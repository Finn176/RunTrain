import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "RunTrain",
  description: "Personal running training plans, tracking, and progress.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  return (
    <html lang="en">
      <body>
        <Navbar userName={session?.name ?? null} />
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
