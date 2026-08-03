"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteRunButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (!confirm("Delete this activity? This can't be undone.")) return;
    setLoading(true);
    try {
      await fetch(`/api/runs/${runId}`, { method: "DELETE" });
      router.push("/activities");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={onDelete} disabled={loading} className="text-sm font-medium text-red-500 hover:text-red-700">
      {loading ? "Deleting..." : "Delete activity"}
    </button>
  );
}
