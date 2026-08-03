import { Suspense } from "react";
import RunImportForm from "@/components/RunImportForm";
import StravaConnectCard from "@/components/StravaConnectCard";

export default function ImportPage() {
  return (
    <div>
      <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">Import run history</h1>
      <p className="mb-6 text-center text-sm text-gray-500">
        Bring in your past runs from Strava or Garmin Connect so new plans are built around your real training, not
        guesswork.
      </p>
      {/* useSearchParams (to detect the post-connect redirect) requires a
          Suspense boundary in the App Router. */}
      <Suspense fallback={null}>
        <StravaConnectCard />
      </Suspense>
      <RunImportForm />
    </div>
  );
}
