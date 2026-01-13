import { NextResponse } from "next/server";

export const runtime = "nodejs";

type NextFetchInit = RequestInit & { next?: { revalidate?: number } };

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object";
}

type Body = {
  coordinates: Array<{ lat: number; lon: number }>;
  profile?: "driving" | "walking" | "cycling" | "transit";
  steps?: boolean;
};

function upstreamBase(profile: "driving" | "walking" | "cycling") {
  // Note: the `router.project-osrm.org` demo often routes similarly for walking/cycling.
  // We use separate public instances for walking/cycling so the result actually changes.
  if (profile === "walking") return "https://routing.openstreetmap.de/routed-foot";
  if (profile === "cycling") return "https://routing.openstreetmap.de/routed-bike";
  return "https://router.project-osrm.org";
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: Request) {
  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = null;
  }

  const coords = body?.coordinates ?? [];
  const profileRaw = body?.profile ?? "driving";
  const profile =
    profileRaw === "walking" || profileRaw === "cycling" || profileRaw === "driving"
      ? profileRaw
      : "driving"; // transit and anything else -> driving
  const wantSteps = Boolean(body?.steps);
  if (coords.length < 2) {
    return NextResponse.json({
      route: null,
    });
  }

  // OSRM expects lon,lat;lon,lat;...
  const coordStr = coords.map((c) => `${c.lon},${c.lat}`).join(";");

  const base = upstreamBase(profile);
  // In routed-foot/routed-bike the path profile is still `driving` (the instance itself is already profiled).
  const upstream = new URL(`${base}/route/v1/driving/${coordStr}`);
  upstream.searchParams.set("overview", "full");
  upstream.searchParams.set("geometries", "geojson");
  upstream.searchParams.set("steps", wantSteps ? "true" : "false");
  upstream.searchParams.set("alternatives", "false");

  const init: NextFetchInit = {
    headers: {
      "User-Agent": "trip_planner (demo) - Next.js proxy",
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  };

  let res: Response | null = null;
  try {
    // Short timeout to avoid 500s due to a stuck upstream.
    res = await fetchWithTimeout(upstream.toString(), init, 6000);
  } catch {
    res = null;
  }

  // Fallback: if walking/cycling fails or times out, try driving on the main demo instance.
  if (!res && profile !== "driving") {
    try {
      const fallback = new URL(`https://router.project-osrm.org/route/v1/driving/${coordStr}`);
      fallback.searchParams.set("overview", "full");
      fallback.searchParams.set("geometries", "geojson");
      fallback.searchParams.set("steps", wantSteps ? "true" : "false");
      fallback.searchParams.set("alternatives", "false");
      res = await fetchWithTimeout(fallback.toString(), init, 6000);
    } catch {
      res = null;
    }
  }

  if (!res) {
    return NextResponse.json({ error: "osrm_timeout", route: null }, { status: 200 });
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: "osrm_error", status: res.status, route: null },
      { status: 200 },
    );
  }

  const json: unknown = await res.json();
  const routes = isRecord(json) ? json["routes"] : undefined;
  const r0 = Array.isArray(routes) ? routes[0] : undefined;
  const geometryRaw = isRecord(r0) ? r0["geometry"] : undefined;
  const geometryType = isRecord(geometryRaw) ? geometryRaw["type"] : undefined;
  if (geometryType !== "LineString") {
    return NextResponse.json({ route: null });
  }

  const coordsRaw = isRecord(geometryRaw) ? geometryRaw["coordinates"] : undefined;
  if (!Array.isArray(coordsRaw)) {
    return NextResponse.json({ route: null });
  }

  return NextResponse.json({
    route: {
      geometry: { type: "LineString", coordinates: coordsRaw as Array<[number, number]> },
      durationSec: Number(isRecord(r0) ? (r0["duration"] ?? 0) : 0),
      distanceM: Number(isRecord(r0) ? (r0["distance"] ?? 0) : 0),
      legs: isRecord(r0) ? (r0["legs"] ?? null) : null,
    },
  });
}



