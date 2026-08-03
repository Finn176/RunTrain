import type { AdaptivePlanSummary } from "@/lib/adaptivePlan";
import { formatPace, type UnitPreference } from "@/lib/units";

const ACWR_LABELS: Record<string, string> = {
  unknown: "Not enough data yet",
  low: "Low",
  ok: "Healthy range",
  elevated: "Elevated",
  high: "High",
};

const ACWR_STYLES: Record<string, string> = {
  unknown: "bg-gray-100 text-gray-500",
  low: "bg-blue-100 text-blue-700",
  ok: "bg-brand-100 text-brand-700",
  elevated: "bg-orange-100 text-orange-700",
  high: "bg-red-100 text-red-700",
};

export default function AdaptiveInsights({ summary, unit }: { summary: AdaptivePlanSummary; unit: UnitPreference }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900">Adaptive Insights</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACWR_STYLES[summary.acwr.status]}`}>
          Training load: {ACWR_LABELS[summary.acwr.status]}
          {summary.acwr.ratio != null ? ` (${summary.acwr.ratio})` : ""}
        </span>
      </div>

      {summary.projectedFinishTime && (
        <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3">
          <p className="text-xs font-medium text-brand-700">Projected {summary.raceLabel} finish</p>
          <p className="text-2xl font-bold text-brand-800">{summary.projectedFinishTime}</p>
        </div>
      )}

      <div className="mb-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-gray-500">Recent completion</p>
          <p className="font-semibold text-gray-900">
            {summary.recentCompletionRate != null ? `${Math.round(summary.recentCompletionRate * 100)}%` : "-"}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Volume adjustment</p>
          <p className="font-semibold text-gray-900">
            {summary.volumeAdjustmentPercent === 0
              ? "None"
              : `${summary.volumeAdjustmentPercent > 0 ? "+" : ""}${summary.volumeAdjustmentPercent}% (next ${
                  summary.affectedWeekCount
                } wk${summary.affectedWeekCount === 1 ? "" : "s"})`}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Projected race pace</p>
          <p className="font-semibold text-gray-900">
            {summary.estimatedRacePaceMinPerKm ? formatPace(summary.estimatedRacePaceMinPerKm, unit) : "-"}
          </p>
        </div>
      </div>

      {summary.notes.length > 0 ? (
        <ul className="space-y-1.5 text-sm text-gray-600">
          {summary.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">
          Check back after you've logged a week or two of runs — insights need some real history to work from.
        </p>
      )}
    </div>
  );
}
