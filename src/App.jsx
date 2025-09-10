import React, { useMemo, useState, useEffect } from "react";
import MobileSummaryBar from "./components/MobileSummaryBar.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import { useAndamanData } from "./hooks/useAndamanData.js";
import { generateItineraryDays } from "./utils/itinerary.js";
import { formatINR, addDays, inferMoods } from "./utils/normalize.js";

/** =========================
 *  Static constants
 *  ========================= */
const DEFAULT_ISLANDS = [
  "Port Blair (South Andaman)",
  "Havelock (Swaraj Dweep)",
  "Neil (Shaheed Dweep)",
  "Long Island (Middle Andaman)",
  "Rangat (Middle Andaman)",
  "Mayabunder (Middle Andaman)",
  "Diglipur (North Andaman)",
  "Little Andaman",
];

// Pricing (placeholder logic you can tune later)
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

const SEATMAP_URL = "https://seatmap.example.com"; // replace later

export default function App() {
  // Centralized data load (resilient, normalized)
  const { status, error, locations, activities, ferries, locAdventures } = useAndamanData();

  // —— App state
  const [step, setStep] = useState(0);
  const [startDate, setStartDate] = useState(""); // optional
  const [adults, setAdults] = useState(2);
  const [infants, setInfants] = useState(0);
  const pax = adults + infants;
  const [startPB, setStartPB] = useState(true);

  // Step 1: selection
  const [selectedIds, setSelectedIds] = useState([]);

  // hide airport from selection (arrival is default)
  const selectableLocations = useMemo(
    () => locations.filter((l) => !/airport/i.test(l.name || "")),
    [locations]
  );
  const selectedLocs = useMemo(
    () => locations.filter((l) => selectedIds.includes(l.id)),
    [locations, selectedIds]
  );

  // Mood + Island filters
  const [islandFilter, setIslandFilter] = useState("All");
  const [moodFilter, setMoodFilter] = useState("All");

  // Attach moods (either from data or inferred)
  const selectableWithMoods = useMemo(
    () =>
      selectableLocations.map((l) => ({
        ...l,
        moods: Array.isArray(l.moods) && l.moods.length ? l.moods : inferMoods(l),
      })),
    [selectableLocations]
  );

  // Filter what we display by island + mood
  const islandsList = useMemo(() => {
    const s = new Set(locations.map((l) => l.island).filter(Boolean));
    return s.size ? Array.from(s) : DEFAULT_ISLANDS;
  }, [locations]);

  const filteredLocations = useMemo(
    () =>
      selectableWithMoods.filter(
        (l) =>
          (islandFilter === "All" || l.island === islandFilter) &&
          (moodFilter === "All" || (l.moods || []).includes(moodFilter))
      ),
    [selectableWithMoods, islandFilter, moodFilter]
  );

  // scooters per island
  const [scooterIslands, setScooterIslands] = useState(new Set());

  // Step 3: itinerary
  const [days, setDays] = useState([]);
  useEffect(() => {
    setDays(generateItineraryDays(selectedLocs, startPB));
  }, [selectedLocs, startPB]);

  // Day helpers
  const addEmptyDayAfter = (index) => {
    const copy = [...days];
    copy.splice(index + 1, 0, { island: copy[index]?.island || "Port Blair (South Andaman)", items: [], transport: "Point-to-Point" });
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

  // Step 4: hotels
  const [chosenHotels, setChosenHotels] = useState({});
  const nightsByIsland = useMemo(() => {
    const map = {};
    days.forEach((day) => {
      if (!day.items.some((i) => i.type === "ferry") && !day.items.some((i) => i.type === "departure")) {
        map[day.island] = (map[day.island] || 0) + 1;
      }
    });
    return map;
  }, [days]);
  const MOCK_HOTELS = useMemo(
    () => ({
      "Port Blair (South Andaman)": [
        { id: "pb_h1", name: "PB Value Hotel", tier: "Value", sell_price: 3299 },
        { id: "pb_h2", name: "PB Mid Hotel", tier: "Mid", sell_price: 5499 },
        { id: "pb_h3", name: "PB Premium Hotel", tier: "Premium", sell_price: 8899 },
      ],
      "Havelock (Swaraj Dweep)": [
        { id: "hl_h1", name: "HL Value Hotel", tier: "Value", sell_price: 4499 },
        { id: "hl_h2", name: "HL Mid Hotel", tier: "Mid", sell_price: 6999 },
        { id: "hl_h3", name: "HL Premium Hotel", tier: "Premium", sell_price: 10999 },
      ],
      "Neil (Shaheed Dweep)": [
        { id: "nl_h1", name: "NL Value Hotel", tier: "Value", sell_price: 3399 },
        { id: "nl_h2", name: "NL Mid Hotel", tier: "Mid", sell_price: 5699 },
      ],
      "Long Island (Middle Andaman)": [{ id: "li_h1", name: "LI Mid Hotel", tier: "Mid", sell_price: 6199 }],
      "Rangat (Middle Andaman)": [{ id: "rg_h1", name: "Rangat Lodge", tier: "Value", sell_price: 2599 }],
      "Mayabunder (Middle Andaman)": [{ id: "mb_h1", name: "Mayabunder Stay", tier: "Value", sell_price: 2399 }],
      "Diglipur (North Andaman)": [{ id: "dg_h1", name: "DG Lodge", tier: "Value", sell_price: 2899 }],
      "Little Andaman": [{ id: "la_h1", name: "Hut Stay", tier: "Value", sell_price: 2199 }],
    }),
    []
  );
  const chooseHotel = (island, hotelId) =>
    setChosenHotels((p) => ({ ...p, [island]: hotelId }));

  // Step 5: essentials (transport + ferries)
  const [essentials, setEssentials] = useState({
    ferryClass: "Deluxe",
    cabModelId: CAB_MODELS[1].id, // default SUV
  });

  // Step 2: add-ons (suggested then fallback)
  const suggestedActivities = useMemo(() => {
    const sel = new Set(selectedIds);

    // Build a quick lookup for location → adventureIds supporting both id & slug
    const advMapByLoc = new Map();
    locAdventures.forEach((m) => {
      if (!m || !m.locationId) return;
      advMapByLoc.set(String(m.locationId).toLowerCase(), Array.isArray(m.adventureIds) ? m.adventureIds : []);
    });

    const mappedIds = new Set();
    locations.forEach((loc) => {
      if (!sel.has(loc.id)) return;
      const byId = advMapByLoc.get(String(loc.id).toLowerCase());
      const bySlug = advMapByLoc.get(String(loc.slug).toLowerCase());
      [...(byId || []), ...(bySlug || [])].forEach((aid) => mappedIds.add(aid));
    });

    const mapped = activities.filter((a) => mappedIds.has(a.id));
    if (mapped.length) return mapped;

    // Otherwise fallback by island overlap
    const selectedIslands = new Set(selectedLocs.map((l) => l.island));
    const islandMatch = activities.filter((a) => (a.islands || []).some((i) => selectedIslands.has(i)));
    return islandMatch.length ? islandMatch : activities;
  }, [activities, selectedIds, selectedLocs, locAdventures, locations]);

  const [addonIds, setAddonIds] = useState([]);

  /** =========================
   *  Dynamic costs
   *  ========================= */
  const hotelsTotal = useMemo(() => {
    let sum = 0;
    Object.entries(nightsByIsland).forEach(([island, nights]) => {
      const hid = chosenHotels[island];
      if (!hid) return;
      const hotel = (MOCK_HOTELS[island] || []).find((h) => h.id === hid);
      if (hotel) sum += Number(hotel.sell_price || 0) * nights;
    });
    return sum;
  }, [nightsByIsland, chosenHotels, MOCK_HOTELS]);

  const addonsTotal = useMemo(
    () =>
      addonIds.reduce((acc, id) => {
        const ad = activities.find((a) => a.id === id);
        const price = Number(ad?.basePriceINR ?? ad?.price ?? 0);
        return acc + (isFinite(price) ? price : 0);
      }, 0),
    [addonIds, activities]
  );

  const ferryLegCount = useMemo(
    () => days.reduce((acc, d) => acc + d.items.filter((i) => i.type === "ferry").length, 0),
    [days]
  );
  const ferryTotal = useMemo(() => {
    const mult = FERRY_CLASS_MULT[essentials.ferryClass] ?? 1;
    return ferryLegCount * FERRY_BASE_ECON * mult * Math.max(1, adults); // infants assumed free
  }, [ferryLegCount, essentials.ferryClass, adults]);

  const cabDayRate = useMemo(() => {
    const found = CAB_MODELS.find((c) => c.id === essentials.cabModelId);
    return found ? found.dayRate : CAB_MODELS[0].dayRate;
  }, [essentials.cabModelId]);

  const logisticsTotal = useMemo(() => {
    let sum = 0;
    days.forEach((day) => {
      if (day.items.some((i) => i.type === "ferry") || day.items.some((i) => i.type === "departure")) return; // ferry handled separately, last day no ground
      const stops = day.items.filter((i) => i.type === "location").length;
      if (scooterIslands.has(day.island)) {
        sum += SCOOTER_DAY_RATE;
        return;
      }
      if (day.transport === "Day Cab") sum += cabDayRate;
      else if (day.transport === "Scooter") sum += SCOOTER_DAY_RATE;
      else sum += Math.max(1, stops - 1) * P2P_RATE_PER_HOP; // P2P
    });
    return sum;
  }, [days, scooterIslands, cabDayRate]);

  const grandTotal = hotelsTotal + addonsTotal + logisticsTotal + ferryTotal;

  // ================= RENDER GUARDS =================
  if (status === "loading") return <LoadingScreen label="Loading Andaman data…" />;

  if (status === "error") {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, Arial", color: "#b91c1c" }}>
        Could not load data. Please check that <code>/public/data/*.json</code> exists and returns JSON.
        <div style={{ marginTop: 8, color: "#334155", fontSize: 12 }}>
          (Open the browser console for details.)
        </div>
      </div>
    );
  }

  // ================= UI =================
  return (
    <div style={{ fontFamily: "system-ui, Arial", background: "#f6f7f8", minHeight: "100vh", color: "#0f172a" }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "white", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: "linear-gradient(90deg, #0891b2, #06b6d4, #22d3ee)" }} />
            <b>Create Your Andaman Tour</b>
          </div>
          <span style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}>
            <span style={{ color: "#64748b" }}>Step</span>
            <span style={{ fontWeight: 800, background: "white", border: "1px solid #e5e7eb", padding: "2px 8px", borderRadius: 999 }}>
              {step + 1} / 6
            </span>
          </span>
        </div>
        <Stepper step={step} setStep={setStep} />
      </header>

      {/* Body */}
      <main className="app-main">
        <section>
          {/* STEP 0 */}
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
                  <input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value) || 0)} />
                </Field>
                <Field label="Infants">
                  <input type="number" min={0} value={infants} onChange={(e) => setInfants(Number(e.target.value) || 0)} />
                </Field>
              </Row>
              <Row>
                <label><input type="checkbox" checked={startPB} onChange={() => setStartPB(!startPB)} /> Start from Port Blair if present</label>
              </Row>
              <FooterNav onNext={() => setStep(1)} />
            </Card>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <Card title="Select Locations">
              <Row>
                <Field label="Island">
                  <select value={islandFilter} onChange={(e) => setIslandFilter(e.target.value)}>
                    <option>All</option>
                    {islandsList.map((i) => <option key={i}>{i}</option>)}
                  </select>
                </Field>

                <Field label="Mood of tour">
                  <select value={moodFilter} onChange={(e) => setMoodFilter(e.target.value)}>
                    <option>All</option>
                    <option>Relaxed</option>
                    <option>Balanced</option>
                    <option>Active</option>
                    <option>Offbeat</option>
                    <option>Family</option>
                    <option>Adventure</option>
                    <option>Photography</option>
                  </select>
                </Field>

                <div style={{ fontSize: 12, color: "#475569", alignSelf: "end" }}>
                  {selectedLocs.length} selected
                </div>
              </Row>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
                {filteredLocations.map((l) => {
                  const picked = selectedIds.includes(l.id);
                  return (
                    <div key={l.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12, position: "relative" }}>
                      <div style={{ cursor: "default" }}>
                        {l.image ? (
                          <div style={{ height: 120, borderRadius: 8, marginBottom: 8, background: `url(${l.image}) center/cover` }} />
                        ) : (
                          <div style={{ height: 120, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                        )}
                        <b style={{ fontSize: 14 }}>{l.name}</b>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                          {l.island} • {l.durationHrs}h
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {(l.moods || []).slice(0, 3).map((m) => (
                            <span key={m} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, border: "1px solid #e5e7eb", color: "#334155", background: "#f8fafc" }}>
                              {m}
                            </span>
                          ))}
                        </div>
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

          {/* STEP 2 */}
          {step === 2 && (
            <Card title="Adventures & Add-ons">
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>
                Suggested first, based on your selected locations. You can add now or later.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
                {suggestedActivities.map((a) => {
                  const on = addonIds.includes(a.id);
                  return (
                    <div key={a.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                      <div style={{ height: 80, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>{formatINR(a.basePriceINR ?? a.price ?? 0)}</div>
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
              <FooterNav onPrev={() => setStep(1)} onNext={() => setStep(3)} />
            </Card>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <Card title="Itinerary (Editable)">
              {!days.length && <p style={{ fontSize: 14 }}>Select a few locations first.</p>}
              <div style={{ display: "grid", gap: 12 }}>
                {days.map((day, i) => {
                  const calendarDate = startDate ? addDays(startDate, i) : null;
                  const dayLabel = calendarDate ? `${calendarDate}` : `No date set`;
                  return (
                    <div key={i} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <b>Day {i + 1} — {day.island}</b>
                          {day.items.some(it => it.type === "ferry") && (
                            <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 999, background: "#ecfeff", color: "#0369a1", border: "1px solid #bae6fd" }}>Ferry</span>
                          )}
                          {day.items.some(it => it.type === "arrival") && (
                            <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 999, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>Arrival</span>
                          )}
                          {day.items.some(it => it.type === "departure") && (
                            <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 999, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>Departure</span>
                          )}
                        </div>
                        <span style={{ fontSize: 12, color: "#334155" }}>{dayLabel}</span>
                      </div>
                      <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 14 }}>
                        {day.items.map((it, k) => (
                          <li key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <span>
                              {it.type === "ferry" ? it.name :
                               it.type === "arrival" ? it.name :
                               it.type === "transfer" ? it.name :
                               it.type === "departure" ? it.name :
                               `${it.name} (${it.durationHrs}h)`}
                            </span>
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <button onClick={() => moveItem(i, k, -1)} style={miniBtn} title="Move to previous day">◀︎</button>
                              <button onClick={() => moveItem(i, k, +1)} style={miniBtn} title="Move to next day">▶︎</button>
                            </span>
                          </li>
                        ))}
                      </ul>
                      {!day.items.some((it) => it.type === "ferry") && !day.items.some(i => i.type === "departure") && (
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
              <FooterNav onPrev={() => setStep(2)} onNext={() => setStep(4)} />
            </Card>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <Card title="Hotels by Island">
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
              <FooterNav onPrev={() => setStep(3)} onNext={() => setStep(5)} />
            </Card>
          )}

          {/* STEP 5 */}
          {step === 5 && (
            <Card title="Transport & Ferries">
              <div style={{ display: "grid", gap: 14 }}>
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
                  <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>
                    Scooter per island (overrides transport to scooter on those islands):
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {Array.from(new Set(days.map(d => d.island))).filter(Boolean).map((isl) => (
                      <label key={isl} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", background: "white" }}>
                        <input
                          type="checkbox"
                          checked={scooterIslands.has(isl)}
                          onChange={() => {
                            const next = new Set(scooterIslands);
                            next.has(isl) ? next.delete(isl) : next.add(isl);
                            setScooterIslands(next);
                          }}
                          style={{ marginRight: 6 }}
                        />
                        {isl} — {formatINR(SCOOTER_DAY_RATE)}/day
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <FooterNav onPrev={() => setStep(4)} onNext={() => alert("This would submit a lead for the full itinerary.")} nextLabel="Request to Book" />
            </Card>
          )}
        </section>

        {/* Desktop summary (modernized) */}
        <aside className="sidebar">
          <div style={{ position: "sticky", top: 80 }}>
            <div style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 24px rgba(2,132,199,0.08)" }}>
              <div style={{ padding: "12px 14px", color: "white", background: "linear-gradient(90deg, #0891b2 0%, #06b6d4 50%, #22d3ee 100%)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 800, background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)", padding: "4px 8px", borderRadius: 999, letterSpacing: 0.3 }}>
                  TRIP SUMMARY
                </span>
                <span style={{ background: "white", color: "#0f172a", padding: "6px 10px", borderRadius: 10, fontWeight: 900, boxShadow: "0 2px 8px rgba(0,0,0,.12)" }}>
                  {formatINR(grandTotal)}
                </span>
              </div>

              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 14, color: "#334155", display: "grid", gap: 4 }}>
                  <div>Start date: <b>{startDate || "Not set"}</b></div>
                  <div>Days planned: <b>{days.length}</b></div>
                  <div>Travellers: <b>{adults} adult(s){infants ? `, ${infants} infant(s)` : ""}</b></div>
                </div>

                <div style={{ marginTop: 12, borderTop: "1px dashed #e5e7eb", paddingTop: 12, display: "grid", gap: 8, fontSize: 14 }}>
                  <RowSplit label="Hotels" value={formatINR(hotelsTotal)} />
                  <RowSplit label="Ferries" value={formatINR(ferryTotal)} />
                  <RowSplit label="Ground transport" value={formatINR(logisticsTotal)} />
                  <RowSplit label="Add-ons" value={formatINR(addonsTotal)} />
                  <div style={{ borderTop: "2px solid #0ea5e9", paddingTop: 10, fontSize: 16, display: "flex", justifyContent: "space-between" }}>
                    <span>Total (indicative)</span>
                    <b>{formatINR(grandTotal)}</b>
                  </div>
                </div>

                <button
                  onClick={() => alert("This would submit a single Request-to-Book for the whole itinerary.")}
                  style={{ marginTop: 12, width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "white", fontWeight: 800 }}
                >
                  Request to Book Full Trip
                </button>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Mobile Summary Bar */}
      <MobileSummaryBar
        total={grandTotal}
        lineItems={[
          { label: "Hotels", amount: hotelsTotal },
          { label: "Ferries", amount: ferryTotal },
          { label: "Ground transport", amount: logisticsTotal },
          { label: "Add-ons", amount: addonsTotal }
        ]}
        badges={[
          { label: "days", value: String(days.length) },
          { label: "travellers", value: String(pax) }
        ]}
        onRequestToBook={() => alert("This would submit a lead for the full itinerary.")}
      />
    </div>
  );
}

/** =========================
 *  Tiny UI primitives
 *  ========================= */
const miniBtn = { border: "1px solid #e5e7eb", background: "white", borderRadius: 6, padding: "3px 8px", fontSize: 12 };
const pillBtn = { border: "1px solid #0ea5e9", background: "white", color: "#0ea5e9", borderRadius: 999, padding: "6px 10px", fontWeight: 700 };
const dangerBtn = { border: "1px solid #ef4444", background: "white", color: "#ef4444", borderRadius: 999, padding: "6px 10px", fontWeight: 700 };

function RowSplit({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span>{label}</span><b>{value}</b>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 16, boxShadow: "0 6px 16px rgba(2,132,199,0.05)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "linear-gradient(90deg, #0891b2, #06b6d4, #22d3ee)" }} />
          <div style={{ fontWeight: 800 }}>{title}</div>
        </div>
      </div>
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
function Stepper({ step, setStep }) {
  const labels = ["Trip Basics", "Select Locations", "Adventures & Add-ons", "Itinerary", "Hotels", "Transport"];
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

/* ✅ Missing before — now added back */
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
