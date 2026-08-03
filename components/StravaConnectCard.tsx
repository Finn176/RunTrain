"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface StravaStatus {
  connected: boolean;
  lastSyncAt: string | null;
}

interface SyncResult {
  imported: number;
  updated: number;
  error: string | null;
  reauthRequired: boolean;
}

function formatLastSync(iso: string | null): string {
  if (!iso) return "Never synced yet";
  const date = new Date(iso);
  return `Last synced ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${date.toLocaleTimeString(
    undefined,
    { hour: "numeric", minute: "2-digit" }
  )}`;
}

export default function StravaConnectCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<StravaStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectedParam = searchParams.get("stravaConnected");
  const errorParam = searchParams.get("stravaError");

  useEffect(() => {
    fetch("/api/strava/status")
      .then((r) => r.json())
      .then((data: StravaStatus) => setStatus(data))
      .catch(() => setStatus({ connected: false, lastSyncAt: null }));
  }, []);

  useEffect(() => {
    if (connectedParam) {
      setMessage("Strava connected! Your run history will sync automatically from now on.");
      // Trigger an immediate first sync rather than waiting for the next
      // dashboard visit's throttle window.
      apiFetch<SyncResult>("/api/strava/sync", { method: "POST" })
        .then((result) => {
          setMessage(
            `Strava connected — imported ${result.imported} run${result.imported === 1 ? "" : "s"}${
              result.updated > 0 ? `, updated ${result.updated}` : ""
            }.`
          );
          setStatus((s) => (s ? { ...s, connected: true, lastSyncAt: new Date().toISOString() } : s));
          router.refresh();
        })
        .catch(() => {
          // The connection itself succeeded even if this first sync attempt
          // didn't — the next dashboard visit or a manual "Sync now" click
          // will retry.
        });
    }
    if (errorParam) setError(errorParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedParam, errorParam]);

  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      const result = await apiFetch<SyncResult>("/api/strava/sync", { method: "POST" });
      if (result.reauthRequired) {
        setError("Strava access needs to be reconnected — click Connect Strava again.");
        setStatus((s) => (s ? { ...s, connected: false } : s));
      } else {
        setMessage(
          `Synced — imported ${result.imported} new run${result.imported === 1 ? "" : "s"}${
            result.updated > 0 ? `, updated ${result.updated}` : ""
          }.`
        );
        setStatus((s) => (s ? { ...s, lastSyncAt: new Date().toISOString() } : s));
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      await apiFetch("/api/strava/disconnect", { method: "POST" });
      setStatus({ connected: false, lastSyncAt: null });
      setMessage("Strava disconnected. Runs already synced stay in your history.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="card mx-auto mb-6 max-w-xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Strava (automatic)</h2>
          <p className="mt-1 text-sm text-gray-600">
            {status?.connected
              ? formatLastSync(status.lastSyncAt)
              : "Connect once and your runs sync automatically every time you visit — no more CSV exports."}
          </p>
        </div>

        {status?.connected ? (
          <div className="flex gap-2">
            <button onClick={syncNow} disabled={syncing} className="btn-secondary text-sm">
              {syncing ? "Syncing..." : "Sync now"}
            </button>
            <button onClick={disconnect} disabled={disconnecting} className="text-sm font-medium text-gray-500 hover:text-gray-800">
              {disconnecting ? "..." : "Disconnect"}
            </button>
          </div>
        ) : (
          <a href="/api/strava/connect" className="btn text-sm">
            Connect Strava
          </a>
        )}
      </div>

      {message && <p className="mt-3 text-sm text-brand-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
