const VALID_SEVERITIES = ['error', 'warning', 'suggestion'];
const VALID_STATES = ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'];


//stripping any additional markdown code fences in gemini response before parsing
function stripCodeFences(text) {
    return text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
}


//checks if a comment has all required valid fields
function validateComment(comment, validFilenames) {
    if (!comment.file || typeof comment.file !== "string") return false;
    if (!comment.line || typeof comment.line !== "number" || comment.line < 1) return false;
    if (!comment.severity || !VALID_SEVERITIES.includes(comment.severity)) return false;
    if (!comment.comment || typeof comment.comment !== "string") return false;

    //file must be one of the files actually in the diff
    if (!validFilenames.includes(comment.file)) {
        console.warn(`Parser: dropping comment on unknown file "${comment.file}"`);
        return false;
    }

    return true;
}


//validate line numbers against actual diff lines
function buildValidLineMap(reviewableFiles) {
    const validLines = {};
    for (const file of reviewableFiles) {
        validLines[file.filename] = new Set();
        let lineNum = 0;

        for (const line of file.patch.split('\n')) {
            if (line.startsWith('@@')) {
                const match = line.match(/\+(\d+)/);
                if (match) {
                    lineNum = parseInt(match[1], 10) - 1;
                }
            }
            else if (line.startsWith('-')) continue;
            else {
                lineNum++;
                if (line.startsWith('+')) {
                    validLines[file.filename].add(lineNum);
                }
            }
        }
    }

    return validLines;
}


//main parser: takes raw gemini text and list of valid filenames from the diff
//returns cleaned review object or null if unparseable
function parseReviewResponse(rawText, reviewableFiles) {
    if (!rawText || typeof rawText !== "string") {
        console.error("Parser: received empty or non-string response");
        return null;
    }

    const cleaned = stripCodeFences(rawText);

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    }
    catch (err) {
        console.error("Parser: failed to parse JSON from Gemini response");
        console.error("Raw response:", rawText.slice(0, 500));
        return null;
    }

    //validate top level fields
    if (!parsed.summary || typeof parsed.summary !== "string") {
        console.warn("Parser: missing or invalid summary, using fallback");
        parsed.summary = "Review completed. See inline comments for details.";
    }

    if (!parsed.review_state || !VALID_STATES.includes(parsed.review_state)) {
        console.warn(`Parser: invalid review_state "${parsed.review_state}", defaulting to COMMENT`);
        parsed.review_state = "COMMENT";
    }

    if (!Array.isArray(parsed.comments)) {
        console.warn("Parser: comments is not an array, defaulting to empty array");
        parsed.comments = [];
    }

    const validFilenames = reviewableFiles.map(f => f.filename);
    const validLineMap = buildValidLineMap(reviewableFiles);

    //filter out invalid comments: drop rather than crash
    const validComments = parsed.comments.filter(c => {
        if (!validateComment(c, validFilenames)) return false;

        const validLinesForFile = validLineMap[c.file];
        if (validLinesForFile && !validLinesForFile.has(c.line)) {
            const lines = Array.from(validLinesForFile);
            if (lines.length === 0) {
                console.warn(`Parser: no valid lines for ${c.file} — dropping comment`);
                return false;
            }
            const closest = lines.reduce((prev, curr) =>
                Math.abs(curr - c.line) < Math.abs(prev - c.line) ? curr : prev
            );
            console.warn(`Parser: snapping line ${c.line} to nearest valid line ${closest} in ${c.file}`);
            c.line = closest;
        }

        return true;
    });

    const droppedCount = parsed.comments.length - validComments.length;
    if (droppedCount > 0) {
        console.warn(`Parser: dropped ${droppedCount} invalid comment(s)`);
    }

    return {
        summary: parsed.summary,
        review_state: parsed.review_state,
        comments: validComments
    };
}


//parses the pass 1 triage response for large PRs
//returns object mapping filename to risk level
function parseTriageResponse(rawText, validFilenames) {
    if (!rawText) return null;

    const cleaned = stripCodeFences(rawText);

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    }
    catch (err) {
        console.error("Parser: failed to parse triage JSON");
        return null;
    }

    if (!Array.isArray(parsed.files)) {
        console.error("Parser: triage response missing files array");
        return null;
    }

    const riskMap = {};
    for (const entry of parsed.files) {
        if (validFilenames.includes(entry.filename) && entry.risk) {
            riskMap[entry.filename] = entry.risk;
        }
    }

    return riskMap;
}

module.exports = { parseReviewResponse, parseTriageResponse, stripCodeFences };