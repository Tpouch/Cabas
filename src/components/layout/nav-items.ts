import { House, LayoutGrid, type LucideIcon, Store } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile: boolean };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Accueil", icon: House, mobile: true },
  { href: "/products", label: "Produits", icon: LayoutGrid, mobile: true },
  { href: "/stores", label: "Magasins", icon: Store, mobile: true },
];

export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
