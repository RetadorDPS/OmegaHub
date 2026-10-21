import { describe, expect, it } from "vitest";
import {
  CLAVES_POR_PLAN,
  API_PLAN_LIMITS,
  PREFIJO_CLAVE,
  claveEnmascarada,
  extraerClave,
  formatoValido,
  generarClave,
  hashClave,
  limitesDePlan,
  mismoHash,
  planConApi,
} from "@/lib/apiKeys";

describe("claves de la API pública", () => {
  it("genera claves con prefijo, longitud y hash estables", () => {
    const { clave, prefijo, hash } = generarClave();
    expect(clave.startsWith(PREFIJO_CLAVE)).toBe(true);
    expect(formatoValido(clave)).toBe(true);
    expect(prefijo.startsWith(PREFIJO_CLAVE)).toBe(true);
    expect(prefijo).not.toBe(clave);
    expect(hash).toBe(hashClave(clave));
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(clave);
  });

  it("cada clave es única", () => {
    const claves = new Set(Array.from({ length: 50 }, () => generarClave().clave));
    expect(claves.size).toBe(50);
  });

  it("rechaza formatos inválidos", () => {
    expect(formatoValido("")).toBe(false);
    expect(formatoValido("thp_live_corto")).toBe(false);
    expect(formatoValido("otra_live_0123456789012345678901234")).toBe(false);
    expect(formatoValido(`thp_live_${"a".repeat(32)}`)).toBe(true);
  });

  it("el hash no depende del secreto en claro", () => {
    expect(hashClave("thp_live_abc")).toBe(hashClave("thp_live_abc"));
    expect(hashClave("thp_live_abc")).not.toBe(hashClave("thp_live_abd"));
    expect(mismoHash(hashClave("x"), hashClave("x"))).toBe(true);
    expect(mismoHash(hashClave("x"), hashClave("y"))).toBe(false);
  });

  it("lee la clave de Authorization o de X-API-Key", () => {
    const cabecera = new Request("https://app.test/api/v1", {
      headers: { authorization: "Bearer thp_live_abcdef" },
    });
    expect(extraerClave(cabecera)).toBe("thp_live_abcdef");

    const xApiKey = new Request("https://app.test/api/v1", {
      headers: { "x-api-key": "thp_live_otra" },
    });
    expect(extraerClave(xApiKey)).toBe("thp_live_otra");

    const sinClave = new Request("https://app.test/api/v1");
    expect(extraerClave(sinClave)).toBeNull();

    const esquemaMalo = new Request("https://app.test/api/v1", {
      headers: { authorization: "Basic abc" },
    });
    expect(extraerClave(esquemaMalo)).toBeNull();
  });

  it("solo Business y Agency tienen API", () => {
    expect(planConApi("BUSINESS")).toBe(true);
    expect(planConApi("AGENCY")).toBe(true);
    expect(planConApi("PRO")).toBe(false);
    expect(planConApi("FREE")).toBe(false);
    expect(planConApi(null)).toBe(false);
  });

  it("los límites crecen con el plan y son coherentes", () => {
    expect(limitesDePlan("BUSINESS").porMinuto).toBeLessThan(limitesDePlan("AGENCY").porMinuto);
    expect(API_PLAN_LIMITS.BUSINESS.porDia).toBeGreaterThan(0);
    expect(CLAVES_POR_PLAN.AGENCY).toBeGreaterThan(CLAVES_POR_PLAN.BUSINESS);
  });

  it("enmascara el secreto para mostrarlo", () => {
    expect(claveEnmascarada("thp_live_abc123")).toBe("thp_live_abc123••••••••");
  });
});
