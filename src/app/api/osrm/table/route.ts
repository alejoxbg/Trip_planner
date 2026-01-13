import { NextResponse } from "next/server";

export const runtime = "nodejs";

type NextFetchInit = RequestInit & { next?: { revalidate?: number } };

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object";
}

type Body = {
  coordinates: Array<{ lat: number; lon: number }>;
  profile?: "driving" | "walking" | "cycling" | "transit";
};

function upstreamBase(profile: "driving" | "walking" | "cycling") {
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
  if (coords.length < 2) {
    return NextResponse.json({ durations: null });
  }

  const coordStr = coords.map((c) => `${c.lon},${c.lat}`).join(";");
  const base = upstreamBase(profile);
  const upstream = new URL(`${base}/table/v1/driving/${coordStr}`);
  upstream.searchParams.set("annotations", "duration");

  const init: NextFetchInit = {
    headers: {
      "User-Agent": "trip_planner (demo) - Next.js proxy",
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  };

  let res: Response | null = null;
  try {
    res = await fetchWithTimeout(upstream.toString(), init, 6000);
  } catch {
    res = null;
  }

  if (!res && profile !== "driving") {
    try {
      const fallback = new URL(`https://router.project-osrm.org/table/v1/driving/${coordStr}`);
      fallback.searchParams.set("annotations", "duration");
      res = await fetchWithTimeout(fallback.toString(), init, 6000);
    } catch {
      res = null;
    }
  }

  if (!res) {
    return NextResponse.json({ error: "osrm_timeout", durations: null }, { status: 200 });
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: "osrm_error", status: res.status, durations: null },
      { status: 200 },
    );
  }

  const json: unknown = await res.json();
  const durations = isRecord(json) ? (json["durations"] ?? null) : null;
  return NextResponse.json({ durations });
}



