export type PlaceKind = "place" | "hotel" | "airport";

export type Place = {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  kind: PlaceKind;
  durationMin: number; // estimated visit duration
  durationUnit?: "min" | "h"; // editing preference (UI)
  priority: number; // 1 (baja) - 5 (alta)
  imageDataUrl?: string; // user-uploaded image (data URL)
};


