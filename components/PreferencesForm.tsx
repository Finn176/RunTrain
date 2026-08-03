"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { UnitPreference } from "@/lib/units";

export interface PreferencesInitial {
  unitPreference: UnitPreference;
  dateOfBirth: string; // "" or "YYYY-MM-DD"
  sex: string | null;
}

const SEX_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Prefer not to say" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
];

export default function PreferencesForm({ initial }: { initial: PreferencesInitial }) {
  const router = useRouter();
  const [unitPreference, setUnitPreference] = useState<UnitPreference>(initial.unitPreference);
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth);
  const [sex, setSex] = useState(initial.sex ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setLoading(true);
    try {
      await apiFetch("/api/user/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          unitPreference,
          dateOfBirth: dateOfBirth || null,
          sex: sex === "" ? null : sex,
        }),
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Units</label>
        <div className="flex gap-2">
          {(["km", "mi"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnitPreference(u)}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                unitPreference === u
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {u === "km" ? "Kilometers" : "Miles"}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Every distance, pace, and elevation across the app will show in this unit.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Date of birth</label>
        <input
          type="date"
          className="input"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-500">Optional. Not shown to anyone else.</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Sex</label>
        <select className="input" value={sex} onChange={(e) => setSex(e.target.value)}>
          {SEX_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">Optional. Not shown to anyone else.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm font-medium text-brand-700">Saved.</p>}

      <button type="submit" className="btn w-full" disabled={loading}>
        {loading ? "Saving..." : "Save preferences"}
      </button>
    </form>
  );
}
