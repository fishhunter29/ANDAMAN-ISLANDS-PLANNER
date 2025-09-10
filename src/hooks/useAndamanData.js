import { useEffect, useState, useRef } from "react";
import { normalizeLocations } from "../utils/normalize.js";

/**
 * Central data loader with:
 * - Timeout guards
 * - Content-Type check
 * - AbortController to prevent state updates after unmount
 * - Partial load tolerance (but we still surface an overall error)
 */
export function useAndamanData() {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [locations, setLocations] = useState([]);
  const [activities, setActivities] = useState([]);
  const [ferries, setFerries] = useState([]);
  const [locAdventures, setLocAdventures] = useState([]);

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    const ctrl = new AbortController();

    const withTimeout = (promise, ms, label) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
      ]);

    const fetchJSON = async (path, label) => {
      const res = await withTimeout(fetch(path, { cache: "no-store", signal: ctrl.signal }), 10000, label);
      if (!res.ok) throw new Error(`${label} ${res.status} ${res.statusText}`);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error(`${label} returned non-JSON content-type: ${ct}`);
      }
      return res.json();
    };

    (async () => {
      try {
        setStatus("loading");
        setError(null);

        const [locsRaw, actsRaw, fersRaw, mapRaw] = await Promise.all([
          fetchJSON("/data/locations.json", "locations"),
          fetchJSON("/data/activities.json", "activities"),
          fetchJSON("/data/ferries.json", "ferries"),
          fetchJSON("/data/location_adventures.json", "location_adventures"),
        ]);

        const normalizedLocs = normalizeLocations(Array.isArray(locsRaw) ? locsRaw : []);
        if (!mounted.current) return;

        setLocations(normalizedLocs);
        setActivities(Array.isArray(actsRaw) ? actsRaw : []);
        setFerries(Array.isArray(fersRaw) ? fersRaw : []);
        setLocAdventures(Array.isArray(mapRaw) ? mapRaw : []);
        setStatus("ready");
      } catch (e) {
        if (!mounted.current) return;
        console.error("[data] load failed:", e);
        setError(e);
        setStatus("error");
      }
    })();

    return () => ctrl.abort();
  }, []);

  return { status, error, locations, activities, ferries, locAdventures };
}
