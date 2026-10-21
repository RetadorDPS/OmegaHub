import { describe, expect, it } from "vitest";
import {
  ALCANCE_SW,
  CACHES,
  RUTA_SW,
  cargaDesdeNotificacion,
  clasificarPeticion,
  endpointCorto,
  navegadorDe,
  sePuedeCachear,
  validarSuscripcion,
} from "@/lib/pwa";

describe("PWA · rutas y cachés", () => {
  it("el service worker se sirve desde la raíz y controla toda la app", () => {
    expect(RUTA_SW).toBe("/sw.js");
    expect(ALCANCE_SW).toBe("/");
  });

  it("cada caché lleva la versión para poder invalidarla", () => {
    for (const nombre of Object.values(CACHES)) {
      expect(nombre).toMatch(/^thp-v\d+-/);
    }
  });
});

describe("PWA · clasificación de peticiones", () => {
  it("las imágenes van a caché de imágenes", () => {
    expect(clasificarPeticion("image", "https://x.com/a.png")).toBe("imagen");
  });

  it("JS, CSS, fuentes y manifiesto son estáticos", () => {
    for (const destino of ["script", "style", "font", "manifest"]) {
      expect(clasificarPeticion(destino, "https://x.com/a")).toBe("estatico");
    }
  });

  it("las páginas se sirven por red y las API nunca se cachean", () => {
    expect(clasificarPeticion("document", "https://x.com/dashboard")).toBe("pagina");
    expect(clasificarPeticion("", "https://x.com/api/productos")).toBe("api");
    expect(clasificarPeticion("", "https://x.com/_next/data/abc/x.json")).toBe("api");
  });

  it("solo se cachean GET del mismo origen", () => {
    expect(sePuedeCachear("GET", "https://x.com/a", "https://x.com")).toBe(true);
    expect(sePuedeCachear("POST", "https://x.com/a", "https://x.com")).toBe(false);
    expect(sePuedeCachear("GET", "https://otro.com/a", "https://x.com")).toBe(false);
    expect(sePuedeCachear("GET", "no-es-url", "https://x.com")).toBe(false);
  });
});

describe("PWA · validación de suscripciones", () => {
  const valida = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123def456",
    keys: {
      p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
      auth: "BTBZMqHH6r4Tts7J_aSIgg",
    },
  };

  it("acepta una suscripción real", () => {
    expect(validarSuscripcion(valida)).toBeNull();
  });

  it("rechaza cuerpos vacíos o incompletos", () => {
    expect(validarSuscripcion(null)).toMatch(/vacía/);
    expect(validarSuscripcion({})).toMatch(/endpoint/);
    expect(validarSuscripcion({ ...valida, endpoint: "corto" })).toMatch(/endpoint/);
    expect(validarSuscripcion({ endpoint: valida.endpoint })).toMatch(/claves/);
    expect(validarSuscripcion({ ...valida, keys: { p256dh: "x", auth: "y" } })).toMatch(/p256dh/);
  });

  it("exige HTTPS: un endpoint en claro podría redirigir los avisos", () => {
    expect(validarSuscripcion({ ...valida, endpoint: "http://fcm.googleapis.com/fcm/send/abc123" })).toMatch(/HTTPS/);
    expect(validarSuscripcion({ ...valida, endpoint: "no-es-una-url-larga" })).toMatch(/URL/);
  });

  it("detecta el navegador por el user-agent", () => {
    expect(navegadorDe("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari")).toBe("Safari (iOS)");
    expect(navegadorDe("Mozilla/5.0 Chrome/126 Safari/537")).toBe("Chrome");
    expect(navegadorDe("Mozilla/5.0 Edg/126")).toBe("Edge");
    expect(navegadorDe("Mozilla/5.0 Firefox/128")).toBe("Firefox");
    expect(navegadorDe(null)).toBe("Navegador");
  });

  it("el endpoint mostrado no expone el token completo", () => {
    const corto = endpointCorto("https://fcm.googleapis.com/fcm/send/token-secreto-123");
    expect(corto).toContain("fcm.googleapis.com");
    expect(corto).not.toContain("token-secreto-123");
    expect(corto.length).toBeLessThan(50);
  });
});

describe("PWA · carga de la notificación", () => {
  it("copia título, cuerpo y enlace del aviso", () => {
    const carga = cargaDesdeNotificacion({
      id: "n1",
      title: "Producto X alcanzó el score 85",
      message: "Está en 92/100.",
      actionUrl: "/dashboard/winning-products/p1",
      type: "TREND_ALERT",
    });
    expect(carga.titulo).toBe("Producto X alcanzó el score 85");
    expect(carga.cuerpo).toBe("Está en 92/100.");
    expect(carga.url).toBe("/dashboard/winning-products/p1");
    expect(carga.etiqueta).toBe("thp-trend_alert");
  });

  it("sin enlace abre el panel y recorta mensajes largos", () => {
    const carga = cargaDesdeNotificacion({
      id: "n2",
      title: "Aviso",
      message: "x".repeat(300),
      actionUrl: null,
      type: "SYSTEM",
    });
    expect(carga.url).toBe("/dashboard");
    expect(carga.cuerpo.length).toBeLessThanOrEqual(140);
    expect(carga.cuerpo.endsWith("…")).toBe(true);
  });
});
