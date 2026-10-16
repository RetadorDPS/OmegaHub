"use client";

import { useMemo } from "react";

interface TrendSparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  /** Color del trazo (por defecto, degradado de marca). */
  stroke?: string;
  showArea?: boolean;
}

/** Mini-gráfica SVG de la evolución del score (sin dependencias de Recharts). */
export function TrendSparkline({
  values,
  width = 96,
  height = 32,
  className,
  stroke = "#818cf8",
  showArea = true,
}: TrendSparklineProps) {
  const { trazo, area, idGradiente } = useMemo(() => {
    if (values.length < 2) {
      return { trazo: "", area: "", idGradiente: `spark-${Math.random().toString(36).slice(2, 8)}` };
    }
    const maximo = Math.max(...values);
    const minimo = Math.min(...values);
    const rango = maximo - minimo || 1;
    const puntos = values.map((valor, indice) => {
      const x = (indice / (values.length - 1)) * width;
      const y = height - ((valor - minimo) / rango) * (height - 4) - 2;
      return [x, y] as const;
    });
    const linea = puntos.map(([x, y], indice) => `${indice === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const relleno = `${linea} L${width},${height} L0,${height} Z`;
    return {
      trazo: linea,
      area: relleno,
      idGradiente: `spark-${values.length}-${Math.round(minimo)}-${Math.round(maximo)}`,
    };
  }, [values, width, height]);

  if (values.length < 2) {
    return <div className={className} style={{ width, height }} aria-hidden />;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label="Evolución de la tendencia"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showArea && <path d={area} fill={`url(#${idGradiente})`} />}
      <path d={trazo} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
