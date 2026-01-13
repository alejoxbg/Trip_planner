export type OsrmRoute = {
  geometry: { type: "LineString"; coordinates: Array<[number, number]> }; // [lon,lat]
  durationSec: number;
  distanceM: number;
  // When `steps=true`
  legs?: unknown;
};

export type OsrmDurationsMatrix = number[][]; // seconds

export type OsrmProfile = "driving" | "walking" | "cycling" | "transit";

function normalizeProfile(p: OsrmProfile | undefined) {
  if (!p) return "driving" as const;
  // OSRM demo does not support public transit; fall back to driving.
  if (p === "transit") return "driving" as const;
  return p;
}

export async function fetchOsrmRoute(
  coordinates: Array<{ lat: number; lon: number }>,
  profile?: OsrmProfile,
  signal?: AbortSignal,
) {
  if (coordinates.length < 2) return null as OsrmRoute | null;

  const res = await fetch("/api/osrm/route", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ coordinates, profile: normalizeProfile(profile) }),
    signal,
  });

  const json = (await res.json()) as { route?: OsrmRoute | null };
  return json.route ?? null;
}

export async function fetchOsrmRouteWithSteps(
  coordinates: Array<{ lat: number; lon: number }>,
  profile?: OsrmProfile,
  signal?: AbortSignal,
) {
  if (coordinates.length < 2) return null as OsrmRoute | null;

  const res = await fetch("/api/osrm/route", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ coordinates, profile: normalizeProfile(profile), steps: true }),
    signal,
  });

  const json = (await res.json()) as { route?: OsrmRoute | null };
  return json.route ?? null;
}

export async function fetchOsrmTableDurations(
  coordinates: Array<{ lat: number; lon: number }>,
  profile?: OsrmProfile,
  signal?: AbortSignal,
) {
  if (coordinates.length < 2) return null as OsrmDurationsMatrix | null;

  const res = await fetch("/api/osrm/table", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ coordinates, profile: normalizeProfile(profile) }),
    signal,
  });

  const json = (await res.json()) as { durations?: OsrmDurationsMatrix | null };
  return json.durations ?? null;
}


