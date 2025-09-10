import React, { useEffect, useMemo, useRef } from "react";

export default function TabNav({ tabs, current, onChange, counts = {} }) {
  const listRef = useRef(null);

  // Keyboard navigation
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const handler = (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();

      const items = Array.from(el.querySelectorAll('[role="tab"]'));
      const idx = items.findIndex((n) => n.getAttribute("aria-selected") === "true");
      let next = idx;

      if (e.key === "ArrowRight") next = Math.min(idx + 1, items.length - 1);
      if (e.key === "ArrowLeft") next = Math.max(idx - 1, 0);
      if (e.key === "Home") next = 0;
      if (e.key === "End") next = items.length - 1;

      items[next]?.focus();
      const key = items[next]?.dataset.key;
      if (key) onChange(key);
    };

    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [onChange]);

  // Add badge counts if available
  const items = useMemo(
    () =>
      tabs.map((t) => {
        const badge = counts[t.key];
        return { ...t, badge: typeof badge === "number" ? badge : null };
      }),
    [tabs, counts]
  );

  return (
    <div
      style={{
        position: "sticky",
        top: 56,
        zIndex: 20,
        background: "white",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      <div
        role="tablist"
        aria-label="Create Tour Steps"
        ref={listRef}
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "8px 16px",
          display: "flex",
          gap: 8,
          overflowX: "auto",
        }}
      >
        {items.map((t) => {
          const selected = t.key === current;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={selected ? "true" : "false"}
              aria-controls={`panel-${t.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.key)}
              data-key={t.key}
              style={{
                appearance: "none",
                border: 0,
                cursor: "pointer",
                outline: "none",
                outlineOffset: 2,
                padding: "8px 12px",
                borderRadius: 999,
                fontWeight: 700,
                background: selected
                  ? "linear-gradient(90deg,#0ea5e9,#06b6d4)"
                  : "#f1f5f9",
                color: selected ? "white" : "#0f172a",
                transition: "all 180ms ease",
              }}
            >
              <span style={{ whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
                {t.label}
                {t.badge !== null && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontWeight: 700,
                      fontSize: 12,
                      background: selected ? "white" : "rgba(255,255,255,0.9)",
                      color: selected ? "#0ea5e9" : "#0f172a",
                      borderRadius: 999,
                      padding: "2px 6px",
                      border: "1px solid rgba(14,165,233,.3)",
                      marginTop: -1,
                    }}
                  >
                    {t.badge}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
