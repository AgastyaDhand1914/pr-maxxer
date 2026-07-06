const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireToken = require('../middleware/requireToken');
const { writeLimiter } = require('../middleware/rateLimiter');
const { saveReview, getLatestReview, getAllReviews, getReview } = require('../controllers/reviews');

// /latest must be defined before /:id to avoid express matching "latest" as an id param
router.post('/', requireToken, writeLimiter, saveReview);
router.get('/latest', requireToken, getLatestReview);
router.get('/', requireAuth, getAllReviews);
router.get('/:id', requireAuth, getReview);

module.exports = router;