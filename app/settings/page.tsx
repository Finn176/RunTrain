import { redirect } from "next/navigation";
import { getCurrentUserPrefs } from "@/lib/session";
import PreferencesForm from "@/components/PreferencesForm";

export default async function SettingsPage() {
  const prefs = await getCurrentUserPrefs();
  if (!prefs) redirect("/login");

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Settings</h1>
      <p className="mb-6 text-sm text-gray-500">
        These preferences are just for you — everyone in your group can set their own.
      </p>
      <PreferencesForm
        initial={{
          unitPreference: prefs.unitPreference,
          dateOfBirth: prefs.dateOfBirth ? prefs.dateOfBirth.toISOString().slice(0, 10) : "",
          sex: prefs.sex,
        }}
      />
    </div>
  );
}
