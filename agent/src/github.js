const { Octokit } = require('@octokit/rest');

if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is not set in environment");
}

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });


//fetches PR metadata including current HEAD commit SHA
async function getPullRequest(owner, repo, prNumber) {
    const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });

    return {
        number: data.number,
        title: data.title,
        body: data.body || "",
        author: data.user.login,
        url: data.html_url,
        headSha: data.head.sha,
        baseSha: data.base.sha,
        commits: data.commits
    };
}


//fetches full PR diff for opened events
//returns array of file objects with patch text
async function getDiff(owner, repo, prNumber) {
    const { data } = await octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100
    });

    return data.map(f => ({
        filename: f.filename,
        status: f.status,     // added, modified, removed, renamed
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch || ""
    }));
}


//fetches diff between two specific commits for synchronize events
//uses github compare api: get /repos/{owner}/{repo}/compare/{base}...{head}
async function getIncrementalDiff(owner, repo, baseSha, headSha) {
    const { data } = await octokit.repos.compareCommits({
        owner,
        repo,
        base: baseSha,
        head: headSha,
        per_page: 100
    });

    return data.files.map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch || ""
    }));
}

//fetches full file content at the PR's head commit
//returns null if file not found (deleted files, binary files)
async function getFileContent(owner, repo, path, ref) {
    try {
        const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
        if (data.encoding === 'base64') {
            return Buffer.from(data.content, 'base64').toString('utf8');
        }

        return data.content;
    }
    catch (err) {
        if (err.status === 404) return null;
        throw err;
    }
}


//fetches all commit messages on the PR
async function getCommitMessages(owner, repo, prNumber) {
    const { data } = await octokit.pulls.listCommits({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100
    });

    return data.map(c => c.commit.message);
}


//submits a formal PR review with inline comments
//returns the github_review_id needed for future dismissals
async function postReview(owner, repo, prNumber, commitSha, reviewState, body, comments) {
    const githubComments = comments.filter(c => c.line && c.file && c.comment).map(c => ({
        path: c.file,
        line: c.line,
        body: `**[${c.severity.toUpperCase()}]** ${c.comment}`
    }));

    async function attempt(event, inlineComments) {
        const { data } = await octokit.pulls.createReview({
            owner,
            repo,
            pull_number: prNumber,
            commit_id: commitSha,
            body,
            event,
            comments: inlineComments
        });
        return data.id;
    }

    try {
        return await attempt(reviewState, githubComments);
    }
    catch (err) {
        console.log("postReview error status:", err.status, "reviewState:", reviewState);

        if (err.status === 422 && reviewState === "REQUEST_CHANGES") {
            console.warn("Cannot request changes on own PR, falling back to COMMENT");
            try {
                return await attempt("COMMENT", githubComments);
            }
            catch (fallbackErr) {
                if (fallbackErr.status === 422) {
                    console.warn("Line resolution failed, retrying with no inline comments");
                    return await attempt("COMMENT", []);
                }
                throw fallbackErr;
            }
        }

        if (err.status === 422) {
            console.warn("Line resolution failed, retrying with no inline comments");
            return await attempt(reviewState, []);
        }

        throw err;
    }
}

//dismisses a previous bot review before posting an updated one
async function dismissReview(owner, repo, prNumber, reviewId) {
    try {
        await octokit.pulls.dismissReview({
            owner,
            repo,
            pull_number: prNumber,
            review_id: reviewId,
            message: "Superseded by updated review following new commits."
        });
    } catch (err) {
        // GitHub only allows dismissing REQUEST_CHANGES or APPROVE reviews
        // COMMENT reviews cannot be dismissed — this is a local dev limitation
        // In production with a bot account this won't occur
        if (err.status === 422) {
            console.warn("Could not dismiss previous review (likely COMMENT state) — continuing anyway");
            return;
        }
        throw err;
    }
}


//posts a plain PR comment, used for error messages and no-code-change notices
async function postComment(owner, repo, prNumber, body) {
    await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body
    });
}

module.exports = {
    getPullRequest,
    getDiff,
    getIncrementalDiff,
    getFileContent,
    getCommitMessages,
    postReview,
    dismissReview,
    postComment
};