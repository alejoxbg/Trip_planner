import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    10,
    Math.max(1, Number(url.searchParams.get("limit") ?? "6")),
  );

  if (q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  // Nominatim usage policy: identify your application. On Vercel we don't have
  // a stable dev domain, so we at least use an explicit User-Agent.
  const upstream = new URL("https://nominatim.openstreetmap.org/search");
  upstream.searchParams.set("format", "jsonv2");
  upstream.searchParams.set("q", q);
  upstream.searchParams.set("limit", String(limit));
  upstream.searchParams.set("addressdetails", "1");
  upstream.searchParams.set("accept-language", "es");

  const res = await fetch(upstream.toString(), {
    headers: {
      "User-Agent": "trip_planner (demo) - Next.js proxy",
      "Accept-Language": "es",
    },
    // Soft cache: edge/serverless may reuse the response; in dev it doesn't matter.
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "nominatim_error", status: res.status, results: [] },
      { status: 200 },
    );
  }

  const data = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
  }>;

  const results = data.map((r) => ({
    id: String(r.place_id),
    name: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }));

  return NextResponse.json({ results });
}



