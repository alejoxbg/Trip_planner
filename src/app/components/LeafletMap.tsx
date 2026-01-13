"use client";

import type { LatLngExpression } from "leaflet";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Marker as LeafletMarker } from "leaflet";

export type MapMarker = {
  id: string;
  name?: string;
  description?: string;
  lat: number;
  lon: number;
  kind?: "place" | "hotel" | "airport";
  label?: string;
  opacity?: number; // 0..1
  imageDataUrl?: string;
  details?: Array<{ k: string; v: string }>;
};

export type LeafletMapProps = {
  markers: MapMarker[];
  center?: { lat: number; lon: number };
  zoom?: number;
  className?: string;
  routeSegments?: Array<{ coords: Array<{ lat: number; lon: number }>; color: string; opacity?: number }>;
  onMapClick?: (picked: { lat: number; lon: number }) => void;
  selectedMarkerId?: string;
  onMarkerClick?: (id: string) => void;
  labels?: {
    unnamed: string;
    kindHotel: string;
    kindAttraction: string;
    kindAirport: string;
  };
};

function markerIcon(kind: "place" | "hotel" | "airport" | undefined, label?: string) {
  const isHotel = kind === "hotel";
  const isAirport = kind === "airport";
  const bg = isHotel ? "#a855f7" /* purple-500 */ : isAirport ? "#22c55e" /* green-500 */ : "#f59e0b" /* amber-500 */;
  const shadow = isHotel ? "#a855f733" : isAirport ? "#22c55e33" : "#f59e0b33";
  const icon = isHotel
    ? `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        xmlns="http://www.w3.org/2000/svg" style="display:block">
        <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
          fill="white" fill-opacity="0.95"/>
      </svg>
    `
    : isAirport
      ? `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        xmlns="http://www.w3.org/2000/svg" style="display:block">
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 1 0-3 0V9L2 14v2l8-2.5V19l-2 1.5V22l3-1 3 1v-1.5L13 19v-5.5L21 16Z"
          fill="white" fill-opacity="0.95"/>
      </svg>
      `
    : "";

  return L.divIcon({
    className: "",
    html: `
      <div style="
        position:relative;
        width: 28px;
        height: 28px;
        border-radius: 9999px;
        background: ${bg};
        box-shadow: 0 0 0 6px ${shadow};
        border: 2px solid white;
        display: grid;
        place-items: center;
      ">
        ${icon ? `<div style="${isAirport && label ? "position:absolute; inset:0; display:grid; place-items:center; opacity:0.92;" : ""}">${icon}</div>` : ""}
        ${!isHotel && label ? `<div style="
          position:absolute;
          inset:0;
          display:grid;
          place-items:center;
          color: rgba(255,255,255,0.98);
          font-weight: 900;
          font-size: 13px;
          line-height: 1;
          text-shadow: 0 1px 2px rgba(0,0,0,0.25);
        ">${label}</div>` : ""}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function LeafletMap({
  markers,
  center,
  zoom,
  className,
  routeSegments,
  onMapClick,
  selectedMarkerId,
  onMarkerClick,
  labels,
}: LeafletMapProps) {
  const initialCenter = useMemo<LatLngExpression>(() => {
    return [center?.lat ?? 40.4168, center?.lon ?? -3.7038]; // Madrid por defecto
  }, [center?.lat, center?.lon]);

  const initialZoom = zoom ?? 13;
  const markerRefs = useRef<Record<string, LeafletMarker | null>>({});

  useEffect(() => {
    if (!selectedMarkerId) return;
    const m = markerRefs.current[selectedMarkerId];
    try {
      m?.openPopup();
    } catch {
      // ignore
    }
  }, [selectedMarkerId]);

  return (
    <div className={["h-full w-full", className].filter(Boolean).join(" ")}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="h-full w-full"
        zoomControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <RecenterOnChange center={center} zoom={zoom} />
        <PickOnClick onMapClick={onMapClick} />
        <RouteArrows routeSegments={routeSegments} />

        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lon]}
            icon={markerIcon(m.kind, m.label)}
            opacity={m.opacity ?? 1}
            ref={(ref) => {
              markerRefs.current[m.id] = (ref as unknown as LeafletMarker) ?? null;
            }}
            eventHandlers={{
              click: () => {
                onMarkerClick?.(m.id);
              },
            }}
          >
            <Popup closeButton>
              <div style={{ width: 240 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                  {m.name ?? (labels?.unnamed ?? "Unnamed")}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 9999,
                      background: m.kind === "hotel" ? "#f3e8ff" : "#fef3c7",
                      color: m.kind === "hotel" ? "#6b21a8" : "#92400e",
                      fontWeight: 700,
                    }}
                  >
                    {m.kind === "hotel"
                      ? (labels?.kindHotel ?? "Hotel")
                      : m.kind === "airport"
                        ? (labels?.kindAirport ?? "Airport")
                        : (labels?.kindAttraction ?? "Attraction")}
                  </span>
                  {m.label ? (
                    <span style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>{m.label}</span>
                  ) : null}
                </div>

                {m.imageDataUrl ? (
                  <img
                    src={m.imageDataUrl}
                    alt=""
                    style={{
                      width: "100%",
                      height: 120,
                      objectFit: "cover",
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.08)",
                      marginBottom: 8,
                    }}
                  />
                ) : null}

                {m.details?.length ? (
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.7)" }}>
                    {m.details.map((d) => (
                      <div key={d.k} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ color: "rgba(0,0,0,0.55)" }}>{d.k}</span>
                        <span style={{ fontWeight: 600 }}>{d.v}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {m.description ? (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: "rgba(0,0,0,0.7)",
                      lineHeight: 1.35,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.description}
                  </div>
                ) : null}
              </div>
            </Popup>
          </Marker>
        ))}

        {routeSegments?.length
          ? routeSegments.map((seg, idx) =>
              seg.coords.length >= 2 ? (
                <Polyline
                  key={idx}
                  positions={seg.coords.map((p) => [p.lat, p.lon] as LatLngExpression)}
                  pathOptions={{ color: seg.color, weight: 4, opacity: seg.opacity ?? 0.9 }}
                />
              ) : null,
            )
          : null}
      </MapContainer>
    </div>
  );
}

function RecenterOnChange({
  center,
  zoom,
}: {
  center?: { lat: number; lon: number };
  zoom?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!center) return;
    map.setView([center.lat, center.lon], zoom ?? map.getZoom(), {
      animate: true,
    });
  }, [center?.lat, center?.lon, zoom, map]);

  return null;
}

function PickOnClick({ onMapClick }: { onMapClick?: (picked: { lat: number; lon: number }) => void }) {
  useMapEvents({
    click(e) {
      if (!onMapClick) return;
      onMapClick({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });

  return null;
}

function RouteArrows({
  routeSegments,
}: {
  routeSegments?: Array<{ coords: Array<{ lat: number; lon: number }>; color: string; opacity?: number }>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!routeSegments?.length) return;
    let decoratorLayers: L.Layer[] = [];
    let cancelled = false;

    (async () => {
      // Plugin extends Leaflet at runtime.
      await import("leaflet-polylinedecorator");
      if (cancelled) return;

      decoratorLayers = routeSegments
        .filter((s) => s.coords.length >= 2)
        .map((seg) => {
          const opacity = seg.opacity ?? 0.9;
          const latlngs = seg.coords.map((p) => [p.lat, p.lon] as LatLngExpression);
          const poly = L.polyline(latlngs);
          // @ts-expect-error: plugin adds polylineDecorator to L at runtime
          const deco = L.polylineDecorator(poly, {
            patterns: [
              {
                offset: "12%",
                repeat: "120px",
                // @ts-expect-error: plugin adds Symbol to L at runtime
                symbol: L.Symbol.arrowHead({
                  pixelSize: 10,
                  polygon: true,
                  pathOptions: { color: seg.color, weight: 2, opacity },
                }),
              },
            ],
          });
          deco.addTo(map);
          return deco;
        });
    })();

    return () => {
      cancelled = true;
      for (const l of decoratorLayers) {
        try {
          map.removeLayer(l);
        } catch {
          // ignore
        }
      }
      decoratorLayers = [];
    };
  }, [map, routeSegments]);

  return null;
}


