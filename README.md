## Trip Planner

Free app to **search places (OSM/Nominatim)**, add them to a map, and compute **road routes (OSRM)** between points.

### What it uses (free)
- **Autocomplete / geocoding**: Nominatim (OpenStreetMap) via `/api/nominatim`
- **Routing**: public OSRM (`router.project-osrm.org`) via `/api/osrm/route`
- **Duration matrix** (for “Optimize order”): OSRM `table` via `/api/osrm/table`
- **Map**: Leaflet + standard OpenStreetMap tiles
- **Persistence**: LocalStorage (no login) + JSON export/import

## Getting Started

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Quick usage
- Search for a place in the left panel and select it to **add it**.
- Edit the place **duration (min)**.
- The route is automatically recomputed (debounced) via OSRM and drawn on the map.
- “Optimize order” reorders points using OSRM `table` + a hybrid TSP solver (exact for small N, heuristic for larger N).
- Export/import with the buttons.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Deploy on Vercel

### Free deploy (Vercel)
1. Push this repo to GitHub.
2. In Vercel: “New Project” → import the repo.
3. Framework: Next.js (auto-detected). Build command: `npm run build`. Output: (auto).
4. Deploy.

You don’t need any environment variables for the MVP.

