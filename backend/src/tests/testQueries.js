require('dotenv').config({ path: '../../.env' });
const pool = require('../db/client');
const {
    createUser,
    findUserByGithubId,
    createRepo,
    getReposByUserId,
    getRepoByToken,
    updateRepoConfig,
    createReview,
    getReviewsByUserId,
    getReviewById,
    getLatestReviewForPR
} = require('../db/queries');

// ─── Test Runner ────────────────────────────────────────────────────────────

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

function assertRejects(promise, expectedMessage) {
    return promise.then(
        () => { throw new Error(`Expected rejection but resolved. Expected: "${expectedMessage}"`); },
        (err) => {
            if (expectedMessage && !err.message.includes(expectedMessage)) {
                throw new Error(`Rejected with wrong message.\n    Expected: "${expectedMessage}"\n    Got:      "${err.message}"`);
            }
        }
    );
}

// ─── Seed Helpers ───────────────────────────────────────────────────────────

// All test data uses this prefix so cleanup is safe and surgical
const TEST_PREFIX = 'TEST_QSCRIPT_';

function makeUser(overrides = {}) {
    const id = Math.random().toString(36).slice(2, 8);
    return {
        githubId: `${TEST_PREFIX}GH_${id}`,
        githubUsername: `${TEST_PREFIX}user_${id}`,
        githubToken: `${TEST_PREFIX}token_${id}`,
        ...overrides
    };
}

function makeRepo(userId, overrides = {}) {
    const id = Math.random().toString(36).slice(2, 8);
    return {
        userId,
        repoFullName: `${TEST_PREFIX}owner/repo_${id}`,
        backendToken: `${TEST_PREFIX}bt_${id}`,
        ...overrides
    };
}

function makeReview(repoId, overrides = {}) {
    return {
        repoId,
        prNumber: Math.floor(Math.random() * 9000) + 1000,
        prTitle: `${TEST_PREFIX}Test PR`,
        prAuthor: `${TEST_PREFIX}author`,
        prUrl: `https://github.com/test/repo/pull/1`,
        reviewState: 'COMMENT',
        summary: 'Test summary',
        comments: [{ file: 'src/index.js', line: 10, severity: 'error', comment: 'Test comment' }],
        commitSha: `${TEST_PREFIX}sha_${Math.random().toString(36).slice(2, 10)}`,
        githubReviewId: Math.floor(Math.random() * 1000000),
        ...overrides
    };
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

async function cleanup() {
    // Delete in reverse dependency order
    await pool.query(`
    DELETE FROM reviews
    WHERE repo_id IN (
      SELECT id FROM repos WHERE repo_full_name LIKE $1
    )
  `, [`${TEST_PREFIX}%`]);

    await pool.query(
        `DELETE FROM repos WHERE repo_full_name LIKE $1`,
        [`${TEST_PREFIX}%`]
    );

    await pool.query(
        `DELETE FROM users WHERE github_id LIKE $1`,
        [`${TEST_PREFIX}%`]
    );
}

// ─── createUser ─────────────────────────────────────────────────────────────

async function testCreateUser() {
    console.log('\ncreateUser');

    await test('creates a new user and returns full row', async () => {
        const input = makeUser();
        const user = await createUser(input);

        assert(user.id, 'should have a generated UUID');
        assert(user.github_id === input.githubId, 'github_id should match');
        assert(user.github_username === input.githubUsername, 'github_username should match');
        assert(user.github_token === input.githubToken, 'github_token should match');
        assert(user.created_at, 'should have a created_at timestamp');
    });

    await test('upserts on conflict — updates token and username for existing github_id', async () => {
        const input = makeUser();
        const first = await createUser(input);

        const updated = await createUser({
            ...input,
            githubToken: `${TEST_PREFIX}new_token`,
            githubUsername: `${TEST_PREFIX}new_username`
        });

        assert(updated.id === first.id, 'UUID should remain the same after upsert');
        assert(updated.github_token === `${TEST_PREFIX}new_token`, 'token should be updated');
        assert(updated.github_username === `${TEST_PREFIX}new_username`, 'username should be updated');
    });

    await test('upsert does not create a duplicate row', async () => {
        const input = makeUser();
        await createUser(input);
        await createUser(input);

        const { rows } = await pool.query(
            `SELECT COUNT(*) FROM users WHERE github_id = $1`,
            [input.githubId]
        );
        assert(parseInt(rows[0].count) === 1, 'should only have one row after two upserts');
    });

    await test('throws if githubId is missing', async () => {
        await assertRejects(
            createUser({ githubUsername: 'user', githubToken: 'token' }),
            'githubId is required'
        );
    });

    await test('throws if githubUsername is missing', async () => {
        await assertRejects(
            createUser({ githubId: 'id', githubToken: 'token' }),
            'githubUsername is required'
        );
    });

    await test('throws if githubToken is missing', async () => {
        await assertRejects(
            createUser({ githubId: 'id', githubUsername: 'user' }),
            'githubToken is required'
        );
    });
}

// ─── findUserByGithubId ──────────────────────────────────────────────────────

async function testFindUserByGithubId() {
    console.log('\nfindUserByGithubId');

    await test('returns user when they exist', async () => {
        const input = makeUser();
        const created = await createUser(input);
        const found = await findUserByGithubId(input.githubId);

        assert(found !== null, 'should not return null');
        assert(found.id === created.id, 'should return the correct user');
        assert(found.github_username === input.githubUsername, 'username should match');
    });

    await test('returns null for a non-existent github_id', async () => {
        const result = await findUserByGithubId(`${TEST_PREFIX}NONEXISTENT_999`);
        assert(result === null, 'should return null, not undefined or empty object');
    });

    await test('does not return a different user with a similar github_id', async () => {
        const userA = makeUser();
        const userB = makeUser();
        await createUser(userA);
        await createUser(userB);

        const found = await findUserByGithubId(userA.githubId);
        assert(found.github_id === userA.githubId, 'should return exactly userA');
        assert(found.github_id !== userB.githubId, 'should not return userB');
    });

    await test('throws if githubId is missing', async () => {
        await assertRejects(
            findUserByGithubId(undefined),
            'githubId is required'
        );
    });
}

// ─── createRepo ──────────────────────────────────────────────────────────────

async function testCreateRepo() {
    console.log('\ncreateRepo');

    await test('creates a repo and returns full row', async () => {
        const user = await createUser(makeUser());
        const input = makeRepo(user.id);
        const repo = await createRepo(input);

        assert(repo.id, 'should have a generated UUID');
        assert(repo.user_id === user.id, 'user_id should match');
        assert(repo.repo_full_name === input.repoFullName, 'repo_full_name should match');
        assert(repo.backend_token === input.backendToken, 'backend_token should match');
        assert(typeof repo.config === 'object', 'config should default to an object');
    });

    await test('enforces unique backend_token constraint', async () => {
        const user = await createUser(makeUser());
        const input = makeRepo(user.id);
        await createRepo(input);

        await assertRejects(
            createRepo({ ...makeRepo(user.id), backendToken: input.backendToken }),
            '' // postgres unique violation — any error is correct here
        );
    });

    await test('throws if userId is missing', async () => {
        await assertRejects(
            createRepo({ repoFullName: 'owner/repo', backendToken: 'token' }),
            'userId is required'
        );
    });

    await test('throws if repoFullName is missing', async () => {
        await assertRejects(
            createRepo({ userId: 'uid', backendToken: 'token' }),
            'repoFullName is required'
        );
    });

    await test('throws if backendToken is missing', async () => {
        await assertRejects(
            createRepo({ userId: 'uid', repoFullName: 'owner/repo' }),
            'backendToken is required'
        );
    });
}

// ─── getReposByUserId ────────────────────────────────────────────────────────

async function testGetReposByUserId() {
    console.log('\ngetReposByUserId');

    await test('returns empty array when user has no repos', async () => {
        const user = await createUser(makeUser());
        const repos = await getReposByUserId(user.id);

        assert(Array.isArray(repos), 'should return an array');
        assert(repos.length === 0, 'should be empty');
    });

    await test('returns all repos for the user', async () => {
        const user = await createUser(makeUser());
        await createRepo(makeRepo(user.id));
        await createRepo(makeRepo(user.id));
        await createRepo(makeRepo(user.id));

        const repos = await getReposByUserId(user.id);
        assert(repos.length === 3, 'should return all 3 repos');
    });

    await test('returns repos in descending created_at order', async () => {
        const user = await createUser(makeUser());
        const r1 = await createRepo(makeRepo(user.id));
        const r2 = await createRepo(makeRepo(user.id));
        const r3 = await createRepo(makeRepo(user.id));

        const repos = await getReposByUserId(user.id);
        assert(repos[0].id === r3.id, 'most recently created should be first');
        assert(repos[2].id === r1.id, 'oldest should be last');
    });

    await test('does not return repos belonging to a different user', async () => {
        const userA = await createUser(makeUser());
        const userB = await createUser(makeUser());
        await createRepo(makeRepo(userA.id));
        await createRepo(makeRepo(userB.id));

        const reposA = await getReposByUserId(userA.id);
        const allBelongToA = reposA.every(r => r.user_id === userA.id);
        assert(allBelongToA, 'should not return repos from userB');
    });

    await test('throws if userId is missing', async () => {
        await assertRejects(
            getReposByUserId(undefined),
            'userId is required'
        );
    });
}

// ─── getRepoByToken ──────────────────────────────────────────────────────────

async function testGetRepoByToken() {
    console.log('\ngetRepoByToken');

    await test('returns repo when token exists', async () => {
        const user = await createUser(makeUser());
        const input = makeRepo(user.id);
        await createRepo(input);

        const repo = await getRepoByToken(input.backendToken);
        assert(repo !== null, 'should not return null');
        assert(repo.backend_token === input.backendToken, 'should return correct repo');
    });

    await test('returns null for a non-existent token', async () => {
        const result = await getRepoByToken(`${TEST_PREFIX}nonexistent_token_999`);
        assert(result === null, 'should return null');
    });

    await test('does not return a repo with a different token', async () => {
        const user = await createUser(makeUser());
        const r1 = makeRepo(user.id);
        const r2 = makeRepo(user.id);
        await createRepo(r1);
        await createRepo(r2);

        const found = await getRepoByToken(r1.backendToken);
        assert(found.backend_token === r1.backendToken, 'should return r1 only');
        assert(found.backend_token !== r2.backendToken, 'should not return r2');
    });

    await test('throws if token is missing', async () => {
        await assertRejects(
            getRepoByToken(undefined),
            'token is required'
        );
    });
}

// ─── updateRepoConfig ────────────────────────────────────────────────────────

async function testUpdateRepoConfig() {
    console.log('\nupdateRepoConfig');

    await test('updates config and returns updated row', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        const config = { extensions: ['.js', '.ts'], min_severity: 'error', custom_instructions: 'test' };

        const updated = await updateRepoConfig(repo.id, user.id, config);
        assert(updated !== null, 'should return updated row');
        assert(updated.config.extensions.includes('.js'), 'config should be saved');
        assert(updated.config.min_severity === 'error', 'min_severity should be saved');
        assert(updated.config.custom_instructions === 'test', 'custom_instructions should be saved');
    });

    await test('IDOR prevention — returns null when repo belongs to a different user', async () => {
        const userA = await createUser(makeUser());
        const userB = await createUser(makeUser());
        const repoA = await createRepo(makeRepo(userA.id));

        // userB tries to update userA's repo
        const result = await updateRepoConfig(repoA.id, userB.id, { extensions: ['.py'] });
        assert(result === null, 'should return null — userB does not own this repo');
    });

    await test('returns null for a non-existent repoId', async () => {
        const user = await createUser(makeUser());
        const result = await updateRepoConfig('00000000-0000-0000-0000-000000000000', user.id, {});
        assert(result === null, 'should return null for non-existent repo');
    });

    await test('overwrites existing config entirely', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));

        await updateRepoConfig(repo.id, user.id, { extensions: ['.js'], min_severity: 'error' });
        const updated = await updateRepoConfig(repo.id, user.id, { extensions: ['.py'] });

        assert(updated.config.extensions[0] === '.py', 'extensions should be overwritten');
        assert(updated.config.min_severity === undefined, 'old keys should not persist');
    });

    await test('throws if repoId is missing', async () => {
        await assertRejects(
            updateRepoConfig(undefined, 'uid', {}),
            'repoId is required'
        );
    });

    await test('throws if userId is missing', async () => {
        await assertRejects(
            updateRepoConfig('rid', undefined, {}),
            'userId is required'
        );
    });

    await test('throws if config is missing', async () => {
        await assertRejects(
            updateRepoConfig('rid', 'uid', undefined),
            'config is required'
        );
    });
}

// ─── createReview ────────────────────────────────────────────────────────────

async function testCreateReview() {
    console.log('\ncreateReview');

    await test('creates a review and returns full row', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        const input = makeReview(repo.id);
        const review = await createReview(input);

        assert(review.id, 'should have a generated UUID');
        assert(review.repo_id === repo.id, 'repo_id should match');
        assert(review.pr_number === input.prNumber, 'pr_number should match');
        assert(review.review_state === 'COMMENT', 'review_state should match');
        assert(review.commit_sha === input.commitSha, 'commit_sha should match');
        assert(review.github_review_id === input.githubReviewId, 'github_review_id should match');
    });

    await test('stores comment_count correctly', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        const comments = [
            { file: 'a.js', line: 1, severity: 'error', comment: 'c1' },
            { file: 'b.js', line: 2, severity: 'warning', comment: 'c2' },
            { file: 'c.js', line: 3, severity: 'suggestion', comment: 'c3' }
        ];
        const review = await createReview(makeReview(repo.id, { comments }));
        assert(review.comment_count === 3, 'comment_count should equal comments array length');
    });

    await test('stores comments as parseable JSONB', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        const comments = [{ file: 'src/auth.js', line: 42, severity: 'error', comment: 'Missing null check' }];
        const review = await createReview(makeReview(repo.id, { comments }));

        assert(Array.isArray(review.comments), 'comments should be returned as array');
        assert(review.comments[0].file === 'src/auth.js', 'comment data should be intact');
        assert(review.comments[0].severity === 'error', 'severity should be intact');
    });

    await test('stores zero comments correctly', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        const review = await createReview(makeReview(repo.id, { comments: [], reviewState: 'APPROVE' }));

        assert(review.comment_count === 0, 'comment_count should be 0');
        assert(Array.isArray(review.comments) && review.comments.length === 0, 'comments should be empty array');
    });

    await test('throws if repoId is missing', async () => {
        await assertRejects(createReview({ ...makeReview('x'), repoId: undefined }), 'repoId is required');
    });

    await test('throws if prNumber is missing', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        await assertRejects(createReview({ ...makeReview(repo.id), prNumber: undefined }), 'prNumber is required');
    });

    await test('throws if reviewState is missing', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        await assertRejects(createReview({ ...makeReview(repo.id), reviewState: undefined }), 'reviewState is required');
    });

    await test('throws if commitSha is missing', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        await assertRejects(createReview({ ...makeReview(repo.id), commitSha: undefined }), 'commitSha is required');
    });

    await test('throws if githubReviewId is missing', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        await assertRejects(createReview({ ...makeReview(repo.id), githubReviewId: undefined }), 'githubReviewId is required');
    });
}

// ─── getReviewsByUserId ──────────────────────────────────────────────────────

async function testGetReviewsByUserId() {
    console.log('\ngetReviewsByUserId');

    await test('returns empty array when user has no reviews', async () => {
        const user = await createUser(makeUser());
        const reviews = await getReviewsByUserId(user.id);
        assert(Array.isArray(reviews), 'should return array');
        assert(reviews.length === 0, 'should be empty');
    });

    await test('returns reviews with repo_full_name joined', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        await createReview(makeReview(repo.id));

        const reviews = await getReviewsByUserId(user.id);
        assert(reviews[0].repo_full_name === repo.repo_full_name, 'should include repo_full_name from join');
    });

    await test('returns reviews in descending reviewed_at order', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        const r1 = await createReview(makeReview(repo.id));
        const r2 = await createReview(makeReview(repo.id));
        const r3 = await createReview(makeReview(repo.id));

        const reviews = await getReviewsByUserId(user.id);
        assert(reviews[0].id === r3.id, 'most recent review should be first');
        assert(reviews[reviews.length - 1].id === r1.id, 'oldest review should be last');
    });

    await test('does not return reviews from another user', async () => {
        const userA = await createUser(makeUser());
        const userB = await createUser(makeUser());
        const repoA = await createRepo(makeRepo(userA.id));
        const repoB = await createRepo(makeRepo(userB.id));
        await createReview(makeReview(repoA.id));
        await createReview(makeReview(repoB.id));

        const reviewsA = await getReviewsByUserId(userA.id);
        const allBelongToA = reviewsA.every(r => r.repo_full_name === repoA.repo_full_name);
        assert(allBelongToA, 'should not include reviews from userB repos');
    });

    await test('pagination — page 1 returns first N results', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        for (let i = 0; i < 5; i++) await createReview(makeReview(repo.id));

        const page1 = await getReviewsByUserId(user.id, 1, 3);
        assert(page1.length === 3, 'page 1 should return 3 results');
    });

    await test('pagination — page 2 returns next N results', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        for (let i = 0; i < 5; i++) await createReview(makeReview(repo.id));

        const page1 = await getReviewsByUserId(user.id, 1, 3);
        const page2 = await getReviewsByUserId(user.id, 2, 3);

        assert(page2.length === 2, 'page 2 should return remaining 2 results');
        const page1Ids = page1.map(r => r.id);
        const overlap = page2.filter(r => page1Ids.includes(r.id));
        assert(overlap.length === 0, 'page 2 should not contain any results from page 1');
    });

    await test('pagination — page beyond results returns empty array', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        await createReview(makeReview(repo.id));

        const page99 = await getReviewsByUserId(user.id, 99, 20);
        assert(page99.length === 0, 'should return empty array for out-of-range page');
    });

    await test('throws if userId is missing', async () => {
        await assertRejects(getReviewsByUserId(undefined), 'userId is required');
    });
}

// ─── getReviewById ───────────────────────────────────────────────────────────

async function testGetReviewById() {
    console.log('\ngetReviewById');

    await test('returns full review when it belongs to the user', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        const created = await createReview(makeReview(repo.id));

        const found = await getReviewById(created.id, user.id);
        assert(found !== null, 'should return the review');
        assert(found.id === created.id, 'should return correct review');
        assert(found.repo_full_name === repo.repo_full_name, 'should include repo_full_name');
        assert(Array.isArray(found.comments), 'comments should be parsed as array');
    });

    await test('IDOR prevention — returns null when review belongs to a different user', async () => {
        const userA = await createUser(makeUser());
        const userB = await createUser(makeUser());
        const repoA = await createRepo(makeRepo(userA.id));
        const review = await createReview(makeReview(repoA.id));

        // userB tries to access userA's review
        const result = await getReviewById(review.id, userB.id);
        assert(result === null, 'should return null — userB does not own this review');
    });

    await test('returns null for a non-existent reviewId', async () => {
        const user = await createUser(makeUser());
        const result = await getReviewById('00000000-0000-0000-0000-000000000000', user.id);
        assert(result === null, 'should return null for non-existent review');
    });

    await test('throws if reviewId is missing', async () => {
        await assertRejects(getReviewById(undefined, 'uid'), 'reviewId is required');
    });

    await test('throws if userId is missing', async () => {
        await assertRejects(getReviewById('rid', undefined), 'userId is required');
    });
}

// ─── getLatestReviewForPR ────────────────────────────────────────────────────

async function testGetLatestReviewForPR() {
    console.log('\ngetLatestReviewForPR');

    await test('returns commit_sha and github_review_id for existing review', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        const review = await createReview(makeReview(repo.id, { prNumber: 42 }));

        const result = await getLatestReviewForPR(repo.id, 42);
        assert(result !== null, 'should return a result');
        assert(result.commit_sha === review.commit_sha, 'commit_sha should match');
        assert(result.github_review_id === review.github_review_id, 'github_review_id should match');
    });

    await test('returns only the most recent review when multiple exist for same PR', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        const prNumber = 99;

        await createReview(makeReview(repo.id, { prNumber, commitSha: `${TEST_PREFIX}sha_old` }));
        await createReview(makeReview(repo.id, { prNumber, commitSha: `${TEST_PREFIX}sha_middle` }));
        const latest = await createReview(makeReview(repo.id, { prNumber, commitSha: `${TEST_PREFIX}sha_latest` }));

        const result = await getLatestReviewForPR(repo.id, prNumber);
        assert(result.commit_sha === latest.commit_sha, 'should return the most recent commit_sha');
    });

    await test('returns null when no reviews exist for this PR', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));

        const result = await getLatestReviewForPR(repo.id, 9999);
        assert(result === null, 'should return null when no reviews found');
    });

    await test('does not return reviews from a different PR on the same repo', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        await createReview(makeReview(repo.id, { prNumber: 1 }));

        const result = await getLatestReviewForPR(repo.id, 2);
        assert(result === null, 'should return null — PR 2 has no reviews');
    });

    await test('does not return reviews from a different repo with the same PR number', async () => {
        const user = await createUser(makeUser());
        const repoA = await createRepo(makeRepo(user.id));
        const repoB = await createRepo(makeRepo(user.id));
        await createReview(makeReview(repoA.id, { prNumber: 1 }));

        const result = await getLatestReviewForPR(repoB.id, 1);
        assert(result === null, 'should return null — repoB has no reviews for PR 1');
    });

    await test('throws if repoId is missing', async () => {
        await assertRejects(getLatestReviewForPR(undefined, 1), 'repoId is required');
    });

    await test('throws if prNumber is missing', async () => {
        await assertRejects(getLatestReviewForPR('rid', undefined), 'prNumber is required');
    });
}

// ─── Cascade Deletes ─────────────────────────────────────────────────────────

async function testCascadeDeletes() {
    console.log('\nCascade Deletes');

    await test('deleting a user cascades to their repos', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));

        await pool.query(`DELETE FROM users WHERE id = $1`, [user.id]);

        const { rows } = await pool.query(`SELECT * FROM repos WHERE id = $1`, [repo.id]);
        assert(rows.length === 0, 'repo should be deleted when user is deleted');
    });

    await test('deleting a repo cascades to its reviews', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        const review = await createReview(makeReview(repo.id));

        await pool.query(`DELETE FROM repos WHERE id = $1`, [repo.id]);

        const { rows } = await pool.query(`SELECT * FROM reviews WHERE id = $1`, [review.id]);
        assert(rows.length === 0, 'review should be deleted when repo is deleted');
    });

    await test('deleting a user cascades all the way to reviews', async () => {
        const user = await createUser(makeUser());
        const repo = await createRepo(makeRepo(user.id));
        const review = await createReview(makeReview(repo.id));

        await pool.query(`DELETE FROM users WHERE id = $1`, [user.id]);

        const { rows } = await pool.query(`SELECT * FROM reviews WHERE id = $1`, [review.id]);
        assert(rows.length === 0, 'review should be deleted when user is deleted');
    });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  PR Maxxer — Database Query Test Suite');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        console.log('\n→ Cleaning up any leftover test data...');
        await cleanup();

        await testCreateUser();
        await testFindUserByGithubId();
        await testCreateRepo();
        await testGetReposByUserId();
        await testGetRepoByToken();
        await testUpdateRepoConfig();
        await testCreateReview();
        await testGetReviewsByUserId();
        await testGetReviewById();
        await testGetLatestReviewForPR();
        await testCascadeDeletes();

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