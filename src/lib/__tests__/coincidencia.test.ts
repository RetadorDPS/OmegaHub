import { describe, expect, it } from "vitest";
import {
  cambioDePrecioRelevante,
  coincideConTendencia,
  compararTitulos,
  mejorCoincidencia,
  mismaPalabra,
  normalizarTexto,
  palabrasClave,
  volumenAproximado,
} from "@/lib/coincidencia";

/**
 * Pruebas del emparejado de títulos.
 *
 * Lo importante no es que empareje mucho, sino que **no empareje lo que no
 * toca**: un falso positivo aquí se convierte en «este producto lo venden 40
 * tiendas» cuando en realidad no lo vende ninguna.
 */
describe("normalizarTexto", () => {
  it("quita acentos, mayúsculas y puntuación", () => {
    expect(normalizarTexto("Máscara LED — 7 colores ¡oferta!")).toBe("mascara led 7 colores oferta");
  });

  it("colapsa espacios repetidos", () => {
    expect(normalizarTexto("  cepillo   secador  ")).toBe("cepillo secador");
  });
});

describe("palabrasClave", () => {
  it("descarta palabras vacías, cortas y números", () => {
    expect(palabrasClave("Set de 11 bandas elásticas para el gym")).toEqual(["bandas", "elasticas"]);
  });

  it("devuelve lista vacía si no hay palabras útiles", () => {
    expect(palabrasClave("LED 7 en 1")).toEqual([]);
  });
});

describe("mismaPalabra", () => {
  it("acepta singular y plural", () => {
    expect(mismaPalabra("crema", "cremas")).toBe(true);
    expect(mismaPalabra("proyector", "proyectores")).toBe(true);
  });

  it("rechaza palabras distintas que empiezan igual", () => {
    expect(mismaPalabra("mascara", "mascarilla")).toBe(false);
    expect(mismaPalabra("pistola", "pistilo")).toBe(false);
  });

  it("no empareja palabras de 4 letras por prefijo", () => {
    expect(mismaPalabra("cama", "camara")).toBe(false);
  });
});

describe("compararTitulos", () => {
  it("acepta el mismo producto con palabras de más", () => {
    const resultado = compararTitulos(
      "Máscara LED de terapia facial 7 colores",
      "Mascara LED facial 7 colores terapia",
    );
    expect(resultado.aceptada).toBe(true);
    expect(resultado.puntuacion).toBeGreaterThanOrEqual(0.7);
  });

  it("acepta singular/plural", () => {
    expect(compararTitulos("Pistola de masaje muscular percusivo 6 niveles", "Pistola masajes musculares").aceptada).toBe(true);
  });

  it("rechaza productos distintos del mismo nicho", () => {
    expect(compararTitulos("Máscara LED de terapia facial", "Rodillo facial de crioterapia").aceptada).toBe(false);
  });

  it("rechaza cuando solo comparte una palabra", () => {
    expect(compararTitulos("Proyector de galaxia y estrellas", "Proyector de cine 4K portátil").aceptada).toBe(false);
  });

  it("no rompe con títulos sin palabras útiles", () => {
    const resultado = compararTitulos("LED 7 en 1", "Pack 3 unidades");
    expect(resultado.aceptada).toBe(false);
    expect(resultado.puntuacion).toBe(0);
  });
});

describe("mejorCoincidencia", () => {
  const catalogo = [
    { id: "p1", title: "Máscara LED de terapia facial 7 colores" },
    { id: "p2", title: "Pistola de masaje muscular percusivo 6 niveles" },
    { id: "p3", title: "Proyector de galaxia y estrellas con altavoz Bluetooth" },
  ];

  it("elige el producto correcto", () => {
    const encontrado = mejorCoincidencia("Pistola de masaje muscular percusivo 6 niveles", catalogo);
    expect(encontrado?.producto.id).toBe("p2");
  });

  it("devuelve null si nada supera el umbral", () => {
    expect(mejorCoincidencia("Taza de cerámica artesanal", catalogo)).toBeNull();
  });
});

describe("coincideConTendencia", () => {
  it("acepta cuando todas las palabras del término están en el título", () => {
    expect(coincideConTendencia("Máscara LED de terapia facial 7 colores", "máscara led")).toBe(true);
    expect(coincideConTendencia("Pistola de masaje muscular percusivo", "pistola de masaje")).toBe(true);
  });

  it("rechaza términos parecidos pero distintos", () => {
    expect(coincideConTendencia("Máscara LED de terapia facial", "mascarilla led")).toBe(false);
  });

  it("rechaza términos de otro tema", () => {
    expect(coincideConTendencia("Camiseta de fútbol retro", "selección española")).toBe(false);
  });

  it("acepta términos sin palabras largas solo si aparecen como palabra completa", () => {
    expect(coincideConTendencia("F1 edición coleccionista 2026", "f1")).toBe(true);
    expect(coincideConTendencia("Funda para móvil", "f1")).toBe(false);
  });
});

describe("volumenAproximado", () => {
  it("traduce los volúmenes que publica Google", () => {
    expect(volumenAproximado("1M+")).toBe(1_000_000);
    expect(volumenAproximado("50K+")).toBe(50_000);
    expect(volumenAproximado("2,000,000+")).toBe(2_000_000);
    expect(volumenAproximado("5.000+")).toBe(5000);
  });

  it("devuelve 0 cuando no hay volumen", () => {
    expect(volumenAproximado("—")).toBe(0);
    expect(volumenAproximado("")).toBe(0);
  });
});

describe("cambioDePrecioRelevante", () => {
  it("detecta bajadas y subidas de más del 1 % y 0,50 €", () => {
    expect(cambioDePrecioRelevante(39.9, 31.9)).toBe(true);
    expect(cambioDePrecioRelevante(64, 69)).toBe(true);
  });

  it("ignora variaciones de céntimos", () => {
    expect(cambioDePrecioRelevante(39.9, 39.95)).toBe(false);
  });

  it("no considera cambio si falta un precio", () => {
    expect(cambioDePrecioRelevante(0, 39.9)).toBe(false);
    expect(cambioDePrecioRelevante(39.9, 0)).toBe(false);
  });
});
