import React from "react";

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

export default function ReviewRow({ review, onClick }) {
  let stateColor;
  switch (review.review_state) {
    case "APPROVE": stateColor = "var(--state-approve)"; break;
    case "REQUEST_CHANGES": stateColor = "var(--state-changes)"; break;
    case "COMMENT":
    default: stateColor = "var(--state-comment)"; break;
  }

  return (
    <div 
      onClick={onClick}
      style={{ 
        display: "flex", 
        alignItems: "center", 
        padding: "16px", 
        borderBottom: "1px solid var(--border)", 
        cursor: "pointer" 
      }}
      onMouseOver={(e) => e.currentTarget.style.backgroundColor = "var(--border)"}
      onMouseOut={(e) => e.currentTarget.style.backgroundColor = "transparent"}
    >
      <div style={{ flex: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{review.pr_title.length > 50 ? review.pr_title.slice(0, 50) + "..." : review.pr_title}</div>
        <div className="text-secondary monospace" style={{ fontSize: 12 }}>{review.repo_full_name}</div>
      </div>
      <div style={{ flex: 1, fontSize: 14 }}>@{review.pr_author}</div>
      <div style={{ flex: 1 }}>
        <span style={{ backgroundColor: "var(--border)", padding: "2px 8px", borderRadius: 12, fontSize: 12 }}>
          {review.comment_count} comments
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ color: stateColor, fontWeight: 500, fontSize: 14 }}>
          {review.review_state}
        </span>
      </div>
      <div style={{ flex: 1, textAlign: "right", fontSize: 12 }} className="text-secondary">
        {timeAgo(review.reviewed_at)}
      </div>
    </div>
  );
}
