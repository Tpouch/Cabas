import { House, LayoutGrid, type LucideIcon, ReceiptText, Store } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Accueil", icon: House, mobile: true },
  { href: "/purchases", label: "Courses", icon: ReceiptText, mobile: true },
  { href: "/products", label: "Produits", icon: LayoutGrid, mobile: true },
  { href: "/stores", label: "Magasins", icon: Store, mobile: true },
];

export const NEW_PURCHASE_HREF = "/purchases/new";

/** The purchase form has its own fixed save bar. */
export function hidesMobileBar(pathname: string): boolean {
  return pathname === NEW_PURCHASE_HREF || /^\/purchases\/[^/]+\/edit$/.test(pathname);
}

export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
