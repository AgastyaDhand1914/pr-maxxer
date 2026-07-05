import React from "react";

export default function SeverityBadge({ severity }) {
  let bgColor, text;
  switch (severity) {
    case "error":
      bgColor = "var(--severity-error)";
      text = "ERROR";
      break;
    case "warning":
      bgColor = "var(--severity-warning)";
      text = "WARNING";
      break;
    case "suggestion":
    default:
      bgColor = "var(--severity-suggestion)";
      text = "SUGGESTION";
      break;
  }

  return (
    <span style={{
      backgroundColor: bgColor,
      color: "#fff",
      fontSize: 10,
      fontWeight: "bold",
      padding: "2px 6px",
      borderRadius: 12,
      display: "inline-block"
    }}>
      {text}
    </span>
  );
}
