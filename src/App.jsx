import React, { useEffect, useMemo, useState } from "react";
import TabNav from "./components/TabNav.jsx";
import MobileSummaryBar from "./components/MobileSummaryBar.jsx";

const ISLANDS = ["Port Blair", "Havelock", "Neil", "Long Island", "Diglipur"];
const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
const norm = (s) => (s || "").toLowerCase();

function bestTimeHints(best_time) {
  const t = norm(best_time);
  const out = [];
  if (t.includes("morning")) out.push("morning");
  if (t.includes("afternoon")) out.push("afternoon");
  if (t.includes("evening") || t.includes("sunset") || t.includes("light"))
    out.push("evening");
  return out.length ? out : ["afternoon"];
}

function ferryDay(fromIsland, toIsland, f) {
  const label = f
    ? `Ferry ${f.from} → ${f.to} (${f.operator} ${f.depart}–${f.arrive}, ${f.duration_label})`
    : `Ferry ${fromIsland} → ${toIsland}`;
  return {
    island: fromIsland,
    transport: "—",
    windows: [
      {
        key: "ferry",
        label: "Ferry",
        cap: 24,
        used: 0,
        items: [{ type: "ferry", name: label }],
      },
    ],
  };
}

export default function App() {
  // DATA
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

  // NAV
  const tabs = [
    { key: "islands", label: "Islands" },
    { key: "mood", label: "Mood" },
    { key: "locations", label: "Locations" },
    { key: "itinerary", label: "Itinerary" },
    { key: "essentials", label: "Essentials" },
    { key: "hotels", label: "Hotels" },
    { key: "addons", label: "Add-ons" },
  ];
  const [step, setStep] = useState("islands");

  // STATE
  const [islandFilter, setIslandFilter] = useState("All");
  const [selectedIds, setSelectedIds] = useState(["pb_airport"]); // start from airport
  const [addonIds, setAddonIds] = useState([]);
  const [mood, setMood] = useState("balanced"); // relaxed | balanced | fast
  const [offbeat, setOffbeat] = useState(false);
  const [family, setFamily] = useState(false);

  // Filters
  const filtered = useMemo(() => {
    let list =
      islandFilter === "All"
        ? locations
        : locations.filter(
            (l) => (l.island || "").toLowerCase() === islandFilter.toLowerCase()
          );
    if (offbeat)
      list = list.filter(
        (l) =>
          (l.tags || []).includes("offbeat") ||
          (l.tags || []).includes("less-crowded")
      );
    if (family) list = list.filter((l) => (l.tags || []).includes("family"));
    return list;
  }, [islandFilter, locations, offbeat, family]);

  // Island visit order (based on selected items)
  const islandSeq = useMemo(() => {
    const seq = [];
    locations
      .filter((l) => selectedIds.includes(l.id))
      .forEach((l) => {
        if (l.island && !seq.includes(l.island)) seq.push(l.island);
      });
    return seq;
  }, [selectedIds, locations]);

  // Mood caps
  const caps = useMemo(() => {
    if (mood === "relaxed") return { morning: 2, afternoon: 3, evening: 2, max: 3 };
    if (mood === "fast")
      return { morning: 3.5, afternoon: 4.5, evening: 3, max: 6 };
    return { morning: 3, afternoon: 4, evening: 3, max: 5 };
  }, [mood]);

  // Itinerary generator
  const days = useMemo(() => {
    const sel = locations.filter((l) => selectedIds.includes(l.id));
    if (!sel.length || !islandSeq.length) return [];
    const d = [];
    let prev = null;

    islandSeq.forEach((island) => {
      if (prev && prev !== island) {
        const f = ferries.find(
          (ff) => norm(ff.from) === norm(prev) && norm(ff.to) === norm(island)
        );
        d.push(ferryDay(prev, island, f));
      }
      prev = island;

      const locs = sel.filter((l) => l.island === island);
      locs.forEach((l) => {
        const dur = Number(l.duration_hrs) || 2;
        const hints = bestTimeHints(l.best_time);

        // Try to place in existing day
        let placed = false;
        for (const day of d) {
          if (day.transport === "—" || day.island !== island) continue;
          const itemsCount = day.windows.reduce(
            (a, w) => a + w.items.filter((i) => i.type === "location").length,
            0
          );
          if (itemsCount >= caps.max) continue;

          for (const key of hints) {
            const w = day.windows.find((x) => x.key === key);
            const cap = caps[key];
            if (w && w.used + dur <= cap) {
              w.items.push({ type: "location", name: l.name, durationHrs: dur });
              w.used += dur;
              placed = true;
              break;
            }
          }
          if (placed) break;
        }

        // New day if needed
        if (!placed) {
          const nd = {
            island,
            transport:
              island === "Havelock" || island === "Neil"
                ? "Scooter"
                : "Point-to-Point",
            windows: [
              { key: "morning", label: "Morning", used: 0, items: [] },
              { key: "afternoon", label: "Afternoon", used: 0, items: [] },
              { key: "evening", label: "Evening", used: 0, items: [] },
            ],
          };

          let done = false;
          for (const key of hints) {
            const w = nd.windows.find((x) => x.key === key);
            const cap = caps[key];
            if (w && w.used + dur <= cap) {
              w.items.push({ type: "location", name: l.name, durationHrs: dur });
              w.used += dur;
              done = true;
              break;
            }
          }
          if (!done) {
            const aft = nd.windows.find((x) => x.key === "afternoon");
            aft.items.push({ type: "location", name: l.name, durationHrs: dur });
            aft.used += dur;
          }
          d.push(nd);
        }
      });
    });

    return d;
  }, [locations, selectedIds, islandSeq, ferries, caps]);

  // Costs (placeholder)
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

  const addonsTotal = useMemo(() => {
    return addonIds.reduce((acc, id) => {
      const a = activities.find((x) => x.id === id);
      return acc + (a?.approx_cost_inr || 2000);
    }, 0);
  }, [addonIds, activities]);

  const hotelsTotal = 0;
  const grandTotal = logistics + addonsTotal + hotelsTotal;

  const counts = useMemo(
    () => ({
      islands: islandFilter === "All" ? 0 : 1,
      mood: 0,
      locations: selectedIds.length,
      itinerary: days.length,
      essentials: 0,
      hotels: 0,
      addons: addonIds.length,
    }),
    [islandFilter, selectedIds.length, days.length, addonIds.length]
  );

  return (
    <div>
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "white",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div
          className="container"
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}
        >
          <b>Create Your Andaman Tour</b>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#475569" }}>
            Selected: {selectedIds.length} • Days: {days.length}
          </span>
        </div>
      </header>

      <TabNav tabs={tabs} current={step} onChange={setStep} counts={counts} />

      <main
        className="container"
        style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}
      >
        <section>
          {/* Islands */}
          <section
            id="panel-islands"
            role="tabpanel"
            hidden={step !== "islands"}
            aria-labelledby="tab-islands"
          >
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Pick island focus</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => setIslandFilter("All")}
                  style={chip(islandFilter === "All")}
                >
                  All
                </button>
                {ISLANDS.map((i) => (
                  <button
                    key={i}
                    onClick={() => setIslandFilter(i)}
                    style={chip(islandFilter === i)}
                  >
                    {i}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                Tip: Switching islands will add a ferry leg later.
              </div>
            </div>
          </section>

          {/* Mood */}
          <section
            id="panel-mood"
            role="tabpanel"
            hidden={step !== "mood"}
            aria-labelledby="tab-mood"
          >
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Trip mood</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setMood("relaxed")} style={chip(mood === "relaxed")}>
                  Relaxed
                </button>
                <button
                  onClick={() => setMood("balanced")}
                  style={chip(mood === "balanced")}
                >
                  Balanced
                </button>
                <button onClick={() => setMood("fast")} style={chip(mood === "fast")}>
                  Fast-paced
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button onClick={() => setOffbeat((v) => !v)} style={chip(offbeat)}>
                  Off-beat
                </button>
                <button onClick={() => setFamily((v) => !v)} style={chip(family)}>
                  Family-friendly
                </button>
              </div>
            </div>
          </section>

          {/* Locations */}
          <section
            id="panel-locations"
            role="tabpanel"
            hidden={step !== "locations"}
            aria-labelledby="tab-locations"
          >
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 10 }}>
                Choose locations (adventure first, then select)
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
                  gap: 12,
                }}
              >
                {filtered.map((l) => {
                  const selected = selectedIds.includes(l.id);
                  const advs = activities.filter((a) =>
                    (a.special_locations || []).some(
                      (p) =>
                        norm(p).includes(norm(l.name)) ||
                        norm(p).includes(norm(l.island))
                    )
                  );
                  return (
                    <div key={l.id} className="card" style={{ padding: 12 }}>
                      <div
                        style={{
                          height: 96,
                          background: "#e2e8f0",
                          borderRadius: 8,
                          marginBottom: 8,
                        }}
                      />
                      <b style={{ fontSize: 14 }}>{l.name}</b>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                        {l.island} • Best: {l.best_time || "—"} • {l.duration_hrs || 2}h
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <label style={{ fontSize: 12, color: "#475569" }}>
                          Add adventure (optional)
                        </label>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id && !addonIds.includes(id))
                              setAddonIds((prev) => [...prev, id]);
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
                            prev.includes(l.id)
                              ? prev.filter((x) => x !== l.id)
                              : [...prev, l.id]
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
          <section
            id="panel-itinerary"
            role="tabpanel"
            hidden={step !== "itinerary"}
            aria-labelledby="tab-itinerary"
          >
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 10 }}>
                Auto-scheduled Itinerary
              </div>
             
