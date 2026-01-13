import type { Place } from "@/app/lib/types";

const KEY = "trip_planner.places.v1";
const SETTINGS_KEY = "trip_planner.settings.v1";
const PLAN_KEY = "trip_planner.plan.v1";

const LEGACY_KEY = "map_planner.places.v1";
const LEGACY_SETTINGS_KEY = "map_planner.settings.v1";
const LEGACY_PLAN_KEY = "map_planner.plan.v1";

function readWithLegacyFallback(primaryKey: string, legacyKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const primary = window.localStorage.getItem(primaryKey);
    if (primary != null) return primary;

    const legacy = window.localStorage.getItem(legacyKey);
    if (legacy == null) return null;

    // Automatically migrate to the new app keys (and remove the old key).
    try {
      window.localStorage.setItem(primaryKey, legacy);
      window.localStorage.removeItem(legacyKey);
    } catch {
      // ignore
    }

    return legacy;
  } catch {
    return null;
  }
}

export type PlannerSettings = {
  dayStart: string; // "HH:MM"
  dayEnd: string; // "HH:MM"
  defaultPlaceDurationMin: number; // minutes
  defaultAirportDurationMin: number; // minutes
  defaultTravelMode: "driving" | "walking" | "cycling" | "transit";
  language?: "es" | "en";
};

export type PlannerPlan = {
  days: string[][]; // activity IDs (NOT hotels) per day, in order
  // Outgoing travel mode for each day item:
  // legModes[dayIdx][i] applies to the leg days[dayIdx][i-1] -> days[dayIdx][i] (i>0).
  // Index 0 is ignored (there is no leg into the first element of the day).
  legModes?: Array<Array<"driving" | "walking" | "cycling" | "transit" | "flight">>;
  // For migrations: "from" (old: applies to the next leg) vs "to" (new: applies to the leg into this item).
  legModesSemantics?: "from" | "to";

  // Per-day schedule (optional). If missing, global schedule is used.
  dayWindows?: Array<{ start: string; end: string }>;
};

const DEFAULT_SETTINGS: PlannerSettings = {
  dayStart: "08:00",
  dayEnd: "20:00",
  defaultPlaceDurationMin: 60,
  defaultAirportDurationMin: 60,
  defaultTravelMode: "driving",
  language: "en",
};

export function loadPlaces(): Place[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = readWithLegacyFallback(KEY, LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Place[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function savePlaces(places: Place[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(places));
  } catch {
    // ignore
  }
}

export function loadSettings(): PlannerSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = readWithLegacyFallback(SETTINGS_KEY, LEGACY_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PlannerSettings>;
    const dayStart = typeof parsed.dayStart === "string" ? parsed.dayStart : DEFAULT_SETTINGS.dayStart;
    const dayEnd = typeof parsed.dayEnd === "string" ? parsed.dayEnd : DEFAULT_SETTINGS.dayEnd;
    const defaultPlaceDurationMin = Number.isFinite(parsed.defaultPlaceDurationMin as number)
      ? Math.max(0, Math.round(Number(parsed.defaultPlaceDurationMin)))
      : DEFAULT_SETTINGS.defaultPlaceDurationMin;
    const defaultAirportDurationMin = Number.isFinite(parsed.defaultAirportDurationMin as number)
      ? Math.max(0, Math.round(Number(parsed.defaultAirportDurationMin)))
      : DEFAULT_SETTINGS.defaultAirportDurationMin;
    const defaultTravelMode =
      parsed.defaultTravelMode === "walking" ||
      parsed.defaultTravelMode === "cycling" ||
      parsed.defaultTravelMode === "transit" ||
      parsed.defaultTravelMode === "driving"
        ? parsed.defaultTravelMode
        : DEFAULT_SETTINGS.defaultTravelMode;
    const language = parsed.language === "en" || parsed.language === "es" ? parsed.language : DEFAULT_SETTINGS.language;
    return { dayStart, dayEnd, defaultPlaceDurationMin, defaultAirportDurationMin, defaultTravelMode, language };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: PlannerSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function loadPlan(): PlannerPlan {
  if (typeof window === "undefined") return { days: [[]] };
  try {
    const raw = readWithLegacyFallback(PLAN_KEY, LEGACY_PLAN_KEY);
    if (!raw) return { days: [[]] };
    const parsed = JSON.parse(raw) as Partial<PlannerPlan>;
    const days = Array.isArray(parsed.days)
      ? parsed.days
          .filter((d) => Array.isArray(d))
          .map((d) => d.filter((x) => typeof x === "string"))
      : [[]];

    const legModesRaw = (parsed as { legModes?: unknown }).legModes;
    const legModesSemanticsRaw = (parsed as { legModesSemantics?: unknown }).legModesSemantics;
    const legModesSemantics =
      legModesSemanticsRaw === "from" || legModesSemanticsRaw === "to" ? legModesSemanticsRaw : undefined;
    const legModes = Array.isArray(legModesRaw)
      ? legModesRaw
          .filter((d: unknown) => Array.isArray(d))
          .map((d: unknown[]) =>
            d
              .map((x) => (typeof x === "string" ? x : ""))
              .map((x) =>
                x === "walking" || x === "cycling" || x === "transit" || x === "flight" || x === "driving"
                  ? x
                  : "driving",
              ),
          )
      : undefined;

    const dayWindowsRaw = (parsed as { dayWindows?: unknown }).dayWindows;
    const dayWindows = Array.isArray(dayWindowsRaw)
      ? dayWindowsRaw
          .filter((x: unknown) => x != null && typeof x === "object")
          .map((x: unknown) => ({
            start: typeof (x as Record<string, unknown>)["start"] === "string" ? String((x as Record<string, unknown>)["start"]) : "",
            end: typeof (x as Record<string, unknown>)["end"] === "string" ? String((x as Record<string, unknown>)["end"]) : "",
          }))
      : undefined;

    return { days: days.length > 0 ? days : [[]], legModes, legModesSemantics, dayWindows };
  } catch {
    return { days: [[]] };
  }
}

export function savePlan(plan: PlannerPlan) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch {
    // ignore
  }
}

export function clearAllData() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(SETTINGS_KEY);
    window.localStorage.removeItem(PLAN_KEY);
    window.localStorage.removeItem(LEGACY_KEY);
    window.localStorage.removeItem(LEGACY_SETTINGS_KEY);
    window.localStorage.removeItem(LEGACY_PLAN_KEY);
  } catch {
    // ignore
  }
}


