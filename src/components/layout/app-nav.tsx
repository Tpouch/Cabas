"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { hidesMobileBar, isActive, NAV_ITEMS, NEW_PURCHASE_HREF, type NavItem } from "./nav-items";

function MobileLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(item.href, pathname);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground",
        active && "font-bold text-primary",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {item.label}
    </Link>
  );
}

export function AppNav() {
  const pathname = usePathname();
  const mobileItems = NAV_ITEMS.filter((item) => item.mobile);
  const middle = Math.ceil(mobileItems.length / 2);

  return (
    <>
      {!hidesMobileBar(pathname) && (
        <nav
          aria-label="Navigation principale"
          className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-around border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {mobileItems.slice(0, middle).map((item) => (
            <MobileLink key={item.href} item={item} pathname={pathname} />
          ))}
          <Link
            href={NEW_PURCHASE_HREF}
            aria-label="Nouvelle course"
            className="-mt-5 grid size-14 place-items-center self-start rounded-2xl bg-primary text-primary-foreground shadow-lg active:scale-95"
          >
            <Plus className="size-6" aria-hidden />
          </Link>
          {mobileItems.slice(middle).map((item) => (
            <MobileLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
      )}

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col gap-1 border-r bg-card px-3 py-4 lg:flex">
        <Link href="/" className="px-2 pb-4 font-serif text-2xl font-bold">
          cabas
        </Link>
        <Link
          href={NEW_PURCHASE_HREF}
          className="mb-3 flex h-10 items-center justify-center gap-2 rounded-md bg-primary font-semibold text-primary-foreground"
        >
          <Plus className="size-4" aria-hidden />
          Nouvelle course
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
