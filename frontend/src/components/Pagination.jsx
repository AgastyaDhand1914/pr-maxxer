import React from "react";

export default function Pagination({ page, totalPages, setPage }) {
  return (
    <div className="flex items-center gap-2" style={{ justifyContent: "center", padding: "24px 0" }}>
      <button 
        className="btn" 
        disabled={page <= 1} 
        onClick={() => setPage(page - 1)}
        style={{ opacity: page <= 1 ? 0.5 : 1, cursor: page <= 1 ? "not-allowed" : "pointer" }}
      >
        Previous
      </button>
      <span style={{ fontSize: 14 }}>Page {page} of {totalPages || 1}</span>
      <button 
        className="btn" 
        disabled={page >= totalPages || totalPages === 0} 
        onClick={() => setPage(page + 1)}
        style={{ opacity: page >= totalPages || totalPages === 0 ? 0.5 : 1, cursor: page >= totalPages || totalPages === 0 ? "not-allowed" : "pointer" }}
      >
        Next
      </button>
    </div>
  );
}
