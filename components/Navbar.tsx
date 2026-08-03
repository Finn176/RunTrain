"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Navbar({ userName }: { userName: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/plan/new", label: "New Plan" },
    { href: "/activities", label: "Activities" },
    { href: "/log", label: "Log" },
    { href: "/progress", label: "Progress" },
    { href: "/import", label: "Import Runs" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href={userName ? "/dashboard" : "/"} className="text-lg font-bold text-brand-700">
          RunTrain
        </Link>
        {userName && (
          <nav className="flex items-center gap-1 sm:gap-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  pathname?.startsWith(l.href)
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <button onClick={logout} className="ml-2 text-sm font-medium text-gray-500 hover:text-gray-800">
              Log out
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
