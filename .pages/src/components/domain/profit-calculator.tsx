"use client";

import { useMemo, useState } from "react";
import { Calculator, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrencyPrecise, formatPercent } from "@/lib/utils";

interface ProfitCalculatorProps {
  costPrice: number;
  sellPrice: number;
  className?: string;
}

/**
 * Calculadora interactiva de ganancias.
 *
 * Calcula en vivo el beneficio neto por unidad descontando el CPA (coste
 * publicitario por venta), el ROAS de equilibrio y la proyección mensual según
 * el volumen de ventas estimado y la tasa de conversión.
 */
export function ProfitCalculator({ costPrice, sellPrice, className }: ProfitCalculatorProps) {
  const [coste, setCoste] = useState(costPrice);
  const [precio, setPrecio] = useState(sellPrice);
  const [cpa, setCpa] = useState<number[]>([Math.max(4, Math.round(sellPrice * 0.28))]);
  const [unidadesDia, setUnidadesDia] = useState<number[]>([10]);
  const [tasaDevolucion, setTasaDevolucion] = useState<number[]>([3]);

  /** Cálculos derivados del estado del formulario. */
  const calculo = useMemo(() => {
    const cpaValor = cpa[0];
    const devoluciones = (tasaDevolucion[0] / 100) * coste; // coste logístico de cada devolución
    const beneficioBruto = precio - coste;
    const beneficioNeto = precio - coste - cpaValor - devoluciones;
    const margenNeto = precio > 0 ? (beneficioNeto / precio) * 100 : 0;
    const roasEquilibrio = cpaValor > 0 && beneficioBruto > 0 ? precio / (beneficioBruto - devoluciones) : 0;
    const roasActual = cpaValor > 0 ? precio / cpaValor : 0;
    const ventasMes = unidadesDia[0] * 30;
    const beneficioMes = beneficioNeto * ventasMes;
    const facturacionMes = precio * ventasMes;

    return {
      cpaValor,
      beneficioBruto,
      beneficioNeto,
      margenNeto,
      roasEquilibrio,
      roasActual,
      ventasMes,
      beneficioMes,
      facturacionMes,
      rentable: beneficioNeto > 0 && roasActual >= roasEquilibrio,
    };
  }, [coste, precio, cpa, unidadesDia, tasaDevolucion]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="size-4 text-indigo-400" />
          Calculadora de ganancia
        </CardTitle>
        <CardDescription>
          Ajusta el CPA y el volumen de ventas para ver el beneficio real descontando publicidad y devoluciones.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Entradas numéricas */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="calc-coste">Coste por unidad</Label>
            <Input
              id="calc-coste"
              type="number"
              min={0}
              step={0.5}
              value={coste}
              onChange={(evento) => setCoste(Number(evento.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calc-precio">Precio de venta</Label>
            <Input
              id="calc-precio"
              type="number"
              min={0}
              step={0.5}
              value={precio}
              onChange={(evento) => setPrecio(Number(evento.target.value))}
            />
          </div>
        </div>

        {/* CPA */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>CPA (coste publicitario por venta)</Label>
            <span className="text-xs font-semibold text-amber-300 tabular-nums">{formatCurrencyPrecise(calculo.cpaValor)}</span>
          </div>
          <Slider value={cpa} min={0} max={Math.max(40, Math.round(precio * 0.9))} step={0.5} onValueChange={setCpa} />
        </div>

        {/* Volumen */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Ventas por día</Label>
            <span className="text-xs font-semibold text-indigo-300 tabular-nums">{unidadesDia[0]} / día</span>
          </div>
          <Slider value={unidadesDia} min={1} max={120} step={1} onValueChange={setUnidadesDia} />
        </div>

        {/* Devoluciones */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Tasa de devoluciones</Label>
            <span className="text-xs font-semibold text-rose-300 tabular-nums">{tasaDevolucion[0]} %</span>
          </div>
          <Slider value={tasaDevolucion} min={0} max={20} step={1} onValueChange={setTasaDevolucion} />
        </div>

        {/* Resultado */}
        <div className="space-y-3 rounded-xl border border-border/60 bg-surface/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Beneficio neto por venta</span>
            <span
              className={cn(
                "text-lg font-bold tabular-nums",
                calculo.beneficioNeto >= 0 ? "text-emerald-400" : "text-rose-400",
              )}
            >
              {formatCurrencyPrecise(calculo.beneficioNeto)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Margen neto</span>
            <span className="font-semibold tabular-nums">{formatPercent(calculo.margenNeto)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Beneficio bruto (sin publicidad)</span>
            <span className="font-semibold tabular-nums">{formatCurrencyPrecise(calculo.beneficioBruto)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">ROAS actual vs. equilibrio</span>
            <span className="flex items-center gap-1.5 font-semibold tabular-nums">
              {calculo.roasActual.toFixed(2)}
              <span className="text-muted-foreground">/ {calculo.roasEquilibrio.toFixed(2)}</span>
              {calculo.roasActual >= calculo.roasEquilibrio ? (
                <TrendingUp className="size-3.5 text-emerald-400" />
              ) : (
                <TrendingDown className="size-3.5 text-rose-400" />
              )}
            </span>
          </div>

          <div className="border-t border-border/60 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Proyección mensual ({calculo.ventasMes} ventas)</span>
              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  calculo.beneficioMes >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {formatCurrencyPrecise(calculo.beneficioMes)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Facturación bruta</span>
              <span className="tabular-nums">{formatCurrencyPrecise(calculo.facturacionMes)}</span>
            </div>
          </div>

          <Badge variant={calculo.rentable ? "success" : "danger"} className="w-full justify-center">
            {calculo.rentable ? "Configuración rentable" : "Revisa el CPA: pérdidas por venta"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
