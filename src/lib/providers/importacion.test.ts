import { describe, expect, it } from "vitest";
import { parsearCSV, parsearJSON, parsearNumero } from "./importacion";

describe("importación de tendencias", () => {
  it("parsea números europeos (1.234,56)", () => {
    expect(parsearNumero("1.234,56")).toBe(1234.56);
    expect(parsearNumero("999")).toBe(999);
    expect(parsearNumero("12,5")).toBe(12.5);
    expect(parsearNumero("1.000")).toBe(1000);
    expect(parsearNumero("")).toBe(0);
  });

  it("parsea CSV con cabecera en español", () => {
    const csv = [
      "fecha;busquedas;tiktok;youtube;meta;tiendas",
      "2026-10-01;12.300;1.500.000;800.000;45;120",
      "2026-10-02;15.000;1.800.000;950.000;52;135",
    ].join("\n");

    const { puntos, error } = parsearCSV(csv);
    expect(error).toBeNull();
    expect(puntos).toHaveLength(2);
    expect(puntos[0].googleSearchVolume).toBe(12300);
    expect(puntos[0].tiktokViews).toBe(1_500_000);
    expect(puntos[0].youtubeViews).toBe(800_000);
    expect(puntos[0].metaAdsCount).toBe(45);
    expect(puntos[0].shopifyStoresUsing).toBe(120);
  });

  it("rechaza CSV sin columna de fecha", () => {
    const { puntos, error } = parsearCSV("google;tiktok\n10;20");
    expect(puntos).toHaveLength(0);
    expect(error).toContain("fecha");
  });

  it("parsea JSON", () => {
    const json = JSON.stringify([
      { date: "2026-10-01", google: 100, tiktok: 5000, youtube: 3000 },
    ]);
    const { puntos, error } = parsearJSON(json);
    expect(error).toBeNull();
    expect(puntos[0].googleSearchVolume).toBe(100);
    expect(puntos[0].tiktokViews).toBe(5000);
    expect(puntos[0].youtubeViews).toBe(3000);
  });

  it("JSON no-array devuelve error", () => {
    const { error } = parsearJSON('{"a":1}');
    expect(error).toContain("array");
  });
});
