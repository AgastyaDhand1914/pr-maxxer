# pr-maxxer

AI-powered pull request review agent for GitHub repositories. When a developer opens a pull request on a connected repository, an agent automatically analyzes the code changes and posts inline review comments directly on the PR.

---

## What it does

- Posts inline comments on specific lines of the diff, labeled by severity: error, warning, or suggestion
- On subsequent commits to an open PR, reviews only the incremental diff since the last review
- Dismisses the previous bot review before posting an updated one, keeping the PR timeline clean
- Handles large PRs via a two-pass triage strategy: classifies files by risk level, then deep reviews only high and medium risk files
- Persists every review in a dashboard accessible via the web app, even after the GitHub PR is closed

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite, deployed on Vercel |
| Backend | Node.js + Express, deployed on Render |
| Database | PostgreSQL via Neon |
| Authentication | GitHub OAuth |
| Sessions | express-session + connect-pg-simple |
| AI | Gemini (Google AI Studio) |
| GitHub integration | GitHub Actions (pull_request_target) |
| GitHub API client | @octokit/rest v20 |

---

## Project Structure
```
pr-maxxer/
├── .gitignore
├── .github/
│   └── workflows/
│       └── pr-review.yaml
├── agent/
│   ├── package.json
│   ├── package-lock.json
│   ├── .gitignore
│   ├── .env.example
│   └── src/
│       ├── context.js
│       ├── gemini.js
│       ├── github.js
│       ├── parser.js
│       └── review.js
├── backend/
│   ├── package.json
│   ├── package-lock.json
│   ├── .gitignore
│   ├── .env.example
│   ├── render.yaml
│   └── src/
│       ├── app.js
│       ├── controllers/
│       │   ├── auth.js
│       │   ├── repos.js
│       │   └── reviews.js
│       ├── db/
│       │   ├── client.js
│       │   ├── queries.js
│       │   └── schema.sql
│       ├── middleware/
│       │   ├── rateLimiter.js
│       │   ├── requireAuth.js
│       │   └── requireToken.js
│       ├── routes/
│       │   ├── auth.js
│       │   ├── repos.js
│       │   └── reviews.js
│       └── tests/
│           ├── testQueries.js
│           └── testAPI.js
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── .gitignore
│   ├── .env.example
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js
│       ├── index.css
│       ├── components/
│       │   ├── NavBar.jsx
│       │   ├── ReviewRow.jsx
│       │   ├── CommentBlock.jsx
│       │   ├── SeverityBadge.jsx
│       │   ├── Pagination.jsx
│       │   └── TokenModal.jsx
│       └── pages/
│           ├── Landing.jsx
│           ├── Dashboard.jsx
│           ├── ReviewDetail.jsx
│           ├── ConnectRepo.jsx
│           └── Configuration.jsx
└── README.md
```

---

### Local Development

### Prerequisites

- Node.js 20 or higher
- A Neon account (neon.tech) — free tier is sufficient
- A Google AI Studio account (aistudio.google.com) — for the Gemini API key

### Database

Create a new project on neon.tech. Use the **direct connection string** (not the pooled one — pooled connections are incompatible with connect-pg-simple). Run `backend/src/db/schema.sql` in the Neon SQL editor to create the tables.

### GitHub OAuth App

Register a new OAuth App at github.com/settings/developers with the following callback URL:

```
http://localhost:4000/auth/github/callback
```

### Environment Variables

Place per-service env files in `backend/.env`, `frontend/.env`, and `agent/.env`.

backend/.env (example)
```
DATABASE_URL=your_neon_direct_connection_string
GITHUB_CLIENT_ID=your_oauth_client_id
GITHUB_CLIENT_SECRET=your_oauth_client_secret
SESSION_SECRET=generate_with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
FRONTEND_URL=http://localhost:5173
PORT=4000
NODE_ENV=development
```

frontend/.env (example)
```
VITE_BACKEND_URL=http://localhost:4000
```

agent/.env (example)
```
GEMINI_API_KEY=your_gemini_api_key
PR_REVIEW_BACKEND_TOKEN=one-time-backend-token-generated-when-connecting-a-repo
BACKEND_URL=http://localhost:4000
GITHUB_TOKEN=github_pat_with_repo_scope   # only for local testing
PR_NUMBER=1
PR_HEAD_SHA=head_commit_sha_of_the_pr
REPO=owner/repo-name
PR_ACTION=opened
```

`PR_REVIEW_BACKEND_TOKEN` is returned once when you connect a repository in the app and must be saved by the operator. In production GitHub Actions provide the `GITHUB_TOKEN` automatically.

### Running locally

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev

# Agent (to run the review agent locally)
cd agent && npm install && node src/review.js
```

### Test suites

```bash
# Database query tests — backend server not required
cd backend && node src/tests/testQueries.js

# API endpoint tests — requires backend running on port 4000
cd backend && node src/tests/testAPI.js
```

---

## Deployment

### Backend — Render

1. New Web Service on render.com → connect the `pr-maxxer` repo
2. Set Root Directory to `backend`, Build Command to `npm install`, Start Command to `npm start`
3. Add environment variables:

| Key | Value |
|---|---|
| `DATABASE_URL` | Neon direct connection string |
| `GITHUB_CLIENT_ID` | Production OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | Production OAuth app client secret |
| `SESSION_SECRET` | Same value as local |
| `FRONTEND_URL` | Vercel URL (update after frontend deployment) |
| `NODE_ENV` | `production` |

Register a separate production GitHub OAuth App with callback URL:
```
https://your-render-url.onrender.com/auth/github/callback
```

### Frontend — Vercel

1. New Project on vercel.com → import the `pr-maxxer` repo
2. Set Root Directory to `frontend`
3. Add environment variable:

| Key | Value |
|---|---|
| `VITE_BACKEND_URL` | Your Render URL |

After deployment, copy the Vercel URL and update `FRONTEND_URL` on Render.

---

## Connecting a Repository

To connect a repository in production:

1. Sign into pr-maxxer and go to Settings
2. Choose a repository from your GitHub repos list and click Connect
3. Copy the one-time backend token shown in the modal — store it securely
4. Add the token and `GEMINI_API_KEY` as GitHub Actions secrets in your repository (`PR_REVIEW_BACKEND_TOKEN`, `GEMINI_API_KEY`) and add the provided workflow to `.github/workflows/pr-review.yaml`

After the workflow and secrets are configured, the agent will be able to post reviews for new pull requests on that repository.

---

## API Reference

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/auth/github` | None | Redirect to GitHub OAuth |
| GET | `/auth/github/callback` | None | OAuth callback handler |
| POST | `/auth/logout` | Session | Destroy session |
| GET | `/auth/me` | Session | Return current user |

### Repos

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/repos` | Session | List connected repos for the logged-in user |
| POST | `/api/repos` | Session | Connect a repo and return a one-time backend token |
| POST | `/api/repos/:repoId/regenerate-token` | Session | Regenerate a backend token for a pending repo (returns new token once) |
| PUT | `/api/repos/:repoId/config` | Session | Update reviewer config for a connected repo |
| GET | `/api/repos/config` | Token | Fetch repo config (used by the agent via backend token) |
| GET | `/api/github/repos` | Session | Proxy to GitHub: list repos visible to the logged-in user |

### Reviews

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/reviews` | Token | Save a review record (called by the agent after posting to GitHub) |
| GET | `/api/reviews/latest` | Token | Get latest review metadata for a PR (called by agent during synchronization) |
| GET | `/api/reviews` | Session | Paginated reviews for the dashboard (supports `page`, `limit`, `repoId`) |
| GET | `/api/reviews/:id` | Session | Full review detail |

Session auth uses the `connect.sid` cookie set during OAuth. Token auth uses `Authorization: Bearer <token>` where the token is the `PR_REVIEW_BACKEND_TOKEN` generated when a repo is connected.
