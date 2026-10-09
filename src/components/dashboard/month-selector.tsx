import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatMonthLabel } from "@/lib/format";
import { nextMonth, previousMonth } from "@/lib/months";
import { cn } from "@/lib/utils";

const control = "grid size-11 place-items-center rounded-md border bg-card";

export function MonthSelector({ month, current }: { month: string; current: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link href={`/?month=${previousMonth(month)}`} aria-label="Mois précédent" className={control}>
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <h1 className="text-2xl">{formatMonthLabel(month)}</h1>
      {month < current ? (
        <Link href={`/?month=${nextMonth(month)}`} aria-label="Mois suivant" className={control}>
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      ) : (
        <button type="button" disabled aria-label="Mois suivant" className={cn(control, "opacity-40")}>
          <ChevronRight className="size-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
