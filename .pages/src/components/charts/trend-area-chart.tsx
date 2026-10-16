"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompactNumber, formatShortDay } from "@/lib/utils";

interface TrendAreaChartProps {
  data: Array<{ date: string; score: number; google?: number; tiktok?: number; meta?: number }>;
  title?: string;
  description?: string;
  height?: number;
}

/** Tooltip oscuro personalizado con formato español. */
function TooltipPersonalizado({ active, payload, label }: {
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
          <span>{entrada.name}:</span>
          <span className="font-semibold text-foreground tabular-nums">
            {entrada.name.includes("Score") ? entrada.value : formatCompactNumber(entrada.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * Gráfica principal de evolución de tendencia (Recharts).
 * Muestra el score medio del catálogo y, opcionalmente, las señales por fuente.
 */
export function TrendAreaChart({ data, title = "Evolución de la tendencia", description, height = 300 }: TrendAreaChartProps) {
  const datos = data.map((punto) => ({ ...punto, fecha: punto.date }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={datos} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="gradienteScore" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradienteGoogle" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis
              dataKey="fecha"
              tickFormatter={(valor: string) => formatShortDay(valor)}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<TooltipPersonalizado />} />
            <Area
              type="monotone"
              dataKey="score"
              name="TrendScore medio"
              stroke="#818cf8"
              strokeWidth={2.2}
              fill="url(#gradienteScore)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface ProductTrendChartProps {
  data: Array<{ date: string; calculatedScore: number; googleSearchVolume: number; tiktokViews: number; metaAdsCount: number }>;
  height?: number;
}

/**
 * Gráfica de detalle de producto: evolución del score y de las señales de
 * demanda (Google, TikTok y anuncios en Meta) en los últimos 30 días.
 */
export function ProductTrendChart({ data, height = 320 }: ProductTrendChartProps) {
  const datos = data.map((punto) => ({
    fecha: punto.date,
    score: punto.calculatedScore,
    google: punto.googleSearchVolume,
    tiktok: punto.tiktokViews,
    meta: punto.metaAdsCount,
  }));

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={datos} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gradienteDetalle" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
          <XAxis
            dataKey="fecha"
            tickFormatter={(valor: string) => formatShortDay(valor)}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={{ stroke: "rgba(148,163,184,0.2)" }}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis yAxisId="score" domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="demanda" orientation="right" hide />
          <Tooltip content={<TooltipPersonalizado />} />
          <Area
            yAxisId="score"
            type="monotone"
            dataKey="score"
            name="TrendScore"
            stroke="#a78bfa"
            strokeWidth={2.4}
            fill="url(#gradienteDetalle)"
          />
          <Line yAxisId="demanda" type="monotone" dataKey="google" name="Google" stroke="#34d399" strokeWidth={1.6} dot={false} />
          <Line yAxisId="demanda" type="monotone" dataKey="tiktok" name="TikTok" stroke="#f472b6" strokeWidth={1.6} dot={false} />
          <Line yAxisId="demanda" type="monotone" dataKey="meta" name="Meta Ads" stroke="#fbbf24" strokeWidth={1.6} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface CategoryBarChartProps {
  data: Array<{ categoria: string; cantidad: number; scoreMedio: number }>;
  height?: number;
}

/** Distribución del catálogo por categoría (barras agrupadas). */
export function CategoryBarChart({ data, height = 280 }: CategoryBarChartProps) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barGap={6}>
          <defs>
            <linearGradient id="gradienteProductos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.55} />
            </linearGradient>
            <linearGradient id="gradienteScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.5} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
          <XAxis dataKey="categoria" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<TooltipPersonalizado />} cursor={{ fill: "rgba(148,163,184,0.06)" }} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
          <Bar dataKey="cantidad" name="Productos" fill="url(#gradienteProductos)" radius={[6, 6, 0, 0]} maxBarSize={38} />
          <Bar dataKey="scoreMedio" name="Score medio" fill="url(#gradienteScore)" radius={[6, 6, 0, 0]} maxBarSize={38} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
