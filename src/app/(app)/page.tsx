import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { EmptyState } from "@/components/common/empty-state";
import { IndicatorTiles } from "@/components/dashboard/indicator-tiles";
import { MonthSelector } from "@/components/dashboard/month-selector";
import { MonthlyChart } from "@/components/dashboard/monthly-chart";
import { StoreSpendBars } from "@/components/dashboard/store-spend";
import { TopProducts } from "@/components/dashboard/top-products";
import { Button } from "@/components/ui/button";
import { currentMonth, parseMonth } from "@/lib/months";
import { firstParam } from "@/lib/search-params";
import { loadDashboard } from "@/server/dashboard";

export const metadata: Metadata = { title: "Accueil" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HomePage({ searchParams }: Props) {
  const month = parseMonth(firstParam((await searchParams).month));
  const dashboard = await loadDashboard(month);

  return (
    <div className="grid gap-5">
      <MonthSelector month={month} current={currentMonth()} />
      {dashboard.purchaseCount === 0 ? (
        <EmptyState
          title="Aucune course ce mois-ci"
          description="Enregistre une course pour voir tes dépenses."
          action={
            <Button asChild>
              <Link href="/purchases/new">Enregistrer une course</Link>
            </Button>
          }
        />
      ) : (
        <>
          <IndicatorTiles
            totalCents={dashboard.totalCents}
            changePercent={dashboard.changePercent}
            previousMonth={dashboard.previousMonth}
            purchaseCount={dashboard.purchaseCount}
            averageBasketCents={dashboard.averageBasketCents}
            promotionSavingsCents={dashboard.promotionSavingsCents}
            priceSavingsCents={dashboard.priceSavingsCents}
          />
          <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
            <MonthlyChart months={dashboard.months} selected={month} />
            <div className="grid content-start gap-5">
              <TopProducts bySpend={dashboard.topBySpend} byQuantity={dashboard.topByQuantity} />
              <StoreSpendBars stores={dashboard.stores} />
            </div>
          </div>
        </>
      )}
      <LogoutButton className="justify-self-center lg:hidden" />
    </div>
  );
}
