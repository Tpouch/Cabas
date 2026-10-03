"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, NAV_ITEMS } from "./nav-items";

export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-around border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {NAV_ITEMS.filter((item) => item.mobile).map(({ href, label, icon: Icon }) => {
          const active = isActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-16 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground",
                active && "font-bold text-primary",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col gap-1 border-r bg-card px-3 py-4 lg:flex">
        <Link href="/" className="px-2 pb-4 font-serif text-2xl font-bold">
          cabas
        </Link>
        <nav aria-label="Menu" className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 font-medium text-muted-foreground hover:bg-secondary",
                  active && "bg-secondary font-bold text-primary",
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
