import type { Metadata } from "next";
import { StoreList } from "@/components/stores/store-list";
import { listStores } from "@/server/repositories/stores";

export const metadata: Metadata = { title: "Magasins" };

export default async function StoresPage() {
  return <StoreList stores={await listStores()} />;
}
