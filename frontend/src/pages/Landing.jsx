import React from "react";

export default function Landing() {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  return (
    <div className="flex flex-col items-center" style={{ marginTop: "10vh", padding: "0 20px" }}>
      <div style={{
        display: "inline-block",
        padding: "6px 16px",
        borderRadius: "20px",
        backgroundColor: "rgba(88, 166, 255, 0.1)",
        color: "var(--text-primary)",
        fontSize: "14px",
        fontWeight: "500",
        marginBottom: "24px",
        border: "1px solid rgba(88, 166, 255, 0.2)"
      }}>
        Next-generation code reviews
      </div>
      
      <h1 style={{ 
        fontSize: 84, 
        marginBottom: 24, 
        letterSpacing: "-0.04em",
        background: "linear-gradient(to right, #ffffff, #8b949e)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        textAlign: "center",
        lineHeight: 1.1
      }}>
        pr-maxxer
      </h1>
      
      <p className="text-secondary" style={{ fontSize: 24, marginBottom: 48, textAlign: "center", maxWidth: 700, lineHeight: 1.5 }}>
        AI-powered code reviews for your GitHub pull requests. <br/> Integrated directly into your workflow.
      </p>

      <a 
        href={`${backendUrl}/auth/github`}
        className="btn btn-primary flex items-center gap-3" 
        style={{ padding: "18px 40px", fontSize: 20, borderRadius: 40, fontWeight: 600, marginBottom: 72, boxShadow: "0 0 40px rgba(88, 166, 255, 0.3)", transition: "all 0.3s ease" }}
      >
        <svg height="28" aria-hidden="true" viewBox="0 0 16 16" version="1.1" width="28" fill="currentColor">
          <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
        </svg>
        Sign in with GitHub
      </a>

      <div className="flex flex-col gap-6" style={{ marginBottom: 80, maxWidth: 800, width: "100%" }}>
        <h2 style={{ textAlign: "center", fontSize: 32, marginBottom: 16 }}>Why pr-maxxer?</h2>
        <div className="card card-hover flex items-start gap-4" style={{ padding: "28px 32px", border: "1px solid rgba(88, 166, 255, 0.15)" }}>
          <div style={{ background: "rgba(88, 166, 255, 0.1)", padding: 12, borderRadius: 12 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </div>
          <div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 20 }}>Inline comments</h3>
            <p className="text-secondary" style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>
              Receive detailed feedback directly on specific lines of code. It feels like a senior engineer is reviewing your pull requests in real time.
            </p>
          </div>
        </div>
        
        <div className="card card-hover flex items-start gap-4" style={{ padding: "28px 32px", border: "1px solid rgba(88, 166, 255, 0.15)" }}>
          <div style={{ background: "rgba(88, 166, 255, 0.1)", padding: 12, borderRadius: 12 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polyline></svg>
          </div>
          <div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 20 }}>Incremental reviews</h3>
            <p className="text-secondary" style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>
              pr-maxxer tracks your pull request history and only reviews the code that has changed since the last review, saving time and context.
            </p>
          </div>
        </div>
        
        <div className="card card-hover flex items-start gap-4" style={{ padding: "28px 32px", border: "1px solid rgba(88, 166, 255, 0.15)" }}>
          <div style={{ background: "rgba(88, 166, 255, 0.1)", padding: 12, borderRadius: 12 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          </div>
          <div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 20 }}>Full review history</h3>
            <p className="text-secondary" style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>
              Every review is safely persisted and fully searchable in your personal dashboard, giving you a complete audit trail of code feedback.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
