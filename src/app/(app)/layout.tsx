import type { ReactNode } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { requirePageSession } from "@/server/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requirePageSession();
  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-24 lg:pr-8 lg:pb-10 lg:pl-[calc(15rem+2rem)]">
        {children}
      </main>
    </>
  );
}
