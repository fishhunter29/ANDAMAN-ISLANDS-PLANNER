// Replace the entire content of CreateTourWireframeDemo.jsx with this

import React, { useMemo, useState } from "react";

// Helpers
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

// Mock data
const ISLANDS = ["Port Blair", "Havelock", "Neil", "Long Island", "Diglipur"];
const MOODS = ["Relaxed", "Adventure", "Offbeat", "Family-friendly", "Romantic"];

const MOCK_LOCATIONS = [
  { id: "pb_cellular", name: "Cellular Jail", island: "Port Blair", durationHrs: 1.5, interest: "Culture", mood: "Family-friendly" },
  { id: "pb_corbyn", name: "Corbyn’s Cove", island: "Port Blair", durationHrs: 2, interest: "Beach", mood: "Relaxed" },
  { id: "hl_radhanagar", name: "Radhanagar Beach", island: "Havelock", durationHrs: 3, interest: "Beach", mood: "Romantic" },
  { id: "hl_elephant", name: "Elephant Beach", island: "Havelock", durationHrs: 3, interest: "Snorkel", mood: "Adventure" },
  { id: "nl_bridge", name: "Natural Bridge", island: "Neil", durationHrs: 1.5, interest: "Viewpoint", mood: "Offbeat" },
];

const MOCK_ADDONS = [
  { id: "ad_kayak", name: "Mangrove Kayaking", price: 1800 },
  { id: "ad_snorkel", name: "Guided Snorkeling", price: 2500 },
  { id: "ad_scuba", name: "Try Scuba", price: 4200 },
];

// Generate itinerary days
function generateItineraryDays(selectedLocs, startFromPB = true) {
  if (!selectedLocs.length) return [];
  const byIsland = {};
  selectedLocs.forEach((l) => (byIsland[l.island] ||= []).push(l));

  let order = Object.keys(byIsland).sort((a, b) => ISLANDS.indexOf(a) - ISLANDS.indexOf(b));
  if (startFromPB && order.includes("Port Blair")) {
    order = ["Port Blair", ...order.filter((x) => x !== "Port Blair")];
  }

  const days = [];
  order.forEach((island, idx) => {
    const locs = byIsland[island];
    let i = 0;
    while (i < locs.length) {
      const chunk = locs.slice(i, i + 4);
      days.push({
        island,
        items: chunk.map((x) => ({ type: "location", ref: x.id, name: x.name, durationHrs: x.durationHrs })),
        transport: chunk.length >= 3 ? "Day Cab" : ["Havelock", "Neil"].includes(island) ? "Scooter" : "Point-to-Point",
      });
      i += chunk.length;
    }
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

// Main Component
export default function CreateTourWireframeDemo() {
  const [step, setStep] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [adults, setAdults] = useState(2);
  const [infants, setInfants] = useState(0);
  const [startPB, setStartPB] = useState(true);
  const [selectedMood, setSelectedMood] = useState("All");

  const [selectedIds, setSelectedIds] = useState(["pb_cellular", "hl_radhanagar"]);
  const selectedLocs = useMemo(
    () => MOCK_LOCATIONS.filter((l) => selectedIds.includes(l.id)),
    [selectedIds]
  );

  const [days, setDays] = useState(() => generateItineraryDays(selectedLocs, startPB));

  React.useEffect(() => {
    if (days.length === 0) setDays(generateItineraryDays(selectedLocs, startPB));
  }, [selectedLocs, startPB]);

  // Trip Summary
  const tripSummary = days.map((d, i) => ({
    day: i + 1,
    island: d.island,
    stops: d.items.map((it) => it.name).join(", "),
  }));

  return (
    <div style={{ fontFamily: "system-ui, Arial", background: "#f6f7f8", minHeight: "100vh", color: "#0f172a" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "white", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "12px 16px", display: "flex", justifyContent: "space-between" }}>
          <b>Create Your Andaman Tour</b>
          <span style={{ fontSize: 12 }}>Step {step + 1} / 6</span>
        </div>
        <Stepper step={step} setStep={setStep} />
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 16, display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
        <section>
          {step === 0 && (
            <Card title="Trip Basics">
              <Row>
                <Field label="Start date"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
                <Field label="Adults"><input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} /></Field>
                <Field label="Infants"><input type="number" min={0} value={infants} onChange={(e) => setInfants(Number(e.target.value))} /></Field>
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
                <Field label="Island Filter">
                  <select onChange={(e) => setSelectedIds(MOCK_LOCATIONS.filter(l => e.target.value === "All" || l.island === e.target.value).map(l => l.id))}>
                    <option>All</option>
                    {ISLANDS.map((i) => <option key={i}>{i}</option>)}
                  </select>
                </Field>
                <Field label="Mood Filter">
                  <select value={selectedMood} onChange={(e) => setSelectedMood(e.target.value)}>
                    <option>All</option>
                    {MOODS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </Field>
              </Row>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
                {MOCK_LOCATIONS.filter(l => selectedMood === "All" || l.mood === selectedMood).map((l) => {
                  const picked = selectedIds.includes(l.id);
                  return (
                    <div key={l.id} style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 12 }}>
                      <b style={{ fontSize: 14 }}>{l.name}</b>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{l.island} • {l.interest} • {l.mood}</div>
                      <button onClick={() => setSelectedIds((p) => p.includes(l.id) ? p.filter((x) => x !== l.id) : [...p, l.id])}
                        style={{ marginTop: 8, width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #0ea5e9", background: picked ? "#0ea5e9" : "white", color: picked ? "white" : "#0ea5e9", fontWeight: 600 }}>
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
            <Card title="Itinerary (Editable)">
              {tripSummary.map((d) => (
                <div key={d.day} style={{ padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
                  <b>Day {d.day} - {d.island}</b><br />
                  <small>{d.stops}</small>
                </div>
              ))}
              <FooterNav onPrev={() => setStep(1)} onNext={() => setStep(3)} />
            </Card>
          )}

          {step === 3 && <Card title="Hotels by Island"><p>Hotels UI here...</p><FooterNav onPrev={() => setStep(2)} onNext={() => setStep(4)} /></Card>}
          {step === 4 && <Card title="Transport & Ferries"><p>Transport UI here...</p><FooterNav onPrev={() => setStep(3)} onNext={() => setStep(5)} /></Card>}
          {step === 5 && <Card title="Add-ons & Activities"><p>Add-ons UI here...</p><FooterNav onPrev={() => setStep(4)} onNext={() => alert("Submit Request")} nextLabel="Request to Book" /></Card>}
        </section>

        <aside>
          <div style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 16 }}>
            <b>Trip Summary</b>
            <div style={{ marginTop: 8 }}>
              {tripSummary.map((d) => (
                <div key={d.day} style={{ marginBottom: 6 }}>
                  Day {d.day}: {d.island} – {d.stops}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

// UI Primitives
function Card({ title, children }) { return <div style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 12, padding: 16, marginBottom: 12 }}><h3>{title}</h3>{children}</div>; }
function Row({ children }) { return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 10 }}>{children}</div>; }
function Field({ label, children }) { return <label style={{ fontSize: 12, display: "grid", gap: 4 }}><span>{label}</span>{children}</label>; }
function FooterNav({ onPrev, onNext, nextLabel = "Next" }) { return <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}><button onClick={onPrev} disabled={!onPrev}>Back</button><button onClick={onNext}>{nextLabel}</button></div>; }
function Stepper({ step, setStep }) { const labels = ["Basics", "Locations", "Itinerary", "Hotels", "Essentials", "Add-ons"]; return <div style={{ display: "grid", gridTemplateColumns: `repeat(${labels.length},1fr)`, gap: 4, margin: "8px 0" }}>{labels.map((l, i) => <button key={l} onClick={() => setStep(i)} style={{ background: i === step ? "#0ea5e9" : "white", color: i === step ? "white" : "#0f172a", border: "1px solid #e5e7eb", padding: "4px 6px" }}>{l}</button>)}</div>; }
