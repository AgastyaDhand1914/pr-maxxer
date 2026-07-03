if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment");
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';
const LARGE_PR_LINE_THRESHOLD = 3000;


//returns true if total changed lines across reviewable files exceeds threshold
function isLargePR(reviewableFiles) {
    const totalLines = reviewableFiles.reduce((sum, f) => sum + f.changes, 0);
    return totalLines > LARGE_PR_LINE_THRESHOLD;
}


//Pass 1 prompt for large PRs
//Asks gemini to classify each file as high, medium or low risk
function buildTriagePrompt(reviewableFiles) {
    const fileSummaries = reviewableFiles.map(f =>
        `File: ${f.filename} (+${f.additions} -${f.deletions} lines)\nPatch excerpt:\n${f.patch.slice(0, 500)}`
    ).join('\n\n---\n\n');

    return `You are a senior software engineer triaging a large pull request.

For each file below, classify it as high_risk, medium_risk, or low_risk based on:
- high_risk: core business logic, auth, security-sensitive, error handling, database queries
- medium_risk: utility functions, API integrations, configuration with real impact
- low_risk: type definitions, test fixtures, generated code, documentation, config files

Respond ONLY with valid JSON in this exact format, no text outside the JSON:
{
  "files": [
    { "filename": "exact/file/path.js", "risk": "high_risk", "reason": "one sentence" }
  ]
}

FILES TO TRIAGE:

${fileSummaries}`;
}


//constructs the full review prompt for single-pass or pass 2 of large PRs
function buildReviewPrompt(pr, context, diff, repoConfig = {}) {
    const { fileContents, importContents, readme, packageJson, reviewableFiles } = context;

    //build file contents section
    const fileSection = Object.entries(fileContents).map(([path, content]) =>
        `--- ${path} ---\n${content}`
    ).join("\n\n");

    //build imports section
    const importSection = Object.keys(importContents).length > 0
        ? Object.entries(importContents).map(([path, content]) =>
            `--- ${path} (imported) ---\n${content}`
        ).join("\n\n")
        : "No local imports found.";

    //build diff section: only changed files
    const diffSection = reviewableFiles.map(f =>
        `--- ${f.filename} ---\n${f.patch}`
    ).join("\n\n");

    const customInstructions = repoConfig.custom_instructions
        ? `\nCUSTOM INSTRUCTIONS FROM REPO OWNER:\n${repoConfig.custom_instructions}\n`
        : "";

    const minSeverity = repoConfig.min_severity || "suggestion";

    return `PROJECT CONTEXT:
- PR title: ${pr.title}
- PR description: ${pr.body || "No description provided"}
- PR author: ${pr.author}
- Stack: ${packageJson ? packageJson.slice(0, 500) : 'Not found'}
- README: ${readme ? readme.slice(0, 1000) : 'Not found'}
${customInstructions}
FULL FILE CONTENTS (for context — do not review these directly):
${fileSection}

IMPORTED FILES (one level of dependencies):
${importSection}

DIFF (what actually changed — review ONLY these changes, ONLY lines marked with +):
${diffSection}

INSTRUCTIONS:
You are a senior software engineer reviewing a pull request.
Review only the lines marked with + in the diff above.
Only report issues of severity: ${minSeverity} and above.
(severity order: error > warning > suggestion)

Respond ONLY with valid JSON in this exact format, no text outside the JSON:
{
  "summary": "One paragraph summarising the overall review",
  "review_state": "REQUEST_CHANGES",
  "comments": [
    {
      "file": "exact/file/path.js",
      "line": 42,
      "severity": "error",
      "comment": "Plain English explanation with concrete fix"
    }
  ]
}

review_state must be exactly one of: APPROVE, REQUEST_CHANGES, COMMENT
- REQUEST_CHANGES if any error-severity issues found
- COMMENT if only warnings or suggestions found
- APPROVE if no significant issues found

Focus on: bugs, security vulnerabilities, unhandled errors, unclear naming, missing input validation.
Do not comment on: formatting, whitespace, style preferences, commented-out code.`;
}


//calls gemini API and returns response
async function callGemini(prompt) {
    const res = await fetch(`${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,    //low temperature for consistent structured output
                maxOutputTokens: 8192
            }
        })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const error = new Error(`Gemini API error: ${res.status}`);
        error.status = res.status;
        error.details = err;
        throw error;
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
        throw new Error("Gemini returned empty response");
    }

    return text;
}


//wraps "callGemini" fn with exponential backoff for 429 rate limit errors
//waits 1min, 2min, 4min before giving up
async function callGeminiWithRetry(prompt, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await callGemini(prompt);
        }
        catch (err) {
            if (err.status === 429 && attempt < maxRetries - 1) {
                const waitMs = Math.pow(2, attempt) * 60000;
                console.log(`Rate limited by Gemini. Waiting ${waitMs / 1000}s before retry ${attempt + 2}/${maxRetries}...`);
                await new Promise(r => setTimeout(r, waitMs));
            }
            else {
                throw err;
            }
        }
    }
}

module.exports = {
    isLargePR,
    buildTriagePrompt,
    buildReviewPrompt,
    callGemini,
    callGeminiWithRetry
};