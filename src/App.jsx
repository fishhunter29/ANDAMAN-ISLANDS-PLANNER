import React, { useEffect, useMemo, useState } from "react";
import TabNav from "./components/TabNav.jsx";
import MobileSummaryBar from "./components/MobileSummaryBar.jsx";

const ISLANDS = ["Port Blair", "Havelock", "Neil", "Long Island", "Diglipur"];
const norm = (s) => (s || "").toLowerCase();
const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

function bestTimeHints(best_time) {
  const t = norm(best_time);
  const out = [];
  if (t.includes("morning")) out.push("morning");
  if (t.includes("afternoon")) out.push("afternoon");
  if (t.includes("evening") || t.includes("sunset") || t.includes("light")) out.push("evening");
  return out.length ? out : ["afternoon"];
}

export default function App() {
  // --- Data ---
  const [locations, setLocations] = useState([]);
  const [activities, setActivities] = useState([]);
  const [ferries, setFerries] = useState([]);

  useEffect(() => {
    Promise.all([
      fetch("/data/locations.json").then((r) => r.json()),
      fetch("/data/activities.json").then((r) => r.json()),
      fetch("/data/ferries.json").then((r) => r.json()),
    ])
      .then(([locs, acts, fers]) => {
        setLocations(locs);
        setActivities(acts);
        setFerries(fers);
      })
      .catch((e) => console.error("Data load error", e));
  }, []);

  // --- Nav / state ---
  const tabs = [
    { key: "islands", label: "Islands" },
    { key: "locations", label: "Locations" },
    { key: "itinerary", label: "Itinerary" },
  ];
  const [step, setStep] = useState("islands");

  const [islandFilter, setIslandFilter] = useState("All");
  const [selectedIds, setSelectedIds] = useState(["pb_airport"]); // start at airport
  const [addonIds, setAddonIds] = useState([]);

  // --- Filters ---
  const filtered = useMemo(() => {
    return islandFilter === "All"
      ? locations
      : locations.filter((l) => norm(l.island) === norm(islandFilter));
  }, [islandFilter, locations]);

  // --- Island sequence for itinerary ---
  const islandSeq = useMemo(() => {
    const seq = [];
    locations
      .filter((l) => selectedIds.includes(l.id))
      .forEach((l) => {
        if (l.island && !seq.includes(l.island)) seq.push(l.island);
      });
    return seq;
  }, [selectedIds, locations]);

  // --- Simple itinerary generator (morning/afternoon/evening caps) ---
  const caps = { morning: 3, afternoon: 4, evening: 3, max: 5 };

  const days = useMemo(() => {
    const sel = locations.filter((l) => selectedIds.includes(l.id));
    if (!sel.length || !islandSeq.length) return [];
    const d = [];
    let prev = null;

    islandSeq.forEach((island) => {
      // ferry if island changed
      if (prev && prev !== island) {
        const f = ferries.find((ff) => norm(ff.from) === norm(prev) && norm(ff.to) === norm(island));
        d.push({
          island: prev,
          transport: "—",
          windows: [{ key: "ferry", label: "Ferry", items: [{ type: "ferry", name: f ? `Ferry ${f.from} → ${f.to} (${f.operator} ${f.depart}–${f.arrive})` : `Ferry ${prev} → ${island}` }] }],
        });
      }
      prev = island;

      const locs = sel.filter((l) => l.island === island);
      locs.forEach((l) => {
        const dur = Number(l.duration_hrs) || 2;
        const hints = bestTimeHints(l.best_time);
        let placed = false;

        // try to place into existing day for same island
        for (const day of d) {
          if (day.transport === "—" || day.island !== island) continue;
          const itemsCount = day.windows.reduce(
            (a, w) => a + w.items.filter((i) => i.type === "location").length,
            0
          );
          if (itemsCount >= caps.max) continue;

          for (const key of hints) {
            const w = day.windows.find((x) => x.key === key);
            if (w && (w.used || 0) + dur <= caps[key]) {
              w.items.push({ type: "location", name: l.name, durationHrs: dur });
              w.used = (w.used || 0) + dur;
              placed = true;
              break;
            }
          }
          if (placed) break;
        }

        // create a new day if not placed
        if (!placed) {
          const nd = {
            island,
            transport: island === "Havelock" || island === "Neil" ? "Scooter" : "Point-to-Point",
            windows: [
              { key: "morning", label: "Morning", used: 0, items: [] },
              { key: "afternoon", label: "Afternoon", used: 0, items: [] },
              { key: "evening", label: "Evening", used: 0, items: [] },
            ],
          };
          const first = hints[0] || "afternoon";
          const w = nd.windows.find((x) => x.key === first) || nd.windows[1];
          w.items.push({ type: "location", name: l.name, durationHrs: dur });
          w.used += dur;
          d.push(nd);
        }
      });
    });

    return d;
  }, [locations, selectedIds, islandSeq, ferries]);

  // --- Costs (very rough) ---
  const logistics = useMemo(() => {
    let sum = 0;
    days.forEach((day) => {
      if (day.transport === "—") return;
      const stops = day.windows.reduce(
        (a, w) => a + w.items.filter((i) => i.type === "location").length,
        0
      );
      sum += stops >= 3 ? 3000 : 1000;
    });
    return sum;
  }, [days]);

  const addonsTotal = useMemo(
    () =>
      addonIds.reduce((acc, id) => {
        const a = activities.find((x) => x.id === id);
        return acc + (a?.approx_cost_inr || 2000);
      }, 0),
    [addonIds, activities]
  );

  const grandTotal = logistics + addonsTotal;

  const counts = useMemo(
    () => ({
      islands: islandFilter === "All" ? 0 : 1,
      locations: selectedIds.length,
      itinerary: days.length,
    }),
    [islandFilter, selectedIds.length, days.length]
  );

  return (
    <div>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 30, background: "white", borderBottom: "1px solid #e5e7eb" }}>
        <div className="container" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
          <b>Create Your Andaman Tour</b>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#475569" }}>
            Selected: {selectedIds.length} • Days: {days.length}
          </span>
        </div>
      </header>

      <TabNav tabs={[{key:"islands",label:"Islands"},{key:"locations",label:"Locations"},{key:"itinerary",label:"Itinerary"}]} current={step} onChange={setStep} counts={counts} />

      <main className="container" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
        <section>
          {/* Islands */}
          <section id="panel-islands" role="tabpanel" hidden={step !== "islands"}>
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Pick island focus</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setIslandFilter("All")} style={chip(islandFilter === "All")}>All</button>
                {ISLANDS.map((i) => (
                  <button key={i} onClick={() => setIslandFilter(i)} style={chip(islandFilter === i)}>{i}</button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Tip: Switching islands will add a ferry leg automatically.</div>
            </div>
          </section>

          {/* Locations */}
          <section id="panel-locations" role="tabpanel" hidden={step !== "locations"}>
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Choose locations (adventure first, then select)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
                {filtered.map((l) => {
                  const selected = selectedIds.includes(l.id);
                  const advs = activities.filter((a) =>
                    (a.special_locations || []).some(
                      (p) => norm(p).includes(norm(l.name)) || norm(p).includes(norm(l.island))
                    )
                  );
                  return (
                    <div key={l.id} className="card" style={{ padding: 12 }}>
                      <div style={{ height: 96, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                      <b style={{ fontSize: 14 }}>{l.name}</b>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                        {l.island} • Best: {l.best_time || "—"} • {l.duration_hrs || 2}h
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <label style={{ fontSize: 12, color: "#475569" }}>Add adventure (optional)</label>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id && !addonIds.includes(id)) setAddonIds((prev) => [...prev, id]);
                            e.target.value = "";
                          }}
                          style={{ width: "100%", marginTop: 4 }}
                        >
                          <option value="">— Choose —</option>
                          {advs.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.activity} ({formatINR(a.approx_cost_inr)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() =>
                          setSelectedIds((prev) =>
                            prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                          )
                        }
                        style={{
                          marginTop: 10,
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid var(--accent)",
                          background: selected ? "var(--accent)" : "white",
                          color: selected ? "white" : "var(--accent)",
                          fontWeight: 700,
                        }}
                      >
                        {selected ? "Selected" : "Select"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Itinerary */}
          <section id="panel-itinerary" role="tabpanel" hidden={step !== "itinerary"}>
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Auto-scheduled Itinerary</div>
              {!days.length && <p style={{ fontSize: 14 }}>Pick some locations first.</p>}
              <div className="grid">
                {days.map((day, i) => (
                  <div key={i} className="card" style={{ padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <b>Day {i + 1} — {day.island} {day.transport === "—" ? "(Ferry)" : ""}</b>
                      <span style={{ fontSize: 12, color: "#334155" }}>Transport: {day.transport}</span>
                    </div>
                    {day.windows.map((w) => (
                      <div key={w.key} style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 12, color: "#334155", fontWeight: 700 }}>{w.label || w.key}</div>
                        <ul style={{ marginTop: 4, paddingLeft: 18, fontSize: 14 }}>
                          {w.items.length === 0 && <li style={{ color: "#94a3b8" }}>—</li>}
                          {w.items.map((it, k) => (
                            <li key={k}>{it.type === "ferry" ? it.name : `${it.name} (${it.durationHrs}h)`}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </section>

        {/* Summary (desktop) */}
        <aside>
          <div style={{ position: "sticky", top: 90 }}>
            <div className="card">
              <b>Trip Summary</b>
              <div style={{ marginTop: 8, fontSize: 14 }}>
                <div>Islands: {islandSeq.length || "—"}</div>
                <div>Locations: {selectedIds.length}</div>
                <div>Adventures: {addonIds.length}</div>
                <div style={{ marginTop: 8, borderTop: "1px dashed #e5e7eb", paddingTop: 8 }}>
                  <div>Essentials (logistics est.): <b>{formatINR(logistics)}</b></div>
                  <div>Add-ons: <b>{formatINR(addonsTotal)}</b></div>
                </div>
              </div>
              <button style={{ marginTop: 12, width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--accent)", background: "var(--accent)", color: "white", fontWeight: 700 }}>
                Request to Book
              </button>
            </div>
          </div>
        </aside>
      </main>

      {/* Mobile summary */}
      <MobileSummaryBar
        total={grandTotal}
        lineItems={[
          { label: "Essentials (logistics est.)", amount: logistics },
          { label: "Add-ons", amount: addonsTotal },
          { label: "Hotels", amount: 0 }
        ]}
        badges={[
          { label: "locations", value: selectedIds.length },
          { label: "days", value: days.length },
          { label: "add-ons", value: addonIds.length }
        ]}
        onRequestToBook={() => alert("This would submit a Request to Book.")}
      />
    </div>
  );
}

const chip = (active) => ({
  padding: "8px 10px",
  borderRadius: 999,
  fontWeight: 700,
  border: "1px solid #e5e7eb",
  background: active ? "var(--accent)" : "white",
  color: active ? "white" : "#0f172a",
});
