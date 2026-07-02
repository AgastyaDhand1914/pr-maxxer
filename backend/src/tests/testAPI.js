require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('../db/client');
const { createUser } = require('../db/queries');
const cookieSignature = require('cookie-signature');
const { randomBytes, randomUUID } = require('crypto');

const BASE_URL = 'http://localhost:4000';
const TEST_PREFIX = 'TEST_API_';

// ─── Test Runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(`    → ${err.message}`);
        failed++;
        failures.push({ name, error: err.message });
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

async function get(path, { cookie, token } = {}) {
    const headers = {};
    if (cookie) headers['Cookie'] = cookie;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${path}`, { headers });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
}

async function post(path, data = {}, { cookie, token } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
}

async function put(path, data = {}, { cookie } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data)
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
}

// ─── Setup Helpers ────────────────────────────────────────────────────────────

function randomId() {
    return randomBytes(4).toString('hex');
}

async function createTestUser() {
    const id = randomId();
    return createUser({
        githubId: `${TEST_PREFIX}GH_${id}`,
        githubUsername: `${TEST_PREFIX}user_${id}`,
        githubToken: `${TEST_PREFIX}token_${id}`
    });
}

async function createTestSession(userId) {
    const sid = `${TEST_PREFIX}${randomBytes(16).toString('hex')}`;
    const sessData = {
        cookie: {
            originalMaxAge: 604800000,
            expires: new Date(Date.now() + 604800000).toISOString(),
            httpOnly: true,
            path: '/'
        },
        userId
    };
    await pool.query(
        `INSERT INTO session (sid, sess, expire) VALUES ($1, $2::json, $3)`,
        [sid, JSON.stringify(sessData), new Date(Date.now() + 604800000)]
    );
    const signed = 's:' + cookieSignature.sign(sid, process.env.SESSION_SECRET);
    return `connect.sid=${encodeURIComponent(signed)}`;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanup() {
    await pool.query(`
    DELETE FROM reviews WHERE repo_id IN (
      SELECT id FROM repos WHERE repo_full_name LIKE $1
    )`, [`${TEST_PREFIX}%`]);
    await pool.query(`DELETE FROM repos WHERE repo_full_name LIKE $1`, [`${TEST_PREFIX}%`]);
    await pool.query(`DELETE FROM session WHERE sid LIKE $1`, [`${TEST_PREFIX}%`]);
    await pool.query(`DELETE FROM users WHERE github_id LIKE $1`, [`${TEST_PREFIX}%`]);
}

// ─── requireToken middleware ──────────────────────────────────────────────────

async function testRequireToken() {
    console.log('\nrequireToken middleware');

    await test('no Authorization header returns 401', async () => {
        const { status } = await get('/api/repos/config');
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('Authorization header without Bearer returns 401', async () => {
        const { status } = await get('/api/repos/config', { token: 'notbearer abc' });
        // override token to send raw header
        const res = await fetch(`${BASE_URL}/api/repos/config`, {
            headers: { 'Authorization': 'Token abc123' }
        });
        assert(res.status === 401, `expected 401, got ${res.status}`);
    });

    await test('Bearer with invalid token returns 401', async () => {
        const { status } = await get('/api/repos/config', { token: 'totally-invalid-token' });
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('Bearer with empty string after Bearer returns 401', async () => {
        const res = await fetch(`${BASE_URL}/api/repos/config`, {
            headers: { 'Authorization': 'Bearer ' }
        });
        assert(res.status === 401, `expected 401, got ${res.status}`);
    });
}

// ─── GET /api/repos ───────────────────────────────────────────────────────────

async function testGetUserRepos() {
    console.log('\nGET /api/repos');

    await test('no session returns 401', async () => {
        const { status } = await get('/api/repos');
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('fake session cookie returns 401', async () => {
        const { status } = await get('/api/repos', { cookie: 'connect.sid=fakecookie' });
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('returns empty array when user has no connected repos', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status, body } = await get('/api/repos', { cookie });
        assert(status === 200, `expected 200, got ${status}`);
        assert(Array.isArray(body), 'body should be array');
        assert(body.length === 0, 'should be empty');
    });

    await test('returns repos for the logged in user', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/repo1` }, { cookie });
        await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/repo2` }, { cookie });
        const { status, body } = await get('/api/repos', { cookie });
        assert(status === 200, `expected 200, got ${status}`);
        assert(body.length === 2, `expected 2 repos, got ${body.length}`);
    });

    await test('does not return repos belonging to a different user', async () => {
        const userA = await createTestUser();
        const userB = await createTestUser();
        const cookieA = await createTestSession(userA.id);
        const cookieB = await createTestSession(userB.id);
        await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/repoA_${randomId()}` }, { cookie: cookieA });
        await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/repoB_${randomId()}` }, { cookie: cookieB });
        const { body } = await get('/api/repos', { cookie: cookieA });
        const allBelongToA = body.every(r => r.user_id === userA.id);
        assert(allBelongToA, 'should not return repos from userB');
    });
}

// ─── POST /api/repos ──────────────────────────────────────────────────────────

async function testConnectRepo() {
    console.log('\nPOST /api/repos');

    await test('no session returns 401', async () => {
        const { status } = await post('/api/repos', { repo_full_name: 'owner/repo' });
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('missing repo_full_name returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status, body } = await post('/api/repos', {}, { cookie });
        assert(status === 400, `expected 400, got ${status}`);
        assert(body.error, 'should have error message');
    });

    await test('invalid format (no slash) returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status } = await post('/api/repos', { repo_full_name: 'invalidrepo' }, { cookie });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('invalid format (extra slash) returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status } = await post('/api/repos', { repo_full_name: 'owner/repo/extra' }, { cookie });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('invalid format (spaces) returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status } = await post('/api/repos', { repo_full_name: 'owner /repo' }, { cookie });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('valid request returns 201 with repo_id and backend_token', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status, body } = await post('/api/repos', {
            repo_full_name: `${TEST_PREFIX}owner/repo_${randomId()}`
        }, { cookie });
        assert(status === 201, `expected 201, got ${status}`);
        assert(body.repo_id, 'should return repo_id');
        assert(body.backend_token, 'should return backend_token');
    });

    await test('backend_token is unique across multiple connects', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: b1 } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r1_${randomId()}` }, { cookie });
        const { body: b2 } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r2_${randomId()}` }, { cookie });
        assert(b1.backend_token !== b2.backend_token, 'tokens should be unique');
    });

    await test('returned backend_token works with requireToken middleware', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body } = await post('/api/repos', {
            repo_full_name: `${TEST_PREFIX}owner/repo_${randomId()}`
        }, { cookie });
        const { status } = await get('/api/repos/config', { token: body.backend_token });
        assert(status === 200, `token should be valid, got ${status}`);
    });
}

// ─── PUT /api/repos/:repoId/config ───────────────────────────────────────────

async function testUpdateConfig() {
    console.log('\nPUT /api/repos/:repoId/config');

    await test('no session returns 401', async () => {
        const { status } = await put('/api/repos/00000000-0000-0000-0000-000000000000/config', {});
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('invalid repoId format returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status } = await put('/api/repos/notauuid/config', { extensions: ['.js'] }, { cookie });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('invalid min_severity returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await put(`/api/repos/${repo.repo_id}/config`, { min_severity: 'critical' }, { cookie });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('extensions not an array returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await put(`/api/repos/${repo.repo_id}/config`, { extensions: '.js' }, { cookie });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('extension not starting with dot returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await put(`/api/repos/${repo.repo_id}/config`, { extensions: ['js', 'ts'] }, { cookie });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('valid config update returns 200 with updated repo', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status, body } = await put(`/api/repos/${repo.repo_id}/config`, {
            extensions: ['.js', '.ts'],
            min_severity: 'error',
            custom_instructions: 'test instructions'
        }, { cookie });
        assert(status === 200, `expected 200, got ${status}`);
        assert(body.config.extensions.includes('.js'), 'extensions should be saved');
        assert(body.config.min_severity === 'error', 'min_severity should be saved');
        assert(body.config.custom_instructions === 'test instructions', 'custom_instructions should be saved');
    });

    await test('IDOR — cannot update another users repo', async () => {
        const userA = await createTestUser();
        const userB = await createTestUser();
        const cookieA = await createTestSession(userA.id);
        const cookieB = await createTestSession(userB.id);
        const { body: repoA } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie: cookieA });
        const { status } = await put(`/api/repos/${repoA.repo_id}/config`, { min_severity: 'error' }, { cookie: cookieB });
        assert(status === 404, `expected 404, got ${status}`);
    });

    await test('non-existent repoId returns 404', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status } = await put('/api/repos/00000000-0000-0000-0000-000000000000/config', { min_severity: 'error' }, { cookie });
        assert(status === 404, `expected 404, got ${status}`);
    });

    await test('partial config update only sets provided fields', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        await put(`/api/repos/${repo.repo_id}/config`, { extensions: ['.js'], min_severity: 'error' }, { cookie });
        const { body } = await put(`/api/repos/${repo.repo_id}/config`, { custom_instructions: 'hello' }, { cookie });
        assert(body.config.custom_instructions === 'hello', 'custom_instructions should be set');
        assert(body.config.extensions === undefined, 'extensions should not persist from previous call');
    });
}

// ─── GET /api/repos/config ────────────────────────────────────────────────────

async function testGetRepoConfig() {
    console.log('\nGET /api/repos/config');

    await test('no token returns 401', async () => {
        const { status } = await get('/api/repos/config');
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('invalid token returns 401', async () => {
        const { status } = await get('/api/repos/config', { token: 'invalid-token-xyz' });
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('valid token returns config object', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status, body } = await get('/api/repos/config', { token: repo.backend_token });
        assert(status === 200, `expected 200, got ${status}`);
        assert(typeof body === 'object', 'should return an object');
    });

    await test('returns updated config after config is saved', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        await put(`/api/repos/${repo.repo_id}/config`, { min_severity: 'warning', extensions: ['.py'] }, { cookie });
        const { body } = await get('/api/repos/config', { token: repo.backend_token });
        assert(body.min_severity === 'warning', 'should reflect updated config');
        assert(body.extensions.includes('.py'), 'extensions should be updated');
    });
}

// ─── GET /api/github/repos ────────────────────────────────────────────────────

async function testGetGithubRepos() {
    console.log('\nGET /api/github/repos');

    await test('no session returns 401', async () => {
        const { status } = await get('/api/github/repos');
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('fake session returns 401', async () => {
        const { status } = await get('/api/github/repos', { cookie: 'connect.sid=fakecookie' });
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('valid session but fake github token returns 502', async () => {
        const user = await createTestUser(); // has a fake github token
        const cookie = await createTestSession(user.id);
        const { status } = await get('/api/github/repos', { cookie });
        assert(status === 502, `expected 502 from GitHub rejecting fake token, got ${status}`);
    });
}

// ─── POST /api/reviews ────────────────────────────────────────────────────────

async function testSaveReview() {
    console.log('\nPOST /api/reviews');

    function validReviewBody(overrides = {}) {
        return {
            pr_number: 1,
            pr_title: 'Test PR',
            pr_author: 'testuser',
            pr_url: 'https://github.com/test/repo/pull/1',
            review_state: 'COMMENT',
            summary: 'Test summary',
            comments: [{ file: 'src/index.js', line: 10, severity: 'error', comment: 'Test' }],
            commit_sha: `sha_${randomId()}`,
            github_review_id: Math.floor(Math.random() * 1000000),
            ...overrides
        };
    }

    await test('no token returns 401', async () => {
        const { status } = await post('/api/reviews', validReviewBody());
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('invalid token returns 401', async () => {
        const { status } = await post('/api/reviews', validReviewBody(), { token: 'bad-token' });
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('missing pr_number returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await post('/api/reviews', validReviewBody({ pr_number: undefined }), { token: repo.backend_token });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('missing review_state returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await post('/api/reviews', validReviewBody({ review_state: undefined }), { token: repo.backend_token });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('invalid review_state returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await post('/api/reviews', validReviewBody({ review_state: 'REJECTED' }), { token: repo.backend_token });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('missing commit_sha returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await post('/api/reviews', validReviewBody({ commit_sha: undefined }), { token: repo.backend_token });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('missing github_review_id returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await post('/api/reviews', validReviewBody({ github_review_id: undefined }), { token: repo.backend_token });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('pr_number not a positive integer returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await post('/api/reviews', validReviewBody({ pr_number: -1 }), { token: repo.backend_token });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('comments not an array returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await post('/api/reviews', validReviewBody({ comments: 'not an array' }), { token: repo.backend_token });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('valid review returns 201 with saved record', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const body_in = validReviewBody();
        const { status, body } = await post('/api/reviews', body_in, { token: repo.backend_token });
        assert(status === 201, `expected 201, got ${status}`);
        assert(body.id, 'should return id');
        assert(body.repo_id === repo.repo_id, 'repo_id should match');
        assert(body.pr_number === body_in.pr_number, 'pr_number should match');
        assert(body.commit_sha === body_in.commit_sha, 'commit_sha should match');
        assert(body.github_review_id === body_in.github_review_id, 'github_review_id should match');
        assert(body.comment_count === 1, 'comment_count should be 1');
    });

    await test('valid review with zero comments saves correctly', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status, body } = await post('/api/reviews', validReviewBody({ comments: [], review_state: 'APPROVE' }), { token: repo.backend_token });
        assert(status === 201, `expected 201, got ${status}`);
        assert(body.comment_count === 0, 'comment_count should be 0');
    });

    await test('all three valid review_states are accepted', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        for (const state of ['APPROVE', 'REQUEST_CHANGES', 'COMMENT']) {
            const { status } = await post('/api/reviews', validReviewBody({ review_state: state }), { token: repo.backend_token });
            assert(status === 201, `${state} should return 201, got ${status}`);
        }
    });
}

// ─── GET /api/reviews/latest ──────────────────────────────────────────────────

async function testGetLatestReview() {
    console.log('\nGET /api/reviews/latest');

    await test('no token returns 401', async () => {
        const { status } = await get('/api/reviews/latest?pr_number=1');
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('missing pr_number returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await get('/api/reviews/latest', { token: repo.backend_token });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('non-integer pr_number returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await get('/api/reviews/latest?pr_number=abc', { token: repo.backend_token });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('returns 404 when no review exists for this PR', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const { status } = await get('/api/reviews/latest?pr_number=9999', { token: repo.backend_token });
        assert(status === 404, `expected 404, got ${status}`);
    });

    await test('returns commit_sha and github_review_id for existing review', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const reviewBody = {
            pr_number: 42,
            review_state: 'COMMENT',
            commit_sha: `sha_${randomId()}`,
            github_review_id: 999888,
            comments: []
        };
        await post('/api/reviews', reviewBody, { token: repo.backend_token });
        const { status, body } = await get('/api/reviews/latest?pr_number=42', { token: repo.backend_token });
        assert(status === 200, `expected 200, got ${status}`);
        assert(body.commit_sha === reviewBody.commit_sha, 'commit_sha should match');
        assert(body.github_review_id === reviewBody.github_review_id, 'github_review_id should match');
    });

    await test('returns only the most recent review when multiple exist', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const prNumber = 77;
        await post('/api/reviews', { pr_number: prNumber, review_state: 'COMMENT', commit_sha: 'sha_old', github_review_id: 1, comments: [] }, { token: repo.backend_token });
        await post('/api/reviews', { pr_number: prNumber, review_state: 'COMMENT', commit_sha: 'sha_latest', github_review_id: 2, comments: [] }, { token: repo.backend_token });
        const { body } = await get(`/api/reviews/latest?pr_number=${prNumber}`, { token: repo.backend_token });
        assert(body.commit_sha === 'sha_latest', 'should return the most recent commit_sha');
    });

    await test('does not return review from a different repo with same PR number', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repoA } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/rA_${randomId()}` }, { cookie });
        const { body: repoB } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/rB_${randomId()}` }, { cookie });
        await post('/api/reviews', { pr_number: 1, review_state: 'COMMENT', commit_sha: 'sha_A', github_review_id: 1, comments: [] }, { token: repoA.backend_token });
        const { status } = await get('/api/reviews/latest?pr_number=1', { token: repoB.backend_token });
        assert(status === 404, 'repoB should not see repoA reviews');
    });
}

// ─── GET /api/reviews ─────────────────────────────────────────────────────────

async function testGetAllReviews() {
    console.log('\nGET /api/reviews');

    await test('no session returns 401', async () => {
        const { status } = await get('/api/reviews');
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('page < 1 returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status } = await get('/api/reviews?page=0', { cookie });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('limit > 100 returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status } = await get('/api/reviews?limit=200', { cookie });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('returns empty array when no reviews exist', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status, body } = await get('/api/reviews', { cookie });
        assert(status === 200, `expected 200, got ${status}`);
        assert(Array.isArray(body) && body.length === 0, 'should return empty array');
    });

    await test('returns reviews with repo_full_name included', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        await post('/api/reviews', { pr_number: 1, review_state: 'APPROVE', commit_sha: `sha_${randomId()}`, github_review_id: 1, comments: [] }, { token: repo.backend_token });
        const { body } = await get('/api/reviews', { cookie });
        assert(body.length > 0, 'should have at least one review');
        assert(body[0].repo_full_name, 'should include repo_full_name');
    });

    await test('does not return reviews from another user', async () => {
        const userA = await createTestUser();
        const userB = await createTestUser();
        const cookieA = await createTestSession(userA.id);
        const cookieB = await createTestSession(userB.id);
        const { body: repoA } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/rA_${randomId()}` }, { cookie: cookieA });
        const { body: repoB } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/rB_${randomId()}` }, { cookie: cookieB });
        await post('/api/reviews', { pr_number: 1, review_state: 'COMMENT', commit_sha: `sha_${randomId()}`, github_review_id: 10, comments: [] }, { token: repoA.backend_token });
        await post('/api/reviews', { pr_number: 1, review_state: 'COMMENT', commit_sha: `sha_${randomId()}`, github_review_id: 11, comments: [] }, { token: repoB.backend_token });
        const { body } = await get('/api/reviews', { cookie: cookieA });
        const allBelongToA = body.every(r => r.repo_full_name === repoA.body?.repo_full_name || r.user_id !== userB.id);
        // Simpler check: none of the reviews should be from repoB
        const hasRepoBReview = body.some(r => r.repo_id === repoB.repo_id);
        assert(!hasRepoBReview, 'should not include reviews from userB repos');
    });

    await test('pagination — page 1 and page 2 return non-overlapping results', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        for (let i = 1; i <= 5; i++) {
            await post('/api/reviews', { pr_number: i, review_state: 'COMMENT', commit_sha: `sha_${randomId()}`, github_review_id: i * 100, comments: [] }, { token: repo.backend_token });
        }
        const { body: page1 } = await get('/api/reviews?page=1&limit=3', { cookie });
        const { body: page2 } = await get('/api/reviews?page=2&limit=3', { cookie });
        assert(page1.length === 3, `page 1 should have 3, got ${page1.length}`);
        assert(page2.length === 2, `page 2 should have 2, got ${page2.length}`);
        const page1Ids = new Set(page1.map(r => r.id));
        const overlap = page2.filter(r => page1Ids.has(r.id));
        assert(overlap.length === 0, 'pages should not overlap');
    });

    await test('page beyond results returns empty array', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body } = await get('/api/reviews?page=999', { cookie });
        assert(Array.isArray(body) && body.length === 0, 'should return empty array');
    });
}

// ─── GET /api/reviews/:id ─────────────────────────────────────────────────────

async function testGetReview() {
    console.log('\nGET /api/reviews/:id');

    await test('no session returns 401', async () => {
        const { status } = await get('/api/reviews/00000000-0000-0000-0000-000000000000');
        assert(status === 401, `expected 401, got ${status}`);
    });

    await test('invalid UUID format returns 400', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status } = await get('/api/reviews/notauuid', { cookie });
        assert(status === 400, `expected 400, got ${status}`);
    });

    await test('non-existent review id returns 404', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { status } = await get('/api/reviews/00000000-0000-0000-0000-000000000000', { cookie });
        assert(status === 404, `expected 404, got ${status}`);
    });

    await test('returns full review with comments array for valid id', async () => {
        const user = await createTestUser();
        const cookie = await createTestSession(user.id);
        const { body: repo } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/r_${randomId()}` }, { cookie });
        const comments = [{ file: 'src/a.js', line: 5, severity: 'error', comment: 'Bad code' }];
        const { body: created } = await post('/api/reviews', {
            pr_number: 1, review_state: 'REQUEST_CHANGES',
            commit_sha: `sha_${randomId()}`, github_review_id: 12345,
            comments, summary: 'Found issues'
        }, { token: repo.backend_token });
        const { status, body } = await get(`/api/reviews/${created.id}`, { cookie });
        assert(status === 200, `expected 200, got ${status}`);
        assert(body.id === created.id, 'should return correct review');
        assert(Array.isArray(body.comments), 'comments should be array');
        assert(body.comments.length === 1, 'should have 1 comment');
        assert(body.comments[0].file === 'src/a.js', 'comment data should be intact');
        assert(body.repo_full_name, 'should include repo_full_name');
        assert(body.summary === 'Found issues', 'summary should be intact');
    });

    await test('IDOR — cannot access another users review', async () => {
        const userA = await createTestUser();
        const userB = await createTestUser();
        const cookieA = await createTestSession(userA.id);
        const cookieB = await createTestSession(userB.id);
        const { body: repoA } = await post('/api/repos', { repo_full_name: `${TEST_PREFIX}owner/rA_${randomId()}` }, { cookie: cookieA });
        const { body: review } = await post('/api/reviews', {
            pr_number: 1, review_state: 'COMMENT',
            commit_sha: `sha_${randomId()}`, github_review_id: 99,
            comments: []
        }, { token: repoA.backend_token });
        const { status } = await get(`/api/reviews/${review.id}`, { cookie: cookieB });
        assert(status === 404, `expected 404, got ${status} — IDOR should be blocked`);
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  PR Maxxer — API Endpoint Test Suite');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Check server is reachable before running tests
    try {
        const res = await fetch(`${BASE_URL}/health`);
        if (!res.ok) throw new Error('Health check failed');
        console.log('\n→ Server reachable at', BASE_URL);
    } catch {
        console.error(`\n✗ Cannot reach server at ${BASE_URL}`);
        console.error('  Make sure the backend is running: npm run dev');
        process.exit(1);
    }

    try {
        console.log('\n→ Cleaning up leftover test data...');
        await cleanup();

        await testRequireToken();
        await testGetUserRepos();
        await testConnectRepo();
        await testUpdateConfig();
        await testGetRepoConfig();
        await testGetGithubRepos();
        await testSaveReview();
        await testGetLatestReview();
        await testGetAllReviews();
        await testGetReview();

        console.log('\n→ Cleaning up test data...');
        await cleanup();

    } catch (err) {
        console.error('\nFatal error outside test cases:', err);
    } finally {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`  Results: ${passed} passed, ${failed} failed`);
        if (failures.length > 0) {
            console.log('\n  Failed tests:');
            failures.forEach(f => console.log(`  ✗ ${f.name}\n    → ${f.error}`));
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        await pool.end();
        process.exit(failed > 0 ? 1 : 0);
    }
}

main();