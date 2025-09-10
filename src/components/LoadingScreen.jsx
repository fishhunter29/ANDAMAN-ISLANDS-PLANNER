import React from "react";

export default function LoadingScreen({ label = "Loading…" }) {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span
          aria-hidden
          style={{
            width: 10, height: 10, borderRadius: 999,
            background: "linear-gradient(90deg, #0891b2, #06b6d4, #22d3ee)",
            animation: "pulse 1.2s ease-in-out infinite"
          }}
        />
        <b>{label}</b>
      </div>
      <style>{`
        @keyframes pulse {
          0%,100% { opacity: .55 }
          50% { opacity: 1 }
        }
      `}</style>
    </div>
  );
}
