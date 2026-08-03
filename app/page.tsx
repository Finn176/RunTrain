import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";

export default async function HomePage() {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl py-12 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight text-brand-700">RunTrain</h1>
      <p className="mt-4 text-lg text-gray-600">
        Personalized running training plans, run logging, and progress tracking &mdash; built for you and your
        running crew.
      </p>
      <div className="mt-8 flex justify-center gap-4">
        <Link href="/signup" className="btn">
          Get started
        </Link>
        <Link href="/login" className="btn-secondary">
          Log in
        </Link>
      </div>
    </div>
  );
}
