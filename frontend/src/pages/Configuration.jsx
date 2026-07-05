import React, { useState, useEffect } from "react";
import { getUserRepos, updateRepoConfig, regenerateRepoToken } from "../api";
import TokenModal from "../components/TokenModal";

export default function Configuration() {
  const [connectedRepos, setConnectedRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalToken, setModalToken] = useState("");
  const [modalRepoName, setModalRepoName] = useState("");

  // Config form state keyed by repo id
  const [configs, setConfigs] = useState({});

  useEffect(() => {
    fetchConnectedRepos();
  }, []);

  async function fetchConnectedRepos() {
    try {
      setLoading(true);
      const data = await getUserRepos();
      setConnectedRepos(data.repos || data || []);

      const initialConfigs = {};
      (data.repos || data || []).forEach(repo => {
        initialConfigs[repo.id] = {
          extensions: (repo.config?.extensions || [".js", ".ts", ".jsx", ".tsx", ".py"]).join(", "),
          minSeverity: repo.config?.minSeverity || "suggestion",
          customInstructions: repo.config?.customInstructions || ""
        };
      });
      setConfigs(initialConfigs);
    } catch (err) {
      setError("Failed to fetch connected repos");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveConfig(repoId) {
    try {
      const formConfig = configs[repoId];
      const exts = formConfig.extensions.split(",").map(s => s.trim()).filter(Boolean);

      await updateRepoConfig(repoId, {
        extensions: exts,
        minSeverity: formConfig.minSeverity,
        customInstructions: formConfig.customInstructions
      });

      alert("Config saved successfully!");
    } catch (err) {
      console.error("Failed to save config", err);
      alert("Failed to save configuration.");
    }
  }

  async function handleRegenerateToken(repoId) {
    if (!window.confirm("This will invalidate the old token immediately. Make sure to update your GitHub secret with the new one. Continue?")) return;
    try {
      const data = await regenerateRepoToken(repoId);
      setModalToken(data.backend_token);
      setModalRepoName(data.repo_full_name);
      setModalOpen(true);
    } catch (err) {
      console.error("Failed to regenerate token", err);
      alert("Failed to regenerate token.");
    }
  }

  const handleConfigChange = (repoId, field, value) => {
    setConfigs(prev => ({
      ...prev,
      [repoId]: {
        ...prev[repoId],
        [field]: value
      }
    }));
  };

  return (
    <div>
      <h2>Configuration</h2>

      {error && <div className="error-text" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

      <div style={{ marginBottom: 48 }}>
        <h3>Connected Repositories</h3>
        {loading ? (
          <div className="spinner" style={{ margin: "16px 0" }}></div>
        ) : connectedRepos.length === 0 ? (
          <p className="text-secondary">No repositories connected yet. Go to Connect Repo to get started.</p>
        ) : (
          connectedRepos.map(repo => (
            <div key={repo.id} className="card">
              <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
                <h4 className="monospace" style={{ margin: 0 }}>{repo.repo_full_name}</h4>
                <div className="flex items-center gap-4">
                  <button
                    className="btn"
                    style={{ fontSize: 12, padding: "4px 10px", whiteSpace: "nowrap", color: "var(--severity-warning)", borderColor: "var(--severity-warning)" }}
                    onClick={() => handleRegenerateToken(repo.id)}
                  >
                    Get New Token
                  </button>
                  {repo.is_active ? (
                    <span style={{ fontSize: 12, color: "var(--state-approve)", fontWeight: "bold", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--state-approve)" }} />
                      Active
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--severity-warning)", fontWeight: "bold", display: "flex", alignItems: "center", gap: 4 }} title="Waiting for the first PR review to complete">
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--severity-warning)" }} />
                      Pending setup
                    </span>
                  )}
                </div>
              </div>

              {!repo.is_active && (
                <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 6, backgroundColor: "rgba(var(--severity-warning-rgb, 230,180,80), 0.12)", border: "1px solid var(--severity-warning)", fontSize: 13, color: "var(--severity-warning)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span>⏳ Waiting for the first review — complete the setup steps and open a pull request to activate.</span>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-secondary" style={{ fontSize: 14 }}>File Extensions (comma separated)</label>
                <input
                  type="text"
                  value={configs[repo.id]?.extensions || ""}
                  onChange={(e) => handleConfigChange(repo.id, "extensions", e.target.value)}
                  style={{ padding: 8, borderRadius: 4, border: "1px solid var(--border)", backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}
                />

                <label className="text-secondary" style={{ fontSize: 14, marginTop: 8 }}>Minimum Severity</label>
                <select
                  value={configs[repo.id]?.minSeverity || "suggestion"}
                  onChange={(e) => handleConfigChange(repo.id, "minSeverity", e.target.value)}
                  style={{ padding: 8, borderRadius: 4, border: "1px solid var(--border)", backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}
                >
                  <option value="suggestion">Suggestion (All)</option>
                  <option value="warning">Warning and above</option>
                  <option value="error">Error only</option>
                </select>

                <label className="text-secondary" style={{ fontSize: 14, marginTop: 8 }}>Custom Instructions</label>
                <textarea
                  value={configs[repo.id]?.customInstructions || ""}
                  onChange={(e) => handleConfigChange(repo.id, "customInstructions", e.target.value)}
                  placeholder="e.g. This project uses a custom error handler, don't flag X as an issue"
                  rows={3}
                  style={{ padding: 8, borderRadius: 4, border: "1px solid var(--border)", backgroundColor: "var(--bg-primary)", color: "var(--text-primary)", fontFamily: "inherit" }}
                />

                <div style={{ marginTop: 16 }}>
                  <button className="btn" onClick={() => handleSaveConfig(repo.id)}>Save Config</button>
                </div>
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)" }}>
                💡 <strong>To disconnect:</strong> delete <code style={{ padding: "1px 4px", borderRadius: 3, backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>.github/workflows/pr-review.yaml</code> from your repo. The token stored in your repo secrets can also be deleted to fully revoke access.
              </div>
            </div>
          ))
        )}
      </div>

      {modalOpen && (
        <TokenModal
          token={modalToken}
          repoFullName={modalRepoName}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
