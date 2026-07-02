require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('./db/client');
const authRoutes = require('./routes/auth');

if (!process.env.FRONTEND_URL) {
    throw new Error("FRONTEND_URL is not set in the environment");
}
if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not set in the environment");
}
if (!process.env.PORT) {
    throw new Error("PORT is not set in the environment");
}


const app = express();


//middlewares

app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true    //to allow origin to share cookies as well. otherwise they are stripped in cross origin requests
}));

app.use(express.json());

app.use(session({
    store: new pgSession({
        pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,    //a session is only saved once something is actually written to it
    //otherwise express saves a session record for every single visitor even before logging in leading to silent traffic filling the db
    cookie: {
        httpOnly: true,
        secure: false,    //set to true in production (HTTPS only)
        maxAge: 7 * 24 * 60 * 60 * 1000    //7 days
    }
}));


//routes

app.use('/auth', authRoutes);
app.use('/health', (req, res) => res.json({ message: "API is healthy" }));


//start

const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
});

module.exports = app;