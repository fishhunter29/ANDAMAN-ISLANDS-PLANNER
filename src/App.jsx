import React, { useMemo, useState, useEffect } from "react";

/** =========================
 *  Helpers (safe + simple)
 *  ========================= */
const safeNum = (n) => (typeof n === "number" && isFinite(n) ? n : 0);
const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(safeNum(n));

const addDays = (yyyy_mm_dd, n) => {
  if (!yyyy_mm_dd) return null;
  const d = new Date(yyyy_mm_dd);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** =========================
 *  Static constants
 *  ========================= */
const DEFAULT_ISLANDS = ["Port Blair", "Havelock", "Neil", "Long Island", "Diglipur"];

// Pricing knobs (adjust later or load from CMS)
const FERRY_BASE_ECON = 1500; // per pax, per leg
const FERRY_CLASS_MULT = { Economy: 1, Deluxe: 1.4, Luxury: 1.9 };

const CAB_MODELS = [
  { id: "sedan", label: "Sedan", dayRate: 2500 },
  { id: "suv", label: "SUV", dayRate: 3200 },
  { id: "innova", label: "Toyota Innova", dayRate: 3800 },
  { id: "traveller", label: "Tempo Traveller (12)", dayRate: 5200 },
];
const P2P_RATE_PER_HOP = 500;
const SCOOTER_DAY_RATE = 800;

const SEATMAP_URL = "https://seatmap.example.com"; // <-- replace with your actual seat-map page

/** ==========================================
 *  Better itinerary generator (duration-aware)
 *  Packs ~7h per day & inserts ferries
 *  Adds default "Airport Arrival" on Day 1
 *  ========================================== */
function orderByBestTime(items) {
  // simple ordering: morning -> afternoon -> evening -> other
  const rank = (it) => {
    const arr = (it.bestTimes || []).map((x) => String(x).toLowerCase());
    if (arr.some((t) => t.includes("morning") || t.includes("sunrise"))) return 0;
    if (arr.some((t) => t.includes("afternoon"))) return 1;
    if (arr.some((t) => t.includes("evening") || t.includes("sunset"))) return 2;
    return 3;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

function generateItineraryDays(selectedLocs, startFromPB = true) {
  const days = [];

  // Day 1: Airport arrival in Port Blair (always)
  days.push({
    island: "Port Blair",
    items: [
      { type: "arrival", name: "Arrival - Veer Savarkar Intl. Airport (IXZ)" },
      { type: "transfer", name: "Airport → Hotel (Port Blair)" },
    ],
    transport: "Point-to-Point",
  });

  if (!selectedLocs.length) return days;

  // group by island
  const byIsland = {};
  selectedLocs.forEach((l) => {
    (byIsland[l.island] ||= []).push(l);
  });

  // order islands alphabetically in DEFAULT_ISLANDS, PB first if present
  let order = Object.keys(byIsland).sort(
    (a, b) => DEFAULT_ISLANDS.indexOf(a) - DEFAULT_ISLANDS.indexOf(b)
  );
  if (startFromPB && order.includes("Port Blair")) {
    order = ["Port Blair", ...order.filter((x) => x !== "Port Blair")];
  }

  // per island → bucket into days by ~7h budget (ensure 2–4 stops if possible)
  order.forEach((island, idx) => {
    const locs = orderByBestTime(byIsland[island] || []);
    let dayBucket = [];
    let timeUsed = 0;

    const flushDay = () => {
      if (!dayBucket.length) return;
      // ensure min 2 stops (if available)
      if (dayBucket.length === 1 && locs.length) {
        const next = locs.shift();
        if (next) {
          const dur = Number.isFinite(next.durationHrs) ? next.durationHrs : 2;
          dayBucket.push(next);
          timeUsed += dur;
        }
      }
      days.push({
        island,
        items: dayBucket.map((x) => ({
          type: "location",
          ref: x.id,
          name: x.name,
          durationHrs: x.durationHrs ?? 2,
          bestTimes: x.bestTimes || [],
        })),
        transport:
          dayBucket.length >= 3
            ? "Day Cab"
            : ["Havelock", "Neil"].includes(island)
            ? "Scooter"
            : "Point-to-Point",
      });
      dayBucket = [];
      timeUsed = 0;
    };

    while (locs.length) {
      const x = locs.shift();
      const dur = Number.isFinite(x.durationHrs) ? x.durationHrs : 2;
      const wouldBe = timeUsed + dur;
      if (dayBucket.length >= 4 || wouldBe > 7) {
        flushDay();
      }
      dayBucket.push(x);
      timeUsed += dur;
    }
    flushDay();

    // insert ferry leg if moving to next island
    const nextIsland = order[idx + 1];
    if (nextIsland) {
      days.push({
        island,
        items: [{ type: "ferry", name: `Ferry ${island} → ${nextIsland}`, time: "08:00–09:30" }],
        transport: "—",
      });
    }
  });
  return days;
}

/** =========================
 *  The Wireframe Component
 *  ========================= */
export default function CreateTourWireframeDemo() {
  // Load real data from /public/data
  const [locations, setLocations] = useState([]);
  const [activities, setActivities] = useState([]);
  const [ferries, setFerries] = useState([]);
  const [dataStatus, setDataStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    (async () => {
      try {
        const [locRes, actRes, ferRes] = await Promise.all([
          fetch("/data/locations.json"),
          fetch("/data/activities.json"),
          fetch("/data/ferries.json"),
        ]);
        const [locJson, actJson, ferJson] = await Promise.all([
          locRes.json(),
          actRes.json(),
          ferRes.json(),
        ]);
        setLocations(locJson || []);
        setActivities(actJson || []);
        setFerries(ferJson || []);
        setDataStatus("ready");
      } catch (e) {
        console.error("Data load error:", e);
        setDataStatus("error");
      }
    })();
  }, []);

  const islandsList = useMemo(() => {
    const s = new Set(locations.map((l) => l.island).filter(Boolean));
    return s.size ? Array.from(s) : DEFAULT_ISLANDS;
  }, [locations]);

  // —— App state
  const [step, setStep] = useState(0); // 0..5
  const [startDate, setStartDate] = useState(""); // optional; blank = no dates
  const [adults, setAdults] = useState(2);
  const [infants, setInfants] = useState(0);
  const pax = adults + infants;
  const [startPB, setStartPB] = useState(true);

  // Step 1: selection
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedLocs = useMemo(
    () => locations.filter((l) => selectedIds.includes(l.id)),
    [locations, selectedIds]
  );

  // Scooters selected per island (affects logistics)
  const [scooterIslands, setScooterIslands] = useState(new Set()); // e.g., {"Havelock","Neil"}

  // Step 2: itinerary (list of days)
  const [days, setDays] = useState([]);
  // Re-generate whenever selection changes so costs update dynamically in summary—always
  useEffect(() => {
    setDays(generateItineraryDays(selectedLocs, startPB));
  }, [selectedLocs, startPB]);

  // Day editing helpers
  const addEmptyDayAfter = (index) => {
    const copy = [...days];
    copy.splice(index + 1, 0, { island: copy[index]?.island || "Port Blair", items: [], transport: "Point-to-Point" });
    setDays(copy);
  };
  const deleteDay = (index) => {
    const copy = [...days];
    copy.splice(index, 1);
    setDays(copy);
  };
  const moveItem = (fromDay, itemIdx, dir = 1) => {
    const toDay = fromDay + dir;
    if (toDay < 0 || toDay >= days.length) return;
    const copy = [...days];
    const [item] = copy[fromDay].items.splice(itemIdx, 1);
    copy[toDay].items.push(item);
    setDays(copy);
  };
  const setTransportForDay = (i, mode) => {
    const copy = [...days];
    copy[i] = { ...copy[i], transport: mode };
    setDays(copy);
  };

  // Step 3: hotels chosen per island-night (placeholder mapping)
  const [chosenHotels, setChosenHotels] = useState({});
  const nightsByIsland = useMemo(() => {
    const map = {};
    days.forEach((day) => {
      if (!day.items.some((i) => i.type === "ferry")) {
        map[day.island] = (map[day.island] || 0) + 1;
      }
    });
    return map;
  }, [days]);
  const MOCK_HOTELS = useMemo(() => ({
    "Port Blair": [
      { id: "pb_h1", name: "PB Value Hotel", tier: "Value", sell_price: 3299 },
      { id: "pb_h2", name: "PB Mid Hotel", tier: "Mid", sell_price: 5499 },
      { id: "pb_h3", name: "PB Premium Hotel", tier: "Premium", sell_price: 8899 },
    ],
    Havelock: [
      { id: "hl_h1", name: "HL Value Hotel", tier: "Value", sell_price: 4499 },
      { id: "hl_h2", name: "HL Mid Hotel", tier: "Mid", sell_price: 6999 },
      { id: "hl_h3", name: "HL Premium Hotel", tier: "Premium", sell_price: 10999 },
    ],
    Neil: [
      { id: "nl_h1", name: "NL Value Hotel", tier: "Value", sell_price: 3399 },
      { id: "nl_h2", name: "NL Mid Hotel", tier: "Mid", sell_price: 5699 },
    ],
    "Long Island": [{ id: "li_h1", name: "LI Mid Hotel", tier: "Mid", sell_price: 6199 }],
    Diglipur: [{ id: "dg_h1", name: "DG Lodge", tier: "Value", sell_price: 2899 }],
  }), []);

  const chooseHotel = (island, hotelId) =>
    setChosenHotels((p) => ({ ...p, [island]: hotelId }));

  // Step 4: essentials
  const [essentials, setEssentials] = useState({
    ferryClass: "Deluxe",
    cabModelId: CAB_MODELS[1].id, // default SUV
  });

  // Step 5: add-ons — suggestions (fallback to all if no mapping)
  const suggestedActivities = useMemo(() => {
    const sel = new Set(selectedIds);
    const matched = activities.filter((a) => (a.locationIds || []).some((id) => sel.has(id)));
    return matched.length ? matched : activities;
  }, [activities, selectedIds]);

  const [addonIds, setAddonIds] = useState([]);

  /** =========================
   *  Dynamic costs (DYNAMIC!)
   *  ========================= */
  // Hotels
  const hotelsTotal = useMemo(() => {
    let sum = 0;
    Object.entries(nightsByIsland).forEach(([island, nights]) => {
      const hid = chosenHotels[island];
      if (!hid) return;
      const hotel = (MOCK_HOTELS[island] || []).find((h) => h.id === hid);
      if (hotel) sum += safeNum(hotel.sell_price) * nights;
    });
    return sum;
  }, [nightsByIsland, chosenHotels, MOCK_HOTELS]);

  // Add-ons
  const addonsTotal = useMemo(
    () =>
      addonIds.reduce((acc, id) => {
        const ad = activities.find((a) => a.id === id);
        return acc + safeNum(ad?.price);
      }, 0),
    [addonIds, activities]
  );

  // Ferry cost = per ferry leg * pax * class multiplier
  const ferryLegCount = useMemo(
    () => days.reduce((acc, d) => acc + d.items.filter((i) => i.type === "ferry").length, 0),
    [days]
  );
  const ferryTotal = useMemo(() => {
    const mult = FERRY_CLASS_MULT[essentials.ferryClass] ?? 1;
    return ferryLegCount * FERRY_BASE_ECON * mult * Math.max(1, adults); // infants often free; adjust later
  }, [ferryLegCount, essentials.ferryClass, adults]);

  // Ground/scooter costs (per day depending on transport or scooter selection)
  const cabDayRate = useMemo(() => {
    const found = CAB_MODELS.find((c) => c.id === essentials.cabModelId);
    return found ? found.dayRate : CAB_MODELS[0].dayRate;
  }, [essentials.cabModelId]);

  const logisticsTotal = useMemo(() => {
    let sum = 0;
    days.forEach((day) => {
      const isFerryDay = day.items.some((i) => i.type === "ferry");
      if (isFerryDay) return; // ferry cost handled separately
      const stops = day.items.filter((i) => i.type === "location").length;

      // Scooter override
      if (scooterIslands.has(day.island)) {
        sum += SCOOTER_DAY_RATE;
        return;
      }

      // Day Cab vs P2P
      if (day.transport === "Day Cab") {
        sum += cabDayRate;
      } else if (day.transport === "Point-to-Point") {
        sum += Math.max(1, stops - 1) * P2P_RATE_PER_HOP;
      } else if (day.transport === "Scooter") {
        sum += SCOOTER_DAY_RATE;
      }
    });
    return sum;
  }, [days, scooterIslands, cabDayRate]);

  const grandTotal = hotelsTotal + addonsTotal + logisticsTotal + ferryTotal;

  if (dataStatus === "loading") {
    return <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>Loading Andaman data…</div>;
  }
  if (dataStatus === "error") {
    return <div style={{ padding: 24, fontFamily: "system-ui, Arial", color: "#b91c1c" }}>
      Could not load data. Please check that <code>/public/data/*.json</code> exists in the repo.
    </div>;
  }

  // helpers
  const toggleScooter = (island) => {
    const next = new Set(scooterIslands);
    if (next.has(island)) next.delete(island);
    else next.add(island);
    setScooterIslands(next);
  };

  const islandsInPlan = Array.from(new Set(days.map((d) => d.island))).filter(Boolean);

  return (
    <div style={{ fontFamily: "system-ui, Arial", background: "#f6f7f8", minHeight: "100vh", color: "#0f172a" }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "white", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <b>Create Your Andaman Tour</b>
          <span style={{ fontSize: 12 }}>Step {step + 1} / 6</span>
        </div>
        <Stepper step={step} setStep={setStep} />
      </header>

      {/* Body */}
      <main className="app-main">
        <section>
          {step === 0 && (
            <Card title="Trip Basics">
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>
                Start date is optional. If you skip it, your itinerary will show Day 1, Day 2… without calendar dates.
              </div>
              <Row>
                <Field label="Start date (optional)">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </Field>
                <Field label="Adults">
                  <input type="number" min={1} value={adults} onChange={(e) => (setAdults(Number(e.target.value) || 0))} />
                </Field>
                <Field label="Infants">
                  <input type="number" min={0} value={infants} onChange={(e) => (setInfants(Number(e.target.value) || 0))} />
                </Field>
              </Row>
              <Row>
                <label><input type="checkbox" checked={startPB} onChange={() => setStartPB(!startPB)} /> Start from Port Blair if present</label>
              </Row>
              <FooterNav onNext={() => setStep(1)} />
            </Card>
          )}

          {step === 1 && (
            <Card title="Select Locations">
              <Row>
                <Field label="Filter by island">
                  <select onChange={(e) => {
                    const v = e.target.value;
                    if (v === "All") return setSelectedIds(locations.map(l => l.id));
                    setSelectedIds(locations.filter(l => l.island === v).map(l => l.id));
                  }}>
                    <option>All</option>
                    {islandsList.map((i) => <option key={i}>{i}</option>)}
                  </select>
                </Field>
                <div style={{ fontSize: 12, color: "#475569", alignSelf: "end" }}>{selectedLocs.length} selected</div>
              </Row>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
                {locations.map((l) => {
                  const picked = selectedIds.includes(l.id);
                  return (
                    <div key={l.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                      <div style={{ height: 96, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                      <b style={{ fontSize: 14 }}>{l.name}</b>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                        {l.island} • {l.durationHrs ?? 2}h
                      </div>
                      <button
                        onClick={() =>
                          setSelectedIds((prev) =>
                            prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                          )
                        }
                        style={{
                          marginTop: 8, width: "100%", padding: "8px 10px",
                          borderRadius: 8, border: "1px solid #0ea5e9",
                          background: picked ? "#0ea5e9" : "white",
                          color: picked ? "white" : "#0ea5e9", fontWeight: 600
                        }}
                      >
                        {picked ? "Selected" : "Select"}
                      </button>
                    </div>
                  );
                })}
              </div>
              <FooterNav onPrev={() => setStep(0)} onNext={() => setStep(2)} />
            </Card>
          )}

          {step === 2 && (
            <Card title="Itinerary">
              {!days.length && <p style={{ fontSize: 14 }}>Select a few locations first.</p>}
              <div style={{ display: "grid", gap: 12 }}>
                {days.map((day, i) => {
                  const calendarDate = startDate ? addDays(startDate, i) : null;
                  const dayLabel = calendarDate ? `${calendarDate}` : `No date set`;
                  return (
                    <div key={i} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <b>Day {i + 1} — {day.island}</b>
                        <span style={{ fontSize: 12, color: "#334155" }}>{dayLabel}</span>
                      </div>
                      <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 14 }}>
                        {day.items.map((it, k) => (
                          <li key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <span>
                              {it.type === "ferry" ? it.name :
                               it.type === "arrival" ? it.name :
                               it.type === "transfer" ? it.name :
                               `${it.name} (${it.durationHrs}h)`}
                            </span>
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <button onClick={() => moveItem(i, k, -1)} style={miniBtn} title="Move to previous day">◀︎</button>
                              <button onClick={() => moveItem(i, k, +1)} style={miniBtn} title="Move to next day">▶︎</button>
                            </span>
                          </li>
                        ))}
                      </ul>
                      {!day.items.some((it) => it.type === "ferry") && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <label style={{ fontSize: 12, color: "#475569" }}>Transport:</label>
                          <select value={day.transport} onChange={(e) => setTransportForDay(i, e.target.value)}>
                            <option>Point-to-Point</option>
                            <option>Day Cab</option>
                            <option>Scooter</option>
                            <option>—</option>
                          </select>
                          <button onClick={() => addEmptyDayAfter(i)} style={pillBtn}>+ Add empty day after</button>
                          <button onClick={() => deleteDay(i)} style={dangerBtn} disabled={days.length <= 1}>Delete day</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={() => addEmptyDayAfter(days.length - 1)} style={pillBtn}>+ Add another day</button>
              </div>
              <FooterNav onPrev={() => setStep(1)} onNext={() => setStep(3)} />
            </Card>
          )}

          {step === 3 && (
            <Card title="Hotels">
              {Object.entries(nightsByIsland).map(([island, nights]) => (
                <div key={island} style={{ marginBottom: 16 }}>
                  <b>{island} — {nights} night(s)</b>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 10, marginTop: 8 }}>
                    {(MOCK_HOTELS[island] || []).map((h) => {
                      const picked = chosenHotels[island] === h.id;
                      return (
                        <div key={h.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                          <div style={{ height: 80, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</div>
                          <div style={{ fontSize: 12, color: "#475569" }}>{h.tier} • From {formatINR(h.sell_price)}/night</div>
                          <button
                            onClick={() => chooseHotel(island, h.id)}
                            style={{
                              marginTop: 8, width: "100%", padding: "8px 10px",
                              borderRadius: 8, border: "1px solid #16a34a",
                              background: picked ? "#16a34a" : "white",
                              color: picked ? "white" : "#16a34a", fontWeight: 600
                            }}
                          >
                            {picked ? "Selected" : "Select"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <FooterNav onPrev={() => setStep(2)} onNext={() => setStep(4)} />
            </Card>
          )}

          {step === 4 && (
            <Card title="Essentials">
              <div style={{ display: "grid", gap: 14 }}>
                {/* Ferry config */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "white" }}>
                  <b>Ferry</b>
                  <Row>
                    <Field label="Class">
                      <select value={essentials.ferryClass} onChange={(e) => setEssentials({ ...essentials, ferryClass: e.target.value })}>
                        <option>Economy</option>
                        <option>Deluxe</option>
                        <option>Luxury</option>
                      </select>
                    </Field>
                    <Field label="Seat map">
                      <button onClick={() => window.open(SEATMAP_URL, "_blank")} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #0ea5e9", background: "white", color: "#0ea5e9", fontWeight: 700 }}>
                        Open Seat Map
                      </button>
                    </Field>
                  </Row>
                </div>

                {/* Ground transport */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "white" }}>
                  <b>Ground Transport</b>
                  <Row>
                    <Field label="Cab model (Day Cab days)">
                      <select value={essentials.cabModelId} onChange={(e) => setEssentials({ ...essentials, cabModelId: e.target.value })}>
                        {CAB_MODELS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label} — {formatINR(c.dayRate)}/day
                          </option>
                        ))}
                      </select>
                    </Field>
                  </Row>
                  <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>Scooter per island (overrides transport to scooter on those islands):</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {islandsInPlan.map((isl) => (
                      <label key={isl} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", background: "white" }}>
                        <input
                          type="checkbox"
                          checked={scooterIslands.has(isl)}
                          onChange={() => toggleScooter(isl)}
                          style={{ marginRight: 6 }}
                        />
                        {isl} — {formatINR(SCOOTER_DAY_RATE)}/day
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <FooterNav onPrev={() => setStep(3)} onNext={() => setStep(5)} />
            </Card>
          )}

          {step === 5 && (
            <Card title="Add-ons">
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>
                Suggested based on your selected locations. You can add now or later.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
                {suggestedActivities.map((a) => {
                  const on = addonIds.includes(a.id);
                  return (
                    <div key={a.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                      <div style={{ height: 80, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>{formatINR(a.price)}</div>
                      <button
                        onClick={() =>
                          setAddonIds((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))
                        }
                        style={{
                          marginTop: 8, width: "100%", padding: "8px 10px",
                          borderRadius: 8, border: "1px solid #0ea5e9",
                          background: on ? "#0ea5e9" : "white",
                          color: on ? "white" : "#0ea5e9", fontWeight: 600
                        }}
                      >
                        {on ? "Added" : "Add"}
                      </button>
                    </div>
                  );
                })}
              </div>
              <FooterNav onPrev={() => setStep(4)} onNext={() => alert("This would submit a lead for the full itinerary.")} nextLabel="Request to Book" />
            </Card>
          )}
        </section>

        {/* Desktop summary (cost-only, truly dynamic) */}
        <aside className="sidebar">
          <div style={{ position: "sticky", top: 80 }}>
            <div style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 16 }}>
              <b>Trip Summary</b>
              <div style={{ marginTop: 8, fontSize: 14 }}>
                <div>Start date: {startDate || "Not set"}</div>
                <div>Days planned: {days.length}</div>
                <div>Travellers: {adults} adult(s){infants ? `, ${infants} infant(s)` : ""}</div>

                {/* Pure cost breakdown */}
                <div style={{ marginTop: 8, borderTop: "1px dashed #e5e7eb", paddingTop: 8 }}>
                  <div>Hotels: <b>{formatINR(hotelsTotal)}</b></div>
                  <div>Ferries: <b>{formatINR(ferryTotal)}</b></div>
                  <div>Ground transport: <b>{formatINR(logisticsTotal)}</b></div>
                  <div>Add-ons: <b>{formatINR(addonsTotal)}</b></div>
                </div>
                <div style={{ marginTop: 8, borderTop: "2px solid #0ea5e9", paddingTop: 8, fontSize: 16 }}>
                  Total (indicative): <b>{formatINR(grandTotal)}</b>
                </div>
              </div>
              <button
                onClick={() => alert("This would submit a single Request-to-Book for the whole itinerary.")}
                style={{
                  marginTop: 12, width: "100%", padding: "10px 12px",
                  borderRadius: 10, border: "1px solid #0ea5e9",
                  background: "#0ea5e9", color: "white", fontWeight: 700
                }}
              >
                Request to Book Full Trip
              </button>
            </div>
          </div>
        </aside>
      </main>

      {/* Mobile sticky summary (cost-only) */}
      <MobileSummaryBar
        grandTotal={grandTotal}
        hotelsTotal={hotelsTotal}
        ferryTotal={ferryTotal}
        logisticsTotal={logisticsTotal}
        addonsTotal={addonsTotal}
      />
    </div>
  );
}

/** =========================
 *  Mobile Summary Bar
 *  ========================= */
function MobileSummaryBar({ grandTotal, hotelsTotal, ferryTotal, logisticsTotal, addonsTotal }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mobile-summary">
        <button className="mobile-summary__pill" onClick={() => setOpen(true)}>
          <span>Total</span>
          <b>{formatINR(grandTotal)}</b>
        </button>
      </div>
      {open && (
        <div className="mobile-summary__overlay" onClick={() => setOpen(false)}>
          <div className="mobile-summary__sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-summary__grab" />
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Cost Breakdown</div>
            <div style={{ fontSize: 14, display: "grid", gap: 6 }}>
              <div>Hotels: <b>{formatINR(hotelsTotal)}</b></div>
              <div>Ferries: <b>{formatINR(ferryTotal)}</b></div>
              <div>Ground transport: <b>{formatINR(logisticsTotal)}</b></div>
              <div>Add-ons: <b>{formatINR(addonsTotal)}</b></div>
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
                Total: <b>{formatINR(grandTotal)}</b>
              </div>
            </div>
            <button className="mobile-summary__cta" onClick={() => alert("Lead submit from mobile summary")}>
              Request to Book
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** =========================
 *  Tiny UI primitives
 *  ========================= */
const miniBtn = { border: "1px solid #e5e7eb", background: "white", borderRadius: 6, padding: "3px 8px", fontSize: 12 };
const pillBtn = { border: "1px solid #0ea5e9", background: "white", color: "#0ea5e9", borderRadius: 999, padding: "6px 10px", fontWeight: 700 };
const dangerBtn = { border: "1px solid #ef4444", background: "white", color: "#ef4444", borderRadius: 999, padding: "6px 10px", fontWeight: 700 };

function Card({ title, children }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 10 }}>{children}</div>;
}
function Field({ label, children }) {
  return (
    <label style={{ fontSize: 12, color: "#475569", display: "grid", gap: 6 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function FooterNav({ onPrev, onNext, nextLabel = "Next" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
      <button onClick={onPrev} disabled={!onPrev} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white" }}>
        Back
      </button>
      <button onClick={onNext} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "white", fontWeight: 700 }}>
        {nextLabel}
      </button>
    </div>
  );
}
function Stepper({ step, setStep }) {
  const labels = ["Basics", "Locations", "Itinerary", "Hotels", "Essentials", "Add-ons"];
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px 12px 16px", display: "grid", gridTemplateColumns: `repeat(${labels.length},1fr)`, gap: 6 }}>
      {labels.map((label, i) => (
        <button key={label} onClick={() => setStep(i)} style={{
          borderRadius: 10, padding: "8px 10px", border: "1px solid #e5e7eb",
          background: i === step ? "#0ea5e9" : "white", color: i === step ? "white" : "#0f172a", fontSize: 12, fontWeight: 600
        }}>
          {i + 1}. {label}
        </button>
      ))}
    </div>
  );
}
