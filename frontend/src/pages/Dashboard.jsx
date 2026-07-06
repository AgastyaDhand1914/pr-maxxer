import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getReviews, getUserRepos } from "../api";
import ReviewRow from "../components/ReviewRow";
import Pagination from "../components/Pagination";

export default function Dashboard() {
  const [reviews, setReviews] = useState([]);
  const [repos, setRepos] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterRepo, setFilterRepo] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [reviewsData, reposData] = await Promise.all([
          getReviews(page, 20, filterRepo || null),
          getUserRepos()
        ]);

        setReviews(reviewsData.reviews || reviewsData || []);
        setTotalPages(reviewsData.totalPages || 1);
        setRepos(reposData.repos || reposData || []);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [page, filterRepo]);

  const totalReviewsRun = reviews.length;
  const totalIssuesFound = reviews.reduce((sum, rev) => sum + (rev.comment_count || 0), 0);
  const reposConnected = repos.length;

  return (
    <div>
      <h2>Dashboard</h2>

      {error && (
        <div className="error-text" style={{ marginBottom: 16 }}>
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Stats Bar */}
      <div className="flex gap-2" style={{ marginBottom: 32 }}>
        <div className="card" style={{ flex: 1, marginBottom: 0 }}>
          <div className="text-secondary" style={{ fontSize: 14 }}>Total Reviews Run</div>
          <div style={{ fontSize: 32, fontWeight: "bold" }}>{totalReviewsRun}</div>
        </div>
        <div className="card" style={{ flex: 1, marginBottom: 0 }}>
          <div className="text-secondary" style={{ fontSize: 14 }}>Total Issues Found</div>
          <div style={{ fontSize: 32, fontWeight: "bold" }}>{totalIssuesFound}</div>
        </div>
        <div className="card" style={{ flex: 1, marginBottom: 0 }}>
          <div className="text-secondary" style={{ fontSize: 14 }}>Repositories Connected</div>
          <div style={{ fontSize: 32, fontWeight: "bold" }}>{reposConnected}</div>
        </div>
      </div>

      {/* Reviews Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="flex justify-between items-center" style={{ padding: "16px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-primary)" }}>
          <div style={{ fontWeight: "bold" }}>Recent Reviews</div>

          {repos.length > 0 && (
            <select
              value={filterRepo}
              onChange={(e) => {
                setFilterRepo(e.target.value);
                setPage(1); // reset to page 1 on filter change
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontSize: 14
              }}
            >
              <option value="">All Repositories</option>
              {repos.map(r => (
                <option key={r.id} value={r.id}>{r.repo_full_name}</option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="flex items-center" style={{ justifyContent: "center", padding: 64 }}>
            <div className="spinner"></div>
          </div>
        ) : reviews.length === 0 ? (
          <div style={{ padding: 64, textAlign: "center" }}>
            <p className="text-secondary" style={{ marginBottom: 16 }}>No reviews yet.</p>
            <Link to="/connect" className="btn btn-primary">Connect a repository to get started</Link>
          </div>
        ) : (
          <div>
            {reviews.map(review => (
              <ReviewRow
                key={review.id}
                review={review}
                onClick={() => navigate(`/reviews/${review.id}`)}
              />
            ))}
            <Pagination page={page} totalPages={totalPages} setPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
