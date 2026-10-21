"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyPrecise, formatShortDay } from "@/lib/utils";

interface Punto {
  fecha: string;
  [producto: string]: string | number;
}

interface PrecioHistoricoChartProps {
  /** Una serie por producto: [{ fecha, "Producto A": 19.99, … }] */
  data: Punto[];
  height?: number;
}

const COLORES = ["#818cf8", "#34d399", "#fbbf24", "#f472b6", "#38bdf8"];

/** Tooltip con precios formateados. */
function TooltipPrecios({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/80 bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1 font-medium">{label ? formatShortDay(label) : ""}</p>
      {payload.map((entrada) => (
        <p key={entrada.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: entrada.color }} />
          <span className="max-w-40 truncate">{entrada.name}</span>
          <span className="font-semibold text-foreground tabular-nums">
            {formatCurrencyPrecise(entrada.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * Evolución del precio de los productos de una tienda
 * a lo largo de los análisis (datos REALES de PriceHistory).
 */
export function PrecioHistoricoChart({ data, height = 300 }: PrecioHistoricoChartProps) {
  if (data.length === 0) return null;
  const nombres = Object.keys(data[0]).filter((clave) => clave !== "fecha");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolución de precios</CardTitle>
        <CardDescription>
          Precio real detectado en cada análisis de esta tienda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
              <XAxis
                dataKey="fecha"
                tickFormatter={(valor: string) => formatShortDay(valor)}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                // Etiqueta corta («24 €»): con el formato completo y el eje
                // estrecho se recortaban los dígitos iniciales.
                tickFormatter={(valor: number) =>
                  `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(valor)} €`
                }
                domain={["auto", "auto"]}
                width={56}
              />
              <Tooltip content={<TooltipPrecios />} />
              {nombres.map((nombre, indice) => (
                <Line
                  key={nombre}
                  type="monotone"
                  dataKey={nombre}
                  name={nombre}
                  stroke={COLORES[indice % COLORES.length]}
                  strokeWidth={2.2}
                  dot={{ r: 2.5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
