import { afterEach, describe, expect, it, vi } from "vitest";
import { asientosDelPlan, correoValido, planMasAlto, planMayorOIgual } from "@/lib/equipos";
import {
  EVENTOS_WEBHOOK,
  construirCuerpo,
  firmarCuerpo,
  validarUrlWebhook,
} from "@/lib/webhooks";

/**
 * Equipos, asientos y webhooks.
 *
 * Lo que protegen estas pruebas: que un plan no regale plazas que no incluye,
 * que los correos se normalicen antes de guardarlos y que un webhook no pueda
 * apuntar a la red interna del servidor (SSRF) ni enviarse sin firmar.
 */

describe("Equipos · planes y asientos", () => {
  it("ordena los planes de menor a mayor", () => {
    expect(planMayorOIgual("AGENCY", "BUSINESS")).toBe(true);
    expect(planMayorOIgual("BUSINESS", "BUSINESS")).toBe(true);
    expect(planMayorOIgual("PRO", "BUSINESS")).toBe(false);
    expect(planMayorOIgual("FREE", "PRO")).toBe(false);
  });

  it("elige el plan más alto de una lista", () => {
    expect(planMasAlto(["PRO", "AGENCY", "BUSINESS"])).toBe("AGENCY");
    expect(planMasAlto(["FREE"])).toBe("FREE");
    expect(planMasAlto([])).toBe("FREE");
  });

  it("reparte las plazas que promete cada plan", () => {
    expect(asientosDelPlan("FREE")).toBe(1);
    expect(asientosDelPlan("PRO")).toBe(1);
    expect(asientosDelPlan("BUSINESS")).toBe(5);
    expect(asientosDelPlan("AGENCY")).toBe(15);
  });

  it("normaliza el correo y rechaza lo que no lo es", () => {
    expect(correoValido("  Ana.Perez@Tienda.COM ")).toBe("ana.perez@tienda.com");
    expect(correoValido("sin-arroba")).toBeNull();
    expect(correoValido("dos@@correo.com")).toBeNull();
    expect(correoValido("correo@sinpunto")).toBeNull();
  });
});

describe("Webhooks · validación de la URL", () => {
  const aceptadas = [
    "https://hooks.slack.com/services/T000/B000/XXXX",
    "https://discord.com/api/webhooks/123/abc",
    "https://mi-automatizacion.com/hook",
    "https://ejemplo.com:8443/hook",
  ];
  const rechazadas = [
    "http://hooks.slack.com/services/T000/B000/XXXX",
    "https://localhost:3000/hook",
    "https://127.0.0.1/hook",
    "https://10.0.0.5/hook",
    "https://192.168.1.10/hook",
    "https://172.16.0.1/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://metadata.google.internal/computeMetadata/v1",
    "https://caja.interna.internal/hook",
    "https://usuario:clave@ejemplo.com/hook",
    "https://ejemplo.com:8080/hook",
    "no-es-una-url",
  ];

  it.each(aceptadas)("acepta %s", (url) => {
    expect(validarUrlWebhook(url).ok).toBe(true);
  });

  it.each(rechazadas)("rechaza %s", (url) => {
    const resultado = validarUrlWebhook(url);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toBeTruthy();
  });
});

describe("Webhooks · carga útil y firma", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Slack recibe bloques con el aviso y el detalle", () => {
    const cuerpo = construirCuerpo("SLACK", {
      titulo: "Nuevo dorado",
      mensaje: "Un producto sube de golpe",
      ruta: "/dashboard/productos/abc",
      tipo: "SCORE_JUMP",
      detalle: "Score 88 → 96",
    });
    expect(String(cuerpo.text)).toContain("Nuevo dorado");
    expect(Array.isArray(cuerpo.blocks)).toBe(true);
    expect(JSON.stringify(cuerpo)).toContain("Score 88");
  });

  it("con la URL pública configurada añade el botón al producto", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.trendhunter.pro");
    const conEnlace = construirCuerpo("SLACK", {
      titulo: "Nuevo dorado",
      mensaje: "Un producto sube de golpe",
      ruta: "/dashboard/productos/abc",
      tipo: "SCORE_JUMP",
    });
    expect(JSON.stringify(conEnlace)).toContain("https://app.trendhunter.pro/dashboard/productos/abc");
  });

  it("Discord usa embeds y limita el color al tipo", () => {
    const cuerpo = construirCuerpo("DISCORD", {
      titulo: "Cambio de precio",
      mensaje: "Baja 12 %",
      tipo: "PRICE_CHANGE",
      detalle: "39 → 34 €",
    });
    const embeds = cuerpo.embeds as Array<{ title: string; description: string; color: number }>;
    expect(embeds).toHaveLength(1);
    expect(embeds[0].title).toContain("Cambio de precio");
    expect(Number.isInteger(embeds[0].color)).toBe(true);
  });

  it("el formato genérico lleva evento y mensaje en claro", () => {
    const cuerpo = construirCuerpo("GENERIC", {
      titulo: "Agotado",
      mensaje: "Se ha agotado un producto",
      tipo: "OUT_OF_STOCK",
    });
    expect(cuerpo.titulo).toBe("Agotado");
    expect(cuerpo.evento).toBe("OUT_OF_STOCK");
    expect(typeof cuerpo.mensaje).toBe("string");
  });

  it("la firma es un HMAC SHA-256 estable y distinto por secreto", () => {
    const cuerpo = '{"a":1}';
    const firma = firmarCuerpo(cuerpo, "whsec_uno");
    expect(firma).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(firmarCuerpo(cuerpo, "whsec_uno")).toBe(firma);
    expect(firmarCuerpo(cuerpo, "whsec_dos")).not.toBe(firma);
    expect(firmarCuerpo('{"a":2}', "whsec_uno")).not.toBe(firma);
  });

  it("declara los seis eventos que la interfaz ofrece", () => {
    expect(EVENTOS_WEBHOOK.map((evento) => evento.id)).toEqual([
      "alerta",
      "producto",
      "precio",
      "agotado",
      "equipo",
      "prueba",
    ]);
  });
});
