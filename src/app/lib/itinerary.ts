import type { OsrmDurationsMatrix } from "@/app/lib/osrm";
import type { Place } from "@/app/lib/types";

export type ItineraryStep = {
  placeId: string;
  kind: "hotel" | "place" | "airport";
  travelMinFromPrev: number;
  arriveMinOfDay: number; // minutes since day start (0..)
  departMinOfDay: number; // minutes since day start (0..)
  visitMin: number;
};

export type ItineraryDay = {
  day: number;
  color: string;
  steps: ItineraryStep[];
  startHotelId: string;
  endHotelId: string;
  travelMinTotal: number;
  visitMinTotal: number;
  totalMin: number;
  overflow: boolean; // true if we had to force something that exceeds the day's time window
};

export type ItineraryPlan = {
  days: ItineraryDay[];
  pathPlaceIds: string[]; // full sequence used to draw the route (includes repeated hotels)
  legColors: string[]; // color for each leg (path[i] -> path[i+1])
  activityOrderIds: string[]; // global activity order (for numbering)
};

const DAY_PALETTE = [
  "#2563eb", // blue
  "#16a34a", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#06b6d4", // cyan
];

function safeMinFromSec(sec: number | null | undefined) {
  if (!Number.isFinite(sec as number)) return Infinity;
  return Math.max(0, (sec as number) / 60);
}

function parseTimeToMin(t: string) {
  const [hRaw, mRaw] = t.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m));
}

function travelMin(matrix: OsrmDurationsMatrix, idxById: Record<string, number>, fromId: string, toId: string) {
  const a = idxById[fromId];
  const b = idxById[toId];
  if (a == null || b == null) return Infinity;
  return safeMinFromSec(matrix[a]?.[b]);
}

function nearestHotelFrom(
  matrix: OsrmDurationsMatrix,
  idxById: Record<string, number>,
  fromId: string,
  hotelIds: string[],
) {
  let best = { hotelId: hotelIds[0] ?? fromId, min: Infinity };
  for (const hid of hotelIds) {
    const m = travelMin(matrix, idxById, fromId, hid);
    if (m < best.min) best = { hotelId: hid, min: m };
  }
  return best;
}

export function buildItineraryPlan(input: {
  places: Place[];
  dayStart: string; // "HH:MM"
  dayEnd: string; // "HH:MM"
  durationsSec: OsrmDurationsMatrix;
}): ItineraryPlan {
  const { places, dayStart, dayEnd, durationsSec } = input;

  const hotels = places.filter((p) => p.kind === "hotel");
  const attractions = places.filter((p) => p.kind !== "hotel");
  if (hotels.length === 0) return { days: [], pathPlaceIds: [], legColors: [], activityOrderIds: [] };

  const idxById: Record<string, number> = {};
  for (let i = 0; i < places.length; i++) idxById[places[i].id] = i;

  const startMin = parseTimeToMin(dayStart);
  const endMin = parseTimeToMin(dayEnd);
  const windowMin = Math.max(0, endMin - startMin);

  const hotelIds = hotels.map((h) => h.id);
  let currentHotelId = hotels[0].id;
  let currentPosId = currentHotelId;
  let queue = attractions.slice(); // already in the current order

  const days: ItineraryDay[] = [];
  const pathPlaceIds: string[] = [];
  const legColors: string[] = [];
  const activityOrderIds: string[] = [];

  const MAX_DAYS = Math.max(1, attractions.length + 2);
  for (let day = 1; day <= MAX_DAYS; day++) {
    const color = DAY_PALETTE[(day - 1) % DAY_PALETTE.length];
    const steps: ItineraryStep[] = [];
    let travelMinTotal = 0;
    let visitMinTotal = 0;
    let t = 0; // minutes since day start
    let overflow = false;

    // start the day at the hotel
    steps.push({
      placeId: currentHotelId,
      kind: "hotel",
      travelMinFromPrev: 0,
      arriveMinOfDay: 0,
      departMinOfDay: 0,
      visitMin: 0,
    });

    if (pathPlaceIds.length === 0) {
      pathPlaceIds.push(currentHotelId);
    } else if (pathPlaceIds[pathPlaceIds.length - 1] !== currentHotelId) {
      // defensive continuity (should always match in theory)
      const prev = pathPlaceIds[pathPlaceIds.length - 1];
      pathPlaceIds.push(currentHotelId);
      legColors.push(color);
      // we don't compute duration here; this is only for drawing
      void prev;
    }

    currentPosId = currentHotelId;

    // day visits
    while (queue.length > 0) {
      const next = queue[0];
      const travelToNext = travelMin(durationsSec, idxById, currentPosId, next.id);
      const visit = Math.max(0, next.durationMin ?? 0);

      // to accept the next attraction, we also need to fit the return to some hotel
      const afterVisitPosId = next.id;
      const nearestAfterVisit = nearestHotelFrom(durationsSec, idxById, afterVisitPosId, hotelIds);
      const wouldUse = t + travelToNext + visit + nearestAfterVisit.min;

      if (wouldUse <= windowMin) {
        // accept the attraction
        t += travelToNext;
        travelMinTotal += travelToNext;

        const arrive = t;
        t += visit;
        visitMinTotal += visit;
        const depart = t;

        steps.push({
          placeId: next.id,
          kind: (next.kind === "airport" ? "airport" : "place"),
          travelMinFromPrev: travelToNext,
          arriveMinOfDay: arrive,
          departMinOfDay: depart,
          visitMin: visit,
        });

        // map path
        const prev = pathPlaceIds[pathPlaceIds.length - 1];
        pathPlaceIds.push(next.id);
        legColors.push(color);
        void prev;

        activityOrderIds.push(next.id);
        currentPosId = next.id;
        queue = queue.slice(1);
        continue;
      }

      // If we haven't visited anything today yet and it doesn't fit, force it (avoid infinite loop).
      if (steps.length === 1) {
        overflow = true;
        t += travelToNext;
        travelMinTotal += travelToNext;
        const arrive = t;
        t += visit;
        visitMinTotal += visit;
        const depart = t;
        steps.push({
          placeId: next.id,
          kind: (next.kind === "airport" ? "airport" : "place"),
          travelMinFromPrev: travelToNext,
          arriveMinOfDay: arrive,
          departMinOfDay: depart,
          visitMin: visit,
        });
        const prev = pathPlaceIds[pathPlaceIds.length - 1];
        pathPlaceIds.push(next.id);
        legColors.push(color);
        void prev;
        activityOrderIds.push(next.id);
        currentPosId = next.id;
        queue = queue.slice(1);
      }

      break; // close the day (return to hotel)
    }

    // end of day: return to the nearest hotel from our current position
    const nearest = nearestHotelFrom(durationsSec, idxById, currentPosId, hotelIds);
    const endHotelId = nearest.hotelId;

    if (endHotelId !== currentPosId || steps.length === 1) {
      t += nearest.min;
      travelMinTotal += Number.isFinite(nearest.min) ? nearest.min : 0;
      steps.push({
        placeId: endHotelId,
        kind: "hotel",
        travelMinFromPrev: nearest.min,
        arriveMinOfDay: t,
        departMinOfDay: t,
        visitMin: 0,
      });

      const prev = pathPlaceIds[pathPlaceIds.length - 1];
      if (prev !== endHotelId) {
        pathPlaceIds.push(endHotelId);
        legColors.push(color);
      }
    }

    days.push({
      day,
      color,
      steps,
      startHotelId: currentHotelId,
      endHotelId,
      travelMinTotal,
      visitMinTotal,
      totalMin: travelMinTotal + visitMinTotal,
      overflow,
    });

    currentHotelId = endHotelId;
    currentPosId = endHotelId;

    if (queue.length === 0) break;
  }

  return { days, pathPlaceIds, legColors, activityOrderIds };
}



