import { RadarSkeleton } from "@/app/components/page-skeletons";

// The Radar's shape without its category bar, which /companies doesn't have.
export default function Loading() {
  return <RadarSkeleton chips={false} />;
}
