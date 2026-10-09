import type { ReactNode } from "react";
import { formatEuros } from "@/domain/money";
import { formatChange, formatMonthName } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  totalCents: number;
  changePercent: number | null;
  previousMonth: string;
  purchaseCount: number;
  averageBasketCents: number;
  promotionSavingsCents: number;
  priceSavingsCents: number;
};

function Tile({ title, children }: { title: string; children: ReactNode }) {
  const id = `tile-${title}`;
  return (
    <div role="group" aria-labelledby={id} className="receipt-edge grid content-start gap-1 rounded-md border bg-card p-4">
      <h2 id={id} className="font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Amount({ cents, className }: { cents: number; className?: string }) {
  return <p className={cn("font-mono text-2xl font-bold", className)}>{formatEuros(cents)}</p>;
}

function Detail({ label, cents }: { label: string; cents: number }) {
  return (
    <p className="flex justify-between text-sm text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono">{formatEuros(cents)}</span>
    </p>
  );
}

export function IndicatorTiles(props: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Tile title="Dépensé">
        <Amount cents={props.totalCents} />
        {props.changePercent !== null && (
          <p className="text-sm">
            <span className="font-mono">{formatChange(props.changePercent)}</span> vs {formatMonthName(props.previousMonth)}
          </p>
        )}
      </Tile>
      <Tile title="Courses">
        <p className="font-mono text-2xl font-bold">{props.purchaseCount}</p>
        <p className="text-sm text-muted-foreground">
          Panier moyen <span className="font-mono">{formatEuros(props.averageBasketCents)}</span>
        </p>
      </Tile>
      <Tile title="Économisé">
        <Amount cents={props.promotionSavingsCents + props.priceSavingsCents} className="text-savings" />
        <Detail label="Promotions" cents={props.promotionSavingsCents} />
        <Detail label="Prix le plus haut" cents={props.priceSavingsCents} />
      </Tile>
    </div>
  );
}
