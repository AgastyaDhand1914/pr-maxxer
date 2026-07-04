const pool = require('./client');


//upsert (insert and update) a user. if they re-authorize, their token can chnage and hence we update
async function createUser({ githubId, githubUsername, githubToken }) {
    if (!githubId) {
        throw new Error("createUser: githubId is required");
    }
    if (!githubUsername) {
        throw new Error("createUser: githubUsername is required");
    }
    if (!githubToken) {
        throw new Error("createUser: githubToken is required");
    }

    const { rows } = await pool.query(
        `INSERT INTO users (github_id, github_username, github_token)
     VALUES ($1, $2, $3)
     ON CONFLICT (github_id)
     DO UPDATE SET github_token = EXCLUDED.github_token,
                   github_username = EXCLUDED.github_username
     RETURNING *`,
        [githubId, githubUsername, githubToken]
    );

    return rows[0];
}


//check if the user already exists
async function findUserByGithubId(githubId) {
    if (!githubId) {
        throw new Error('findUserByGithubId: githubId is required');
    }

    const { rows } = await pool.query(
        `SELECT * FROM users WHERE github_id = $1`,
        [githubId]
    );

    return rows[0] || null;    //for non existent user, rows[0] is undefined, so we return null
}


//to connect a repo to use the agent, each repo has unique backend_token to use the agent
//we dont create the backend_token secret here for purposeof seperation of concerns
//its creation will be handled by the route handler
async function createRepo({ userId, repoFullName, backendToken }) {
    if (!userId) {
        throw new Error("createRepo: userId is required")
    }
    if (!repoFullName) {
        throw new Error("createRepo: repoFullName is required")
    }
    if (!backendToken) {
        throw new Error("createRepo: backendToken is required")
    }

    const { rows } = await pool.query(
        `INSERT INTO repos (user_id, repo_full_name, backend_token)
      VALUES ($1, $2, $3)
      RETURNING *`, [userId, repoFullName, backendToken]
    );

    return rows[0]
}

//return all connected repos belonging to a user
async function getReposByUserId(userId) {
    if (!userId) {
        throw new Error('getReposByUserId: userId is required');
    }

    const { rows } = await pool.query(
        `SELECT * FROM repos WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
    );

    return rows;    //if no connected repos, returns []
}


//to get repo by its unique backend_token
async function getRepoByToken(token) {
    if (!token) {
        throw new Error('getRepoByToken: token is required');
    }

    const { rows } = await pool.query(
        `SELECT * FROM repos WHERE backend_token = $1`,
        [token]
    );

    return rows[0] || null;
}


//to update repo's config. we also check if the repo belongs to the user explicitly here to prevent
//IDOR vulnerability (Insecure Direct Object Reference)
//without this check, a malicious user can sign in legitimately and get their session but
//can enumerate/guess a repoId and end up accessing it
async function updateRepoConfig(repoId, userId, config) {
    if (!repoId) {
        throw new Error('updateRepoConfig: repoId is required');
    }
    if (!userId) {
        throw new Error('updateRepoConfig: userId is required');
    }
    if (!config) {
        throw new Error('updateRepoConfig: config is required');
    }

    const { rows } = await pool.query(
        `UPDATE repos SET config = $1
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
        [JSON.stringify(config), repoId, userId]
    );

    if (rows.length === 0) return null;
    return rows[0];
}


//called by the agent script at the end of every review, after the gitHub review is posted and 
//we have the github review id back
async function createReview({ repoId, prNumber, prTitle, prAuthor, prUrl, reviewState, summary, comments, commitSha, githubReviewId }) {
    if (!repoId) {
        throw new Error('createReview: repoId is required');
    }
    if (!prNumber) {
        throw new Error('createReview: prNumber is required');
    }
    if (!reviewState) {
        throw new Error('createReview: reviewState is required');
    }
    if (!commitSha) {
        throw new Error('createReview: commitSha is required');
    }
    if (!githubReviewId) {
        throw new Error('createReview: githubReviewId is required');
    }

    const { rows } = await pool.query(
        `INSERT INTO reviews (repo_id, pr_number, pr_title, pr_author, pr_url, review_state, summary, comments, comment_count, commit_sha, github_review_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
        [repoId, prNumber, prTitle, prAuthor, prUrl, reviewState, summary, JSON.stringify(comments), comments.length, commitSha, githubReviewId]
    );

    //in db we store review id as BIGINT, pg library returns it as "string" type
    //so we exlicitly typecast it
    rows[0].github_review_id = parseInt(rows[0].github_review_id, 10);
    return rows[0];
}


//get all reviews across all of a user's repos, paginated, optionally filtered by repoId
async function getReviewsByUserId(userId, page = 1, limit = 20, repoId = null) {
    if (!userId) {
        throw new Error('getReviewsByUserId: userId is required');
    }

    const offset = (page - 1) * limit;

    let queryStr = `SELECT r.*, repos.repo_full_name
     FROM reviews r
     JOIN repos ON r.repo_id = repos.id
     WHERE repos.user_id = $1`;
    const params = [userId];

    if (repoId) {
        queryStr += ` AND r.repo_id = $2`;
        params.push(repoId);
    }

    queryStr += ` ORDER BY r.reviewed_at DESC LIMIT ${params.length + 1} OFFSET ${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(queryStr, params);

    return rows;
}


//get a single review by its id, with repo_full_name, only if it belongs to the user
//repos.user_id = $2 plays 2 roles here: one is IDOR prevention and other is the necessary
//join requirement to access a review given the accessing user, through repos table
async function getReviewById(reviewId, userId) {
    if (!reviewId) {
        throw new Error('getReviewById: reviewId is required');
    }
    if (!userId) {
        throw new Error('getReviewById: userId is required');
    }

    const { rows } = await pool.query(
        `SELECT r.*, repos.repo_full_name
     FROM reviews r
     JOIN repos ON r.repo_id = repos.id
     WHERE r.id = $1 AND repos.user_id = $2`,
        [reviewId, userId]
    );

    return rows[0] || null;
}


//called by agent script at the start of every synchronize event, it needs 2 things-
//commit_sha: to know where to start the incremental diff from
//github_review_id: to know which previous review to dismiss
async function getLatestReviewForPR(repoId, prNumber) {
    if (!repoId) {
        throw new Error('getLatestReviewForPR: repoId is required');
    }
    if (!prNumber) {
        throw new Error('getLatestReviewForPR: prNumber is required');
    }

    const { rows } = await pool.query(
        `SELECT commit_sha, github_review_id 
     FROM reviews 
     WHERE repo_id = $1 AND pr_number = $2 
     ORDER BY reviewed_at DESC 
     LIMIT 1`,
        [repoId, prNumber]
    );

    if (rows[0]) {
        rows[0].github_review_id = parseInt(rows[0].github_review_id, 10);
    }
    return rows[0] || null;
}


module.exports = {
    createUser,
    findUserByGithubId,
    createRepo,
    getReposByUserId,
    getRepoByToken,
    updateRepoConfig,
    createReview,
    getReviewsByUserId,
    getReviewById,
    getLatestReviewForPR
};