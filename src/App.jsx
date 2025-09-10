import React, { useMemo, useState, useEffect } from "react";
import MobileSummaryBar from "./components/MobileSummaryBar.jsx";

/* -----------------------------
   Helpers / Normalizers
------------------------------ */
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

// a neutral beachy SVG as a data-URI (no asset file needed)
const DEFAULT_BEACH_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stop-color='#a5f3fc'/>
          <stop offset='0.6' stop-color='#60a5fa'/>
          <stop offset='0.61' stop-color='#fcd34d'/>
          <stop offset='1' stop-color='#fde68a'/>
        </linearGradient>
      </defs>
      <rect fill='url(#g)' width='100%' height='100%'/>
      <text x='50%' y='52%' text-anchor='middle' font-size='42' font-family='system-ui, Arial' fill='rgba(15,23,42,.7)'>Andaman Islands</text>
      <text x='50%' y='60%' text-anchor='middle' font-size='20' font-family='system-ui, Arial' fill='rgba(15,23,42,.6)'>beach placeholder</text>
    </svg>`
  );

const CANONICAL_MOODS = [
  "Family",
  "Adventure",
  "Romantic",
  "Offbeat",
  "Photography",
  "Relaxed",
  "Balanced",
  "Active",
];
const CANON_MAP = CANONICAL_MOODS.reduce((m, k) => {
  m[k.toLowerCase()] = k;
  return m;
}, {});
const normalizeMoods = (arr = []) => {
  const out = new Set();
  arr.forEach((m) => {
    const key = String(m || "").trim().toLowerCase();
    if (CANON_MAP[key]) out.add(CANON_MAP[key]);
  });
  return Array.from(out);
};

// If a location has no moods, infer some
function inferMoods(loc) {
  const moods = new Set();
  const interest = (loc.interest || loc.brief || "").toLowerCase();
  const name = (loc.name || "").toLowerCase();
  const dur = Number.isFinite(loc.durationHrs) ? loc.durationHrs : 2;

  if (dur <= 2) moods.add("Relaxed");
  if (dur >= 3) moods.add("Balanced");
  if (dur >= 4) moods.add("Active");

  if (/family|museum|culture|heritage|jail|cellular|memorial|park|aquarium|kids|complex/.test(interest))
    moods.add("Family");
  if (/snorkel|scuba|dive|trek|kayak|surf|jet|parasail|hike|peak|cave|helmet|sea walk/.test(interest))
    moods.add("Adventure");
  if (/beach|sunset|view|cove|lagoon|promenade|market|café|cafe/.test(interest))
    moods.add("Romantic");
  if (/wildlife|reef|coral|mangrove|bird|nature|viewpoint|sandbar/.test(interest))
    moods.add("Photography");
  if (/lighthouse|mangrove|cave|long island|mud volcano|baratang|ross|smith|viper|offbeat|quiet|remote/.test(name + " " + interest))
    moods.add("Offbeat");

  if (moods.size === 0) moods.add("Balanced");
  return Array.from(moods);
}

const nameOf = (l) => l?.name || l?.location || "";
const durOf = (l) => (Number.isFinite(l?.durationHrs) ? l.durationHrs : (Number.isFinite(l?.typicalHours) ? l.typicalHours : 2));

/* -----------------------------
   Static pricing & lists
------------------------------ */
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

const SEATMAP_URL = "https://seatmap.example.com"; // replace with real URL

/* -----------------------------
   Itinerary generator
------------------------------ */
const orderByBestTime = (items) => {
  const rank = (it) => {
    const arr = (it.bestTimes || []).map((x) => String(x).toLowerCase());
    if (arr.some((t) => t.includes("morning") || t.includes("sunrise"))) return 0;
    if (arr.some((t) => t.includes("afternoon"))) return 1;
    if (arr.some((t) => t.includes("evening") || t.includes("sunset"))) return 2;
    return 3;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
};

function generateItineraryDays(selectedLocs, startFromPB = true) {
  const days = [];
  // Day 1: Airport arrival (locked)
  days.push({
    island: "Port Blair (South Andaman)",
    items: [
      { type: "arrival", name: "Arrival - Veer Savarkar Intl. Airport (IXZ)" },
      { type: "transfer", name: "Airport → Hotel (Port Blair)" },
    ],
    transport: "Point-to-Point",
  });

  if (!selectedLocs.length) {
    days.push({
      island: "Port Blair (South Andaman)",
      items: [{ type: "departure", name: "Airport Departure (IXZ) — Fly Out" }],
      transport: "—",
    });
    return days;
  }

  // group by island
  const byIsland = {};
  selectedLocs.forEach((l) => ((byIsland[l.island] ||= []).push(l)));

  // sort islands and force PB first
  let order = Object.keys(byIsland).sort(
    (a, b) => DEFAULT_ISLANDS.indexOf(a) - DEFAULT_ISLANDS.indexOf(b)
  );
  if (startFromPB) {
    const pb = "Port Blair (South Andaman)";
    if (order.includes(pb)) order = [pb, ...order.filter((x) => x !== pb)];
    else order = [pb, ...order];
  }

  // build per-island days (~7h/day)
  order.forEach((island, idx) => {
    const locs = orderByBestTime(byIsland[island] || []);
    let bucket = [];
    let time = 0;

    const flush = () => {
      if (!bucket.length) return;
      if (bucket.length === 1 && locs.length) {
        const n = locs.shift();
        if (n) {
          bucket.push(n);
          time += durOf(n);
        }
      }
      days.push({
        island,
        items: bucket.map((x) => ({
          type: "location",
          ref: x.id,
          name: nameOf(x),
          durationHrs: durOf(x),
          bestTimes: x.bestTimes || [],
        })),
        transport:
          bucket.length >= 3
            ? "Day Cab"
            : /Havelock|Neil/.test(island)
            ? "Scooter"
            : "Point-to-Point",
      });
      bucket = [];
      time = 0;
    };

    while (locs.length) {
      const x = locs.shift();
      const d = durOf(x);
      if (bucket.length >= 4 || time + d > 7) flush();
      bucket.push(x);
      time += d;
    }
    flush();

    const nextIsland = order[idx + 1];
    if (nextIsland) {
      days.push({
        island,
        items: [{ type: "ferry", name: `Ferry ${island} → ${nextIsland}`, time: "08:00–09:30" }],
        transport: "—",
      });
    }
  });

  // force return to PB + departure
  const lastIsland = days[days.length - 1]?.island;
  if (lastIsland !== "Port Blair (South Andaman)") {
    days.push({
      island: lastIsland || "—",
      items: [{ type: "ferry", name: `Ferry ${lastIsland} → Port Blair (South Andaman)` }],
      transport: "—",
    });
  }
  days.push({
    island: "Port Blair (South Andaman)",
    items: [{ type: "departure", name: "Airport Departure (IXZ) — Fly Out" }],
    transport: "—",
  });

  return days;
}

/* -----------------------------
   App
------------------------------ */
export default function App() {
  // raw data
  const [rawLocations, setRawLocations] = useState([]);
  const [activities, setActivities] = useState([]);
  const [ferries, setFerries] = useState([]);
  const [locAdventures, setLocAdventures] = useState([]);
  const [dataStatus, setDataStatus] = useState("loading");

  // load
  useEffect(() => {
    (async () => {
      const withTimeout = (p, ms, label) =>
        Promise.race([
          p,
          new Promise((_, rj) => setTimeout(() => rj(new Error(`${label} timed out after ${ms}ms`)), ms)),
        ]);
      const fetchJSON = async (path, label) => {
        try {
          const res = await withTimeout(fetch(path, { cache: "no-store" }), 8000, label);
          if (!res.ok) throw new Error(`${label} ${res.status} ${res.statusText}`);
          const ct = res.headers.get("content-type") || "";
          if (!ct.includes("application/json")) throw new Error(`${label} returned non-JSON: ${ct}`);
          return res.json();
        } catch (e) {
          console.error(`[data] ${label}:`, e);
          return null;
        }
      };

      const [locs, acts, fers, map] = await Promise.all([
        fetchJSON("/data/locations.json", "locations"),
        fetchJSON("/data/activities.json", "activities"),
        fetchJSON("/data/ferries.json", "ferries"),
        fetchJSON("/data/location_adventures.json", "location_adventures"),
      ]);

      setRawLocations(Array.isArray(locs) ? locs : []);
      setActivities(Array.isArray(acts) ? acts : []);
      setFerries(Array.isArray(fers) ? fers : []); // not used yet in UI
      setLocAdventures(Array.isArray(map) ? map : []);

      setDataStatus("ready");
    })();
  }, []);

  // normalize locations to a unified shape the UI expects
  const locations = useMemo(() => {
    return rawLocations.map((l) => ({
      ...l,
      name: nameOf(l),
      durationHrs: durOf(l),
      moods:
        (Array.isArray(l.moods) && l.moods.length
          ? normalizeMoods(l.moods)
          : inferMoods({ ...l, name: nameOf(l) })) || [],
      image: l.image || DEFAULT_BEACH_IMG,
    }));
  }, [rawLocations]);

  const islandsList = useMemo(() => {
    const s = new Set(locations.map((l) => l.island).filter(Boolean));
    return s.size ? Array.from(s) : DEFAULT_ISLANDS;
  }, [locations]);

  // —— App state
  const [step, setStep] = useState(0); // 0 Basics, 1 Adventures, 2 Locations, 3 Itin, 4 Hotels, 5 Transport
  const [startDate, setStartDate] = useState("");
  const [adults, setAdults] = useState(2);
  const [infants, setInfants] = useState(0);
  const pax = adults + infants;
  const [startPB, setStartPB] = useState(true);

  // selection
  const [selectedIds, setSelectedIds] = useState([]);

  // hide airport from selection list
  const selectableLocations = useMemo(
    () => locations.filter((l) => !/airport/i.test(nameOf(l))),
    [locations]
  );
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

  const selectedLocs = useMemo(
    () => locations.filter((l) => selectedIds.includes(l.id)),
    [locations, selectedIds]
  );

  // itinerary
  const [days, setDays] = useState([]);
  useEffect(() => {
    setDays(generateItineraryDays(selectedLocs, startPB));
  }, [selectedLocs, startPB]);

  // day helpers (lock last departure day)
  const addEmptyDayAfter = (i) => {
    const copy = [...days];
    if (!copy.length) return;
    const lastIdx = copy.length - 1;
    if (copy[lastIdx].items.some((it) => it.type === "departure")) {
      // insert before last (departure) day
      copy.splice(lastIdx, 0, {
        island: copy[i]?.island || "Port Blair (South Andaman)",
        items: [],
        transport: "Point-to-Point",
      });
    } else {
      copy.splice(i + 1, 0, { island: copy[i]?.island || "Port Blair (South Andaman)", items: [], transport: "Point-to-Point" });
    }
    setDays(copy);
  };
  const deleteDay = (index) => {
    const copy = [...days];
    // prevent deleting the final departure day
    const isLastDeparture =
      index === copy.length - 1 && copy[index].items.some((it) => it.type === "departure");
    if (isLastDeparture) return;
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

  // hotels
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
  const chooseHotel = (island, hotelId) => setChosenHotels((p) => ({ ...p, [island]: hotelId }));
  const [hotelIsland, setHotelIsland] = useState("Port Blair (South Andaman)");

  // transport essentials
  const [essentials, setEssentials] = useState({
    ferryClass: "Deluxe",
    cabModelId: CAB_MODELS[1].id, // default SUV
  });

  // scooters (separate section)
  const [scooterIslands, setScooterIslands] = useState(new Set());
  const toggleScooter = (isl) => {
    const next = new Set(scooterIslands);
    next.has(isl) ? next.delete(isl) : next.add(isl);
    setScooterIslands(next);
  };

  // ADVENTURES — suggested + all (grouped by island)
  const [addonIds, setAddonIds] = useState([]);
  const suggestedActivities = useMemo(() => {
    if (!selectedLocs.length) return [];
    const selectedIslands = new Set(selectedLocs.map((l) => l.island));
    const islandMatch = activities.filter((a) => (a.islands || []).some((i) => selectedIslands.has(i)));
    return islandMatch;
  }, [activities, selectedLocs]);

  const activitiesByIsland = useMemo(() => {
    const map = {};
    activities.forEach((a) => {
      (a.islands || []).forEach((isl) => {
        (map[isl] ||= []).push(a);
      });
    });
    return map;
  }, [activities]);

  /* -------- Totals -------- */
  const hotelsTotal = useMemo(() => {
    let sum = 0;
    Object.entries(nightsByIsland).forEach(([island, nights]) => {
      const hid = chosenHotels[island];
      if (!hid) return;
      const h = (MOCK_HOTELS[island] || []).find((x) => x.id === hid);
      if (h) sum += safeNum(h.sell_price) * nights;
    });
    return sum;
  }, [nightsByIsland, chosenHotels, MOCK_HOTELS]);

  const addonsTotal = useMemo(
    () =>
      addonIds.reduce((acc, id) => {
        const ad = activities.find((a) => a.id === id);
        return acc + safeNum(ad?.basePriceINR ?? ad?.price);
      }, 0),
    [addonIds, activities]
  );

  const ferryLegCount = useMemo(
    () => days.reduce((acc, d) => acc + d.items.filter((i) => i.type === "ferry").length, 0),
    [days]
  );
  const ferryTotal = useMemo(() => {
    const mult = FERRY_CLASS_MULT[essentials.ferryClass] ?? 1;
    return ferryLegCount * FERRY_BASE_ECON * mult * Math.max(1, adults);
  }, [ferryLegCount, essentials.ferryClass, adults]);

  const cabDayRate = useMemo(() => {
    const found = CAB_MODELS.find((c) => c.id === essentials.cabModelId);
    return found ? found.dayRate : CAB_MODELS[0].dayRate;
  }, [essentials.cabModelId]);

  const logisticsTotal = useMemo(() => {
    let sum = 0;
    days.forEach((day) => {
      if (day.items.some((i) => i.type === "ferry") || day.items.some((i) => i.type === "departure")) return;
      const stops = day.items.filter((i) => i.type === "location").length;
      if (scooterIslands.has(day.island)) {
        sum += SCOOTER_DAY_RATE;
        return;
      }
      if (day.transport === "Day Cab") sum += cabDayRate;
      else if (day.transport === "Scooter") sum += SCOOTER_DAY_RATE;
      else sum += Math.max(1, stops - 1) * P2P_RATE_PER_HOP;
    });
    return sum;
  }, [days, scooterIslands, cabDayRate]);

  const grandTotal = hotelsTotal + addonsTotal + logisticsTotal + ferryTotal;

  /* -------- Location Modal -------- */
  const [openLoc, setOpenLoc] = useState(null);
  const openModalFor = (loc) => setOpenLoc(loc);
  const closeModal = () => setOpenLoc(null);

  if (dataStatus === "loading") {
    return <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>Loading Andaman data…</div>;
  }

  /* -----------------------------
     UI
  ------------------------------ */
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
          {/* STEP 0: Basics */}
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

          {/* STEP 1: Adventures (optional) */}
          {step === 1 && (
            <Card title="Adventures (Optional)">
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>
                Suggested adventures appear first from your selected locations (if any). Then explore all adventures island-wise.
              </div>

              <div style={{ marginBottom: 12 }}>
                <b>Suggested from your selected locations</b>
                {!suggestedActivities.length && (
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                    No suggestions yet — add a few locations to see island-specific ideas.
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12, marginTop: 8 }}>
                  {suggestedActivities.map((a) => {
                    const on = addonIds.includes(a.id);
                    return (
                      <div key={a.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                        <div style={{ height: 90, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                        <div style={{ fontSize: 12, color: "#475569" }}>{formatINR(a.basePriceINR ?? a.price ?? 0)}</div>
                        <button
                          onClick={() => setAddonIds((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
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
              </div>

              <div style={{ marginTop: 10 }}>
                <b>All Adventures — grouped by island</b>
                {Object.keys(activitiesByIsland).length === 0 && (
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>No adventures loaded.</div>
                )}
                {Object.entries(activitiesByIsland).map(([isl, list]) => (
                  <div key={isl} style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 6 }}>{isl}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
                      {list.map((a) => {
                        const on = addonIds.includes(a.id);
                        return (
                          <div key={a.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                            <div style={{ height: 90, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                            <div style={{ fontSize: 12, color: "#475569" }}>{formatINR(a.basePriceINR ?? a.price ?? 0)}</div>
                            <button
                              onClick={() => setAddonIds((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
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
                  </div>
                ))}
              </div>

              <FooterNav onPrev={() => setStep(0)} onNext={() => setStep(2)} />
            </Card>
          )}

          {/* STEP 2: Select Locations */}
          {step === 2 && (
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
                <Field label="Mood of trip">
                  <select value={moodFilter} onChange={(e) => setMoodFilter(e.target.value)}>
                    <option>All</option>
                    {CANONICAL_MOODS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
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
                    <div key={l.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                      {/* hero */}
                      <div
                        style={{
                          height: 120,
                          borderRadius: 8,
                          marginBottom: 8,
                          background: `url(${l.image || DEFAULT_BEACH_IMG}) center/cover`,
                        }}
                      />
                      <b style={{ fontSize: 14 }}>{nameOf(l)}</b>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                        {l.island} • {durOf(l)}h
                      </div>
                      {/* Mood chips */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        {(l.moods || []).slice(0, 4).map((m) => (
                          <span key={m} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, border: "1px solid #e5e7eb", color: "#334155", background: "#f8fafc" }}>
                            {m}
                          </span>
                        ))}
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                        <button
                          onClick={() => openModalFor(l)}
                          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white", fontWeight: 600 }}
                        >
                          Explore
                        </button>
                        <button
                          onClick={() => setStep(1)}
                          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #0ea5e9", background: "white", color: "#0ea5e9", fontWeight: 700 }}
                        >
                          View Adventures
                        </button>
                      </div>

                      <button
                        onClick={() =>
                          setSelectedIds((prev) =>
                            prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                          )
                        }
                        style={{
                          marginTop: 8,
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #0ea5e9",
                          background: picked ? "#0ea5e9" : "white",
                          color: picked ? "white" : "#0ea5e9",
                          fontWeight: 700,
                        }}
                      >
                        {picked ? "Selected" : "Select"}
                      </button>
                    </div>
                  );
                })}
              </div>

              <FooterNav onPrev={() => setStep(1)} onNext={() => setStep(3)} />
            </Card>
          )}

          {/* STEP 3: Itinerary */}
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
                          {day.items.some((it) => it.type === "ferry") && (
                            <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 999, background: "#ecfeff", color: "#0369a1", border: "1px solid #bae6fd" }}>Ferry</span>
                          )}
                          {day.items.some((it) => it.type === "arrival") && (
                            <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 999, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>Arrival</span>
                          )}
                          {day.items.some((it) => it.type === "departure") && (
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
                      {!day.items.some((it) => it.type === "ferry") && !day.items.some((i) => i.type === "departure") && (
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

          {/* STEP 4: Hotels */}
          {step === 4 && (
            <Card title="Hotels by Island">
              <Row>
                <Field label="Browse hotels for island">
                  <select value={hotelIsland} onChange={(e) => setHotelIsland(e.target.value)}>
                    {islandsList.map((i) => (
                      <option key={i}>{i}</option>
                    ))}
                  </select>
                </Field>
              </Row>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 10, marginTop: 4 }}>
                {(MOCK_HOTELS[hotelIsland] || []).map((h) => {
                  const picked = chosenHotels[hotelIsland] === h.id;
                  return (
                    <div key={h.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                      <div style={{ height: 80, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>{h.tier} • From {formatINR(h.sell_price)}/night</div>
                      <button
                        onClick={() => chooseHotel(hotelIsland, h.id)}
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

              {/* nights summary blocks remain (not removed) */}
              <div style={{ marginTop: 16 }}>
                {Object.entries(nightsByIsland).map(([isl, nights]) => (
                  <div key={isl} style={{ marginTop: 12 }}>
                    <b>{isl} — {nights} night(s)</b>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 10, marginTop: 8 }}>
                      {(MOCK_HOTELS[isl] || []).map((h) => {
                        const picked = chosenHotels[isl] === h.id;
                        return (
                          <div key={h.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                            <div style={{ height: 80, background: "#e2e8f0", borderRadius: 8, marginBottom: 8 }} />
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</div>
                            <div style={{ fontSize: 12, color: "#475569" }}>{h.tier} • From {formatINR(h.sell_price)}/night</div>
                            <button
                              onClick={() => chooseHotel(isl, h.id)}
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
              </div>

              <FooterNav onPrev={() => setStep(3)} onNext={() => setStep(5)} />
            </Card>
          )}

          {/* STEP 5: Transport & Ferries */}
          {step === 5 && (
            <Card title="Transport & Ferries">
              {/* Ferries */}
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "white", marginBottom: 12 }}>
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

              {/* Cabs */}
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "white", marginBottom: 12 }}>
                <b>Cab (Day Cab days)</b>
                <Row>
                  <Field label="Cab model">
                    <select value={essentials.cabModelId} onChange={(e) => setEssentials({ ...essentials, cabModelId: e.target.value })}>
                      {CAB_MODELS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label} — {formatINR(c.dayRate)}/day
                        </option>
                      ))}
                    </select>
                  </Field>
                </Row>
              </div>

              {/* Scooters (separate major section) */}
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "white" }}>
                <b>Scooter per Island</b>
                <div style={{ fontSize: 12, color: "#475569", margin: "6px 0 8px" }}>
                  Enable scooters on these islands (overrides daily ground transport cost for those days).
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {Array.from(new Set(days.map((d) => d.island)))
                    .filter(Boolean)
                    .map((isl) => (
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

              <FooterNav onPrev={() => setStep(4)} onNext={() => alert("This would submit a lead for the full itinerary.")} nextLabel="Request to Book" />
            </Card>
          )}
        </section>

        {/* Desktop summary */}
        <aside className="sidebar">
          <div style={{ position: "sticky", top: 80 }}>
            <div style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 24px rgba(2,132,199,0.08)" }}>
              {/* header */}
              <div style={{ padding: "12px 14px", color: "white", background: "linear-gradient(90deg, #0891b2 0%, #06b6d4 50%, #22d3ee 100%)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 800, background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)", padding: "4px 8px", borderRadius: 999, letterSpacing: 0.3 }}>
                  TRIP SUMMARY
                </span>
                <span style={{ background: "white", color: "#0f172a", padding: "6px 10px", borderRadius: 10, fontWeight: 900, boxShadow: "0 2px 8px rgba(0,0,0,.12)" }}>
                  {formatINR(grandTotal)}
                </span>
              </div>

              {/* body */}
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
                  <RowSplit label="Adventures" value={formatINR(addonsTotal)} />
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

      {/* Location Detail Modal */}
      {openLoc && (
        <div
          onClick={(e) => { if (e.target.id === "loc-ov") closeModal(); }}
          id="loc-ov"
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "flex-end" }}
        >
          <div style={{
            width: "100%", maxWidth: 640, background: "white",
            borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden",
            boxShadow: "0 -16px 40px rgba(0,0,0,.28)"
          }}>
            <div style={{ position: "relative" }}>
              <div style={{ height: 200, background: `url(${openLoc.image || DEFAULT_BEACH_IMG}) center/cover` }} />
              <button onClick={closeModal} aria-label="Close" style={{
                position: "absolute", right: 10, top: 10,
                background: "rgba(0,0,0,.5)", color: "white", border: 0,
                width: 32, height: 32, borderRadius: 999, fontSize: 18
              }}>×</button>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ fontSize: 16 }}>{nameOf(openLoc)}</b>
                <span style={{ fontSize: 12, color: "#64748b" }}>{openLoc.island}</span>
              </div>
              <div style={{ fontSize: 13, color: "#334155", marginTop: 6 }}>
                {openLoc.brief || "Popular stop that fits a relaxed pace. Add it to your day and tweak later."}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {(openLoc.moods || inferMoods(openLoc)).slice(0, 4).map((m) => (
                  <span key={m} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f8fafc" }}>{m}</span>
                ))}
                <span style={{ fontSize: 11, padding: "4px 8px", borderRadius: 999, background: "#ecfeff", color: "#0369a1", border: "1px solid #bae6fd" }}>
                  {durOf(openLoc)}h typical
                </span>
              </div>

              {/* Nearby attractions (same island) */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}><b>Nearby attractions</b> (same island)</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {locations
                    .filter((l) => l.island === openLoc.island && l.id !== openLoc.id)
                    .slice(0, 6)
                    .map((l) => {
                      const picked = selectedIds.includes(l.id);
                      return (
                        <span key={l.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "white" }}>
                          {nameOf(l)}
                          <button
                            onClick={() =>
                              setSelectedIds((prev) =>
                                picked ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                              )
                            }
                            style={{
                              border: "1px solid " + (picked ? "#ef4444" : "#16a34a"),
                              color: picked ? "#ef4444" : "#16a34a",
                              background: "white",
                              borderRadius: 999,
                              fontSize: 10,
                              padding: "2px 6px",
                              marginLeft: 4,
                            }}
                          >
                            {picked ? "Remove" : "Add"}
                          </button>
                        </span>
                      );
                    })}
                </div>
              </div>

              {/* Suggested activities (island match or explicit map if provided) */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}><b>Suggested activities</b></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {activities
                    .filter((a) => (a.islands || []).includes(openLoc.island))
                    .slice(0, 6)
                    .map((a) => {
                      const on = addonIds.includes(a.id);
                      return (
                        <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "white" }}>
                          {a.name}
                          <button
                            onClick={() => setAddonIds((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                            style={{
                              border: "1px solid " + (on ? "#ef4444" : "#0ea5e9"),
                              color: on ? "#ef4444" : "#0ea5e9",
                              background: "white",
                              borderRadius: 999,
                              fontSize: 10,
                              padding: "2px 6px",
                              marginLeft: 4,
                            }}
                          >
                            {on ? "Remove" : "Add"}
                          </button>
                        </span>
                      );
                    })}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  onClick={() =>
                    setSelectedIds((prev) =>
                      prev.includes(openLoc.id) ? prev : [...prev, openLoc.id]
                    )
                  }
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #16a34a", background: "#16a34a", color: "white", fontWeight: 700 }}
                >
                  Add this location
                </button>
                <button onClick={closeModal} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white" }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Summary Bar */}
      <MobileSummaryBar
        total={grandTotal}
        lineItems={[
          { label: "Hotels", amount: hotelsTotal },
          { label: "Ferries", amount: ferryTotal },
          { label: "Ground transport", amount: logisticsTotal },
          { label: "Adventures", amount: addonsTotal },
        ]}
        badges={[
          { label: "days", value: String(days.length) },
          { label: "travellers", value: String(pax) },
        ]}
        onRequestToBook={() => alert("This would submit a lead for the full itinerary.")}
      />
    </div>
  );
}

/* -----------------------------
   Tiny UI primitives
------------------------------ */
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
  const labels = ["Trip Basics", "Adventures (Optional)", "Select Locations", "Itinerary", "Hotels", "Transport"];
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px 12px 16px", display: "grid", gridTemplateColumns: `repeat(${labels.length},1fr)`, gap: 6 }}>
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
