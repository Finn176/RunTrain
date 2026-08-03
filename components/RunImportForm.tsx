"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Source = "strava" | "garmin";
type GarminUnit = "" | "km" | "mi";

interface ImportResult {
  imported: number;
  updated: number;
  skippedNonRun: number;
  skippedInvalid: number;
  totalRows: number;
}

export default function RunImportForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>("strava");
  const [garminUnit, setGarminUnit] = useState<GarminUnit>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const garminUnitRequired = source === "garmin" && !garminUnit;

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (garminUnitRequired) {
      setError("Choose your Garmin distance unit above before uploading.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setFileName(file.name);
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const csv = await file.text();
      const url = source === "strava" ? "/api/imports/strava" : "/api/imports/garmin";
      const body =
        source === "strava" ? { csv } : { csv, distanceUnit: garminUnit };
      const data = await apiFetch<ImportResult>(url, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong reading that file");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="card mx-auto max-w-xl p-6">
      <h2 className="font-semibold text-gray-900">Or upload a CSV file</h2>
      <p className="mt-1 text-sm text-gray-500">
        A one-time file upload — use this for Garmin, or for Strava if you'd rather not connect your account above.
      </p>

      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">Source</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSource("strava")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              source === "strava" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-gray-300 text-gray-600"
            }`}
          >
            Strava
          </button>
          <button
            type="button"
            onClick={() => setSource("garmin")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              source === "garmin" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-gray-300 text-gray-600"
            }`}
          >
            Garmin Connect
          </button>
        </div>
      </div>

      {source === "strava" ? (
        <p className="mt-4 text-sm text-gray-600">
          On strava.com, go to Settings &rarr; My Account &rarr; Download or Delete Your Account &rarr; Request Your
          Archive. Once it's ready, unzip it and upload the{" "}
          <code className="rounded bg-gray-100 px-1">activities.csv</code> file from inside it here.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-gray-600">
            On connect.garmin.com, go to Activities &rarr; scroll to load your full history &rarr; click "Export CSV"
            at the bottom of the list. Upload the downloaded file here.
          </p>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Distance unit in your Garmin export
            </label>
            <select
              className="input"
              value={garminUnit}
              onChange={(e) => setGarminUnit(e.target.value as GarminUnit)}
            >
              <option value="">Choose one&hellip;</option>
              <option value="km">Kilometers</option>
              <option value="mi">Miles</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Garmin exports distance in whatever unit your account displays, with no way to auto-detect it. Not
              sure which? Check a long run or race in the file: if it shows ~26.2 for a marathon, that's miles; if
              ~42.2, that's km.
            </p>
          </div>
        </>
      )}

      <label
        className={`btn mt-4 inline-flex ${garminUnitRequired ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      >
        {loading ? "Importing..." : "Choose CSV file"}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onFileChange}
          disabled={loading || garminUnitRequired}
        />
      </label>
      {fileName && !loading && <p className="mt-2 text-xs text-gray-500">Last file: {fileName}</p>}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-4 rounded-lg bg-brand-50 p-4 text-sm text-brand-800">
          <p className="font-medium">
            Imported {result.imported} new run{result.imported === 1 ? "" : "s"}
            {result.updated > 0 ? `, updated ${result.updated}` : ""}.
          </p>
          <p className="mt-1 text-brand-700">
            {result.totalRows} rows in file &middot; {result.skippedNonRun} non-running activities skipped
            {result.skippedInvalid > 0 ? ` · ${result.skippedInvalid} rows couldn't be read` : ""}.
          </p>
        </div>
      )}
    </div>
  );
}
