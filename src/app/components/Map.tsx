import dynamic from "next/dynamic";
import type { LeafletMapProps, MapMarker } from "@/app/components/LeafletMap";

export type { MapMarker };

const LeafletMap = dynamic(
  () => import("@/app/components/LeafletMap").then((m) => m.LeafletMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-neutral-100" />,
  },
);

export function PlannerMap(props: LeafletMapProps) {
  return <LeafletMap {...props} />;
}


