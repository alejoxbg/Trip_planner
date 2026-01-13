 "use client";

import { PlannerMap } from "@/app/components/Map";
import type { MapMarker } from "@/app/components/Map";
import { PlaceSearch } from "@/app/components/PlaceSearch";
import { createId } from "@/app/lib/id";
import { createT } from "@/app/lib/i18n";
import type { Language } from "@/app/lib/i18n";
import { fetchOsrmRoute, fetchOsrmRouteWithSteps, fetchOsrmTableDurations } from "@/app/lib/osrm";
import { twoOptImprove } from "@/app/lib/optimizer/tsp";
import { clearAllData, loadPlaces, loadPlan, loadSettings, savePlaces, savePlan, saveSettings } from "@/app/lib/storage";
import type { Place, PlaceKind } from "@/app/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";

type TravelMode = "driving" | "walking" | "cycling" | "transit" | "flight";
type DayWindow = { start: string; end: string };

export default function Home() {
  const exportMenuRef = useRef<HTMLDetailsElement | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number }>();
  const [routeSegments, setRouteSegments] = useState<
    Array<{
      coords: Array<{ lat: number; lon: number }>;
      color: string;
      dayIdx: number;
      legIdxInDay: number;
      durationMin?: number;
      distanceM?: number;
    }>
  >([]);
  const abortRef = useRef<AbortController | null>(null);
  const [newKind, setNewKind] = useState<PlaceKind>("place");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pickOnMap, setPickOnMap] = useState(false);
  const [addUI, setAddUI] = useState<null | { mode: "search" | "map"; kind: PlaceKind }>(null);
  const [dayStart, setDayStart] = useState("08:00");
  const [dayEnd, setDayEnd] = useState("20:00");
  const [defaultPlaceDurationMin, setDefaultPlaceDurationMin] = useState(60);
  const [defaultAirportDurationMin, setDefaultAirportDurationMin] = useState(60);
  const [defaultTravelMode, setDefaultTravelMode] = useState<Exclude<TravelMode, "flight">>("driving");
  const [language, setLanguage] = useState<Language>("en");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [planDays, setPlanDays] = useState<string[][]>([[]]); // activity IDs per day
  const [planLegModes, setPlanLegModes] = useState<TravelMode[][]>([[]]); // outgoing mode per day item
  const [planDayWindows, setPlanDayWindows] = useState<DayWindow[]>([]); // start/end per day
  const [dragging, setDragging] = useState<null | { placeId: string; fromDay: number; fromIdx: number }>(null);
  const [dragOver, setDragOver] = useState<null | { day: number; idx: number | null }>(null);
  const [optimizingDayIdx, setOptimizingDayIdx] = useState<number | null>(null);
  const [mapView, setMapView] = useState<
    | { mode: "por_dias" }
    | { mode: "enfocar_dia"; day: number }
    | { mode: "solo_dia"; day: number }
  >({ mode: "por_dias" });
  const [focusDay, setFocusDay] = useState(1); // 1..N (for the bottom control)
  const [focusStopIdx, setFocusStopIdx] = useState(0); // index within the day (includes hotel when applicable)
  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [legInfo, setLegInfo] = useState<
    | null
    | {
        open: true;
        title: string;
        subtitle: string;
        mode: TravelMode;
        loading: boolean;
        error?: string;
        lines: string[];
      }
  >(null);

  useEffect(() => {
    setPlaces(loadPlaces());
    const s = loadSettings();
    setDayStart(s.dayStart);
    setDayEnd(s.dayEnd);
    setDefaultPlaceDurationMin(s.defaultPlaceDurationMin ?? 60);
    setDefaultAirportDurationMin(s.defaultAirportDurationMin ?? 60);
    setDefaultTravelMode((s.defaultTravelMode ?? "driving") as Exclude<TravelMode, "flight">);
    setLanguage((s.language ?? "es") as Language);
    const plan = loadPlan();
    setPlanDays(plan.days);
    const fallback = (plan.days.length > 0 ? plan.days : [[]]).map((d) => d.map(() => (s.defaultTravelMode ?? "driving") as TravelMode));
    const raw = plan.legModes?.length ? (plan.legModes as TravelMode[][]) : fallback;
    // Migration: old ("from") stored the mode for i->i+1 (selector on the first item, not on the last).
    // New ("to") stores the mode for (i-1)->i (selector on all but the first item, including the last).
    const modes =
      plan.legModesSemantics === "to"
        ? raw
        : raw.map((d) => {
            if (!Array.isArray(d) || d.length === 0) return d;
            const out: TravelMode[] = new Array(d.length).fill((s.defaultTravelMode ?? "driving") as TravelMode);
            out[0] = (s.defaultTravelMode ?? "driving") as TravelMode; // se ignora igual
            for (let i = 0; i < d.length - 1; i++) out[i + 1] = d[i] ?? "driving";
            return out;
          });
    setPlanLegModes(modes);

    const dw =
      plan.dayWindows?.length
        ? plan.dayWindows.map((w) => ({
            start: typeof w.start === "string" && w.start ? w.start : s.dayStart,
            end: typeof w.end === "string" && w.end ? w.end : s.dayEnd,
          }))
        : (plan.days.length > 0 ? plan.days : [[]]).map(() => ({ start: s.dayStart, end: s.dayEnd }));
    setPlanDayWindows(dw);
  }, []);

  useEffect(() => {
    savePlaces(places);
  }, [places]);

  useEffect(() => {
    savePlan({ days: planDays, legModes: planLegModes, legModesSemantics: "to", dayWindows: planDayWindows });
  }, [planDays, planLegModes, planDayWindows]);

  useEffect(() => {
    saveSettings({ dayStart, dayEnd, defaultPlaceDurationMin, defaultAirportDurationMin, defaultTravelMode, language });
  }, [dayStart, dayEnd, defaultPlaceDurationMin, defaultAirportDurationMin, defaultTravelMode, language]);

  const t = useMemo(() => createT(language), [language]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    try {
      document.documentElement.lang = language;
    } catch {
      // ignore
    }
  }, [language]);

  const placeById = useMemo(() => {
    const m: Record<string, Place> = {};
    for (const p of places) m[p.id] = p;
    return m;
  }, [places]);

  // Keeps the plan consistent with the current `places` list (add/remove points).
  useEffect(() => {
    const placeIds = places.map((p) => p.id);
    const placeSet = new Set(placeIds);

    const modeById: Record<string, TravelMode> = {};
    for (let d = 0; d < planDays.length; d++) {
      const ids = planDays[d] ?? [];
      const modes = planLegModes[d] ?? [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        if (modeById[id] != null) continue;
        const m = modes[i] ?? "driving";
        modeById[id] = m;
      }
    }

    // 1) Filter out missing IDs and remove global duplicates (avoid an activity appearing on 2 days).
    const seen = new Set<string>();
    const filtered = (planDays.length > 0 ? planDays : [[]]).map((day) =>
      day.filter((id) => {
        if (!placeSet.has(id)) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      }),
    );

    // 2) Append missing items to the end of the LAST day.
    const missing = placeIds.filter((id) => !seen.has(id));
    const next = filtered.length > 0 ? filtered.slice() : [[]];
    if (next.length === 0) next.push([]);
    if (missing.length > 0) next[next.length - 1] = [...next[next.length - 1], ...missing];

    // 3) Ensure at least 1 day.
    if (next.length === 0) next.push([]);

    // Avoid setState if nothing changed (simple comparison).
    const same =
      next.length === planDays.length &&
      next.every((d, i) => d.length === planDays[i]?.length && d.every((x, j) => x === planDays[i]?.[j]));

    const nextModes = next.map((day) => day.map((id) => modeById[id] ?? (defaultTravelMode as TravelMode)));
    const sameModes =
      nextModes.length === planLegModes.length &&
      nextModes.every(
        (d, i) => d.length === (planLegModes[i]?.length ?? 0) && d.every((x, j) => x === planLegModes[i]?.[j]),
      );

    if (!same) setPlanDays(next);
    if (!sameModes) setPlanLegModes(nextModes);

    // Adjust dayWindows to match number of days (if it changes via add/delete).
    setPlanDayWindows((prev) => {
      const want = next.length;
      const base = prev.length ? prev.slice() : [];
      while (base.length < want) base.push({ start: dayStart, end: dayEnd });
      if (base.length > want) base.length = want;
      return base;
    });
  }, [places, planDays, planLegModes, dayStart, dayEnd, defaultTravelMode]);

  const flattenedPlanIds = useMemo(() => planDays.flat(), [planDays]);

  const activityIndexById = useMemo(() => {
    // Numbering ONLY for attractions ("place"), following the actual multi-day itinerary order.
    const m: Record<string, number> = {};
    let k = 0;
    for (const id of flattenedPlanIds) {
      if (m[id] != null) continue;
      const p = placeById[id];
      if (p?.kind !== "place") continue;
      k++;
      m[id] = k;
    }
    // fallback: if there's no plan yet
    if (k === 0) {
      for (const p of places) {
        if (p.kind !== "place") continue;
        if (m[p.id] != null) continue;
        k++;
        m[p.id] = k;
      }
    }
    return m;
  }, [flattenedPlanIds, places, placeById]);

  const airportIndexById = useMemo(() => {
    // Numbering ONLY for airports, following the actual plan order.
    const m: Record<string, number> = {};
    let k = 0;
    for (const id of flattenedPlanIds) {
      const p = placeById[id];
      if (p?.kind !== "airport") continue;
      if (m[id] != null) continue;
      k++;
      m[id] = k;
    }
    // fallback: if there's no plan yet
    if (k === 0) {
      for (const p of places) {
        if (p.kind !== "airport") continue;
        if (m[p.id] != null) continue;
        k++;
        m[p.id] = k;
      }
    }
    return m;
  }, [flattenedPlanIds, places, placeById]);

  const hotelIndexById = useMemo(() => {
    // Numbering ONLY for hotels, following the actual plan order.
    const m: Record<string, number> = {};
    let k = 0;
    for (const id of flattenedPlanIds) {
      const p = placeById[id];
      if (p?.kind !== "hotel") continue;
      if (m[id] != null) continue;
      k++;
      m[id] = k;
    }
    // fallback: if there's no plan yet
    if (k === 0) {
      for (const p of places) {
        if (p.kind !== "hotel") continue;
        if (m[p.id] != null) continue;
        k++;
        m[p.id] = k;
      }
    }
    return m;
  }, [flattenedPlanIds, places, placeById]);

  function parseTimeMin(t: string) {
    const [hRaw, mRaw] = String(t ?? "").split(":");
    const h = Number(hRaw);
    const m = Number(mRaw);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m));
  }

  function formatClockAbs(minAbs: number) {
    const x = Math.max(0, Math.round(minAbs));
    const hh24 = Math.floor(x / 60) % 24;
    const mm = x % 60;
    const ampm = hh24 >= 12 ? "PM" : "AM";
    const hh12 = ((hh24 + 11) % 12) + 1;
    return `${hh12}:${String(mm).padStart(2, "0")} ${ampm}`;
  }

  const etaByDayIdx = useMemo(() => {
    // ETA per stop: arrivalMinAbs (absolute minutes since 00:00). "overflow" if it exceeds the day's end.
    // If some leg durations are missing, ETA may be approximate (we assume 0 for unknown legs).
    const travelByLeg = new Map<string, number>();
    for (const s of routeSegments) {
      const key = `${s.dayIdx}:${s.legIdxInDay}`;
      if (Number.isFinite(s.durationMin as number)) travelByLeg.set(key, Number(s.durationMin));
    }

    return planDays.map((ids, dayIdx) => {
      const w = planDayWindows[dayIdx] ?? { start: dayStart, end: dayEnd };
      const startAbs = parseTimeMin(w.start || dayStart);
      const endAbs = parseTimeMin(w.end || dayEnd);
      const arr: Array<{ arriveAbs: number; departAbs: number; travelMin: number; overflow: boolean }> = [];
      let t = startAbs;
      for (let i = 0; i < (ids?.length ?? 0); i++) {
        const id = ids[i]!;
        const p = placeById[id];
        const visitMin = p && p.kind !== "hotel" ? Math.max(0, Number(p.durationMin ?? 0)) : 0;

        if (i === 0) {
          const arriveAbs = t;
          const departAbs = t + visitMin;
          arr.push({ arriveAbs, departAbs, travelMin: 0, overflow: departAbs > endAbs });
          t = departAbs;
          continue;
        }

        const legKey = `${dayIdx}:${i - 1}`; // legIdxInDay = fromIndex
        const travelMin = travelByLeg.get(legKey) ?? 0;
        const arriveAbs = t + travelMin;
        const departAbs = arriveAbs + visitMin;
        const overflow = arriveAbs > endAbs || departAbs > endAbs;
        arr.push({ arriveAbs, departAbs, travelMin, overflow });
        t = departAbs;
      }
      return { startAbs, endAbs, items: arr };
    });
  }, [routeSegments, planDays, planDayWindows, dayStart, dayEnd, placeById]);

  function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function safeIsoDateForFilename(d = new Date()) {
    // YYYY-MM-DD
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function isRecord(v: unknown): v is Record<string, unknown> {
    return Boolean(v) && typeof v === "object";
  }

  function exportJsonV2() {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      places,
      settings: {
        dayStart,
        dayEnd,
        defaultPlaceDurationMin,
        defaultAirportDurationMin,
        defaultTravelMode,
      },
      plan: {
        days: planDays,
        legModes: planLegModes,
        legModesSemantics: "to" as const,
        dayWindows: planDayWindows,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(`trip-planner-${safeIsoDateForFilename()}.json`, blob);
    if (exportMenuRef.current) exportMenuRef.current.open = false;
  }

  function csvEscape(v: unknown, sep: string) {
    if (v == null) return "";
    const s = String(v);
    const mustQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(sep);
    const escaped = s.replace(/"/g, '""');
    return mustQuote ? `"${escaped}"` : escaped;
  }

  function exportCsv() {
    const sep = ";";
    const header =
      language === "es"
        ? [
            "Día",
            "Orden_en_día",
            "Ventana_inicio",
            "Ventana_fin",
            "Tipo",
            "Nombre",
            "Llegada",
            "Salida",
            "Visita_min",
            "Viaje_min_desde_anterior",
            "Modo_viaje_desde_anterior",
            "Distancia_km_desde_anterior",
            "Prioridad",
            "Lat",
            "Lon",
            "Maps",
            "Notas",
            "Tiene_imagen",
          ]
        : [
            "Day",
            "Order_in_day",
            "Window_start",
            "Window_end",
            "Type",
            "Name",
            "Arrival",
            "Departure",
            "Visit_min",
            "Travel_min_from_prev",
            "Travel_mode_from_prev",
            "Distance_km_from_prev",
            "Priority",
            "Lat",
            "Lon",
            "Maps",
            "Notes",
            "Has_image",
          ];

    const segByKey = new Map<string, { durationMin?: number; distanceM?: number }>();
    for (const s of routeSegments) segByKey.set(`${s.dayIdx}:${s.legIdxInDay}`, { durationMin: s.durationMin, distanceM: s.distanceM });

    const rows: string[] = [];
    for (let dayIdx = 0; dayIdx < planDays.length; dayIdx++) {
      const ids = planDays[dayIdx] ?? [];
      const w = planDayWindows[dayIdx] ?? { start: dayStart, end: dayEnd };
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        const p = placeById[id];
        const eta = etaByDayIdx[dayIdx]?.items?.[i];
        const seg = i > 0 ? segByKey.get(`${dayIdx}:${i - 1}`) : undefined;

        const travelMin =
          i > 0 && Number.isFinite(seg?.durationMin as number) ? Math.round(Math.max(0, Number(seg?.durationMin))) : "";
        const distKm =
          i > 0 && Number.isFinite(seg?.distanceM as number) ? (Math.max(0, Number(seg?.distanceM)) / 1000).toFixed(2) : "";
        const mode = i > 0 ? ((planLegModes[dayIdx]?.[i] ?? defaultTravelMode) as TravelMode) : "";
        const lat = Number.isFinite(p?.lat as number) ? Number(p?.lat) : "";
        const lon = Number.isFinite(p?.lon as number) ? Number(p?.lon) : "";
        const maps = lat !== "" && lon !== "" ? `https://www.google.com/maps?q=${lat},${lon}` : "";
        const kind = p?.kind ?? "place";
        const visitMin = p && kind !== "hotel" ? Math.max(0, Math.round(Number(p.durationMin ?? 0))) : 0;

        rows.push(
          [
            dayIdx + 1,
            i + 1,
            w.start || dayStart,
            w.end || dayEnd,
            kind,
            p?.name ?? id,
            eta ? formatClockAbs(eta.arriveAbs) : "",
            eta ? formatClockAbs(eta.departAbs) : "",
            visitMin,
            travelMin,
            mode,
            distKm,
            p?.priority ?? "",
            lat,
            lon,
            maps,
            p?.description ?? "",
            p?.imageDataUrl ? t("common.yes") : t("common.no"),
          ]
            .map((x) => csvEscape(x, sep))
            .join(sep),
        );
      }
    }

    // Excel tip: "sep=;" helps Excel detect the delimiter in many locales.
    const csv = `sep=${sep}\n${header.join(sep)}\n${rows.join("\n")}\n`;
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(`trip-planner-${safeIsoDateForFilename()}.csv`, blob);
    if (exportMenuRef.current) exportMenuRef.current.open = false;
  }

  function normalizeImportedLegModes(input: {
    days: string[][];
    legModes?: TravelMode[][];
    legModesSemantics?: "from" | "to";
    defaultMode: TravelMode;
  }) {
    const { days, legModes, legModesSemantics, defaultMode } = input;
    const baseDays = days.length > 0 ? days : [[]];
    const fallback = baseDays.map((d) => (d ?? []).map(() => defaultMode));
    const raw = legModes?.length ? legModes : fallback;
    if (legModesSemantics === "to") return raw;
    // Migration "from" -> "to"
    return raw.map((d) => {
      if (!Array.isArray(d) || d.length === 0) return d;
      const out: TravelMode[] = new Array(d.length).fill(defaultMode);
      out[0] = defaultMode; // still ignored
      for (let i = 0; i < d.length - 1; i++) out[i + 1] = (d[i] ?? defaultMode) as TravelMode;
      return out;
    });
  }

  function normalizeImportedDayWindows(input: { daysCount: number; dayWindows?: Array<{ start: string; end: string }>; fallback: DayWindow }) {
    const { daysCount, dayWindows, fallback } = input;
    const base: DayWindow[] = [];
    if (Array.isArray(dayWindows) && dayWindows.length) {
      for (const w of dayWindows) {
        const wr: Record<string, unknown> = isRecord(w) ? w : {};
        base.push({
          start: typeof wr["start"] === "string" && wr["start"] ? String(wr["start"]) : fallback.start,
          end: typeof wr["end"] === "string" && wr["end"] ? String(wr["end"]) : fallback.end,
        });
      }
    }
    while (base.length < daysCount) base.push({ ...fallback });
    if (base.length > daysCount) base.length = daysCount;
    return base;
  }

  async function importJsonFile(file: File) {
    const text = await file.text();
    const parsed: unknown = JSON.parse(text);

    // v2
    if (isRecord(parsed) && parsed["version"] === 2) {
      const placesRaw = parsed["places"];
      const nextPlaces: Place[] = Array.isArray(placesRaw) ? (placesRaw as Place[]) : [];

      const settingsRaw = parsed["settings"];
      const nextSettings = isRecord(settingsRaw) ? settingsRaw : {};

      const planRaw = parsed["plan"];
      const nextPlan = isRecord(planRaw) ? planRaw : {};

      const nextDayStart = typeof nextSettings["dayStart"] === "string" ? String(nextSettings["dayStart"]) : dayStart;
      const nextDayEnd = typeof nextSettings["dayEnd"] === "string" ? String(nextSettings["dayEnd"]) : dayEnd;

      const rawPlaceDur = nextSettings["defaultPlaceDurationMin"];
      const nextDefaultPlaceDurationMin =
        typeof rawPlaceDur === "number" && Number.isFinite(rawPlaceDur)
          ? Math.max(0, Math.round(rawPlaceDur))
          : defaultPlaceDurationMin;

      const rawAirportDur = nextSettings["defaultAirportDurationMin"];
      const nextDefaultAirportDurationMin =
        typeof rawAirportDur === "number" && Number.isFinite(rawAirportDur)
          ? Math.max(0, Math.round(rawAirportDur))
          : defaultAirportDurationMin;

      const rawMode = nextSettings["defaultTravelMode"];
      const nextDefaultTravelMode =
        rawMode === "walking" || rawMode === "cycling" || rawMode === "transit" || rawMode === "driving"
          ? (rawMode as Exclude<TravelMode, "flight">)
          : defaultTravelMode;

      const parseString2D = (v: unknown): string[][] => {
        if (!Array.isArray(v)) return [[]];
        const out: string[][] = [];
        for (const d of v) {
          if (!Array.isArray(d)) continue;
          out.push(d.filter((x): x is string => typeof x === "string"));
        }
        return out.length ? out : [[]];
      };

      const isTravelMode = (x: unknown): x is TravelMode =>
        x === "walking" || x === "cycling" || x === "transit" || x === "flight" || x === "driving";

      const parseModes2D = (v: unknown): TravelMode[][] | undefined => {
        if (!Array.isArray(v)) return undefined;
        const out: TravelMode[][] = [];
        for (const d of v) {
          if (!Array.isArray(d)) continue;
          out.push(d.map((x) => (isTravelMode(x) ? x : "driving")));
        }
        return out.length ? out : undefined;
      };

      const parseDayWindows = (v: unknown): Array<{ start: string; end: string }> | undefined => {
        if (!Array.isArray(v)) return undefined;
        const out: Array<{ start: string; end: string }> = [];
        for (const x of v) {
          if (!isRecord(x)) continue;
          out.push({
            start: typeof x["start"] === "string" ? String(x["start"]) : "",
            end: typeof x["end"] === "string" ? String(x["end"]) : "",
          });
        }
        return out.length ? out : undefined;
      };

      const nextDays = parseString2D(nextPlan["days"]);
      const nextLegModes = parseModes2D(nextPlan["legModes"]);
      const semRaw = nextPlan["legModesSemantics"];
      const nextLegModesSemantics: "from" | "to" | undefined = semRaw === "from" || semRaw === "to" ? semRaw : undefined;
      const nextDayWindowsRaw = parseDayWindows(nextPlan["dayWindows"]);

      setDayStart(nextDayStart);
      setDayEnd(nextDayEnd);
      setDefaultPlaceDurationMin(nextDefaultPlaceDurationMin);
      setDefaultAirportDurationMin(nextDefaultAirportDurationMin);
      setDefaultTravelMode(nextDefaultTravelMode);

      setPlaces(nextPlaces);
      setPlanDays(nextDays.length > 0 ? nextDays : [[]]);
      setPlanLegModes(
        normalizeImportedLegModes({
          days: nextDays,
          legModes: nextLegModes,
          legModesSemantics: nextLegModesSemantics,
          defaultMode: nextDefaultTravelMode as TravelMode,
        }),
      );
      setPlanDayWindows(
        normalizeImportedDayWindows({
          daysCount: Math.max(1, nextDays.length),
          dayWindows: nextDayWindowsRaw,
          fallback: { start: nextDayStart, end: nextDayEnd },
        }),
      );

      // Reset UI state that depends on the previous plan.
      setExpanded({});
      setPickOnMap(false);
      setAddUI(null);
      setDragging(null);
      setDragOver(null);
      setSelectedPlaceId(null);
      setRouteSegments([]);
      setMapCenter(undefined);
      setLegInfo(null);
      setMapView({ mode: "por_dias" });
      setFocusDay(1);
      setFocusStopIdx(0);
      setSettingsOpen(false);
      pushToast(t("toasts.importedJson"));
      return;
    }

    // v1 legacy: { places, planDays }
    if (isRecord(parsed) && (Array.isArray(parsed["places"]) || Array.isArray(parsed["planDays"]))) {
      const nextPlaces: Place[] = Array.isArray(parsed["places"]) ? (parsed["places"] as Place[]) : [];
      const nextDays: string[][] = Array.isArray(parsed["planDays"]) ? (parsed["planDays"] as string[][]) : [[]];
      setPlaces(nextPlaces);
      setPlanDays(nextDays.length > 0 ? nextDays : [[]]);
      setPlanLegModes(nextDays.map((d) => (d ?? []).map(() => (defaultTravelMode as TravelMode))));
      setPlanDayWindows(nextDays.map(() => ({ start: dayStart, end: dayEnd })));
      setExpanded({});
      setRouteSegments([]);
      setLegInfo(null);
      pushToast(t("toasts.importedJsonLegacy"));
      return;
    }

    throw new Error("Unrecognized JSON format");
  }

  const safeDayCount = Math.max(1, planDays.length);
  useEffect(() => {
    setFocusDay((d) => Math.max(1, Math.min(safeDayCount, d)));
  }, [safeDayCount]);

  // If the user is using a per-day view mode, keep the bottom control in sync with that day.
  useEffect(() => {
    if (mapView.mode === "enfocar_dia" || mapView.mode === "solo_dia") {
      setFocusDay(Math.max(1, Math.min(safeDayCount, mapView.day)));
    }
  }, [mapView, safeDayCount]);

  // If the day changes or its contents change, keep the activity index always valid.
  useEffect(() => {
    const ids = planDays[Math.max(0, Math.min(planDays.length - 1, focusDay - 1))] ?? [];
    const total = ids.length;
    setFocusStopIdx((i) => (total === 0 ? 0 : Math.max(0, Math.min(total - 1, i))));
  }, [planDays, focusDay]);

  const dayIndexById = useMemo(() => {
    const m: Record<string, number> = {};
    for (let d = 0; d < planDays.length; d++) {
      for (const id of planDays[d] ?? []) {
        if (m[id] == null) m[id] = d;
      }
    }
    return m;
  }, [planDays]);

  const DAY_PALETTE = ["#2563eb", "#16a34a", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

  function segmentColor(idx: number) {
    // "Distinct" colors per leg: spread the hue around the color wheel.
    const h = ((idx * 47) % 360 + 360) % 360;
    return `hsl(${h} 85% 50%)`;
  }

  function formatDurationCompact(p: Place) {
    if (p.kind === "hotel") return "—";
    const mins = Math.max(0, Math.round(Number(p.durationMin ?? 0)));
    if (!Number.isFinite(mins)) return "—";
    if (mins > 999) return "999+ min";
    return `${mins} min`;
  }

  function fmtDistance(m: number) {
    const x = Number(m);
    if (!Number.isFinite(x)) return "";
    if (x < 1000) return `${Math.round(x)} m`;
    return `${(x / 1000).toFixed(x / 1000 >= 10 ? 0 : 1)} km`;
  }

  function fmtDurationSec(s: number) {
    const x = Number(s);
    if (!Number.isFinite(x)) return "";
    const min = Math.round(x / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h} h ${m} min`;
  }

  function maneuverText(type?: string, modifier?: string) {
    const mt = String(type ?? "");
    const mod = String(modifier ?? "");

    const modMap: Record<string, string> =
      language === "es"
        ? {
            left: "a la izquierda",
            right: "a la derecha",
            "slight left": "ligeramente a la izquierda",
            "slight right": "ligeramente a la derecha",
            straight: "recto",
            uturn: "en U",
            "sharp left": "fuerte a la izquierda",
            "sharp right": "fuerte a la derecha",
          }
        : {
            left: "left",
            right: "right",
            "slight left": "slightly left",
            "slight right": "slightly right",
            straight: "straight",
            uturn: "U-turn",
            "sharp left": "sharp left",
            "sharp right": "sharp right",
          };

    const m = modMap[mod] ? ` ${modMap[mod]}` : "";
    if (mt === "depart") return t("routing.maneuvers.depart");
    if (mt === "arrive") return t("routing.maneuvers.arrive");
    if (mt === "turn") return `${t("routing.maneuvers.turn")}${m}`;
    if (mt === "continue") return `${t("routing.maneuvers.continue")}${m}`;
    if (mt === "roundabout") return t("routing.maneuvers.roundabout");
    if (mt === "exit roundabout") return t("routing.maneuvers.exitRoundabout");
    if (mt === "merge") return t("routing.maneuvers.merge");
    if (mt === "fork") return t("routing.maneuvers.fork");
    if (mt === "end of road") return t("routing.maneuvers.endOfRoad");
    if (mt === "new name") return t("routing.maneuvers.newName");
    return mt ? mt : t("routing.maneuvers.step");
  }

  function modeLabel(mode: TravelMode) {
    if (mode === "walking") return t("travelMode.walking");
    if (mode === "cycling") return t("travelMode.cycling");
    if (mode === "transit") return t("travelMode.transitSimulated");
    if (mode === "flight") return t("travelMode.flightEstimated");
    return t("travelMode.driving");
  }

  function haversineDistanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
    const R = 6371e3; // meters
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const s1 = Math.sin(dLat / 2);
    const s2 = Math.sin(dLon / 2);
    const x = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c;
  }

  function estimateFlightDurationMin(distanceM: number) {
    // Simple "flight-like" estimate: cruising speed + fixed overhead (taxi/boarding).
    const speedKmh = 750;
    const overheadMin = 25;
    const distanceKm = Math.max(0, distanceM) / 1000;
    const cruiseMin = (distanceKm / speedKmh) * 60;
    return Math.max(10, Math.round(cruiseMin + overheadMin));
  }

  function kindLabel(kind: PlaceKind) {
    if (kind === "hotel") return t("place.hotel");
    if (kind === "airport") return t("place.airport");
    return t("place.attraction");
  }

  async function openLegInfo(dayIdx: number, idx: number) {
    if (idx <= 0) return;
    const ids = planDays[dayIdx] ?? [];
    const fromId = ids[idx - 1];
    const toId = ids[idx];
    const a = fromId ? placeById[fromId] : undefined;
    const b = toId ? placeById[toId] : undefined;
    if (!a || !b) return;
    const mode = (planLegModes[dayIdx]?.[idx] as TravelMode | undefined) ?? "driving";

    // Special case: airport → airport in flight mode (visual). No OSRM road instructions.
    if (a.kind === "airport" && b.kind === "airport" && mode === "flight") {
      const distM = haversineDistanceM({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon });
      const durMin = estimateFlightDurationMin(distM);
      setLegInfo({
        open: true,
        title: `${a.name} → ${b.name}`,
        subtitle: `${t("planner.goBy")} ${modeLabel(mode)}`,
        mode,
        loading: false,
        lines: [
          t("routing.flightLegHint"),
          t("routing.estimatedDuration", { min: Math.round(durMin) }),
        ],
      });
      return;
    }

    setLegInfo({
      open: true,
      title: `${a.name} → ${b.name}`,
      subtitle: `${t("planner.goBy")} ${modeLabel(mode)}`,
      mode,
      loading: true,
      lines: [],
    });

    try {
      const r = await fetchOsrmRouteWithSteps(
        [
          { lat: a.lat, lon: a.lon },
          { lat: b.lat, lon: b.lon },
        ],
        mode === "flight" ? "driving" : mode,
      );
      const steps = (() => {
        const legs = r?.legs;
        if (!Array.isArray(legs) || legs.length === 0) return [];
        const firstLeg = legs[0];
        if (!isRecord(firstLeg)) return [];
        const s = firstLeg["steps"];
        return Array.isArray(s) ? s : [];
      })();
      const lines: string[] = [];
      if (Array.isArray(steps)) {
        for (let i = 0; i < steps.length; i++) {
          const sRaw = steps[i];
          const s = isRecord(sRaw) ? sRaw : {};
          const name =
            typeof s["name"] === "string" && String(s["name"]).trim()
              ? language === "es"
                ? ` por ${String(s["name"])}`
                : ` via ${String(s["name"])}`
              : "";
          const dist = fmtDistance(Number(s["distance"] ?? 0));
          const dur = fmtDurationSec(Number(s["duration"] ?? 0));
          const maneuver = isRecord(s["maneuver"]) ? s["maneuver"] : undefined;
          const mType = isRecord(maneuver) && typeof maneuver["type"] === "string" ? String(maneuver["type"]) : undefined;
          const mMod =
            isRecord(maneuver) && typeof maneuver["modifier"] === "string" ? String(maneuver["modifier"]) : undefined;
          const extra = [dist, dur].filter(Boolean).join(" · ");
          lines.push(`${i + 1}. ${maneuverText(mType, mMod)}${name}${extra ? ` (${extra})` : ""}`);
        }
      }
      if (lines.length === 0) lines.push(t("routing.noDetailedInstructions"));
      setLegInfo((prev) =>
        prev?.open
          ? { ...prev, loading: false, lines }
          : prev,
      );
    } catch {
      setLegInfo((prev) =>
        prev?.open
          ? { ...prev, loading: false, error: t("routing.noRouteInfo"), lines: [] }
          : prev,
      );
    }
  }

  function setLegMode(dayIdx: number, idx: number, mode: TravelMode) {
    setPlanLegModes((prev) => {
      const next = prev.map((d) => d.slice());
      while (next.length <= dayIdx) next.push([]);
      const arr = next[dayIdx] ?? [];
      // ensure minimum length so we can set idx
      while (arr.length <= idx) arr.push(defaultTravelMode as TravelMode);
      arr[idx] = mode;
      next[dayIdx] = arr;
      return next;
    });
  }

  async function optimizeDayRoute(dayIdx: number) {
    const ids = planDays[dayIdx] ?? [];
    if (ids.length < 3) {
      pushToast(t("toasts.optimizeNeedAtLeast3"));
      return;
    }
    if (optimizingDayIdx != null) return;

    const startId = ids[0]!;
    const endId = ids[ids.length - 1]!;
    const nodes = [startId, ...ids.slice(1, -1), endId];

    const oldModes = planLegModes[dayIdx] ?? ids.map(() => defaultTravelMode as TravelMode);
    const modeToById: Record<string, TravelMode> = {};
    for (let i = 0; i < ids.length; i++) modeToById[ids[i]!] = (oldModes[i] ?? (defaultTravelMode as TravelMode)) as TravelMode;

    // Unbreakable blocks: airport->airport with ✈ mode (keep them contiguous).
    const blocks: Array<{ ids: string[]; firstIdx: number; lastIdx: number }> = [];
    for (let i = 0; i < nodes.length; i++) {
      const id = nodes[i]!;
      const p = placeById[id];
      const prevId = i > 0 ? nodes[i - 1] : null;
      const prev = prevId ? placeById[prevId] : undefined;
      const modeToThis = modeToById[id] ?? (defaultTravelMode as TravelMode);
      const shouldChain =
        i > 0 &&
        p?.kind === "airport" &&
        prev?.kind === "airport" &&
        modeToThis === "flight" &&
        blocks.length > 0;
      if (shouldChain) {
        blocks[blocks.length - 1]!.ids.push(id);
        blocks[blocks.length - 1]!.lastIdx = i;
      } else {
        blocks.push({ ids: [id], firstIdx: i, lastIdx: i });
      }
    }

    const stops = nodes
      .map((id) => placeById[id])
      .filter((p): p is Place => Boolean(p))
      .map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }));

    if (stops.length !== nodes.length) {
      pushToast(t("toasts.optimizeFailed"));
      return;
    }
    if (stops.some((s) => !Number.isFinite(s.lat) || !Number.isFinite(s.lon))) {
      pushToast(t("toasts.optimizeFailed"));
      return;
    }

    try {
      setOptimizingDayIdx(dayIdx);
      const durationsSec = await fetchOsrmTableDurations(
        stops.map((s) => ({ lat: s.lat, lon: s.lon })),
        defaultTravelMode,
      );
      if (!durationsSec || durationsSec.length !== nodes.length) {
        pushToast(t("toasts.optimizeFailed"));
        return;
      }

      const matrix = durationsSec.map((row) =>
        (row ?? []).map((sec) => (Number.isFinite(sec as number) ? Math.max(0, Number(sec)) / 60 : 1e9)),
      );

      // Block matrix (cost: last(A) -> first(B)).
      const matrixBlocks = blocks.map((a) => blocks.map((b) => (matrix[a.lastIdx]?.[b.firstIdx] ?? 1e9)));

      // Initial order: greedy over intermediates, keeping first and last fixed.
      const n = blocks.length;
      const remaining = new Set<number>();
      for (let i = 1; i <= n - 2; i++) remaining.add(i);
      const order: number[] = [0];
      let cur = 0;
      while (remaining.size > 0) {
        let best = -1;
        let bestCost = Infinity;
        for (const j of remaining) {
          const c = matrixBlocks[cur]?.[j] ?? 1e9;
          if (c < bestCost) {
            bestCost = c;
            best = j;
          }
        }
        if (best === -1) break;
        order.push(best);
        remaining.delete(best);
        cur = best;
      }
      for (const j of remaining) order.push(j);
      order.push(n - 1);

      const improved = twoOptImprove(matrixBlocks, order);
      const optimizedIds = improved.flatMap((i) => blocks[i]!.ids);
      const same =
        optimizedIds.length === ids.length &&
        optimizedIds.every((x, i) => x === ids[i]);
      if (same) {
        pushToast(t("toasts.optimizeNoChanges"));
        return;
      }

      // Reapply saved modes ("to" semantics): the mode stays attached to the destination.
      const nextModes = optimizedIds.map((id, i) =>
        i === 0 ? ((oldModes[0] ?? defaultTravelMode) as TravelMode) : ((modeToById[id] ?? defaultTravelMode) as TravelMode),
      );

      setPlanDays((prev) => prev.map((d, i) => (i === dayIdx ? optimizedIds : d)));
      setPlanLegModes((prev) => prev.map((d, i) => (i === dayIdx ? nextModes : d)));
      pushToast(t("toasts.dayOptimized", { day: dayIdx + 1 }));
    } catch {
      pushToast(t("toasts.optimizeFailed"));
    } finally {
      setOptimizingDayIdx((prev) => (prev === dayIdx ? null : prev));
    }
  }

  useEffect(() => {
    // Whenever places change (add/remove or duration edit), recompute routes (debounced to avoid spamming).
    const daysStops: Array<Array<{ id: string; lat: number; lon: number; kind: PlaceKind }>> = planDays.map((ids) =>
      (ids ?? [])
        .map((id) => placeById[id])
        .filter((p): p is Place => Boolean(p))
        .map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, kind: p.kind })),
    );

    const totalLegs = daysStops.reduce((acc, d) => acc + Math.max(0, d.length - 1), 0);
    if (totalLegs <= 0) {
      setRouteSegments([]);
      return;
    }

    const handle = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const segments: Array<{
          coords: Array<{ lat: number; lon: number }>;
          color: string; // per-day color (for multi-day views)
          dayIdx: number;
          legIdxInDay: number;
          durationMin?: number;
          distanceM?: number;
        }> = [];

        for (let dayIdx = 0; dayIdx < daysStops.length; dayIdx++) {
          const stops = daysStops[dayIdx] ?? [];
          if (stops.length < 2) continue;

          const dayColor = DAY_PALETTE[dayIdx % DAY_PALETTE.length];
          for (let legIdxInDay = 0; legIdxInDay < stops.length - 1; legIdxInDay++) {
            const a = stops[legIdxInDay]!;
            const b = stops[legIdxInDay + 1]!;
            // Mode for the leg into the destination (b), stored at index (legIdxInDay + 1)
            const mode = (planLegModes[dayIdx]?.[legIdxInDay + 1] as TravelMode | undefined) ?? "driving";
            // Special case: airport → airport ONLY if flight mode was selected.
            if (a.kind === "airport" && b.kind === "airport" && mode === "flight") {
              const distM = haversineDistanceM({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon });
              segments.push({
                color: dayColor,
                dayIdx,
                legIdxInDay,
                distanceM: distM,
                durationMin: estimateFlightDurationMin(distM),
                coords: [
                  { lat: a.lat, lon: a.lon },
                  { lat: b.lat, lon: b.lon },
                ],
              });
              continue;
            }
            const leg = await fetchOsrmRoute(
              [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }],
              mode === "flight" ? "driving" : mode,
              ac.signal,
            );
            const coords = leg?.geometry.coordinates ?? [];
            segments.push({
              color: dayColor,
              dayIdx,
              legIdxInDay,
              durationMin: Number.isFinite(leg?.durationSec as number) ? Number(leg!.durationSec) / 60 : undefined,
              distanceM: Number.isFinite(leg?.distanceM as number) ? Number(leg!.distanceM) : undefined,
              coords: coords.map(([lon, lat]) => ({ lat, lon })),
            });
          }
        }

        setRouteSegments(segments);
      } catch {
        // ignore (abort or request failure)
      }
    }, 350);

    return () => window.clearTimeout(handle);
  }, [planDays, planLegModes, placeById]);

  function moveInPlan(input: {
    placeId: string;
    fromDay: number;
    fromIdx: number;
    toDay: number;
    toIdx: number; // insert BEFORE this index (0..len). if len => append
  }) {
    const { placeId, fromDay, fromIdx, toDay, toIdx } = input;
    setPlanDays((prev) => {
      const next = prev.map((d) => d.slice());
      if (!next[fromDay] || !next[toDay]) return prev;
      const removed = next[fromDay].splice(fromIdx, 1)[0];
      if (removed !== placeId) {
        // Something changed (stale state): don't do anything weird.
        return prev;
      }
      let insertIdx = Math.max(0, Math.min(toIdx, next[toDay].length));
      if (fromDay === toDay && fromIdx < insertIdx) insertIdx -= 1;
      next[toDay].splice(insertIdx, 0, placeId);
      return next;
    });

    // Keep the "outgoing" mode associated with the moved element.
    setPlanLegModes((prev) => {
      const next = prev.map((d) => d.slice());
      if (!next[fromDay] || !next[toDay]) return prev;
      const movedMode = (next[fromDay][fromIdx] as TravelMode | undefined) ?? (defaultTravelMode as TravelMode);
      next[fromDay].splice(fromIdx, 1);
      let insertIdx = Math.max(0, Math.min(toIdx, next[toDay].length));
      if (fromDay === toDay && fromIdx < insertIdx) insertIdx -= 1;
      next[toDay].splice(insertIdx, 0, movedMode);
      return next;
    });
  }

  const mapMenuLabel = useMemo(() => {
    if (mapView.mode === "por_dias") return t("mapView.byDays");
    if (mapView.mode === "enfocar_dia") return t("mapView.focusDay", { day: mapView.day });
    return t("mapView.onlyDay", { day: mapView.day });
  }, [mapView, t]);

  const focusedStops = useMemo(() => {
    const dayIdx = Math.max(0, Math.min(planDays.length - 1, focusDay - 1));
    const ids = planDays[dayIdx] ?? [];
    const stops: Array<{ place: Place }> = [];
    for (const id of ids) {
      const p = placeById[id];
      if (!p) continue;
      stops.push({ place: p });
    }
    return stops;
  }, [planDays, focusDay, placeById]);

  const focusedStop = useMemo(() => {
    return focusedStops[focusStopIdx];
  }, [focusedStops, focusStopIdx]);

  function focusDayAndMaybeCenter(day: number, nextIdx?: number) {
    const safeDay = Math.max(1, Math.min(safeDayCount, day));
    const ids = planDays[safeDay - 1] ?? [];
    const total = ids.length;
    const idx = total === 0 ? 0 : Math.max(0, Math.min(total - 1, nextIdx ?? 0));
    setFocusDay(safeDay);
    setFocusStopIdx(idx);
    setMapView({ mode: "enfocar_dia", day: safeDay });
    const id = ids[Math.max(0, Math.min(ids.length - 1, idx))];
    const p = id ? placeById[id] : undefined;
    if (p) {
      setMapCenter({ lat: p.lat, lon: p.lon });
      setSelectedPlaceId(p.id);
    }
  }

  function focusNextActivity() {
    const stops = focusedStops;
    if (stops.length === 0) {
      // find the next day with something
      for (let d = focusDay; d < safeDayCount; d++) {
        if ((planDays[d] ?? []).length > 0) return focusDayAndMaybeCenter(d + 1, 0);
      }
      return;
    }
    const next = focusStopIdx + 1;
    if (next < stops.length) return focusDayAndMaybeCenter(focusDay, next);
    // jump to the next day with something
    for (let d = focusDay; d < safeDayCount; d++) {
      if ((planDays[d] ?? []).length > 0) return focusDayAndMaybeCenter(d + 1, 0);
    }
  }

  function focusPrevActivity() {
    const stops = focusedStops;
    if (stops.length === 0) {
      // find the previous day with something
      for (let d = focusDay - 2; d >= 0; d--) {
        const arr = planDays[d] ?? [];
        if (arr.length > 0) return focusDayAndMaybeCenter(d + 1, arr.length - 1);
      }
      return;
    }
    const prev = focusStopIdx - 1;
    if (prev >= 0) return focusDayAndMaybeCenter(focusDay, prev);
    // jump to the previous day with something
    for (let d = focusDay - 2; d >= 0; d--) {
      const arr = planDays[d] ?? [];
      if (arr.length > 0) return focusDayAndMaybeCenter(d + 1, arr.length - 1);
    }
  }

  const effectiveRouteSegments = useMemo(() => {
    const focusDayIdx =
      mapView.mode === "enfocar_dia" || mapView.mode === "solo_dia"
        ? Math.max(0, Math.min(planDays.length - 1, mapView.day - 1))
        : 0;

    if (mapView.mode === "por_dias") {
      return routeSegments.map((s) => ({ coords: s.coords, color: s.color, opacity: 0.9 }));
    }

    if (mapView.mode === "solo_dia") {
      return routeSegments
        .filter((s) => s.dayIdx === focusDayIdx)
        .map((s) => ({ coords: s.coords, color: segmentColor(s.legIdxInDay), opacity: 0.9 }));
    }

    // enfocar_dia
    return routeSegments.map((s) => ({
      coords: s.coords,
      color: s.dayIdx === focusDayIdx ? segmentColor(s.legIdxInDay) : s.color,
      opacity: s.dayIdx === focusDayIdx ? 0.95 : 0.25,
    }));
  }, [routeSegments, mapView, planDays.length]);

  const mapMarkers = useMemo<MapMarker[]>(() => {
    const focusDayIdx =
      mapView.mode === "enfocar_dia" || mapView.mode === "solo_dia"
        ? Math.max(0, Math.min(planDays.length - 1, mapView.day - 1))
        : 0;

    return places.map((p) => {
      const isHotel = p.kind === "hotel";
      const dayIdx = dayIndexById[p.id];

      let opacity = 1;
      if (mapView.mode === "enfocar_dia") opacity = dayIdx === focusDayIdx ? 1 : 0.25;
      if (mapView.mode === "solo_dia") opacity = dayIdx === focusDayIdx ? 1 : 0;

      const details: Array<{ k: string; v: string }> = [];
      if (!isHotel) {
        details.push({
          k: t("editor.duration"),
          v:
            (p.durationUnit ?? "min") === "h"
              ? `${(p.durationMin / 60).toFixed((p.durationMin / 60) % 1 === 0 ? 0 : 2)} h`
              : `${Math.max(0, Math.round(p.durationMin))} min`,
        });
      }

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        lat: p.lat,
        lon: p.lon,
        kind: (p.kind === "hotel" ? "hotel" : p.kind === "airport" ? "airport" : "place") as "hotel" | "place" | "airport",
        label:
          p.kind === "airport"
            ? airportIndexById[p.id] != null
              ? String(airportIndexById[p.id])
              : undefined
            : p.kind !== "hotel" && activityIndexById[p.id] != null
              ? String(activityIndexById[p.id])
              : undefined,
        opacity,
        imageDataUrl: p.imageDataUrl,
        details,
      };
    });
  }, [places, mapView, planDays.length, dayIndexById, activityIndexById, airportIndexById, t]);

  function openAdd(kind: PlaceKind) {
    setNewKind(kind);
    setAddUI({ mode: "search", kind });
    setPickOnMap(false);
  }

  function closeAdd() {
    setAddUI(null);
    setPickOnMap(false);
  }

  function appendToLastDay(placeId: string) {
    setPlanDays((prev) => {
      const next = prev.length > 0 ? prev.map((d) => d.slice()) : [[]];
      if (next.length === 0) next.push([]);
      next[next.length - 1].push(placeId);
      return next;
    });
    setPlanLegModes((prev) => {
      const next = prev.length > 0 ? prev.map((d) => d.slice()) : [[]];
      if (next.length === 0) next.push([]);
      next[next.length - 1].push(defaultTravelMode as TravelMode);
      return next;
    });
  }

  function uniqueMapPointName(existing: Place[]) {
    const adjectives =
      language === "es"
        ? [
            "Ágil",
            "Claro",
            "Valiente",
            "Suave",
            "Fresco",
            "Quieto",
            "Rápido",
            "Leal",
            "Nítido",
            "Vivo",
            "Sólido",
            "Dulce",
            "Alto",
            "Bajo",
            "Azul",
            "Rojo",
            "Verde",
            "Dorado",
            "Gris",
            "Negro",
            "Blanco",
            "Cálido",
            "Frío",
            "Sutil",
            "Firme",
            "Luz",
            "Nube",
            "Faro",
            "Lento",
            "Sereno",
          ]
        : [
            "Agile",
            "Clear",
            "Brave",
            "Smooth",
            "Fresh",
            "Quiet",
            "Fast",
            "Loyal",
            "Crisp",
            "Lively",
            "Solid",
            "Sweet",
            "High",
            "Low",
            "Blue",
            "Red",
            "Green",
            "Golden",
            "Gray",
            "Black",
            "White",
            "Warm",
            "Cold",
            "Subtle",
            "Steady",
            "Light",
            "Cloud",
            "Lighthouse",
            "Slow",
            "Serene",
          ];

    const nouns =
      language === "es"
        ? [
            "Lobo",
            "Zorro",
            "Águila",
            "Tigre",
            "Oso",
            "Gato",
            "Perro",
            "Búho",
            "Río",
            "Mar",
            "Luna",
            "Sol",
            "Viento",
            "Bosque",
            "Monte",
            "Fuego",
            "Hielo",
            "Roca",
            "Pino",
            "Cedro",
            "Trébol",
            "Nébula",
            "Cometa",
            "Estrella",
            "Puente",
            "Puerto",
            "Jardín",
            "Camino",
            "Norte",
            "Sur",
          ]
        : [
            "Wolf",
            "Fox",
            "Eagle",
            "Tiger",
            "Bear",
            "Cat",
            "Dog",
            "Owl",
            "River",
            "Sea",
            "Moon",
            "Sun",
            "Wind",
            "Forest",
            "Mountain",
            "Fire",
            "Ice",
            "Rock",
            "Pine",
            "Cedar",
            "Clover",
            "Nebula",
            "Comet",
            "Star",
            "Bridge",
            "Harbor",
            "Garden",
            "Path",
            "North",
            "South",
          ];

    const used = new Set(existing.map((p) => p.name.trim().toLowerCase()).filter(Boolean));
    const tries = 60;
    for (let i = 0; i < tries; i++) {
      const a = adjectives[Math.floor(Math.random() * adjectives.length)] ?? (language === "es" ? "Punto" : "Point");
      const b = nouns[Math.floor(Math.random() * nouns.length)] ?? (language === "es" ? "Nuevo" : "New");
      const name = `${a} ${b}`.trim();
      if (!used.has(name.toLowerCase())) return name;
    }

    // fallback 2 palabras
    let k = 1;
    const base = language === "es" ? "punto" : "point";
    while (used.has(`${base} ${k}`)) k++;
    return `${language === "es" ? "Punto" : "Point"} ${k}`;
  }

  function setPlaceName(placeId: string, name: string) {
    const next = name.trim();
    if (!next) return;
    setPlaces((prev) => prev.map((p) => (p.id === placeId ? { ...p, name: next } : p)));
  }

  function setPlaceDescription(placeId: string, description: string) {
    setPlaces((prev) => prev.map((p) => (p.id === placeId ? { ...p, description } : p)));
  }

  async function fileToResizedDataUrl(file: File, maxW = 900, maxH = 900, quality = 0.82): Promise<string> {
    const blobUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = blobUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image load failed"));
      });

      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxW / Math.max(1, w), maxH / Math.max(1, h));
      const outW = Math.max(1, Math.round(w * scale));
      const outH = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas ctx");
      ctx.drawImage(img, 0, 0, outW, outH);

      return canvas.toDataURL("image/jpeg", quality);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  async function setPlaceImage(placeId: string, file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setPlaces((prev) => prev.map((p) => (p.id === placeId ? { ...p, imageDataUrl: dataUrl } : p)));
      pushToast(t("toasts.imageUpdated"));
    } catch {
      pushToast(t("toasts.imageUploadFailed"));
    }
  }

  function removePlaceImage(placeId: string) {
    setPlaces((prev) => prev.map((p) => (p.id === placeId ? { ...p, imageDataUrl: undefined } : p)));
    pushToast(t("toasts.imageRemoved"));
  }

  function pushToast(message: string) {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }

  function clearDataAndReset() {
    const ok = window.confirm(t("settings.clearDataConfirm"));
    if (!ok) return;

    clearAllData();

    const s = loadSettings();
    setDayStart(s.dayStart);
    setDayEnd(s.dayEnd);
    setDefaultPlaceDurationMin(s.defaultPlaceDurationMin ?? 60);
    setDefaultAirportDurationMin(s.defaultAirportDurationMin ?? 60);
    setDefaultTravelMode((s.defaultTravelMode ?? "driving") as Exclude<TravelMode, "flight">);
    setLanguage((s.language ?? "es") as Language);

    setPlaces(loadPlaces());
    const plan = loadPlan();
    setPlanDays(plan.days);
    const fallback = (plan.days.length > 0 ? plan.days : [[]]).map((d) => d.map(() => (s.defaultTravelMode ?? "driving") as TravelMode));
    const raw = plan.legModes?.length ? (plan.legModes as TravelMode[][]) : fallback;
    setPlanLegModes(raw);
    setPlanDayWindows((plan.days.length > 0 ? plan.days : [[]]).map(() => ({ start: s.dayStart, end: s.dayEnd })));

    setExpanded({});
    setPickOnMap(false);
    setAddUI(null);
    setDragging(null);
    setDragOver(null);
    setSelectedPlaceId(null);
    setRouteSegments([]);
    setMapCenter(undefined);
    setLegInfo(null);
    setMapView({ mode: "por_dias" });
    setFocusDay(1);
    setFocusStopIdx(0);
    setSettingsOpen(false);
    pushToast(t("toasts.dataCleared"));
  }

  function deleteDay(dayIdx: number) {
    const ids = planDays[dayIdx] ?? [];
    const dayNum = dayIdx + 1;
    if (ids.length > 0) {
      const ok = window.confirm(t("planner.confirmDeleteDay", { count: ids.length, day: dayNum }));
      if (!ok) return;
    }

    const toDelete = new Set(ids);
    setPlanDays((prev) => {
      if (prev.length <= 1) return [[]];
      return prev.filter((_, i) => i !== dayIdx);
    });
    setPlanLegModes((prev) => {
      if (prev.length <= 1) return [[]];
      return prev.filter((_, i) => i !== dayIdx);
    });
    setPlanDayWindows((prev) => {
      if (prev.length <= 1) return [{ start: dayStart, end: dayEnd }];
      return prev.filter((_, i) => i !== dayIdx);
    });
    if (toDelete.size > 0) {
      setPlaces((prev) => prev.filter((p) => !toDelete.has(p.id)));
      setExpanded((prev) => {
        const next = { ...prev };
        for (const id of toDelete) delete next[id];
        return next;
      });
    }
    pushToast(t("toasts.dayDeleted", { day: dayNum }));
  }

  function deletePlace(placeId: string) {
    const p = placeById[placeId];
    const name = p?.name ?? t("planner.unnamedItem");
    const ok = window.confirm(t("planner.confirmRemovePlace", { name }));
    if (!ok) return;

    // Remove from the plan immediately (there's also an effect that cleans up missing IDs).
    setPlanDays((prev) => prev.map((d) => (d ?? []).filter((id) => id !== placeId)));
    setPlaces((prev) => prev.filter((x) => x.id !== placeId));
    setExpanded((prev) => {
      const next = { ...prev };
      delete next[placeId];
      return next;
    });
    setSelectedPlaceId((prev) => (prev === placeId ? null : prev));
    pushToast(t("toasts.deletedWithName", { name }));
  }

  function setDayWindow(dayIdx: number, patch: Partial<DayWindow>) {
    setPlanDayWindows((prev) => {
      const next = prev.length ? prev.map((x) => ({ ...x })) : [];
      while (next.length <= dayIdx) next.push({ start: dayStart, end: dayEnd });
      next[dayIdx] = { ...next[dayIdx], ...patch };
      return next;
    });
  }

  return (
    <div className="h-dvh bg-neutral-50 text-neutral-900">
      <main className="h-full min-h-0 grid grid-cols-1 md:grid-cols-[360px_1fr] gap-3 p-3">
        <aside className="min-h-0 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm flex flex-col relative">
          <div className="mt-1 shrink-0">
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-neutral-600">{t("common.add")}</div>
                <div className="relative flex items-center gap-2">
                  <button
                    type="button"
                    className="h-9 w-9 grid place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                    aria-label={t("common.info")}
                    title={t("common.info")}
                    onClick={() => {
                      setInfoOpen((v) => !v);
                      setSettingsOpen(false);
                    }}
                  >
                    ℹ
                  </button>
                  <button
                    type="button"
                    className="h-9 w-9 grid place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                    aria-label={t("common.settings")}
                    title={t("common.settings")}
                    onClick={() => {
                      setSettingsOpen((v) => !v);
                      setInfoOpen(false);
                    }}
                  >
                    ⚙
                  </button>

                  {infoOpen ? (
                    <div className="absolute right-3 top-10 z-50 w-[332px] min-w-[260px] max-w-[calc(100vw-48px)] rounded-2xl border border-neutral-200 bg-white shadow-lg overflow-hidden">
                      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2">
                        <div>
                          <div className="text-xs font-medium text-neutral-500">{t("common.info")}</div>
                          <div className="text-sm font-semibold text-neutral-900">{t("info.title")}</div>
                        </div>
                        <button
                          type="button"
                          className="h-8 w-8 grid place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                          aria-label={t("common.close")}
                          onClick={() => setInfoOpen(false)}
                        >
                          ✕
                        </button>
                      </div>

                      <div className="max-h-[calc(100vh-140px)] overflow-y-auto p-3 space-y-3">
                        <div className="flex items-center gap-3">
                          <a
                            href="https://www.linkedin.com/in/alejandro-naranjo-z/"
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0"
                            aria-label={t("info.openLinkedIn")}
                            title={t("info.openLinkedIn")}
                          >
                            <img
                              src="/1758386788913.jpeg"
                              alt=""
                              width={40}
                              height={40}
                              className="h-10 w-10 rounded-full border border-neutral-200 object-cover"
                            />
                          </a>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-neutral-900 truncate">Alejandro Naranjo</div>
                            <div className="text-xs text-neutral-600 leading-snug whitespace-normal">
                              {t("info.cta")}
                            </div>
                          </div>
                          <a
                            href="https://www.linkedin.com/in/alejandro-naranjo-z/"
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto h-9 shrink-0 inline-flex items-center rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                          >
                            LinkedIn
                          </a>
                        </div>

                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800 leading-snug">
                          {t("info.aboutText")}
                        </div>

                        <div className="flex gap-2">
                          <a
                            href="https://docs.google.com/forms/d/e/1FAIpQLScyl8Ee8oQenjS27vbsDahNQaQ8Bj8XRCH4-jfJkVmmQo976g/viewform?usp=dialog"
                            target="_blank"
                            rel="noreferrer"
                            className="h-9 flex-1 inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                          >
                            {t("info.sendSuggestions")}
                          </a>
                          <a
                            href="https://youtu.be/zAy5aE5R5gI"
                            target="_blank"
                            rel="noreferrer"
                            className="h-9 inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                          >
                            {t("info.watchOnYouTube")}
                          </a>
                        </div>

                        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                          <div className="aspect-video w-full bg-black">
                            <iframe
                              title={t("info.videoTitle")}
                              src="https://www.youtube.com/embed/zAy5aE5R5gI"
                              className="h-full w-full"
                              loading="lazy"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {settingsOpen ? (
                    <div className="absolute right-3 top-10 z-50 w-[300px] min-w-[260px] max-w-[calc(100vw-48px)] rounded-2xl border border-neutral-200 bg-white shadow-lg overflow-hidden">
                      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2">
                        <div>
                          <div className="text-xs font-medium text-neutral-500">{t("common.settings")}</div>
                          <div className="text-sm font-semibold text-neutral-900">{t("settings.title")}</div>
                        </div>
                        <button
                          type="button"
                          className="h-8 w-8 grid place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                          aria-label={t("settings.closeAria")}
                          onClick={() => setSettingsOpen(false)}
                        >
                          ✕
                        </button>
                      </div>

                      <div className="max-h-[calc(100vh-140px)] overflow-y-auto p-3 space-y-3">
                        <label className="block text-xs text-neutral-600">
                          {t("settings.language")}
                          <select
                            className="mt-1 h-9 w-full rounded-xl border border-neutral-300 bg-white px-2 text-sm text-neutral-900"
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as Language)}
                          >
                            <option value="es">{t("settings.languageEs")}</option>
                            <option value="en">{t("settings.languageEn")}</option>
                          </select>
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-xs text-neutral-600">
                            {t("settings.defaultAttractionDuration")}
                            <input
                              type="number"
                              min={0}
                              className="mt-1 h-9 w-full rounded-xl border border-neutral-300 bg-white px-2 text-sm"
                              value={defaultPlaceDurationMin}
                              onChange={(e) =>
                                setDefaultPlaceDurationMin(Math.max(0, Math.round(Number(e.target.value) || 0)))
                              }
                            />
                          </label>
                          <label className="text-xs text-neutral-600">
                            {t("settings.defaultAirportDuration")}
                            <input
                              type="number"
                              min={0}
                              className="mt-1 h-9 w-full rounded-xl border border-neutral-300 bg-white px-2 text-sm"
                              value={defaultAirportDurationMin}
                              onChange={(e) =>
                                setDefaultAirportDurationMin(Math.max(0, Math.round(Number(e.target.value) || 0)))
                              }
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-xs text-neutral-600">
                            {t("settings.dayStart")}
                            <input
                              type="time"
                              className="mt-1 h-9 w-full rounded-xl border border-neutral-300 bg-white px-2 text-sm"
                              value={dayStart}
                              onChange={(e) => setDayStart(e.target.value)}
                            />
                          </label>
                          <label className="text-xs text-neutral-600">
                            {t("settings.dayEnd")}
                            <input
                              type="time"
                              className="mt-1 h-9 w-full rounded-xl border border-neutral-300 bg-white px-2 text-sm"
                              value={dayEnd}
                              onChange={(e) => setDayEnd(e.target.value)}
                            />
                          </label>
                        </div>

                        <label className="block text-xs text-neutral-600">
                          {t("settings.defaultMode")}
                          <select
                            className="mt-1 h-9 w-full rounded-xl border border-neutral-300 bg-white px-2 text-sm text-neutral-900"
                            value={defaultTravelMode}
                            onChange={(e) => setDefaultTravelMode(e.target.value as Exclude<TravelMode, "flight">)}
                          >
                            <option value="driving">{t("travelMode.driving")}</option>
                            <option value="walking">{t("travelMode.walking")}</option>
                            <option value="cycling">{t("travelMode.cycling")}</option>
                            <option value="transit">{t("travelMode.transit")}</option>
                          </select>
                        </label>

                        <div className="text-[11px] text-neutral-500 leading-snug">
                          {t("settings.defaultsHint")}
                        </div>

                        <div className="pt-2 border-t border-neutral-200">
                          <button
                            type="button"
                            className="h-9 w-full rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm font-medium hover:bg-red-100"
                            onClick={clearDataAndReset}
                          >
                            {t("settings.clearData")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className={[
                    "h-10 flex-1 rounded-xl border px-3 text-sm font-medium transition-colors",
                    newKind === "place"
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
                  ].join(" ")}
                  onClick={() => openAdd("place")}
                >
                  {t("place.attraction")}
                </button>
                <button
                  type="button"
                  className={[
                    "h-10 flex-1 rounded-xl border px-3 text-sm font-medium transition-colors",
                    newKind === "hotel"
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
                  ].join(" ")}
                  onClick={() => openAdd("hotel")}
                >
                  {t("place.hotel")}
                </button>
                <button
                  type="button"
                  className={[
                    "h-10 flex-1 rounded-xl border px-3 text-sm font-medium transition-colors",
                    newKind === "airport"
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
                  ].join(" ")}
                  onClick={() => openAdd("airport")}
                >
                  {t("place.airport")}
                </button>
              </div>
            </div>

            {/* Global schedule removed: it's now configured per day. */}

          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-auto border-t border-neutral-200 pt-4">
            {places.length >= 2 ? null : (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {t("planner.needTwoPoints")}
              </div>
            )}
            {places.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
                {t("planner.emptyPlacesHint")}
              </div>
            ) : null}

            {places.length > 0 && places.some((p) => p.kind !== "hotel") ? (
              <div className="mt-3">
                <div className="mt-2 space-y-3">
                  {planDays.map((day, dayIdx) => (
                    <div
                      key={`day_${dayIdx}`}
                      className={[
                        "py-2 rounded-xl transition-colors",
                        dragging && dragOver?.day === dayIdx && dragOver?.idx === null
                          ? "bg-neutral-50 ring-2 ring-neutral-900/10"
                          : "",
                      ].join(" ")}
                      onDragOver={(e) => {
                        e.preventDefault();
                      }}
                      onDragEnter={() => {
                        if (!dragging) return;
                        setDragOver({ day: dayIdx, idx: null });
                      }}
                      onDragLeave={(e) => {
                        // Avoid clearing if the pointer is still inside the container (due to bubbling).
                        const rt = e.relatedTarget as Node | null;
                        if (rt && (e.currentTarget as HTMLElement).contains(rt)) return;
                        setDragOver((prev) => (prev?.day === dayIdx && prev?.idx === null ? null : prev));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!dragging) return;
                        moveInPlan({
                          placeId: dragging.placeId,
                          fromDay: dragging.fromDay,
                          fromIdx: dragging.fromIdx,
                          toDay: dayIdx,
                          toIdx: day.length, // append if dropped on the container
                        });
                        setDragging(null);
                        setDragOver(null);
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-3 py-1">
                        <div className="h-px flex-1 bg-neutral-200" />
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-xs font-medium text-neutral-500">
                            {t("common.day")} {dayIdx + 1}
                          </div>
                        <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-1.5 py-1">
                          <input
                            type="time"
                            className="h-6 w-[78px] rounded-md border border-neutral-200 bg-neutral-50 px-1 text-[11px] text-neutral-800"
                            value={(planDayWindows[dayIdx]?.start ?? dayStart) as string}
                            onChange={(e) => setDayWindow(dayIdx, { start: e.target.value })}
                            aria-label={t("planner.ariaDayStartTime", { day: dayIdx + 1 })}
                            title={t("planner.dayStartTitle")}
                          />
                          <span className="text-[11px] text-neutral-400">—</span>
                          <input
                            type="time"
                            className="h-6 w-[78px] rounded-md border border-neutral-200 bg-neutral-50 px-1 text-[11px] text-neutral-800"
                            value={(planDayWindows[dayIdx]?.end ?? dayEnd) as string}
                            onChange={(e) => setDayWindow(dayIdx, { end: e.target.value })}
                            aria-label={t("planner.ariaDayEndTime", { day: dayIdx + 1 })}
                            title={t("planner.dayEndTitle")}
                          />
                        </div>
                          <details className="relative">
                            <summary
                              className={[
                                "list-none h-7 w-8 grid place-items-center rounded-lg border bg-white text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 cursor-pointer select-none",
                                optimizingDayIdx != null ? "opacity-60 pointer-events-none" : "border-neutral-200",
                              ].join(" ")}
                              aria-label={t("planner.dayMenuLabel")}
                              title={t("planner.dayMenuLabel")}
                            >
                              ⋯
                            </summary>
                            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-neutral-200 bg-white shadow-lg p-1 z-20">
                              <button
                                type="button"
                                className="w-full text-left rounded-lg px-2 py-2 text-xs text-neutral-800 hover:bg-neutral-50"
                                onClick={(e) => {
                                  (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                                  optimizeDayRoute(dayIdx);
                                }}
                                title={t("planner.optimizeDayHint")}
                                aria-label={t("planner.optimizeDayHint")}
                                disabled={optimizingDayIdx != null}
                              >
                                {optimizingDayIdx === dayIdx ? t("planner.optimizingDayButton") : t("planner.dayMenuOptimize")}
                              </button>
                              <button
                                type="button"
                                className="w-full text-left rounded-lg px-2 py-2 text-xs text-red-700 hover:bg-red-50"
                                onClick={(e) => {
                                  (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                                  deleteDay(dayIdx);
                                }}
                                aria-label={t("planner.ariaDeleteDay", { day: dayIdx + 1 })}
                                title={t("planner.dayMenuDelete")}
                              >
                                {t("planner.dayMenuDelete")}
                              </button>
                            </div>
                          </details>
                        </div>
                        <div className="h-px flex-1 bg-neutral-200" />
                      </div>

                      {day.length === 0 ? (
                        <div className="mt-3 rounded-lg border border-dashed border-neutral-200 p-3 text-xs text-neutral-500 bg-white">
                          {t("planner.dragActivitiesHere")}
                        </div>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {day.map((id, idx) => {
                            const p = placeById[id];
                            if (!p) return null;
                            const key = `plan_${dayIdx}_${idx}_${p.id}`;
                            const isExpanded = Boolean(expanded[p.id]);
                            const isHotel = p.kind === "hotel";
                            const isAirport = p.kind === "airport";
                            const mode = (planLegModes[dayIdx]?.[idx] ?? "driving") as TravelMode;
                            const eta = etaByDayIdx[dayIdx]?.items?.[idx];

                            return (
                              <div key={key}>
                                {idx > 0 ? (
                                  <div className="flex items-center px-2 py-1 text-xs text-neutral-600">
                                    <span className="min-w-0 truncate">
                                      {modeLabel(mode).replace(" (simulado)", "")}
                                    </span>
                                    <span className="ml-auto font-medium tabular-nums">
                                      {eta?.travelMin != null ? `${Math.round(Math.max(0, eta.travelMin))} min` : "—"}
                                    </span>
                                  </div>
                                ) : null}

                                <li
                                  className={[
                                    "rounded-lg border border-neutral-200 bg-white p-2 transition transform-gpu",
                                    dragging?.placeId === p.id
                                      ? "opacity-80 shadow-lg ring-2 ring-neutral-900/10 scale-[1.01] cursor-grabbing"
                                      : "hover:bg-neutral-50",
                                    dragging && dragOver?.day === dayIdx && dragOver?.idx === idx
                                      ? "ring-2 ring-blue-400/60 bg-blue-50"
                                      : "",
                                  ].join(" ")}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                  }}
                                  onDragEnter={() => {
                                    if (!dragging) return;
                                    setDragOver({ day: dayIdx, idx });
                                  }}
                                  onDragLeave={(e) => {
                                    const rt = e.relatedTarget as Node | null;
                                    if (rt && (e.currentTarget as HTMLElement).contains(rt)) return;
                                    setDragOver((prev) => (prev?.day === dayIdx && prev?.idx === idx ? null : prev));
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    if (!dragging) return;
                                    moveInPlan({
                                      placeId: dragging.placeId,
                                      fromDay: dragging.fromDay,
                                      fromIdx: dragging.fromIdx,
                                      toDay: dayIdx,
                                      toIdx: idx, // insert before the item
                                    });
                                    setDragging(null);
                                    setDragOver(null);
                                  }}
                                >
                                <div className="flex items-start justify-between gap-2">
                                  <button
                                    type="button"
                                    className="min-w-0 text-left"
                                    onClick={() => {
                                      setMapCenter({ lat: p.lat, lon: p.lon });
                                      setSelectedPlaceId(p.id);
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={[
                                          "text-xs select-none",
                                          dragging?.placeId === p.id
                                            ? "text-neutral-700 cursor-grabbing"
                                            : "text-neutral-400 cursor-grab active:cursor-grabbing hover:text-neutral-600",
                                        ].join(" ")}
                                        aria-label={t("planner.dragToReorder")}
                                        title={t("planner.dragToReorder")}
                                        draggable
                                        onDragStart={(e) => {
                                          e.dataTransfer.effectAllowed = "move";
                                          // Firefox requires setData to initiate drag.
                                          try {
                                            e.dataTransfer.setData("text/plain", p.id);
                                          } catch {
                                            // ignore
                                          }
                                          // More visible drag preview (avoids the "nothing seems to move" feeling).
                                          try {
                                            const li = (e.currentTarget as HTMLElement).closest("li") as HTMLElement | null;
                                            if (li) {
                                              const r = li.getBoundingClientRect();
                                              const clone = li.cloneNode(true) as HTMLElement;
                                              clone.style.position = "absolute";
                                              clone.style.top = "-10000px";
                                              clone.style.left = "-10000px";
                                              clone.style.width = `${Math.max(220, Math.round(r.width))}px`;
                                              clone.style.background = "white";
                                              clone.style.borderRadius = "12px";
                                              clone.style.boxShadow = "0 18px 40px rgba(0,0,0,0.18)";
                                              clone.style.opacity = "0.98";
                                              clone.style.transform = "scale(1.02)";
                                              clone.style.pointerEvents = "none";
                                              document.body.appendChild(clone);
                                              e.dataTransfer.setDragImage(clone, 24, 20);
                                              window.setTimeout(() => clone.remove(), 0);
                                            }
                                          } catch {
                                            // ignore
                                          }
                                          setDragging({ placeId: p.id, fromDay: dayIdx, fromIdx: idx });
                                        }}
                                        onDragEnd={() => {
                                          setDragging(null);
                                          setDragOver(null);
                                        }}
                                      >
                                        ⠿
                                      </span>
                                      {isHotel ? (
                                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                                          H:{hotelIndexById[p.id] ?? ""}
                                        </span>
                                      ) : isAirport ? (
                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                                          ✈:{airportIndexById[p.id] ?? ""}
                                        </span>
                                      ) : (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                          A:{activityIndexById[p.id] ?? ""}
                                        </span>
                                      )}
                                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                                        {formatDurationCompact(p)}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-sm font-medium line-clamp-2">
                                      {p.name}
                                    </div>
                                    {idx > 0 ? (
                                      <div className="mt-1 flex items-center gap-2 text-xs text-neutral-600">
                                        <span className="shrink-0">{t("planner.goBy")}</span>
                                        {(() => {
                                          const prevId = day[idx - 1];
                                          const prev = prevId ? placeById[prevId] : undefined;
                                          const canFly = Boolean(prev && prev.kind === "airport" && p.kind === "airport");
                                          return (
                                        <select
                                          className="h-7 rounded-xl bg-neutral-100 px-2 text-xs text-neutral-800 border border-neutral-200"
                                          value={(planLegModes[dayIdx]?.[idx] ?? "driving") as TravelMode}
                                          onChange={(e) => setLegMode(dayIdx, idx, e.target.value as TravelMode)}
                                          aria-label={t("planner.travelModeToThis")}
                                          title={t("planner.travelModeToThis")}
                                        >
                                          <option value="driving">{t("travelMode.driving")}</option>
                                          <option value="walking">{t("travelMode.walking")}</option>
                                          <option value="cycling">{t("travelMode.cycling")}</option>
                                          <option value="transit">{t("travelMode.transit")}</option>
                                          {canFly ? <option value="flight">{t("travelMode.flight")}</option> : null}
                                        </select>
                                          );
                                        })()}
                                        <span
                                          className={[
                                            "ml-auto min-w-[150px] text-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs tabular-nums",
                                            eta?.overflow
                                              ? "bg-red-100 text-red-800"
                                              : "bg-emerald-100 text-emerald-800",
                                          ].join(" ")}
                                          title={t("planner.etaTitle")}
                                        >
                                          {eta ? `${formatClockAbs(eta.arriveAbs)}–${formatClockAbs(eta.departAbs)}` : "—"}
                                        </span>
                                      </div>
                                    ) : null}
                                  </button>

                                  <div className="shrink-0 flex items-center gap-2">
                                    {idx > 0 ? (
                                      <button
                                        type="button"
                                        className="h-7 rounded-lg border border-neutral-200 bg-white px-2 text-xs text-neutral-700 hover:bg-neutral-50"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void openLegInfo(dayIdx, idx);
                                        }}
                                        title={t("planner.viewRouteInstructions")}
                                      >
                                        {t("planner.routeButton")}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="h-7 w-7 grid place-items-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                      onClick={() => deletePlace(p.id)}
                                      aria-label={`${t("common.remove")} ${isHotel ? t("place.hotel") : isAirport ? t("place.airport") : t("place.attraction")}`}
                                      title={t("common.remove")}
                                    >
                                      🗑
                                    </button>
                                    <button
                                      type="button"
                                      className="text-xs text-neutral-500 hover:text-neutral-900"
                                      onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                                    >
                                      {isExpanded ? t("editor.hide") : t("editor.edit")}
                                    </button>
                                  </div>
                                </div>

                                {isExpanded ? (
                                  <div className="mt-3">
                                    <label className="text-xs text-neutral-600">
                                      {t("editor.name")}
                                      <input
                                        className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-2 text-sm"
                                        value={p.name}
                                        onChange={(e) => setPlaceName(p.id, e.target.value)}
                                      />
                                    </label>

                                    <label className="mt-3 block text-xs text-neutral-600">
                                      {t("editor.description")}
                                      <textarea
                                        className="mt-1 min-h-[84px] w-full resize-y rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                                        placeholder={t("planner.quickNotesPlaceholder")}
                                        value={p.description ?? ""}
                                        onChange={(e) => setPlaceDescription(p.id, e.target.value)}
                                      />
                                    </label>

                                    <div className="mt-3">
                                      <div className="text-xs text-neutral-600">{t("editor.image")}</div>
                                      {p.imageDataUrl ? (
                                        <div className="mt-2">
                                          <img
                                            src={p.imageDataUrl}
                                            alt=""
                                            className="h-28 w-full rounded-xl border border-neutral-200 object-cover"
                                          />
                                          <div className="mt-2 flex items-center justify-between">
                                            <label className="text-xs text-neutral-600 hover:text-neutral-900 cursor-pointer">
                                              {t("editor.change")}
                                              <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                  const f = e.target.files?.[0] ?? null;
                                                  void setPlaceImage(p.id, f);
                                                  e.target.value = "";
                                                }}
                                              />
                                            </label>
                                            <button
                                              type="button"
                                              className="text-xs text-red-600 hover:text-red-700"
                                              onClick={() => removePlaceImage(p.id)}
                                            >
                                              {t("editor.removeImage")}
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <label className="mt-2 inline-flex items-center gap-2 text-xs text-neutral-600 hover:text-neutral-900 cursor-pointer">
                                          <span className="h-8 px-3 rounded-xl border border-neutral-300 bg-white grid place-items-center">
                                            {t("editor.uploadImage")}
                                          </span>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                              const f = e.target.files?.[0] ?? null;
                                              void setPlaceImage(p.id, f);
                                              e.target.value = "";
                                            }}
                                          />
                                        </label>
                                      )}
                                    </div>

                                    <div className="grid grid-cols-[1fr_110px] gap-2">
                                      {!isHotel ? (
                                        <label className="text-xs text-neutral-600">
                                          {t("editor.duration")}
                                          <input
                                            className="mt-1 h-9 w-full rounded-lg border border-neutral-300 px-2 text-sm"
                                            type="number"
                                            min={0}
                                            step={p.durationUnit === "h" ? 0.25 : 5}
                                            value={
                                              (p.durationUnit ?? "min") === "h"
                                                ? Number((p.durationMin / 60).toFixed(2))
                                                : Math.round(p.durationMin)
                                            }
                                            onChange={(e) => {
                                              const raw = Number(e.target.value);
                                              const unit = p.durationUnit ?? "min";
                                              const nextMin = unit === "h" ? raw * 60 : raw;
                                              setPlaces((prev) =>
                                                prev.map((x) =>
                                                  x.id === p.id
                                                    ? { ...x, durationMin: Math.max(0, nextMin) }
                                                    : x,
                                                ),
                                              );
                                            }}
                                          />
                                        </label>
                                      ) : (
                                        <div />
                                      )}

                                      {!isHotel ? (
                                        <label className="text-xs text-neutral-600">
                                          {t("editor.unit")}
                                          <select
                                            className="mt-1 h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm"
                                            value={p.durationUnit ?? "min"}
                                            onChange={(e) => {
                                              const unit = e.target.value as "min" | "h";
                                              setPlaces((prev) =>
                                                prev.map((x) =>
                                                  x.id === p.id ? { ...x, durationUnit: unit } : x,
                                                ),
                                              );
                                            }}
                                          >
                                            <option value="min">min</option>
                                            <option value="h">h</option>
                                          </select>
                                        </label>
                                      ) : (
                                        <div />
                                      )}
                                    </div>

                                    <div className="mt-3 flex items-center justify-between">
                                      <button
                                        type="button"
                                        className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100"
                                        onClick={() => deletePlace(p.id)}
                                      >
                                        🗑 {t("common.remove")}
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </li>
                              </div>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                    onClick={() => {
                      // UX: when creating a new day, close any open editable panels.
                      setExpanded({});
                      setPlanDays((prev) => [...prev, []]);
                      setPlanLegModes((prev) => [...prev, []]);
                    }}
                  >
                    {t("planner.addDay")}
                  </button>
                </div>
              </div>
            ) : places.length > 0 ? (
              <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
                {t("planner.needAttractionToPlan")}
              </div>
            ) : null}
          </div>

          <div className="mt-3 shrink-0 border-t border-neutral-200 pt-3">
            <div className="mt-2 flex flex-wrap gap-2">
              <details ref={exportMenuRef} className="relative flex-1 min-w-[150px]">
                <summary className="list-none h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50 cursor-pointer flex items-center justify-center gap-2">
                  <span>{t("common.export")}</span>
                  <span className="text-neutral-500" aria-hidden="true">
                    ▾
                  </span>
                </summary>
                <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                    onClick={exportJsonV2}
                  >
                    {t("export.jsonReimport")}
                  </button>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                    onClick={exportCsv}
                  >
                    {t("export.csvExcel")}
                  </button>
                </div>
              </details>

              <label className="h-10 flex-1 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50 grid place-items-center cursor-pointer">
                {t("common.import")}
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      await importJsonFile(file);
                    } catch {
                      pushToast(t("toasts.importInvalidJson"));
                    } finally {
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </aside>

        <section
          className={[
            "min-h-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm",
            pickOnMap ? "cursor-crosshair" : "",
          ].join(" ")}
        >
          <div className="relative h-full">
            {addUI ? (
              <div className="absolute left-3 top-3 z-1100 w-[320px] max-w-[calc(100%-24px)] rounded-2xl border border-neutral-200 bg-white/95 shadow-lg backdrop-blur">
                <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-neutral-500">{t("common.add")}</div>
                    <div className="text-sm font-semibold text-neutral-900">
                      {kindLabel(addUI.kind)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="h-9 w-9 grid place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                    onClick={closeAdd}
                    aria-label={t("common.close")}
                  >
                    ✕
                  </button>
                </div>

                <div className="p-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={[
                        "h-9 flex-1 rounded-xl border px-3 text-sm font-medium",
                        addUI.mode === "search"
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
                      ].join(" ")}
                      onClick={() => {
                        setAddUI((prev) => (prev ? { ...prev, mode: "search" } : prev));
                        setPickOnMap(false);
                      }}
                    >
                      {t("common.search")}
                    </button>
                    <button
                      type="button"
                      className={[
                        "h-9 flex-1 rounded-xl border px-3 text-sm font-medium",
                        addUI.mode === "map"
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
                      ].join(" ")}
                      onClick={() => {
                        setAddUI((prev) => (prev ? { ...prev, mode: "map" } : prev));
                        setPickOnMap(true);
                      }}
                    >
                      {t("planner.clickOnMap")}
                    </button>
                  </div>

                  {addUI.mode === "search" ? (
                    <div className="mt-3">
                      <PlaceSearch
                        labels={{
                          label: t("placeSearch.label"),
                          placeholder: t("placeSearch.placeholder"),
                          searching: t("placeSearch.searching"),
                          hint: t("placeSearch.hint"),
                        }}
                        onPick={(picked) => {
                          const kind = addUI.kind;
                          const dayNum = Math.max(1, planDays.length);
                          const newPlace: Place = {
                            id: createId(kind),
                            name: picked.name,
                            lat: picked.lat,
                            lon: picked.lon,
                            kind,
                            durationMin:
                              kind === "hotel"
                                ? 0
                                : kind === "airport"
                                  ? defaultAirportDurationMin
                                  : defaultPlaceDurationMin,
                            durationUnit:
                              kind === "hotel"
                                ? "min"
                                : (kind === "airport" ? defaultAirportDurationMin : defaultPlaceDurationMin) % 60 === 0
                                  ? "h"
                                  : "min",
                            priority: 3,
                          };
                          setPlaces((prev) => [newPlace, ...prev]);
                          appendToLastDay(newPlace.id);
                          pushToast(t("toasts.addedToDay", { kind: kindLabel(kind), name: newPlace.name, day: dayNum }));
                          // UX: when creating a new item, close everything and leave only this one open.
                          setExpanded({ [newPlace.id]: true });
                          setMapCenter({ lat: picked.lat, lon: picked.lon });
                          closeAdd();
                        }}
                      />
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
                      {t("planner.clickOnMapToAdd", { kind: kindLabel(addUI.kind) })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <details className="absolute right-3 top-3 z-1000">
              <summary className="list-none cursor-pointer select-none rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm backdrop-blur hover:bg-white focus:outline-none focus:ring-4 focus:ring-neutral-900/10">
                <span className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">{t("common.view")}</span>
                  <span>{mapMenuLabel}</span>
                  <span className="text-neutral-500" aria-hidden="true">▾</span>
                </span>
              </summary>
              <div className="mt-2 w-[270px] rounded-2xl border border-neutral-200 bg-white shadow-lg overflow-hidden">
                <div className="p-2">
                  <button
                    type="button"
                    className={[
                      "h-9 w-full rounded-xl px-3 text-sm text-left",
                      mapView.mode === "por_dias"
                        ? "bg-neutral-900 text-white"
                        : "hover:bg-neutral-50 text-neutral-900",
                    ].join(" ")}
                    onClick={() => setMapView({ mode: "por_dias" })}
                  >
                    {t("mapView.byDaysColors")}
                  </button>

                  <div className="mt-3 border-t border-neutral-200 pt-3">
                    <div className="text-xs font-medium text-neutral-600 px-1">{t("common.day")}</div>
                    <div className="mt-2 flex gap-2">
                      <select
                        className="h-9 flex-1 rounded-xl border border-neutral-300 bg-white px-2 text-sm"
                        value={
                          mapView.mode === "enfocar_dia" || mapView.mode === "solo_dia"
                            ? mapView.day
                            : 1
                        }
                        onChange={(e) => {
                          const day = Math.max(1, Math.min(planDays.length || 1, Number(e.target.value) || 1));
                          focusDayAndMaybeCenter(day, 0);
                        }}
                      >
                        {Array.from({ length: Math.max(1, planDays.length) }).map((_, i) => (
                          <option key={i} value={i + 1}>
                            {t("common.day")} {i + 1}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      className={[
                        "mt-2 h-9 w-full rounded-xl px-3 text-sm text-left",
                        mapView.mode === "enfocar_dia"
                          ? "bg-neutral-900 text-white"
                          : "hover:bg-neutral-50 text-neutral-900",
                      ].join(" ")}
                      onClick={() => {
                        const day =
                          mapView.mode === "enfocar_dia" || mapView.mode === "solo_dia" ? mapView.day : 1;
                        focusDayAndMaybeCenter(day, focusStopIdx);
                      }}
                    >
                      {t("mapView.focusDayButton")}
                    </button>

                    <button
                      type="button"
                      className={[
                        "mt-2 h-9 w-full rounded-xl px-3 text-sm text-left",
                        mapView.mode === "solo_dia"
                          ? "bg-neutral-900 text-white"
                          : "hover:bg-neutral-50 text-neutral-900",
                      ].join(" ")}
                      onClick={() => {
                        const day =
                          mapView.mode === "enfocar_dia" || mapView.mode === "solo_dia" ? mapView.day : 1;
                        setMapView({ mode: "solo_dia", day: Math.max(1, Math.min(planDays.length || 1, day)) });
                      }}
                    >
                      {t("mapView.onlyDayButton")}
                    </button>
                  </div>
                </div>
              </div>
            </details>

            <div className="absolute left-1/2 bottom-4 z-1000 -translate-x-1/2">
              <div className="rounded-2xl border border-neutral-200 bg-white/95 shadow-sm backdrop-blur px-2 py-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-9 w-9 grid place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                    onClick={() => focusDayAndMaybeCenter(focusDay - 1, 0)}
                    aria-label={t("common.previousDay")}
                  >
                    ‹
                  </button>

                  <select
                    className="h-9 rounded-xl border border-neutral-300 bg-white px-2 text-sm"
                    value={focusDay}
                    onChange={(e) => focusDayAndMaybeCenter(Number(e.target.value) || 1, 0)}
                    aria-label={t("common.selectDay")}
                  >
                    {Array.from({ length: safeDayCount }).map((_, i) => (
                      <option key={i} value={i + 1}>
                        {t("common.day")} {i + 1}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="h-9 w-9 grid place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                    onClick={() => focusDayAndMaybeCenter(focusDay + 1, 0)}
                    aria-label={t("common.nextDay")}
                  >
                    ›
                  </button>

                  <div className="mx-1 h-6 w-px bg-neutral-200" />

                  <button
                    type="button"
                    className="h-9 w-9 grid place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                    onClick={focusPrevActivity}
                    aria-label={t("common.previousActivity")}
                    disabled={safeDayCount === 0}
                  >
                    ‹
                  </button>

                  <button
                    type="button"
                    className="h-9 w-[280px] sm:w-[360px] rounded-xl border border-neutral-200 bg-white px-3 text-sm text-neutral-900 hover:bg-neutral-50"
                    onClick={() => focusDayAndMaybeCenter(focusDay, focusStopIdx)}
                    aria-label={t("common.centerCurrentActivity")}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="font-medium shrink-0">{language === "es" ? `D${focusDay}` : `Day ${focusDay}`}</span>
                      <span className="text-neutral-300 shrink-0">·</span>
                      <span className="text-neutral-700 shrink-0">
                        {focusedStops.length > 0 ? `${focusStopIdx + 1}/${focusedStops.length}` : "—"}
                      </span>
                      <span className="text-neutral-300 shrink-0">·</span>
                      {focusedStop?.place ? (
                        <span className="min-w-0 flex-1 truncate text-neutral-500">
                          {focusedStop.place.name}
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-neutral-500">{t("planner.noActivities")}</span>
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="h-9 w-9 grid place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                    onClick={focusNextActivity}
                    aria-label={t("common.nextActivity")}
                    disabled={safeDayCount === 0}
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>

            <PlannerMap
              className="h-full"
              center={mapCenter}
              markers={mapMarkers}
              routeSegments={effectiveRouteSegments}
              selectedMarkerId={selectedPlaceId ?? undefined}
              onMarkerClick={(id) => setSelectedPlaceId(id)}
              labels={{
                unnamed: t("place.unnamed"),
                kindHotel: t("place.hotel"),
                kindAttraction: t("place.attraction"),
                kindAirport: t("place.airport"),
              }}
              onMapClick={(picked) => {
                if (!pickOnMap) return;
                const dayNum = Math.max(1, planDays.length);
                const name = uniqueMapPointName(places);
                const newPlace: Place = {
                  id: createId(newKind),
                  name,
                  lat: picked.lat,
                  lon: picked.lon,
                  kind: newKind,
                  durationMin:
                    newKind === "hotel"
                      ? 0
                      : newKind === "airport"
                        ? defaultAirportDurationMin
                        : defaultPlaceDurationMin,
                  durationUnit:
                    newKind === "hotel"
                      ? "min"
                      : (newKind === "airport" ? defaultAirportDurationMin : defaultPlaceDurationMin) % 60 === 0
                        ? "h"
                        : "min",
                  priority: 3,
                };
                setPlaces((prev) => [newPlace, ...prev]);
                appendToLastDay(newPlace.id);
                pushToast(t("toasts.addedToDay", { kind: kindLabel(newKind), name: newPlace.name, day: dayNum }));
                // UX: when creating a new item, close everything and leave only this one open.
                setExpanded({ [newPlace.id]: true });
                setMapCenter({ lat: picked.lat, lon: picked.lon });
                setSelectedPlaceId(newPlace.id);
                setPickOnMap(false);
                setAddUI(null);
              }}
            />
          </div>
        </section>
      </main>

      {toasts.length > 0 ? (
        <div className="fixed left-4 bottom-4 z-2000 space-y-2 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto max-w-[420px] rounded-2xl border border-neutral-200 bg-white/95 shadow-lg backdrop-blur px-3 py-2 text-sm text-neutral-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate">{toast.message}</div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-neutral-500 hover:text-neutral-900"
                  onClick={() => setToasts((prev) => prev.filter((x) => x.id !== toast.id))}
                  aria-label={t("common.close")}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {legInfo?.open ? (
        <div className="fixed inset-0 z-3000 bg-black/40 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setLegInfo(null)} />
          <div className="absolute left-1/2 top-1/2 w-[min(720px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-neutral-900 truncate">{legInfo.title}</div>
                <div className="mt-0.5 text-xs text-neutral-600 truncate">{legInfo.subtitle}</div>
              </div>
              <button
                type="button"
                className="h-8 w-8 grid place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                onClick={() => setLegInfo(null)}
                aria-label={t("common.close")}
              >
                ✕
              </button>
            </div>
            <div className="px-4 py-3 max-h-[60vh] overflow-auto">
              {legInfo.loading ? (
                <div className="text-sm text-neutral-600">{t("routing.loadingInstructions")}</div>
              ) : legInfo.error ? (
                <div className="text-sm text-red-700">{legInfo.error}</div>
              ) : (
                <ol className="space-y-2 text-sm text-neutral-800 list-decimal pl-5">
                  {legInfo.lines.map((l, i) => (
                    <li key={i} className="leading-snug">
                      {l.replace(/^\d+\.\s*/, "")}
                    </li>
                  ))}
                </ol>
              )}
              {legInfo.mode === "transit" ? (
                <div className="mt-3 text-xs text-neutral-500">
                  {t("routing.transitSimulatedNote")}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
