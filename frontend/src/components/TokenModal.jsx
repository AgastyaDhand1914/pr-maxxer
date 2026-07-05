import React, { useState } from "react";

export default function TokenModal({ token, repoFullName, onClose }) {
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedYaml, setCopiedYaml] = useState(false);

  const yamlContent = `name: AI PR Review

on:
  pull_request_target:
    types: [opened, synchronize]

permissions:
  pull-requests: write
  contents: read

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: AgastyaDhand1914/pr-maxxer
          ref: main
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install dependencies
        run: npm install
        working-directory: agent/
      - name: Run PR review
        run: node src/review.js
        working-directory: agent/
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GEMINI_API_KEY: \${{ secrets.GEMINI_API_KEY }}
          PR_REVIEW_BACKEND_TOKEN: \${{ secrets.PR_REVIEW_BACKEND_TOKEN }}
          BACKEND_URL: https://pr-maxxer-backend.onrender.com
          PR_NUMBER: \${{ github.event.pull_request.number }}
          PR_HEAD_SHA: \${{ github.event.pull_request.head.sha }}
          REPO: \${{ github.repository }}
          PR_ACTION: \${{ github.event.action }}`;

  const copyToClipboard = (text, setCopied) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const CopyIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  );

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.7)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000
    }}>
      <div className="card flex-col" style={{ width: 800, maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
        <h2 style={{ color: "var(--severity-warning)" }}>⚠️ Save your token — it will not be shown again</h2>
        <p style={{ marginBottom: 16 }}>Repository: <strong>{repoFullName}</strong></p>
        
        <div style={{ marginBottom: 24 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <strong>Backend Token:</strong>
            <button 
              className="btn flex items-center justify-center" 
              style={{ padding: copiedToken ? "4px 8px" : "4px", fontSize: 12, borderRadius: 4, height: 26, width: copiedToken ? "auto" : 26 }} 
              onClick={() => copyToClipboard(token, setCopiedToken)}
              title="Copy Backend Token"
            >
              {copiedToken ? "Copied!" : <CopyIcon />}
            </button>
          </div>
          <pre style={{ margin: 0, padding: 12, backgroundColor: "var(--bg-primary)", borderRadius: 6, border: "1px solid var(--border)", overflowX: "auto" }}>
            {token}
          </pre>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <strong>GitHub Actions Workflow:</strong>
            <button 
              className="btn flex items-center justify-center" 
              style={{ padding: copiedYaml ? "4px 8px" : "4px", fontSize: 12, borderRadius: 4, height: 26, width: copiedYaml ? "auto" : 26 }} 
              onClick={() => copyToClipboard(yamlContent, setCopiedYaml)}
              title="Copy GitHub Actions Workflow"
            >
              {copiedYaml ? "Copied!" : <CopyIcon />}
            </button>
          </div>
          <pre style={{ margin: 0, padding: 12, backgroundColor: "var(--bg-primary)", borderRadius: 6, border: "1px solid var(--border)", overflowX: "auto", fontSize: 12 }}>
            {yamlContent}
          </pre>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3>Setup Instructions</h3>
          <ol style={{ paddingLeft: 24, fontSize: 14 }}>
            <li style={{ marginBottom: 8 }}>Create the file <code className="monospace bg-primary" style={{ padding: "2px 4px", borderRadius: 4, border: "1px solid var(--border)" }}>.github/workflows/pr-review.yaml</code> in your repo with the YAML above</li>
            <li style={{ marginBottom: 8 }}>Go to your repo Settings → Secrets and variables → Actions → New repository secret</li>
            <li style={{ marginBottom: 8 }}>Add secret <strong>GEMINI_API_KEY</strong> — get your free key from aistudio.google.com</li>
            <li style={{ marginBottom: 8 }}>Add secret <strong>PR_REVIEW_BACKEND_TOKEN</strong> — paste the token shown above</li>
            <li style={{ marginBottom: 8 }}>Open a pull request — the AI review will appear within 60 seconds</li>
          </ol>
        </div>

        <div className="flex justify-between">
          <div />
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
