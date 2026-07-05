import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getReviewById } from "../api";
import SeverityBadge from "../components/SeverityBadge";
import CommentBlock from "../components/CommentBlock";

function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

export default function ReviewDetail() {
  const { id } = useParams();
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchReview() {
      try {
        setLoading(true);
        const data = await getReviewById(id);
        setReview(data);
      } catch (err) {
        console.error("Failed to load review", err);
        setError("Failed to load review details.");
      } finally {
        setLoading(false);
      }
    }
    fetchReview();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center" style={{ justifyContent: "center", padding: 64 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="error-text">
        <span>⚠️ {error || "Review not found"}</span>
      </div>
    );
  }

  let stateColor;
  switch (review.review_state) {
    case "APPROVE": stateColor = "var(--state-approve)"; break;
    case "REQUEST_CHANGES": stateColor = "var(--state-changes)"; break;
    case "COMMENT":
    default: stateColor = "var(--state-comment)"; break;
  }

  // Group comments by file
  const commentsByFile = (review.comments || []).reduce((acc, comment) => {
    if (!acc[comment.file]) acc[comment.file] = [];
    acc[comment.file].push(comment);
    return acc;
  }, {});

  const hasComments = Object.keys(commentsByFile).length > 0;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link 
          to="/dashboard" 
          className="text-secondary" 
          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 500 }}
        >
          <span>←</span> Back to Dashboard
        </Link>
      </div>

      {/* Header section */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ marginBottom: 8 }}>{review.pr_title}</h1>
        <div className="monospace text-secondary" style={{ fontSize: 16, marginBottom: 16 }}>
          {review.repo_full_name}
        </div>
        
        <div className="flex items-center gap-3 text-secondary" style={{ fontSize: 14 }}>
          <span>@{review.pr_author}</span>
          <span style={{ color: stateColor, fontWeight: 500 }}>{review.review_state}</span>
          <span>{timeAgo(review.reviewed_at)}</span>
          {review.pr_url && (
            <a href={review.pr_url} target="_blank" rel="noreferrer" className="flex items-center gap-1">
              View on GitHub ↗
            </a>
          )}
        </div>
      </div>

      {/* Summary section */}
      <div className="card">
        <h3>AI Summary</h3>
        <div style={{ whiteSpace: "pre-wrap" }}>{review.summary}</div>
      </div>

      {/* Comments section */}
      <div style={{ marginTop: 48 }}>
        <h2>Inline Comments ({review.comment_count || 0})</h2>
        
        {!hasComments ? (
          <p className="text-secondary">No inline comments — see summary above.</p>
        ) : (
          Object.entries(commentsByFile).map(([file, comments]) => (
            <div key={file} style={{ marginBottom: 32 }}>
              <div 
                className="monospace" 
                style={{ 
                  backgroundColor: "var(--bg-surface)", 
                  padding: "8px 16px", 
                  border: "1px solid var(--border)",
                  borderRadius: "6px 6px 0 0",
                  borderBottom: "none",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                }}
              >
                📄 {file}
              </div>
              <div style={{ borderTop: "1px solid var(--border)" }}>
                {comments.map((comment, idx) => (
                  <CommentBlock key={idx} comment={comment} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
