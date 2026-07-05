import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { logout } from "../api";

export default function NavBar({ user, setUser }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      navigate("/");
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const location = useLocation();
  const avatarUrl = user?.github_username ? `https://avatars.githubusercontent.com/${user.github_username}` : null;

  const NavLink = ({ to, label }) => {
    const isActive = location.pathname.startsWith(to);
    return (
      <Link
        to={to}
        style={{
          color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
          backgroundColor: isActive ? "var(--bg-primary)" : "transparent",
          padding: "6px 12px",
          borderRadius: 20,
          fontWeight: isActive ? 600 : 400,
          transition: "all 0.2s"
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav style={{
      borderBottom: "1px solid var(--border)",
      backgroundColor: "rgba(22, 27, 34, 0.8)",
      backdropFilter: "blur(8px)",
      position: "sticky",
      top: 0,
      zIndex: 100,
      padding: "12px 24px"
    }}>
      <div className="flex justify-between items-center" style={{ maxWidth: 1012, margin: "0 auto" }}>
        <div className="flex items-center gap-4">
          <Link to="/dashboard" style={{ color: "var(--text-primary)", fontWeight: "bold", fontSize: 18, marginRight: 8, letterSpacing: "-0.02em" }}>
            pr-maxxer
          </Link>
          <NavLink to="/dashboard" label="Dashboard" />
          <NavLink to="/configuration" label="Configuration" />
          <NavLink to="/connect" label="Connect Repo" />
        </div>
        <div className="flex items-center gap-4">
          <a 
            href={`https://github.com/${user?.github_username}`} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="flex items-center gap-2"
            style={{ textDecoration: "none", color: "inherit", transition: "opacity 0.2s" }}
            onMouseOver={(e) => e.currentTarget.style.opacity = 0.8}
            onMouseOut={(e) => e.currentTarget.style.opacity = 1}
          >
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt={user?.github_username}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)" }}
              />
            )}
            <span style={{ fontSize: 14, fontWeight: 500 }}>{user?.github_username}</span>
          </a>
          <button className="btn" onClick={handleLogout} style={{ padding: "6px 12px", fontSize: 12 }}>
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
