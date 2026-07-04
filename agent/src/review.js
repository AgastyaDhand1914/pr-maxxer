require('dotenv').config();

const { getPullRequest, getDiff, getIncrementalDiff, getCommitMessages, postReview, dismissReview, postComment } = require('./github');
const { buildContext, isReviewable, DEFAULT_REVIEWABLE_EXTENSIONS } = require('./context');
const { isLargePR, buildTriagePrompt, buildReviewPrompt, callGeminiWithRetry } = require('./gemini');
const { parseReviewResponse, parseTriageResponse } = require('./parser');


const REQUIRED_ENV = ['GITHUB_TOKEN', 'GEMINI_API_KEY', 'PR_REVIEW_BACKEND_TOKEN', 'BACKEND_URL', 'PR_NUMBER', 'PR_HEAD_SHA', 'REPO', 'PR_ACTION'];

for (const key of REQUIRED_ENV) {
    if (!process.env[key]) throw new Error(`${key} is not set in environment`);
}

const [owner, repo] = process.env.REPO.split('/');
const prNumber = parseInt(process.env.PR_NUMBER, 10);
const headSha = process.env.PR_HEAD_SHA;
const eventName = process.env.PR_ACTION;
const backendUrl = process.env.BACKEND_URL;
const backendToken = process.env.PR_REVIEW_BACKEND_TOKEN;


//backend api helpers

async function fetchRepoConfig() {
    try {
        const res = await fetch(`${backendUrl}/api/repos/config`, {
            headers: { "Authorization": `Bearer ${backendToken}` }
        });

        if (!res.ok) return {};
        return await res.json();
    }
    catch (err) {
        console.warn("Could not fetch repository config, using defaults:", err.message);
        return {};
    }
}

async function fetchPreviousReview() {
    const res = await fetch(`${backendUrl}/api/reviews/latest?pr_number=${prNumber}`, {
        headers: { "Authorization": `Bearer ${backendToken}` }
    });

    if (res.status === 404) return null;
    if (!res.ok) {
        throw new Error(`Failed to fetch previous review: ${res.status}`);
    }

    return await res.json();
}

async function saveReview(reviewData) {
    try {
        const res = await fetch(`${backendUrl}/api/reviews`, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${backendToken}`
            },
            body: JSON.stringify(reviewData)
        });

        if (!res.ok) {
            console.error("Failed to save review to backend:", res.status);
        }
        else {
            console.log("Review saved to backend successfully");
        }
    } catch (err) {
        //log but do not throw, the github review was already posted successfully
        console.error('Error saving review to backend:', err.message);
    }
}


//core review pipeline
//shared by both opened and synchronize paths
//takes diff files, builds context, calls gemini, parses response
async function runReviewPipeline(pr, diffFiles, repoConfig) {
    const context = await buildContext(owner, repo, headSha, diffFiles, repoConfig);

    if (context.reviewableFiles.length === 0) return null;

    const commitMessages = await getCommitMessages(owner, repo, prNumber);
    const validFilenames = context.reviewableFiles.map(f => f.filename);

    let reviewResult;

    if (isLargePR(context.reviewableFiles)) {
        console.log("Large PR detected: running two-pass triage...");

        //pass 1: triage
        const triagePrompt = buildTriagePrompt(context.reviewableFiles);
        const triageRaw = await callGeminiWithRetry(triagePrompt);
        const riskMap = parseTriageResponse(triageRaw, validFilenames);

        if (!riskMap) {
            console.warn("Triage failed, falling back to full review");
        }
        else {
            //filter to only high and medium risk files for pass 2
            const highMediumFiles = diffFiles.filter(f =>
                riskMap[f.filename] === "high_risk" || riskMap[f.filename] === "medium_risk"
            );
            const lowRiskFiles = diffFiles.filter(f => riskMap[f.filename] === "low_risk");

            console.log(`Triage: ${highMediumFiles.length} high/medium risk, ${lowRiskFiles.length} low risk`);

            //build context for only high/medium risk files
            const scopedContext = await buildContext(owner, repo, headSha, highMediumFiles, repoConfig);

            const pr_with_commits = { ...pr, commitMessages };
            const reviewPrompt = buildReviewPrompt(pr_with_commits, scopedContext, highMediumFiles, repoConfig);
            const reviewRaw = await callGeminiWithRetry(reviewPrompt);
            reviewResult = parseReviewResponse(reviewRaw, scopedContext.reviewableFiles);

            if (reviewResult && lowRiskFiles.length > 0) {
                reviewResult.summary += `\n\n**Triage disclosure:** This PR contains ${diffFiles.length} changed files. The above review covers ${highMediumFiles.length} high/medium risk files. ${lowRiskFiles.length} low-risk files (${lowRiskFiles.map(f => f.filename).join(', ')}) were summarised by triage without inline review.`;
            }
        }
    }

    //single pass for normal PRs or triage fallback
    if (!reviewResult) {
        const pr_with_commits = { ...pr, commitMessages };
        const reviewPrompt = buildReviewPrompt(pr_with_commits, context, diffFiles, repoConfig);
        const reviewRaw = await callGeminiWithRetry(reviewPrompt);
        reviewResult = parseReviewResponse(reviewRaw, context.reviewableFiles);
    }

    return reviewResult;
}


//main
async function main() {
    console.log(`Starting PR review for event: ${eventName}, PR: #${prNumber}, repository: ${owner}/${repo}`);

    console.log("All env vars:", {
        GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
        PR_NUMBER: process.env.PR_NUMBER,
        REPO: process.env.REPO
    });

    try {
        //fetch repo config from backend
        const repoConfig = await fetchRepoConfig();
        console.log("Repository config fetched:", repoConfig);

        //fetch PR metadata
        const pr = await getPullRequest(owner, repo, prNumber);
        console.log(`PR: "${pr.title}" by ${pr.author}`);

        //opened event: full diff review
        if (eventName === "opened") {
            console.log("Event: opened, running full diff review");

            const diffFiles = await getDiff(owner, repo, prNumber);
            console.log(`Diff: ${diffFiles.length} files changed`);

            const reviewResult = await runReviewPipeline(pr, diffFiles, repoConfig);

            if (!reviewResult) {
                await postComment(owner, repo, prNumber, "No reviewable code changes detected in this PR.");
                console.log("No reviewable files, posted comment and exiting");
                return;
            }

            console.log(`Review complete: ${reviewResult.review_state}, ${reviewResult.comments.length} comments`);

            //post review to GitHub
            const githubReviewId = await postReview(
                owner, repo, prNumber, headSha,
                reviewResult.review_state,
                reviewResult.summary,
                reviewResult.comments
            );

            console.log(`Review posted to GitHub, review ID: ${githubReviewId}`);

            //save review to backend
            await saveReview({
                pr_number: pr.number,
                pr_title: pr.title,
                pr_author: pr.author,
                pr_url: pr.url,
                review_state: reviewResult.review_state,
                summary: reviewResult.summary,
                comments: reviewResult.comments,
                commit_sha: headSha,
                github_review_id: githubReviewId
            });
        }

        //synchronize event: incremental diff review
        else if (eventName === "synchronize") {
            console.log("Event: synchronize, fetching previous review");

            const previousReview = await fetchPreviousReview();

            if (!previousReview) {
                console.log("No previous review found, falling back to full diff review");
                const diffFiles = await getDiff(owner, repo, prNumber);
                const reviewResult = await runReviewPipeline(pr, diffFiles, repoConfig);

                if (!reviewResult) {
                    await postComment(owner, repo, prNumber, "No reviewable code changes detected.");
                    return;
                }

                const githubReviewId = await postReview(
                    owner, repo, prNumber, headSha,
                    reviewResult.review_state,
                    reviewResult.summary,
                    reviewResult.comments
                );

                await saveReview({
                    pr_number: pr.number,
                    pr_title: pr.title,
                    pr_author: pr.author,
                    pr_url: pr.url,
                    review_state: reviewResult.review_state,
                    summary: reviewResult.summary,
                    comments: reviewResult.comments,
                    commit_sha: headSha,
                    github_review_id: githubReviewId
                });

                return;
            }

            console.log(`Previous review found, base SHA: ${previousReview.commit_sha}`);

            //fetch incremental diff between previous review commit and current HEAD
            const incrementalDiff = await getIncrementalDiff(owner, repo, previousReview.commit_sha, headSha);
            console.log(`Incremental diff: ${incrementalDiff.length} files changed`);

            //check if any reviewable files changed
            const extensions = repoConfig.extensions || DEFAULT_REVIEWABLE_EXTENSIONS;
            const reviewableIncremental = incrementalDiff.filter(f => isReviewable(f.filename, extensions));

            if (reviewableIncremental.length === 0) {
                await postComment(owner, repo, prNumber,
                    "No reviewable code changes detected in the latest commits. Previous review stands."
                );
                console.log("No reviewable files in incremental diff, posted comment and exiting");
                return;
            }

            //dismiss previous review before posting new one
            console.log(`Dismissing previous review ID: ${previousReview.github_review_id}`);
            await dismissReview(owner, repo, prNumber, previousReview.github_review_id);

            //run review on incremental diff only
            const reviewResult = await runReviewPipeline(pr, incrementalDiff, repoConfig);

            if (!reviewResult) {
                await postComment(owner, repo, prNumber, "No reviewable code changes detected in the latest commits. Previous review stands.");
                return;
            }

            console.log(`Incremental review complete: ${reviewResult.review_state}, ${reviewResult.comments.length} comments`);

            const githubReviewId = await postReview(
                owner, repo, prNumber, headSha,
                reviewResult.review_state,
                reviewResult.summary,
                reviewResult.comments
            );

            console.log(`Incremental review posted, review ID: ${githubReviewId}`);

            await saveReview({
                pr_number: pr.number,
                pr_title: pr.title,
                pr_author: pr.author,
                pr_url: pr.url,
                review_state: reviewResult.review_state,
                summary: reviewResult.summary,
                comments: reviewResult.comments,
                commit_sha: headSha,
                github_review_id: githubReviewId
            });
        }

        else {
            console.log(`Unknown event: ${eventName}. Exiting`);
        }

    }
    catch (err) {
        console.error("Fatal error in review script:", err);
        //post error comment on PR so the author knows something went wrong
        try {
            await postComment(owner, repo, prNumber,
                `AI review could not complete due to an unexpected error: ${err.message}\n\nYou can re-run this workflow manually from the Actions tab.`
            );
        }
        catch (commentErr) {
            console.error("Could not post error comment:", commentErr.message);
        }
        process.exit(1);
    }
}

main();
