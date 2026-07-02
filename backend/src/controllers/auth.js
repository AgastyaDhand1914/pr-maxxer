const { createUser } = require('../db/queries');
const pool = require('../db/client');


//redirect user to github login
const redirectToGithub = (req, res) => {
    if (!process.env.GITHUB_CLIENT_ID) {
        throw new Error("GITHUB_CLIENT_ID is not set in the environment");
    }

    const params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        scope: "read:user repo",
        //tells github what permissions the app is requesting from user
        //read:user to read profile
        //repo for read and write access to their repo
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
};


//handle callback from github
const handleGithubCallback = async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: "No code provided by GitHub" });
    }

    if (!process.env.GITHUB_CLIENT_ID) {
        throw new Error("GITHUB_CLIENT_ID is not set in the environment");
    }
    if (!process.env.GITHUB_CLIENT_SECRET) {
        throw new Error("GITHUB_CLIENT_SECRET is not set in the environment");
    }
    if (!process.env.FRONTEND_URL) {
        throw new Error("FRONTEND_URL is not set in the environment");
    }

    try {
        //step 1: exchange code for access token
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                //this tells github the version of api response format the app wants
            },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code
            })
        });

        const tokenData = await tokenRes.json();

        if (tokenData.error) {
            console.error("GitHub token exchange error:", tokenData.error);
            return res.status(401).json({ error: "Failed to exchange code for token" });
        }

        const accessToken = tokenData.access_token;

        //step 2: fetch github user profile
        const userRes = await fetch("https://api.github.com/user", {
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/vnd.github+json"
            }
        });

        const githubUser = await userRes.json();

        if (!githubUser.id) {
            console.error("Failed to fetch GitHub user profile");
            return res.status(401).json({ error: "Failed to fetch GitHub user profile" });
        }

        //step 3: upsert user in database
        const user = await createUser({
            githubId: String(githubUser.id),
            githubUsername: githubUser.login,
            githubToken: accessToken
        });

        //step 4: set session
        req.session.userId = user.id;
        req.session.save(err => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ error: 'Failed to save session' });
            }
            //step 5: redirect only after session is confirmed saved
            res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
        });
    }
    catch (err) {
        console.error("OAuth callback error:", err);
        res.status(500).json({ error: "Internal server error during OAuth" });
    }
};


//logout fn
const logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Session destroy error:', err);
            return res.status(500).json({ error: 'Failed to log out' });
        }

        res.clearCookie('connect.sid');    //default cookie name given by express-session, sid is session id
        res.json({ success: true });
    });
};


//get me fn
const getMe = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT github_username, github_id FROM users WHERE id = $1`,
            [req.session.userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json(rows[0]);
    }
    catch (err) {
        console.error("GET /me error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

module.exports = { redirectToGithub, handleGithubCallback, logout, getMe };