const { createRepo, getReposByUserId, updateRepoConfig, regenerateRepoToken, getUserById } = require('../db/queries');
const { randomUUID } = require('crypto');
const pool = require('../db/client');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_SEVERITIES = ['error', 'warning', 'suggestion'];


//returns all repos connected by the logged in user
const getUserRepos = async (req, res) => {
    try {
        const repos = await getReposByUserId(req.session.userId);
        res.json(repos);
    }
    catch (err) {
        console.error("GET /api/repos error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};


//connects a new repo, generates a unique backend token and returns it once
const connectRepo = async (req, res) => {
    const { repo_full_name } = req.body;

    if (!repo_full_name) {
        return res.status(400).json({ error: "repo_full_name is required" });
    }

    if (typeof repo_full_name !== 'string') {
        return res.status(400).json({ error: "repo_full_name must be a string" });
    }

    //must be in format owner/repo with no extra slashes or spaces
    if (!/^[^\s\/]+\/[^\s\/]+$/.test(repo_full_name.trim())) {
        return res.status(400).json({ error: "repo_full_name must be in format [owner/repo]" });
    }

    try {
        const user = await getUserById(req.session.userId);
        if (!user || !user.github_token) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const githubRes = await fetch(`https://api.github.com/repos/${repo_full_name.trim()}`, {
            headers: {
                "Authorization": `Bearer ${user.github_token}`,
                "Accept": "application/vnd.github+json"
            }
        });

        if (githubRes.status === 404) {
            return res.status(404).json({ error: "Repository not found on GitHub" });
        }

        if (!githubRes.ok) {
            return res.status(githubRes.status).json({ error: "Failed to verify repository with GitHub" });
        }

        //GET /repos/{owner}/{repo} permissions field is unreliable—it's omitted for
        //public repos where the user has no explicit collaborator record (e.g. they're
        //the repo owner but the API doesn't return the field). Instead, we use the
        //dedicated collaborator permission endpoint which always returns a clear level.
        const permRes = await fetch(
            `https://api.github.com/repos/${repo_full_name.trim()}/collaborators/${user.github_username}/permission`,
            {
                headers: {
                    "Authorization": `Bearer ${user.github_token}`,
                    "Accept": "application/vnd.github+json"
                }
            }
        );

        if (!permRes.ok) {
            return res.status(403).json({ error: "You do not have sufficient permissions (write or admin) for this repository" });
        }

        const permData = await permRes.json();
        const level = permData.permission; // "admin" | "write" | "read" | "none"

        //we require write or admin access to connect the repo
        if (level !== "admin" && level !== "write") {
            return res.status(403).json({ error: "You do not have sufficient permissions (write or admin) for this repository" });
        }

        const backendToken = randomUUID();

        const repo = await createRepo({
            userId: req.session.userId,
            repoFullName: repo_full_name.trim(),
            backendToken
        });

        //return token here and only here, not stored in a retrievable way after this
        res.status(201).json({ repo_id: repo.id, backend_token: backendToken });
    }
    catch (err) {
        console.error("POST /api/repos error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};


//regenerate the backend token for a pending (not yet active) repo
//old token is immediately invalidated, the new one must be saved and set as a GitHub secret
const regenerateToken = async (req, res) => {
    const { repoId } = req.params;

    if (!UUID_REGEX.test(repoId)) {
        return res.status(400).json({ error: "Invalid repoId format" });
    }

    try {
        const newToken = randomUUID();
        const updated = await regenerateRepoToken(repoId, req.session.userId, newToken);

        if (!updated) {
            return res.status(404).json({ error: "Repository not found or access denied" });
        }

        //return new token here and only here
        res.json({ repo_id: updated.id, repo_full_name: updated.repo_full_name, backend_token: newToken });
    }
    catch (err) {
        console.error("POST /api/repos/:repoId/regenerate-token error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};


//update repo reviewer config
const updateConfig = async (req, res) => {
    const { repoId } = req.params;
    const { extensions, min_severity, custom_instructions } = req.body;

    if (!UUID_REGEX.test(repoId)) {
        return res.status(400).json({ error: "Invalid repoId format" });
    }

    if (min_severity !== undefined && !VALID_SEVERITIES.includes(min_severity)) {
        return res.status(400).json({ error: "min_severity must be one of: error, warning, suggestion" });
    }

    if (extensions !== undefined && !Array.isArray(extensions)) {
        return res.status(400).json({ error: "extensions must be an array" });
    }

    if (extensions !== undefined && !extensions.every(e => typeof e === 'string' && e.startsWith('.'))) {
        return res.status(400).json({ error: "each extension must be a string starting with a dot e.g. .js" });
    }

    if (custom_instructions !== undefined && typeof custom_instructions !== 'string') {
        return res.status(400).json({ error: "custom_instructions must be a string" });
    }

    const config = {};
    if (extensions !== undefined) config.extensions = extensions;
    if (min_severity !== undefined) config.min_severity = min_severity;
    if (custom_instructions !== undefined) config.custom_instructions = custom_instructions;

    try {
        const updated = await updateRepoConfig(repoId, req.session.userId, config);    //IDOR protected

        if (!updated) {
            return res.status(404).json({ error: "Repository not found or access denied" });
        }

        res.json(updated);
    }
    catch (err) {
        console.error("PUT /api/repos/:repoId/config error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};


//called by agent script, returns config for the repo identified by bearer token
//requireToken middleware already validated the token and attached req.repo
const getRepoConfig = (req, res) => {
    res.json(req.repo.config || {});
};


//calls GitHub API using logged in user's stored OAuth token
//returns list of repos available to connect
const getGithubRepos = async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT github_token FROM users WHERE id = $1',
            [req.session.userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const githubRes = await fetch(
            "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator",
            {
                headers: {
                    "Authorization": `Bearer ${rows[0].github_token}`,
                    "Accept": 'application/vnd.github+json'
                }
            }
        );

        if (!githubRes.ok) {
            console.error("GitHub API error fetching repositories:", githubRes.status);
            return res.status(502).json({ error: "Failed to fetch repositories from GitHub" });
        }

        const repos = await githubRes.json();

        res.json(repos.map(r => ({
            id: r.id,
            full_name: r.full_name,
            private: r.private,
            description: r.description,
            updated_at: r.updated_at
        })));
    }
    catch (err) {
        console.error("GET /api/github/repos error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

module.exports = { getUserRepos, connectRepo, updateConfig, getRepoConfig, getGithubRepos, regenerateToken };