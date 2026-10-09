"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, type BarShapeProps, Rectangle, ResponsiveContainer, XAxis } from "recharts";
import { formatEuros } from "@/domain/money";
import type { MonthTotal } from "@/domain/statistics";
import { formatMonthLabel, formatShortMonth } from "@/lib/format";

export function MonthlyChart({ months, selected }: { months: MonthTotal[]; selected: string }) {
  const router = useRouter();
  const data = months.map((month) => ({ ...month, label: formatShortMonth(month.month) }));

  return (
    <section aria-labelledby="monthly-chart-title" className="grid gap-3 rounded-md border bg-card p-4">
      <h2 id="monthly-chart-title" className="text-lg">
        12 derniers mois
      </h2>
      {/* The table below carries the same data for screen readers and keyboard users. */}
      <div aria-hidden className="h-56">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 224 }}>
          <BarChart data={data} accessibilityLayer={false} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} fontSize={11} />
            <Bar
              dataKey="totalCents"
              radius={[3, 3, 0, 0]}
              minPointSize={2}
              cursor="pointer"
              shape={(props: BarShapeProps) => (
                <Rectangle {...props} fill={months[props.index]?.month === selected ? "var(--primary)" : "var(--chart-2)"} />
              )}
              onClick={(_entry, index) => {
                const target = months[index];
                if (target) router.push(`/?month=${target.month}`);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Dépenses des 12 derniers mois</caption>
        <thead>
          <tr>
            <th scope="col">Mois</th>
            <th scope="col">Dépensé</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.month}>
              <th scope="row">{formatMonthLabel(month.month)}</th>
              <td>{formatEuros(month.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
