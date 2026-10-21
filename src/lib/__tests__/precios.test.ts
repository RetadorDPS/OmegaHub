import { describe, expect, it } from "vitest";
import { caidaPercent, describirCaida, esCaidaRelevante } from "@/lib/precios";

describe("caída de precio", () => {
  it("calcula el porcentaje de caída", () => {
    expect(caidaPercent(100, 90)).toBeCloseTo(10, 5);
    expect(caidaPercent(50, 40)).toBeCloseTo(20, 5);
  });

  it("subida de precio no es caída", () => {
    expect(caidaPercent(90, 100)).toBe(0);
  });

  it("precios inválidos no cuentan", () => {
    expect(caidaPercent(0, 10)).toBe(0);
    expect(caidaPercent(Number.NaN, 10)).toBe(0);
  });

  it("detecta caídas relevantes sobre el umbral", () => {
    expect(esCaidaRelevante(100, 94)).toBe(true); // 6 % ≥ 5 %
    expect(esCaidaRelevante(100, 94, 10)).toBe(false); // umbral mayor
  });

  it("umbral por defecto del 5 %", () => {
    expect(esCaidaRelevante(100, 95)).toBe(true); // exactamente 5 %
    expect(esCaidaRelevante(100, 96)).toBe(false); // 4 %
    expect(esCaidaRelevante(100, 90, 15)).toBe(false);
    expect(esCaidaRelevante(100, 80, 15)).toBe(true);
  });

  it("precio 0 no es una rebaja", () => {
    expect(esCaidaRelevante(100, 0)).toBe(false);
  });

  it("describe la caída en español", () => {
    expect(describirCaida(99.99, 89.99)).toBe("99.99 € → 89.99 € (−10 %)");
  });
});
