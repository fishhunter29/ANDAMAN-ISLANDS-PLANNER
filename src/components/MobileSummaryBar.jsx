import React, { useEffect, useState } from "react";

export default function MobileSummaryBar({
  total = 0, lineItems = [], badges = [], onRequestToBook = () => {}, breakpointPx = 768,
}) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpointPx);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpointPx]);

  const formatINR = (n) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
      .format(Number(n) || 0);

  if (!isMobile) return null;

  return (
    <>
      {open && (
        <button
          aria-label="Close summary"
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 50, border: 0 }}
        />
      )}

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60, paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-summary-panel"
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: 10,
            alignItems: "center",
            background: "#0ea5e9",
            color: "white",
            padding: "12px 14px",
            border: 0,
            textAlign: "left"
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 12, opacity: 0.9 }}>Total</span>
            <strong style={{ fontSize: 18, letterSpacing: 0.2 }}>{formatINR(total)}</strong>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {badges.map((b, i) => (
              <span
                key={i}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  background: "rgba(255,255,255,.15)",
                  color: "white",
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,.25)"
                }}
              >
                {b.value} {b.label}
              </span>
            ))}
          </div>
          <span aria-hidden style={{ fontSize: 18, transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }}>▾</span>
        </button>

        <div
          id="mobile-summary-panel"
          role="region"
          aria-label="Trip summary details"
          style={{
            overflow: "hidden",
            background: "white",
            borderTop: "1px solid #e5e7eb",
            transition: "max-height 220ms ease",
            boxShadow: "0 -12px 28px rgba(0,0,0,.18)",
            maxHeight: open ? 420 : 0
          }}
        >
          <div style={{ padding: "10px 12px 4px" }}>
            {lineItems.map((li, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 14 }}>
                <span>{li.label}</span>
                <strong>{formatINR(li.amount)}</strong>
              </div>
            ))}
            <div style={{ borderTop: "1px dashed #e5e7eb", margin: "6px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 16 }}>
              <span>Total (indicative)</span>
              <strong>{formatINR(total)}</strong>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>Prices indicative; confirmed at booking.</div>
            <button
              onClick={onRequestToBook}
              style={{ width: "100%", marginTop: 10, padding: "12px 14px", borderRadius: 12, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "white", fontWeight: 800 }}
            >
              Request to Book
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
