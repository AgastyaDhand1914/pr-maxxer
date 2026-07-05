import React, { useState, useEffect } from "react";
import { getUserRepos, getGithubRepos, connectRepo } from "../api";
import TokenModal from "../components/TokenModal";

export default function ConnectRepo() {
  const [connectedRepos, setConnectedRepos] = useState([]);
  const [githubRepos, setGithubRepos] = useState([]);
  const [loadingGithub, setLoadingGithub] = useState(false);
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalToken, setModalToken] = useState("");
  const [modalRepoName, setModalRepoName] = useState("");

  useEffect(() => {
    fetchConnectedRepos();
  }, []);

  async function fetchConnectedRepos() {
    try {
      const data = await getUserRepos();
      setConnectedRepos(data.repos || data || []);
    } catch (err) {
      console.error("Failed to fetch connected repos");
    }
  }

  async function loadGithubRepos() {
    if (githubRepos.length > 0) return; // already loaded
    try {
      setLoadingGithub(true);
      const data = await getGithubRepos();
      setGithubRepos(data.repos || data || []);
    } catch (err) {
      console.error("Failed to fetch GitHub repos", err);
    } finally {
      setLoadingGithub(false);
    }
  }

  async function handleConnect(repoFullName) {
    try {
      const data = await connectRepo(repoFullName);
      setModalToken(data.backend_token);
      setModalRepoName(repoFullName);
      setModalOpen(true);
      
      // refresh connected repos
      fetchConnectedRepos();
    } catch (err) {
      console.error("Failed to connect repo", err);
      alert("Failed to connect repository. It may already be connected.");
    }
  }

  return (
    <div>
      <h2>Connect Repo</h2>
      
      <div>
        <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Connect a Repository</h3>
          <button className="btn" onClick={loadGithubRepos} disabled={loadingGithub}>
            {loadingGithub ? "Loading..." : "Load GitHub Repos"}
          </button>
        </div>
        
        {githubRepos.length > 0 && (
          <div className="flex flex-col gap-2">
            {githubRepos.map(repo => {
              const connectedRepo = connectedRepos.find(cr => cr.repo_full_name === repo.full_name);
              const isPending = connectedRepo && !connectedRepo.is_active;
              const isActive = connectedRepo?.is_active;
              return (
                <div key={repo.id} className="flex justify-between items-center" style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 6, backgroundColor: "var(--bg-surface)" }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="monospace">{repo.full_name}</strong>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 12, backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>
                        {repo.private ? "Private" : "Public"}
                      </span>
                    </div>
                    {repo.description && <div className="text-secondary" style={{ fontSize: 12, marginTop: 4 }}>{repo.description.slice(0, 80)}{repo.description.length > 80 ? '...' : ''}</div>}
                  </div>
                  
                  {isActive ? (
                    <span style={{ fontSize: 12, color: "var(--state-approve)", fontWeight: "bold", display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", backgroundColor: "var(--state-approve)" }} />
                      Active
                    </span>
                  ) : isPending ? (
                    <span style={{ fontSize: 12, color: "var(--severity-warning)", fontWeight: "bold", display: "flex", alignItems: "center", gap: 4 }} title="Workflow added — waiting for the first PR review">
                      <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", backgroundColor: "var(--severity-warning)" }} />
                      Pending
                    </span>
                  ) : (
                    <button className="btn btn-primary" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => handleConnect(repo.full_name)}>Connect</button>
                  )}
                </div>
              );
            })}
          </div>
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
