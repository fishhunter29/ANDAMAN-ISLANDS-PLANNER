import React, { useEffect, useState } from "react";

export default function MobileSummaryBar({
  total = 0,
  lineItems = [],
  badges = [],
  onRequestToBook = () => {},
  breakpointPx = 768
}) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(true);

  // format helper
  const formatINR = (n) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(Number(n) || 0);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpointPx]);

  // Optional: lock scroll when open
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = overflow);
  }, [open]);

  if (!isMobile) return null;

  return (
    <>
      {/* overlay */}
      {open && (
        <button
          aria-label="Close summary"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.35)",
            zIndex: 50,
            border: 0
          }}
        />
      )}

      {/* fixed bottom bar (full-bleed) */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 60,
          paddingBottom: "max(env(safe-area-inset-bottom), 0px)"
        }}
      >
        {/* HEADER BUTTON: two cells (Total | Value) */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-summary-panel"
          style={{
            width: "100%",
            border: 0,
            borderRadius: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            alignItems: "center",
            background:
              "linear-gradient(90deg, #0891b2 0%, #06b6d4 50%, #22d3ee 100%)",
            color: "white",
            padding: "12px 12px"
          }}
        >
          {/* LEFT CELL: 'Total' tag */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                background: "rgba(255,255,255,.15)",
                border: "1px solid rgba(255,255,255,.25)",
                color: "white",
                padding: "6px 10px",
                borderRadius: 999,
                letterSpacing: 0.3
              }}
            >
              TOTAL
            </span>

            {/* optional mini badges (days, travellers) */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {badges.map((b, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    background: "rgba(255,255,255,.12)",
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
          </div>

          {/* RIGHT CELL: value in white pill, strong black text */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <span
              style={{
                background: "white",
                color: "#0f172a",
                padding: "8px 12px",
                borderRadius: 12,
                fontWeight: 900,
                fontSize: 16,
                boxShadow: "0 2px 8px rgba(0,0,0,.12)"
              }}
            >
              {formatINR(total)}
            </span>
          </div>
        </button>

        {/* SLIDE PANEL with animation */}
        <div
          id="mobile-summary-panel"
          role="region"
          aria-label="Trip summary details"
          style={{
            background: "white",
            borderTop: "1px solid #e5e7eb",
            boxShadow: "0 -12px 28px rgba(0,0,0,.18)",
            overflow: "hidden",
            transform: open ? "translateY(0%)" : "translateY(100%)",
            transition: "transform 240ms ease",
            willChange: "transform"
          }}
        >
          <div style={{ padding: "12px 12px 8px" }}>
            {lineItems.map((li, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  fontSize: 14
                }}
              >
                <span>{li.label}</span>
                <strong>{formatINR(li.amount)}</strong>
              </div>
            ))}

            <div style={{ borderTop: "1px dashed #e5e7eb", margin: "6px 0" }} />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                fontSize: 16
              }}
            >
              <span>Total (indicative)</span>
              <strong>{formatINR(total)}</strong>
            </div>

            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
              Prices indicative; confirmed at booking.
            </div>

            <button
              onClick={onRequestToBook}
              style={{
                width: "100%",
                marginTop: 10,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #0ea5e9",
                background: "#0ea5e9",
                color: "white",
                fontWeight: 800
              }}
            >
              Request to Book
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
