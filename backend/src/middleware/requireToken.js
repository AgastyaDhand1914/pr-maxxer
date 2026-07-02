const { getRepoByToken } = require('../db/queries');

async function requireToken(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
        return res.status(401).json({ error: "Missing token" });
    }

    try {
        const repo = await getRepoByToken(token);

        if (!repo) {
            return res.status(401).json({ error: "Invalid token" });
        }

        req.repo = repo;
        next();
    }
    catch (err) {
        console.error("requireToken error", err);
        res.status(500).json({ error: "Internal server error" });
    }
}

module.exports = requireToken;