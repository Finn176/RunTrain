import PlanForm from "@/components/PlanForm";
import { getCurrentUserPrefs } from "@/lib/session";

export default async function NewPlanPage() {
  const prefs = await getCurrentUserPrefs();
  const unit = prefs?.unitPreference ?? "km";

  return (
    <div>
      <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">Create a training plan</h1>
      <p className="mb-6 text-center text-sm text-gray-500">
        Tell us about your goal race and current fitness, and we'll build a week-by-week plan.
      </p>
      <PlanForm unit={unit} />
    </div>
  );
}
