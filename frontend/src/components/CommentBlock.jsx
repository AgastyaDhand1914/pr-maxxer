import React from "react";
import SeverityBadge from "./SeverityBadge";

export default function CommentBlock({ comment }) {
  let borderColor;
  switch (comment.severity) {
    case "error":
      borderColor = "var(--severity-error)";
      break;
    case "warning":
      borderColor = "var(--severity-warning)";
      break;
    case "suggestion":
    default:
      borderColor = "var(--severity-suggestion)";
      break;
  }

  return (
    <div style={{
      borderLeft: `3px solid ${borderColor}`,
      backgroundColor: "var(--bg-surface)",
      padding: "12px 16px",
      marginBottom: 16,
      borderRadius: "0 6px 6px 0",
      border: "1px solid var(--border)",
      borderLeftWidth: 3
    }}>
      <div className="flex items-center gap-1" style={{ marginBottom: 8 }}>
        <SeverityBadge severity={comment.severity} />
        <span className="monospace text-secondary" style={{ fontSize: 12 }}>Line {comment.line}</span>
      </div>
      <div style={{ fontSize: 14 }}>
        {comment.comment}
      </div>
    </div>
  );
}
