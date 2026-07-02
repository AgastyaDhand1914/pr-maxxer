const { createReview, getReviewsByUserId, getReviewById, getLatestReviewForPR } = require('../db/queries');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATES = ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'];


//called by agent script after posting review to GitHub
//saves full review record
const saveReview = async (req, res) => {
    const {
        pr_number, pr_title, pr_author, pr_url,
        review_state, summary, comments,
        commit_sha, github_review_id
    } = req.body;

    if (pr_number === undefined || pr_number === null) {
        return res.status(400).json({ error: "pr_number is required" });
    }
    if (!review_state) {
        return res.status(400).json({ error: "review_state is required" });
    }
    if (!commit_sha) {
        return res.status(400).json({ error: "commit_sha is required" });
    }
    if (github_review_id === undefined || github_review_id === null) {
        return res.status(400).json({ error: "github_review_id is required" });
    }

    if (!Number.isInteger(pr_number) || pr_number < 1) {
        return res.status(400).json({ error: "pr_number must be a positive integer" });
    }

    if (!VALID_STATES.includes(review_state)) {
        return res.status(400).json({ error: "review_state must be APPROVE, REQUEST_CHANGES, or COMMENT" });
    }

    if (comments !== undefined && !Array.isArray(comments)) {
        return res.status(400).json({ error: "comments must be an array" });
    }

    try {
        const review = await createReview({
            repoId: req.repo.id,
            prNumber: pr_number,
            prTitle: pr_title || null,
            prAuthor: pr_author || null,
            prUrl: pr_url || null,
            reviewState: review_state,
            summary: summary || null,
            comments: comments || [],
            commitSha: commit_sha,
            githubReviewId: github_review_id
        });

        res.status(201).json(review);
    }
    catch (err) {
        console.error("POST /api/reviews error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};


//called by agent script at start of every synchronize event
//returns commit_sha and github_review_id for the most recent review on a PR
const getLatestReview = async (req, res) => {
    const { pr_number } = req.query;

    if (!pr_number) {
        return res.status(400).json({ error: "pr_number query param is required" });
    }

    const prNum = parseInt(pr_number, 10);
    if (isNaN(prNum) || prNum < 1) {
        return res.status(400).json({ error: "pr_number must be a positive integer" });
    }

    try {
        const review = await getLatestReviewForPR(req.repo.id, prNum);
        if (!review) {
            return res.status(404).json({ error: 'No previous review found for this PR' });
        }

        res.json(review);
    }
    catch (err) {
        console.error("GET /api/reviews/latest error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};


//returns paginated reviews for the logged in user across all their repos
const getAllReviews = async (req, res) => {
    const rawPage = req.query.page !== undefined ? parseInt(req.query.page, 10) : 1;
    const rawLimit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : 20;

    if (isNaN(rawPage) || rawPage < 1) {
        return res.status(400).json({ error: "page must be a non-zero positive integer" });
    }
    if (isNaN(rawLimit) || rawLimit < 1 || rawLimit > 100) {
        return res.status(400).json({ error: "limit must be between 1 and 100" });
    }

    const page = rawPage;
    const limit = rawLimit;

    try {
        const reviews = await getReviewsByUserId(req.session.userId, page, limit);
        res.json(reviews);
    }
    catch (err) {
        console.error("GET /api/reviews error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};


//returns full review detail
const getReview = async (req, res) => {
    const { id } = req.params;

    if (!UUID_REGEX.test(id)) {
        return res.status(400).json({ error: "Invalid review id format" });
    }

    try {
        const review = await getReviewById(id, req.session.userId);    //IDOR prevention
        if (!review) {
            return res.status(404).json({ error: "Review not found or access denied" });
        }
        res.json(review);
    }
    catch (err) {
        console.error("GET /api/reviews/:id error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

module.exports = { saveReview, getLatestReview, getAllReviews, getReview };