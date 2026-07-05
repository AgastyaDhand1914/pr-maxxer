import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { getMe } from "./api";

// Pages
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import ReviewDetail from "./pages/ReviewDetail";
import Configuration from "./pages/Configuration";
import ConnectRepo from "./pages/ConnectRepo";

// Components
import NavBar from "./components/NavBar";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slowLoad, setSlowLoad] = useState(false);

  useEffect(() => {
    // Show a hint after 2s in case the Render backend is cold-starting
    const slowTimer = setTimeout(() => setSlowLoad(true), 2000);

    getMe()
      .then((data) => {
        setUser(data);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        clearTimeout(slowTimer);
        setLoading(false);
      });

    return () => clearTimeout(slowTimer);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center" style={{ height: "100vh", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div className="spinner"></div>
        {slowLoad && (
          <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>
            Waking up the backend… this can take up to 30s on a cold start.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {user && <NavBar user={user} setUser={setUser} />}
      <div className="container">
        <Routes>
          <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
          <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/" />} />
          <Route path="/reviews/:id" element={user ? <ReviewDetail /> : <Navigate to="/" />} />
          <Route path="/configuration" element={user ? <Configuration /> : <Navigate to="/" />} />
          <Route path="/connect" element={user ? <ConnectRepo /> : <Navigate to="/" />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
