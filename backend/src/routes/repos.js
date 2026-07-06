const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireToken = require('../middleware/requireToken');
const { writeLimiter } = require('../middleware/rateLimiter');
const { getUserRepos, connectRepo, updateConfig, getRepoConfig, regenerateToken } = require('../controllers/repos');

// /config must be defined before /:repoId to avoid express matching "config" as a param
router.get("/config", requireToken, getRepoConfig);
router.get("/", requireAuth, getUserRepos);
router.post("/", requireAuth, writeLimiter, connectRepo);
router.post("/:repoId/regenerate-token", requireAuth, writeLimiter, regenerateToken);
router.put("/:repoId/config", requireAuth, updateConfig);

module.exports = router;