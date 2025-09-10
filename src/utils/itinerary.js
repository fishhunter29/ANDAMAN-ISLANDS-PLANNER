function orderByBestTime(items) {
  const rank = (it) => {
    const arr = (it.bestTimes || []).map((x) => String(x).toLowerCase());
    if (arr.some((t) => t.includes("morning") || t.includes("sunrise"))) return 0;
    if (arr.some((t) => t.includes("afternoon"))) return 1;
    if (arr.some((t) => t.includes("evening") || t.includes("sunset"))) return 2;
    return 3;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/**
 * Packs ~7h/day & inserts ferries, Day 1 = Airport, end day = Airport Departure
 */
export function generateItineraryDays(selectedLocs, startFromPB = true) {
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

  const days = [];
  // Day 1 starts with Airport Arrival in Port Blair
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
  selectedLocs.forEach((l) => {
    (byIsland[l.island] ||= []).push(l);
  });

  // sort islands; PB first if present
  let order = Object.keys(byIsland).sort(
    (a, b) => DEFAULT_ISLANDS.indexOf(a) - DEFAULT_ISLANDS.indexOf(b)
  );
  if (startFromPB) {
    const pb = "Port Blair (South Andaman)";
    if (order.includes(pb)) order = [pb, ...order.filter((x) => x !== pb)];
    else order = [pb, ...order]; // ensure PB day exists for return logic
  }

  // per island → bucket into days by ~7h (aim 2–4 stops/day)
  order.forEach((island, idx) => {
    const locs = orderByBestTime(byIsland[island] || []);
    let dayBucket = [];
    let timeUsed = 0;

    const flushDay = () => {
      if (!dayBucket.length) return;
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
            : /Havelock|Neil/.test(island)
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
      if (dayBucket.length >= 4 || wouldBe > 7) flushDay();
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

  // Force final day = Airport Departure in Port Blair
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
