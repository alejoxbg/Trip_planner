export type NominatimResult = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

const memoryCache = new Map<string, { at: number; results: NominatimResult[] }>();
const TTL_MS = 5 * 60 * 1000;

export async function searchPlaces(q: string, signal?: AbortSignal) {
  const query = q.trim();
  if (query.length < 3) return [] as NominatimResult[];

  const cached = memoryCache.get(query.toLowerCase());
  if (cached && Date.now() - cached.at < TTL_MS) return cached.results;

  const res = await fetch(`/api/nominatim?q=${encodeURIComponent(query)}&limit=6`, {
    method: "GET",
    signal,
    headers: { Accept: "application/json" },
  });

  const json = (await res.json()) as { results?: NominatimResult[] };
  const results = json.results ?? [];
  memoryCache.set(query.toLowerCase(), { at: Date.now(), results });
  return results;
}



