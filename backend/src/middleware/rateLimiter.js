const rateLimit = require('express-rate-limit');

//broad limit applied to all routes, guards against basic flooding
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  //15 minutes
    max: 150,
    standardHeaders: true,      //return RateLimit-* headers so the client knows its remaining quota
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" }
});

//tight limit for sensitive write actions: connectRepo, saveReview, regenerate-token
//these hit external APIs or write to the DB and should not be spammable
const writeLimiter = rateLimit({
    windowMs: 60 * 1000,        //1 minute
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many write requests, please try again later" }
});

//limit for the GitHub repos proxy endpoint which fans out to GitHub's API
//per user per minute to avoid burning through GitHub rate limits on their behalf
const githubProxyLimiter = rateLimit({
    windowMs: 60 * 1000,        //1 minute
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many fetch requests, please try again later" }
});

module.exports = { globalLimiter, writeLimiter, githubProxyLimiter };
