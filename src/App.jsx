import React, { useMemo, useState, useEffect } from "react";

/** =========================
 *  Helpers (safe + simple)
 *  ========================= */
const safeNum = (n) => (typeof n === "number" && isFinite(n) ? n : 0);
const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safeNum(n));

const addDays = (yyyy_mm_dd, n) => {
  if (!yyyy_mm_dd) return null;
  const d = new Date(yyyy_mm_dd);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// Normalize bestTime string to day-parts for ordering
function bestTimeToParts(bestTime) {
  const s = String(bestTime || "").toLowerCase();
  const parts = [];
  if (/morning|sunrise|am/.test(s)) parts.push("morning");
  if (/afternoon|noon|midday/.test(s)) parts.push("afternoon");
  if (/evening|sunset|pm/.test(s)) parts.push("evening");
  return parts;
}

// Heuristic: infer moods if missing (resilient to sparse data)
function inferMoods(loc) {
  const moods = new Set();
  const interest = (loc.brief || "").toLowerCase() + " " + (loc.name || "").toLowerCase();
  if (/snorkel|scuba|dive|trek|kayak|surf|jet|parasail/.test(interest)) moods.add("Adventure");
  if (/beach|sunset|view|cove|lagoon|mangrove/.test(interest)) moods.add("Relaxed");
  if (/museum|culture|heritage|jail|cellular|memorial/.test(interest)) moods.add("Family");
  if (/wildlife|reef|coral|mangrove|bird|nature|peak/.test(interest)) moods.add("Photography");
  if (/lighthouse|mangrove|cave|mud volcano|baratang|ross|smith|saddle peak|long island/.test(interest))
    moods.add("Offbeat");
  if (!moods.size) moods.add("Balanced");
  return Array.from(moods);
}

/** =========================
 *  Constants
 *  ========================= */
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

const SEATMAP_URL = "https://seatmap.example.com"; // replace with your real seat-map URL
const AIRPORT_NAME = "Veer Savarkar International Airport (IXZ)";
const PB_CANON = "Port Blair (South Andaman)";

/** ==========================================
 *  Islands taxonomy normalization
 *  ========================================== */
function normalizeIslandName(raw, taxonomy = []) {
  if (!raw) return raw;
  const s = String(raw).trim().toLowerCase();
  for (const t of taxonomy) {
    if (t.name.toLowerCase() === s) return t.name;
    const aliases = (t.aliases || []).map((a) => a.toLowerCase().trim());
    if (aliases.includes(s)) return t.name;
  }
  return raw; // fallback
}

/** ==========================================
 *  Itinerary generator with mandatory Airport
 *  Day 1: Arrival @ PB; Last Day: Departure @ PB
 *  Inserts ferries + auto-return to PB if needed
 *  ========================================== */
function orderByBestTime(items) {
  const rank = (it) => {
    const arr = it.bestTimes || [];
    if (arr.includes("morning")) return 0;
    if (arr.includes("afternoon")) return 1;
    if (arr.includes("evening")) return 2;
    return 3;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

function generateItineraryDays(selectedLocs) {
  const days = [];
  // Day 1: Arrival
  days.push({
    island: PB_CANON,
    items: [
      { type: "arrival", name: `Arrival — ${AIRPORT_NAME}` },
      { type: "transfer", name: "Airport → Hotel (Port Blair)" },
    ],
    transport: "Point-to-Point",
    _locked: true,
  });

  if (!selectedLocs.length) {
    // still end with departure
    days.push({
      island: PB_CANON,
      items: [{ type: "departure", name: `Departure — ${AIRPORT_NAME}` }],
      transport: "—",
      _locked: true,
    });
    return days;
  }

  // group by island
  const byIsland = {};
  selectedLocs.forEach((l) => {
    (byIsland[l.island] ||= []).push(l);
  });

  // canonical order via first appearance in data (already normalized)
  const order = Object.keys(byIsland);

  // Build sightseeing days (≈7h/day, 2–4 stops/day)
  order.forEach((island, idx) => {
    const locs = orderByBestTime(
      (byIsland[island] || []).map((x) => ({
        ...x,
        durationHrs: Number.isFinite(x.durationHrs) ? x.durationHrs : 2,
      }))
    );
    let dayBucket = [];
    let timeUsed = 0;

    const flushDay = () => {
      if (!dayBucket.length) return;
      if (dayBucket.length === 1 && locs.length) {
        const next = locs.shift();
        if (next) {
          dayBucket.push(next);
          timeUsed += next.durationHrs;
        }
      }
      days.push({
        island,
        items: dayBucket.map((x) => ({
          type: "location",
          ref: x.id,
          name: x.name,
          durationHrs: x.durationHrs,
          bestTimes: x.bestTimes || [],
        })),
        transport:
          dayBucket.length >= 3
            ? "Day Cab"
            : ["Havelock (Swaraj Dweep)", "Neil (Shaheed Dweep)"].includes(island)
            ? "Scooter"
            : "Point-to-Point",
      });
      dayBucket = [];
      timeUsed = 0;
    };

    while (locs.length) {
      const x = locs.shift();
      const wouldBe = timeUsed + x.durationHrs;
      if (dayBucket.length >= 4 || wouldBe > 7) flushDay();
      dayBucket.push(x);
      timeUsed += x.durationHrs;
    }
    flushDay();

    // Ferry to next island
    const nextIsland = order[idx + 1];
    if (nextIsland) {
      days.push({
        island,
        items: [{ type: "ferry", name: `Ferry ${island} → ${nextIsland}`, time: "08:00–09:30" }],
        transport: "—",
      });
    }
  });

  // Ensure last leg returns to Port Blair for departure
  const lastIsland = days.length ? days[days.length - 1].island : PB_CANON;
  if (lastIsland !== PB_CANON) {
    days.push({
      island: lastIsland,
      items: [{ type: "ferry", name: `Ferry ${lastIsland} → ${PB_CANON}`, time: "15:00–16:30" }],
      transport: "—",
    });
    days.push({
      island: PB_CANON,
      items: [
        { type: "transfer", name: "Hotel (Port Blair) → Airport" },
        { type: "departure", name: `Departure — ${AIRPORT_NAME}` },
      ],
      transport: "—",
      _locked: true,
    });
  } else {
    days.push({
      island: PB_CANON,
      items: [{ type: "departure", name: `Departure — ${AIRPORT_NAME}` }],
      transport: "—",
      _locked: true,
    });
  }

  return days;
}

/** =========================
 *  App Component
 *  ========================= */
export default function CreateTourWireframeDemo() {
  // Load data
  const [locationsRaw, setLocationsRaw] = useState([]);
  const [activitiesRaw, setActivitiesRaw] = useState([]);
  const [locAdvMap, setLocAdvMap] = useState([]); // [{locationId, adventureIds}]
  const [ferries, setFerries] = useState([]);
  const [islandsTaxonomy, setIslandsTaxonomy] = useState([]);
  const [dataStatus, setDataStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    (async () => {
      try {
        const [locRes, actRes, mapRes, ferRes, islRes] = await Promise.all([
          fetch("/data/locations.json"),
          fetch("/data/activities.json"),
          fetch("/data/location_adventures.json").catch(() => ({ ok: false })),
          fetch("/data/ferries.json"),
          fetch("/data/islands.json"),
        ]);
        const locJson = await locRes.json();
        const actJson = await actRes.json();
        const mapJson = mapRes && mapRes.ok ? await mapRes.json() : [];
        const ferJson = await ferRes.json();
        const islJson = await islRes.json();

        setLocationsRaw(Array.isArray(locJson) ? locJson : []);
        setActivitiesRaw(Array.isArray(actJson) ? actJson : []);
        setLocAdvMap(Array.isArray(mapJson) ? mapJson : []);
        setFerries(Array.isArray(ferJson) ? ferJson : []);
        setIslandsTaxonomy(Array.isArray(islJson) ? islJson : []);
        setDataStatus("ready");
      } catch (e) {
        console.error("Data load error:", e);
        setDataStatus("error");
      }
    })();
  }, []);

  // Normalize locations to internal shape {id,island,name,durationHrs,moods,brief,bestTimes[]}
  const locations = useMemo(() => {
    return locationsRaw.map((l) => {
      const canonicalIsland = normalizeIslandName(l.island || l.region || "", islandsTaxonomy);
      return {
        id: l.id,
        island: canonicalIsland,
        name: l.location || l.name,
        durationHrs: Number.isFinite(l.typicalHours) ? l.typicalHours : l.durationHrs,
        moods: Array.isArray(l.moods) && l.moods.length ? l.moods : inferMoods(l),
        brief: l.brief || "",
        bestTimes: bestTimeToParts(l.bestTime),
        image: l.image || null,
      };
    });
  }, [locationsRaw, islandsTaxonomy]);

  // Normalize activities to have a "price" and an "islands" array
  const activities = useMemo(() => {
    return activitiesRaw.map((a) => ({
      ...a,
      price: safeNum(a.basePriceINR ?? a.price ?? 0),
      islands: Array.isArray(a.islands) ? a.islands : [],
    }));
  }, [activitiesRaw]);

  // Island list in taxonomy order (only those present)
  const islandsList = useMemo(() => {
    if (!islandsTaxonomy.length) {
      const s = new Set(locations.map((l) => l.island).filter(Boolean));
      return Array.from(s);
    }
    const present = new Set(locations.map((l) => l.island));
    return islandsTaxonomy
      .filter((t) => present.has(t.name))
      .sort((a, b) => (a.order || 999) - (b.order || 999))
      .map((t) => t.name);
  }, [locations, islandsTaxonomy]);

  // —— App state
  const [step, setStep] = useState(0);
  const [startDate, setStartDate] = useState(""); // optional
  const [adults, setAdults] = useState(2);
  const [infants, setInfants] = useState(0);

  // Step 1: selection
  const [selectedIds, setSelectedIds] = useState([]);

  // hide airport from selection
  const selectableLocations = useMemo(
    () => locations.filter((l) => !/airport/i.test(l.name || "")),
    [locations]
  );
  const selectedLocs = useMemo(
    () => locations.filter((l) => selectedIds.includes(l.id)),
    [locations, selectedIds]
  );

  // Filters
  const [islandFilter, setIslandFilter] = useState("All");
  const [moodFilter, setMoodFilter] = useState("All");

  const filteredLocations = useMemo(
    () =>
      selectableLocations.filter(
        (l) =>
          (islandFilter === "All" || l.island === islandFilter) &&
          (moodFilter === "All" || (l.moods || []).includes(moodFilter))
      ),
    [selectableLocations, islandFilter, moodFilter]
  );

  // scooters per island
  thead;
  const [scooterIslands, setScooterIslands] = useState(new Set());

  // Step 3: itinerary state (auto-generated from selections)
  const [days, setDays] = useState([]);
  useEffect(() => {
    setDays(generateItineraryDays(selectedLocs));
  }, [selectedLocs]);

  // Day helpers
  const addEmptyDayAfter = (index) => {
    const copy = [...days];
    copy.splice(index + 1, 0, {
      island: copy[index]?.island || PB_CANON,
      items: [],
      transport: "Point-to-Point",
    });
    setDays(copy);
  };
  const deleteDay = (index) => {
    const d = days[index];
    if (d?._locked) return; // prevent deleting arrival/departure days
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
      if (day.items.some((i) => i.type === "ferry")) return;
      map[day.island] = (map[day.island] || 0) + 1;
    });
    return map;
  }, [days]);
  const MOCK_HOTELS = useMemo(
    () => ({
      [PB_CANON]: [
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
      "Diglipur (North Andaman)": [{ id: "dg_h1", name: "DG Lodge", tier: "Value", sell_price: 2899 }],
      "Baratang (Middle Andaman)": [{ id: "bt_h1", name: "BT Lodge", tier: "Value", sell_price: 2799 }],
      "Rangat (Middle Andaman)": [{ id: "rg_h1", name: "RG Stay", tier: "Value", sell_price: 2699 }],
      "Mayabunder (Middle Andaman)": [{ id: "mb_h1", name: "MB Stay", tier: "Value", sell_price: 2899 }],
      "Little Andaman": [{ id: "la_h1", name: "LA Surf Lodge", tier: "Value", sell_price: 2499 }],
      "Remote/Expeditions": [{ id: "rx_h1", name: "Charter/Liveaboard", tier: "Special", sell_price: 0 }],
    }),
    []
  );
  const chooseHotel = (island, hotelId) => setChosenHotels((p) => ({ ...p, [island]: hotelId }));

  // Step 5: Transport & Ferries
  const [essentials, setEssentials] = useState({
    ferryClass: "Deluxe",
    cabModelId: CAB_MODELS[1].id, // default SUV
  });

  // Add-ons state (global)
  const [addonIds, setAddonIds] = useState([]);

  // Suggested per selected locations (union of mapped adventures)
  const suggestedActivitiesBySelection = useMemo(() => {
    if (!selectedIds.length) return [];
    const setLoc = new Set(selectedIds);
    const mappedIds = new Set();
    locAdvMap.forEach((m) => {
      if (setLoc.has(m.locationId)) (m.adventureIds || []).forEach((aid) => mappedIds.add(aid));
    });
    if (!mappedIds.size) {
      const selIslands = new Set(selectedLocs.map((l) => l.island));
      return activities.filter((a) => a.islands?.some((isl) => selIslands.has(isl))).slice(0, 12);
    }
    return activities.filter((a) => mappedIds.has(a.id));
  }, [locAdvMap, selectedIds, activities, selectedLocs]);

  /** =========================
   *  Modal state for Location Details
   *  ========================= */
  const [modalLoc, setModalLoc] = useState(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setModalLoc(null);
    };
    if (modalLoc) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalLoc]);

  /** =========================
   *  Dynamic costs
   *  ========================= */
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

  const addonsTotal = useMemo(
    () =>
      addonIds.reduce((acc, id) => {
        const ad = activities.find((a) => a.id === id);
        return acc + safeNum(ad?.price);
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
      if (day.items.some((i) => i.type === "ferry")) return; // ferry handled separately
      const stops = day.items.filter((i) => i.type === "location").length;

      if (scooterIslands.has(day.island)) {
        sum += SCOOTER_DAY_RATE;
        return;
      }
      if (day.transport === "Day Cab") sum += cabDayRate;
      else if (day.transport === "Scooter") sum += SCOOTER_DAY_RATE;
      else sum += Math.max(1, stops - 1) * P2P_RATE_PER_HOP; // P2P per hop
    });
    return sum;
  }, [days, scooterIslands, cabDayRate]);

  const grandTotal = hotelsTotal + addonsTotal + logisticsTotal + ferryTotal;

  if (dataStatus === "loading") {
    return <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>Loading Andaman data…</div>;
  }
  if (dataStatus === "error") {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, Arial", color: "#b91c1c" }}>
        Could not load data. Please check that <code>/public/data/*.json</code> exists in the repo.
      </div>
    );
  }

  const toggleScooter = (island) => {
    const next = new Set(scooterIslands);
    next.has(island) ? next.delete(island) : next.add(island);
    setScooterIslands(next);
  };

  // Helper: suggested adventures for a location card (max 3)
  const suggestedForLocation = (loc) => {
    const mapped = locAdvMap.find((m) => m.locationId === loc.id);
    let ids = mapped?.adventureIds || [];
    if (!ids.length) {
      ids = activities
        .filter((a) => a.islands?.includes(loc.island))
        .slice(0, 3)
        .map((a) => a.id);
    }
    return ids
      .map((id) => activities.find((a) => a.id === id))
      .filter(Boolean)
      .slice(0, 3);
  };

  const pill = {
    border: "1px solid #0ea5e9",
    background: "white",
    color: "#0ea5e9",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 12,
    fontWeight: 600,
  };

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
      <main className="app-main" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, maxWidth: 1200, margin: "0 auto", padding: 16 }}>
        <section>
          {/* Step 0: Basics */}
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
              <FooterNav onNext={() => setStep(1)} />
            </Card>
          )}

          {/* Step 1: Select Locations */}
          {step === 1 && (
            <Card title="Select Locations">
              <Row>
                <Field label="Island">
                  <select value={islandFilter} onChange={(e) => setIslandFilter(e.target.value)}>
                    <option>All</option>
                    {islandsList.map((i) => (
                      <option key={i}>{i}</option>
                    ))}
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

                <div style={{ fontSize: 12, color: "#475569", alignSelf: "end" }}>{selectedLocs.length} selected</div>
              </Row>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 12 }}>
                {filteredLocations.map((l) => {
                  const picked = selectedIds.includes(l.id);
                  const suggested = suggestedForLocation(l);
                  return (
                    <div key={l.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                      <div style={{ height: 96, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                      <b style={{ fontSize: 14 }}>{l.name}</b>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                        {l.island} • {(l.durationHrs ?? 2)}h
                      </div>

                      {/* Mood badges */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        {(l.moods || []).slice(0, 3).map((m) => (
                          <span
                            key={m}
                            style={{
                              fontSize: 10,
                              padding: "2px 6px",
                              borderRadius: 999,
                              border: "1px solid #e5e7eb",
                              color: "#334155",
                              background: "#f8fafc",
                            }}
                          >
                            {m}
                          </span>
                        ))}
                      </div>

                      {/* Optional: Adventures chips (toggle add-ons) */}
                      {suggested.length > 0 && (
                        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "#64748b", alignSelf: "center" }}>Optional:</span>
                          {suggested.map((a) => {
                            const on = addonIds.includes(a.id);
                            return (
                              <button
                                key={a.id}
                                onClick={() =>
                                  setAddonIds((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))
                                }
                                title={a.name}
                                style={{
                                  border: on ? "1px solid #0ea5e9" : "1px solid #94a3b8",
                                  background: on ? "#eaf6fd" : "white",
                                  color: on ? "#0ea5e9" : "#334155",
                                  borderRadius: 999,
                                  padding: "4px 8px",
                                  fontSize: 12,
                                  fontWeight: 600,
                                }}
                              >
                                {a.name}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          onClick={() =>
                            setSelectedIds((prev) => (picked ? prev.filter((x) => x !== l.id) : [...prev, l.id]))
                          }
                          style={{
                            flex: 1,
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #0ea5e9",
                            background: picked ? "#0ea5e9" : "white",
                            color: picked ? "white" : "#0ea5e9",
                            fontWeight: 600,
                          }}
                        >
                          {picked ? "Selected" : "Select"}
                        </button>
                        <button
                          onClick={() => setModalLoc(l)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            background: "white",
                            color: "#0f172a",
                            fontWeight: 600,
                            minWidth: 96,
                          }}
                          aria-label={`Details about ${l.name}`}
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <FooterNav onPrev={() => setStep(0)} onNext={() => setStep(2)} />
            </Card>
          )}

          {/* Step 2: Adventures & Add-ons */}
          {step === 2 && (
            <Card title="Adventures & Add-ons">
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>
                Suggested for your selected locations. Add now or skip for later.
              </div>

              {/* Suggested */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Suggested for Your Locations</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
                  {(suggestedActivitiesBySelection.length ? suggestedActivitiesBySelection : activities)
                    .slice(0, 12)
                    .map((a) => {
                      const on = addonIds.includes(a.id);
                      return (
                        <div key={a.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                          <div style={{ height: 80, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                          <div style={{ fontSize: 12, color: "#475569" }}>
                            {a.price ? formatINR(a.price) : "Price on request"}
                          </div>
                          <button
                            onClick={() => setAddonIds((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                            style={{
                              marginTop: 8,
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #0ea5e9",
                              background: on ? "#0ea5e9" : "white",
                              color: on ? "white" : "#0ea5e9",
                              fontWeight: 600,
                            }}
                          >
                            {on ? "Added" : "Add"}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* All adventures */}
              <div style={{ fontWeight: 700, margin: "12px 0 6px" }}>All Adventures</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
                {activities.map((a) => {
                  const on = addonIds.includes(a.id);
                  return (
                    <div key={a.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                      <div style={{ height: 80, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        {a.price ? formatINR(a.price) : "Price on request"}
                      </div>
                      <button
                        onClick={() => setAddonIds((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                        style={{
                          marginTop: 8,
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #0ea5e9",
                          background: on ? "#0ea5e9" : "white",
                          color: on ? "white" : "#0ea5e9",
                          fontWeight: 600,
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

          {/* Step 3: Itinerary (Editable) */}
          {step === 3 && (
            <Card title="Itinerary (Editable)">
              {!days.length && <p style={{ fontSize: 14 }}>Select a few locations first.</p>}
              <div style={{ display: "grid", gap: 12 }}>
                {days.map((day, i) => {
                  const calendarDate = startDate ? addDays(startDate, i) : null;
                  const dayLabel = calendarDate ? `${calendarDate}` : `No date set`;
                  const locked = !!day._locked;
                  return (
                    <div key={i} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <b>
                          Day {i + 1} — {day.island}
                        </b>
                        <span style={{ fontSize: 12, color: "#334155" }}>{dayLabel}</span>
                      </div>
                      <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 14 }}>
                        {day.items.map((it, k) => (
                          <li key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <span>
                              {it.type === "ferry"
                                ? it.name
                                : it.type === "arrival"
                                ? it.name
                                : it.type === "transfer"
                                ? it.name
                                : it.type === "departure"
                                ? it.name
                                : `${it.name} (${it.durationHrs}h)`}
                            </span>
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <button onClick={() => moveItem(i, k, -1)} style={miniBtn} title="Move to previous day" disabled={i === 0}>
                                ◀︎
                              </button>
                              <button onClick={() => moveItem(i, k, +1)} style={miniBtn} title="Move to next day" disabled={i === days.length - 1}>
                                ▶︎
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                      {!day.items.some((it) => it.type === "ferry") && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <label style={{ fontSize: 12, color: "#475569" }}>Transport:</label>
                          <select value={day.transport} onChange={(e) => setTransportForDay(i, e.target.value)} disabled={locked}>
                            <option>Point-to-Point</option>
                            <option>Day Cab</option>
                            <option>Scooter</option>
                            <option>—</option>
                          </select>
                          <button onClick={() => addEmptyDayAfter(i)} style={pillBtn} disabled={locked}>
                            + Add empty day after
                          </button>
                          <button onClick={() => deleteDay(i)} style={dangerBtn} disabled={locked || days.length <= 2}>
                            Delete day
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={() => addEmptyDayAfter(days.length - 1)} style={pillBtn}>
                  + Add another day
                </button>
              </div>
              <FooterNav onPrev={() => setStep(2)} onNext={() => setStep(4)} />
            </Card>
          )}

          {/* Step 4: Hotels by Island */}
          {step === 4 && (
            <Card title="Hotels by Island">
              {Object.entries(nightsByIsland).map(([island, nights]) => (
                <div key={island} style={{ marginBottom: 16 }}>
                  <b>
                    {island} — {nights} night(s)
                  </b>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 10, marginTop: 8 }}>
                    {(MOCK_HOTELS[island] || []).map((h) => {
                      const picked = chosenHotels[island] === h.id;
                      return (
                        <div key={h.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                          <div style={{ height: 80, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</div>
                          <div style={{ fontSize: 12, color: "#475569" }}>
                            {h.tier} • From {formatINR(h.sell_price)}/night
                          </div>
                          <button
                            onClick={() => chooseHotel(island, h.id)}
                            style={{
                              marginTop: 8,
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #16a34a",
                              background: picked ? "#16a34a" : "white",
                              color: picked ? "white" : "#16a34a",
                              fontWeight: 600,
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

          {/* Step 5: Transport & Ferries */}
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
                      <button
                        onClick={() => window.open(SEATMAP_URL, "_blank")}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #0ea5e9",
                          background: "white",
                          color: "#0ea5e9",
                          fontWeight: 700,
                        }}
                      >
                        Open Seat Map
                      </button>
                    </Field>
                  </Row>
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "white" }}>
                  <b>Ground Transport</b>
                  <Row>
                    <Field label="Cab model (for Day Cab days)">
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
                    {Array.from(new Set(days.map((d) => d.island)))
                      .filter(Boolean)
                      .map((isl) => (
                        <label key={isl} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", background: "white" }}>
                          <input type="checkbox" checked={scooterIslands.has(isl)} onChange={() => toggleScooter(isl)} style={{ marginRight: 6 }} />
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

        {/* Desktop summary (cost-only, dynamic) */}
        <aside className="sidebar">
          <div style={{ position: "sticky", top: 80 }}>
            <div style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 16 }}>
              <b>Trip Summary</b>
              <div style={{ marginTop: 8, fontSize: 14 }}>
                <div>Start date: {startDate || "Not set"}</div>
                <div>Days planned: {days.length}</div>
                <div>
                  Travellers: {adults} adult(s)
                  {infants ? `, ${infants} infant(s)` : ""}
                </div>
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
                  marginTop: 12,
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #0ea5e9",
                  background: "#0ea5e9",
                  color: "white",
                  fontWeight: 700,
                }}
              >
                Request to Book Full Trip
              </button>
            </div>
          </div>
        </aside>
      </main>

      {/* --- FORCE-SHOW MOBILE SUMMARY (always visible) --- */}
      <div
        id="force-pill"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 12,
          zIndex: 9999,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <button
          id="force-pill-btn"
          onClick={() => {
            const ov = document.getElementById("force-pill-ov");
            if (ov) ov.style.display = "flex";
          }}
          style={{
            pointerEvents: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            width: "calc(100% - 24px)",
            maxWidth: 480,
            padding: "12px 16px",
            background: "#0ea5e9",
            color: "#fff",
            border: "1px solid #0ea5e9",
            borderRadius: 999,
            fontWeight: 700,
            boxShadow: "0 8px 24px rgba(2,132,199,0.35)",
          }}
        >
          <span>Total</span>
          <b>{formatINR(grandTotal)}</b>
        </button>
      </div>

      {/* Overlay + bottom sheet */}
      <div
        id="force-pill-ov"
        style={{
          display: "none",
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(15,23,42,0.45)",
          alignItems: "flex-end",
        }}
        onClick={(e) => {
          if (e.target.id === "force-pill-ov") e.currentTarget.style.display = "none";
        }}
      >
        <div
          style={{
            width: "100%",
            background: "#fff",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            padding: 16,
            boxShadow: "0 -12px 32px rgba(0,0,0,0.25)",
            maxHeight: "70vh",
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ width: 48, height: 4, borderRadius: 4, background: "#e5e7eb", margin: "4px auto 12px auto" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>Cost Breakdown</div>
            <button
              onClick={() => {
                document.getElementById("force-pill-ov").style.display = "none";
              }}
              style={{ border: "none", background: "transparent", fontSize: 22, lineHeight: 1 }}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div style={{ fontSize: 14, display: "grid", gap: 8 }}>
            <div>Hotels: <b>{formatINR(hotelsTotal)}</b></div>
            <div>Ferries: <b>{formatINR(ferryTotal)}</b></div>
            <div>Ground transport: <b>{formatINR(logisticsTotal)}</b></div>
            <div>Add-ons: <b>{formatINR(addonsTotal)}</b></div>
            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, marginTop: 6 }}>
              Total: <b>{formatINR(grandTotal)}</b>
            </div>
          </div>

          <button
            onClick={() => alert("Lead submit from mobile summary")}
            style={{
              marginTop: 6,
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #0ea5e9",
              background: "#0ea5e9",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            Request to Book
          </button>
        </div>
      </div>

      {/* Location Details Modal */}
      {modalLoc && (
        <LocationModal
          loc={modalLoc}
          onClose={() => setModalLoc(null)}
          isSelected={selectedIds.includes(modalLoc.id)}
          onToggleSelect={() =>
            setSelectedIds((prev) =>
              prev.includes(modalLoc.id)
                ? prev.filter((x) => x !== modalLoc.id)
                : [...prev, modalLoc.id]
            )
          }
          suggested={suggestedForLocation(modalLoc)}
          addonIds={addonIds}
          toggleAddon={(id) =>
            setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
          }
        />
      )}
      {/* --- END FORCE-SHOW MOBILE SUMMARY --- */}
    </div>
  );
}

/** =========================
 *  Location Modal Component
 *  ========================= */
function LocationModal({ loc, onClose, isSelected, onToggleSelect, suggested, addonIds, toggleAddon }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target.id === "loc-modal-overlay") onClose();
      }}
      id="loc-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 11000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "min(720px, 96vw)", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14, borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ fontWeight: 700 }}>{loc.name}</div>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: 14, display: "grid", gap: 12 }}>
          <div style={{ height: 160, background: "#e2e8f0", borderRadius: 10 }} />

          <div style={{ fontSize: 13, color: "#475569" }}>
            <div><b>Island:</b> {loc.island}</div>
            <div><b>Typical Duration:</b> {(loc.durationHrs ?? 2)} hour(s)</div>
          </div>

          {(loc.moods || []).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(loc.moods || []).map((m) => (
                <span key={m} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 999, border: "1px solid #e5e7eb", color: "#334155", background: "#f8fafc" }}>
                  {m}
                </span>
              ))}
            </div>
          )}

          {loc.brief && <div style={{ fontSize: 14, color: "#0f172a" }}>{loc.brief}</div>}

          {suggested.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Suggested adventures</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {suggested.map((a) => {
                  const on = addonIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAddon(a.id)}
                      title={a.name}
                      style={{
                        border: on ? "1px solid #0ea5e9" : "1px solid #94a3b8",
                        background: on ? "#eaf6fd" : "white",
                        color: on ? "#0ea5e9" : "#334155",
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={onToggleSelect}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #0ea5e9",
                background: isSelected ? "#0ea5e9" : "white",
                color: isSelected ? "white" : "#0ea5e9",
                fontWeight: 700,
              }}
            >
              {isSelected ? "Selected" : "Select"}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "white",
                color: "#0f172a",
                fontWeight: 700,
                minWidth: 120,
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** =========================
 *  Tiny UI primitives
 *  ========================= */
const miniBtn = {
  border: "1px solid #e5e7eb",
  background: "white",
  borderRadius: 6,
  padding: "3px 8px",
  fontSize: 12,
};
const pillBtn = {
  border: "1px solid #0ea5e9",
  background: "white",
  color: "#0ea5e9",
  borderRadius: 999,
  padding: "6px 10px",
  fontWeight: 700,
};
const dangerBtn = {
  border: "1px solid #ef4444",
  background: "white",
  color: "#ef4444",
  borderRadius: 999,
  padding: "6px 10px",
  fontWeight: 700,
};

function Card({ title, children }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 10 }}>
      {children}
    </div>
  );
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
      <button
        onClick={onNext}
        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #0ea5e9", background: "#0ea5e9", color: "white", fontWeight: 700 }}
      >
        {nextLabel}
      </button>
    </div>
  );
}
function Stepper({ step, setStep }) {
  const labels = ["Basics", "Locations", "Adventures", "Itinerary", "Hotels", "Transport"];
  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "0 16px 12px 16px",
        display: "grid",
        gridTemplateColumns: `repeat(${labels.length},1fr)`,
        gap: 6,
      }}
    >
      {labels.map((label, i) => (
        <button
          key={label}
          onClick={() => setStep(i)}
          style={{
            borderRadius: 10,
            padding: "8px 10px",
            border: "1px solid #e5e7eb",
            background: i === step ? "#0ea5e9" : "white",
            color: i === step ? "white" : "#0f172a",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {i + 1}. {label}
        </button>
      ))}
    </div>
  );
}
