const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const {
    redirectToGithub,
    handleGithubCallback,
    logout,
    getMe
} = require('../controllers/auth');

//auth routes

router.get('/github', redirectToGithub);
router.get('/github/callback', handleGithubCallback);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, getMe);

module.exports = router;