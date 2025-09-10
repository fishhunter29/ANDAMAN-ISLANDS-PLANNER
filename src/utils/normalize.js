export const safeNum = (n) => (typeof n === "number" && isFinite(n) ? n : 0);
export const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(safeNum(n));

export const addDays = (yyyy_mm_dd, n) => {
  if (!yyyy_mm_dd) return null;
  const d = new Date(yyyy_mm_dd);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const slugify = (s = "") =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\s/(),.-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

export function normalizeLocations(locs) {
  return locs.map((l) => {
    const name = l.name || l.location || "Unnamed";
    const durationHrs = l.durationHrs ?? l.typicalHours ?? 2;
    const bestTimes = Array.isArray(l.bestTimes)
      ? l.bestTimes
      : (l.bestTime ? String(l.bestTime).split(/[\/,;+]/).map((s) => s.trim()) : []);
    return {
      ...l,
      name,
      durationHrs,
      bestTimes,
      slug: slugify(name),
    };
  });
}

// Heuristic: infer "moods" for a location if not provided in data
export function inferMoods(loc) {
  const moods = new Set();
  const interest = (loc.interest || "").toLowerCase();
  const name = (loc.name || "").toLowerCase();
  const dur = Number.isFinite(loc.durationHrs) ? loc.durationHrs : 2;

  if (dur <= 2) moods.add("Relaxed");
  if (dur >= 3) moods.add("Balanced");
  if (dur >= 4) moods.add("Active");

  if (/snorkel|scuba|dive|trek|kayak|surf|jet|parasail/.test(interest)) moods.add("Adventure");
  if (/beach|sunset|view|cove|lagoon|mangrove/.test(interest)) moods.add("Relaxed");
  if (/museum|culture|heritage|jail|cellular|memorial/.test(interest)) moods.add("Family");
  if (/wildlife|reef|coral|mangrove|bird|nature|peak/.test(interest)) moods.add("Photography");
  if (/lighthouse|mangrove|cave|long island|mud volcano|baratang|ross|smith|saddle peak/.test(name)) moods.add("Offbeat");

  if (moods.size === 0) moods.add("Balanced");
  return Array.from(moods);
}
