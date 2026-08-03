"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeletePlanButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (!confirm("Delete this plan and its weekly schedule? This can't be undone. Runs you've already logged will be kept in your progress history, just unlinked from this plan.")) return;
    setLoading(true);
    try {
      await fetch(`/api/plans/${planId}`, { method: "DELETE" });
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={onDelete} disabled={loading} className="text-sm font-medium text-red-500 hover:text-red-700">
      {loading ? "Deleting..." : "Delete plan"}
    </button>
  );
}
