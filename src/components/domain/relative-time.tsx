"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, formatDateTime, formatRelativeTime } from "@/lib/utils";

interface RelativeTimeProps {
  /** Marca de tiempo que se quiere expresar de forma relativa. */
  value: Date | string;
  className?: string;
}

/**
 * Marca de tiempo relativa ("hace 5 minutos") segura para la hidratación.
 *
 * El texto relativo depende de `Date.now()`, que en el servidor y en el
 * navegador nunca coinciden exactamente: cuando el HTML servido tiene unos
 * segundos de antigüedad, React detecta un desajuste de hidratación y rehace
 * el subárbol. Para evitarlo, el primer render (servidor y cliente) muestra la
 * fecha absoluta, que es determinista, y una vez montado el componente se
 * sustituye por el texto relativo, que además se refresca cada minuto.
 */
export function RelativeTime({ value, className }: RelativeTimeProps) {
  // Se normaliza la entrada a texto para que la dependencia sea estable.
  const marca = typeof value === "string" ? value : value.toISOString();
  const fecha = useMemo(() => new Date(marca), [marca]);

  const [texto, setTexto] = useState(() => formatDate(fecha));
  const [fechaExacta, setFechaExacta] = useState<string>();

  useEffect(() => {
    const actualizar = () => setTexto(formatRelativeTime(fecha));
    actualizar();
    setFechaExacta(formatDateTime(fecha));

    const temporizador = window.setInterval(actualizar, 60_000);
    return () => window.clearInterval(temporizador);
  }, [fecha]);

  return (
    // `suppressHydrationWarning` cubre las diferencias de formato de fecha
    // entre el ICU de Node y el del navegador.
    <span className={className} title={fechaExacta} suppressHydrationWarning>
      {texto}
    </span>
  );
}
