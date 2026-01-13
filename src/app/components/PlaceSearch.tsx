"use client";

import type { NominatimResult } from "@/app/lib/nominatim";
import { searchPlaces } from "@/app/lib/nominatim";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  onPick: (picked: NominatimResult) => void;
  labels?: {
    label: string;
    placeholder: string;
    searching: string;
    hint: string;
  };
};

export function PlaceSearch({ onPick, labels }: Props) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const canSearch = useMemo(() => q.trim().length >= 3, [q]);

  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      setOpen(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        setLoading(true);
        const r = await searchPlaces(q, ac.signal);
        setResults(r);
        setOpen(true);
      } catch {
        // Abort or request failure: don't spam the user.
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(handle);
    };
  }, [q, canSearch]);

  function pick(r: NominatimResult) {
    setQ("");
    setResults([]);
    setOpen(false);
    onPick(r);
  }

  return (
    <div className="relative">
      <label className="text-sm font-medium" htmlFor="place-search">
        {labels?.label ?? "Search place"}
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id="place-search"
          className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-900/10 placeholder:text-neutral-400 focus:ring-4"
          placeholder={labels?.placeholder ?? "e.g. Prado Museum, Sagrada Familia..."}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
        />
      </div>

      {open && results.length > 0 ? (
        <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg">
          <ul className="max-h-72 overflow-auto">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  onClick={() => pick(r)}
                >
                  <div className="font-medium text-neutral-900 line-clamp-1">
                    {r.name}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {r.lat.toFixed(5)}, {r.lon.toFixed(5)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-2 text-xs text-neutral-500">
        {loading ? (labels?.searching ?? "Searching...") : (labels?.hint ?? "Type at least 3 characters to search.")}
      </p>
    </div>
  );
}



