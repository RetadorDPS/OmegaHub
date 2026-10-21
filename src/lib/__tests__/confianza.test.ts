import { describe, expect, it } from "vitest";
import {
  direccionSenal,
  etiquetaOportunidad,
  evaluarConfianza,
  puedeSerDorada,
  resumenFuentes,
  tipoDatoDeFila,
  type ObservacionFuente,
} from "@/lib/confianza";

/**
 * Reglas de confianza del dato.
 *
 * Lo que se protege con estas pruebas: que una estimación nunca se presente
 * como medición, que dos fuentes recientes y de acuerdo verifiquen un producto
 * y que las fuentes que se contradicen no lo hagan.
 */

const AHORA = new Date("2026-05-20T12:00:00.000Z");
const haceDias = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString();

function observacion(parcial: Partial<ObservacionFuente> & Pick<ObservacionFuente, "fuente">): ObservacionFuente {
  return {
    tipo: "MEDIDO",
    fecha: haceDias(0),
    valor: 1000,
    previo: 800,
    ...parcial,
  };
}

describe("Confianza · niveles", () => {
  it("sin observaciones no hay datos", () => {
    const resultado = evaluarConfianza([], AHORA);
    expect(resultado.nivel).toBe("SIN_DATOS");
    expect(resultado.puntos).toBe(0);
    expect(resultado.motivos[0]).toMatch(/ninguna observación/i);
  });

  it("un catálogo solo con estimaciones se queda en ESTIMADO y con 0 puntos", () => {
    const resultado = evaluarConfianza(
      [
        observacion({ fuente: "google", tipo: "ESTIMADO" }),
        observacion({ fuente: "tiktok", tipo: "ESTIMADO" }),
        observacion({ fuente: "tiendas", tipo: "ESTIMADO" }),
      ],
      AHORA,
    );
    expect(resultado.nivel).toBe("ESTIMADO");
    expect(resultado.puntos).toBe(0);
    expect(resultado.fuentesMedidas).toBe(0);
    expect(resultado.motivos.join(" ")).toMatch(/cálculos internos/i);
  });

  it("una sola fuente medida no basta: PARCIAL", () => {
    const resultado = evaluarConfianza([observacion({ fuente: "youtube" })], AHORA);
    expect(resultado.nivel).toBe("PARCIAL");
    expect(resultado.fuentesMedidas).toBe(1);
    expect(resultado.motivos.join(" ")).toMatch(/otra independiente/i);
  });

  it("dos fuentes medidas hoy y de acuerdo: VERIFICADO", () => {
    const resultado = evaluarConfianza(
      [
        observacion({ fuente: "google", valor: 1200, previo: 900 }),
        observacion({ fuente: "tiendas", valor: 40, previo: 30 }),
      ],
      AHORA,
    );
    expect(resultado.nivel).toBe("VERIFICADO");
    expect(resultado.puntos).toBeGreaterThanOrEqual(60);
    expect(resultado.diasDesdeUltima).toBe(0);
    expect(resultado.motivos.join(" ")).toMatch(/confirmado por 2 fuentes/i);
  });

  it("tres fuentes de tres familias puntúan más que dos", () => {
    const dos = evaluarConfianza(
      [observacion({ fuente: "google" }), observacion({ fuente: "tiendas" })],
      AHORA,
    );
    const tres = evaluarConfianza(
      [observacion({ fuente: "google" }), observacion({ fuente: "tiendas" }), observacion({ fuente: "meta" })],
      AHORA,
    );
    expect(tres.puntos).toBeGreaterThan(dos.puntos);
    expect(tres.familiasMedidas).toBe(3);
  });

  it("dos fuentes que se contradicen no verifican", () => {
    const resultado = evaluarConfianza(
      [
        observacion({ fuente: "google", valor: 1500, previo: 900 }), // sube
        observacion({ fuente: "tiktok", valor: 600, previo: 1200 }), // baja
      ],
      AHORA,
    );
    expect(resultado.nivel).toBe("PARCIAL");
    expect(resultado.motivos.join(" ")).toMatch(/se contradicen/i);
  });

  it("una medición antigua pierde la verificación", () => {
    const resultado = evaluarConfianza(
      [
        observacion({ fuente: "google", fecha: haceDias(20) }),
        observacion({ fuente: "tiendas", fecha: haceDias(20) }),
      ],
      AHORA,
    );
    expect(resultado.nivel).toBe("PARCIAL");
    expect(resultado.diasDesdeUltima).toBe(20);
    expect(resultado.motivos.join(" ")).toMatch(/caducados/i);
  });

  it("las importaciones del usuario cuentan como dato real", () => {
    const resultado = evaluarConfianza(
      [
        observacion({ fuente: "google", tipo: "IMPORTADO" }),
        observacion({ fuente: "tiendas", tipo: "MEDIDO" }),
      ],
      AHORA,
    );
    expect(resultado.fuentesMedidas).toBe(2);
    expect(resultado.nivel).toBe("VERIFICADO");
  });

  it("un tipo MIXTO nunca se cuenta como medición", () => {
    const resultado = evaluarConfianza([observacion({ fuente: "google", tipo: "MIXTO" })], AHORA);
    expect(resultado.fuentesMedidas).toBe(0);
    expect(resultado.nivel).toBe("ESTIMADO");
  });

  it("respeta la fecha de la observación, no la del cálculo", () => {
    const resultado = evaluarConfianza([observacion({ fuente: "google", fecha: haceDias(3) })], AHORA);
    expect(resultado.diasDesdeUltima).toBe(3);
    expect(resultado.factores.find((factor) => factor.id === "frescura")?.puntos).toBe(20);
  });
});

describe("Confianza · oportunidad dorada", () => {
  it("solo se puede destacar como dorada si está verificada", () => {
    expect(puedeSerDorada({ nivel: "VERIFICADO", puntos: 80 })).toBe(true);
    expect(puedeSerDorada({ nivel: "VERIFICADO", puntos: 40 })).toBe(false);
    expect(puedeSerDorada({ nivel: "PARCIAL", puntos: 90 })).toBe(false);
    expect(puedeSerDorada({ nivel: "ESTIMADO", puntos: 100 })).toBe(false);
  });

  it("la etiqueta cambia cuando no hay verificación", () => {
    expect(etiquetaOportunidad(true, "VERIFICADO")).toBe("Oportunidad dorada");
    expect(etiquetaOportunidad(true, "PARCIAL")).toBe("Oportunidad estimada");
    expect(etiquetaOportunidad(true, "ESTIMADO")).toBe("Oportunidad estimada");
    expect(etiquetaOportunidad(false, "VERIFICADO")).toBe("Destacado");
  });
});

describe("Confianza · procedencia de una fila", () => {
  it("una fila con todo medido es MEDIDO", () => {
    expect(tipoDatoDeFila(["MEDIDO", "MEDIDO"])).toBe("MEDIDO");
  });

  it("una fila con todo estimado es ESTIMADO", () => {
    expect(tipoDatoDeFila(["ESTIMADO", "ESTIMADO"])).toBe("ESTIMADO");
  });

  it("medido + heredado es MIXTO (el error que había antes)", () => {
    expect(tipoDatoDeFila(["MEDIDO", "ESTIMADO"])).toBe("MIXTO");
    expect(tipoDatoDeFila(["MEDIDO", "MIXTO"])).toBe("MIXTO");
  });

  it("importado + estimado también es MIXTO", () => {
    expect(tipoDatoDeFila(["IMPORTADO", "ESTIMADO"])).toBe("MIXTO");
    expect(tipoDatoDeFila(["IMPORTADO", "IMPORTADO"])).toBe("IMPORTADO");
  });
});

describe("Confianza · utilidades", () => {
  it("la dirección distingue subir, bajar y plano con un 5 % de margen", () => {
    expect(direccionSenal(110, 100)).toBe(1);
    expect(direccionSenal(90, 100)).toBe(-1);
    expect(direccionSenal(103, 100)).toBe(0);
    expect(direccionSenal(100, null)).toBe(0);
  });

  it("el resumen de fuentes se lee en una línea", () => {
    expect(resumenFuentes({ fuentesMedidas: 0, diasDesdeUltima: null })).toBe("sin fuentes medidas");
    expect(resumenFuentes({ fuentesMedidas: 1, diasDesdeUltima: 0 })).toBe("1 fuente · hoy");
    expect(resumenFuentes({ fuentesMedidas: 3, diasDesdeUltima: 4 })).toBe("3 fuentes · hace 4 d");
  });
});
