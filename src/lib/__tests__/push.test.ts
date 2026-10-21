import { execFileSync } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { enviarPushAUsuario, estadoPush, pushConfigurado } from "@/lib/push";

/**
 * Pruebas del envío push contra un servidor HTTPS local que hace de servicio
 * push del navegador (FCM/Apple).
 *
 * Verifican lo importante del backend: que `web-push` cifra y firma de verdad,
 * que se envía a todos los dispositivos, que un 410 desactiva la suscripción
 * muerta y que sin claves VAPID no se rompe nada.
 */

let servidor: Server;
let origen = "";
let directorio = "";
let respuesta = 201;
const peticiones: Array<{ url: string; ttl: string | undefined; auth: string | undefined; bytes: number }> = [];

/** Certificado autofirmado para el servicio push de prueba. */
function generarCertificado(): { cert: Buffer; key: Buffer } {
  directorio = mkdtempSync(path.join(tmpdir(), "push-test-"));
  const clave = path.join(directorio, "key.pem");
  const certificado = path.join(directorio, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      clave,
      "-out",
      certificado,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
    ],
    { stdio: "ignore" },
  );
  return { cert: readFileSync(certificado), key: readFileSync(clave) };
}

/** Suscripción con claves criptográficas válidas (como las de un navegador). */
function suscripcion(id: string) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    id,
    endpoint: `${origen}/push/${id}`,
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

/** Prisma de mentira: solo lo que usa el envío push. */
function prismaFalso(dispositivos: ReturnType<typeof suscripcion>[]) {
  const cambios: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  return {
    cambios,
    cliente: {
      pushSubscription: {
        findMany: async () => dispositivos,
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          cambios.push(args);
          return {};
        },
      },
    },
  };
}

beforeAll(async () => {
  const { cert, key } = generarCertificado();
  servidor = createServer({ cert, key }, (peticion: IncomingMessage, salida: ServerResponse) => {
    let bytes = 0;
    peticion.on("data", (trozo: Buffer) => {
      bytes += trozo.length;
    });
    peticion.on("end", () => {
      peticiones.push({
        url: peticion.url ?? "",
        ttl: peticion.headers.ttl as string | undefined,
        auth: peticion.headers.authorization,
        bytes,
      });
      salida.writeHead(respuesta).end();
    });
  });
  await new Promise<void>((resolver) => servidor.listen(0, "127.0.0.1", resolver));
  const direccion = servidor.address();
  origen = `https://localhost:${typeof direccion === "object" && direccion ? direccion.port : 0}`;
  // El certificado del servicio push de prueba es autofirmado.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
});

afterAll(() => {
  servidor?.close();
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (directorio) rmSync(directorio, { recursive: true, force: true });
});

beforeEach(() => {
  peticiones.length = 0;
  respuesta = 201;
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
    "BG6OUMblmSWK7K0TKn17wPhfoVSfQxwzF37tQqqVoDpj7XIWC7bHF9J5CH1mqTEveDSz1x992QpbeOJIa766g6c";
  process.env.VAPID_PRIVATE_KEY = "-zDFwHAiVDoerT5eB4NtlJ6bvqjeGNkUux4PRBOUA14";
  process.env.VAPID_SUBJECT = "mailto:pruebas@trendhunter.pro";
});

describe("Push · configuración", () => {
  it("detecta las claves VAPID y no expone la privada", () => {
    expect(pushConfigurado()).toBe(true);
    const estado = estadoPush();
    expect(estado.configurado).toBe(true);
    expect(JSON.stringify(estado)).not.toContain(process.env.VAPID_PRIVATE_KEY as string);
  });

  it("sin claves se declara no configurado", () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect(pushConfigurado()).toBe(false);
    expect(estadoPush().nota).toMatch(/campana/);
  });
});

describe("Push · envío real al servicio push", () => {
  it("cifra y entrega a todos los dispositivos activos", async () => {
    const dispositivos = [suscripcion("uno"), suscripcion("dos")];
    const { cliente, cambios } = prismaFalso(dispositivos);

    const resultado = await enviarPushAUsuario(cliente, "usuario-1", {
      titulo: "Score alcanzado",
      cuerpo: "El producto llegó a 91/100.",
      url: "/dashboard/winning-products/p1",
      etiqueta: "thp-p1",
      tipo: "SCORE_THRESHOLD",
    });

    expect(resultado).toMatchObject({ enviados: 2, fallidos: 0, desactivados: 0 });
    expect(peticiones).toHaveLength(2);
    // TTL: un aviso caduca en una hora; el cuerpo va cifrado (no en claro).
    expect(peticiones[0].ttl).toBe("3600");
    expect(peticiones[0].auth).toContain("vapid");
    expect(peticiones[0].bytes).toBeGreaterThan(40);
    // Se registra el último uso de cada dispositivo.
    expect(cambios.map((cambio) => cambio.where.id).sort()).toEqual(["dos", "uno"]);
    expect(cambios.every((cambio) => cambio.data.ultimoUso instanceof Date)).toBe(true);
  });

  it("desactiva el dispositivo que el servicio push da por retirado (410)", async () => {
    respuesta = 410;
    const { cliente, cambios } = prismaFalso([suscripcion("muerto")]);

    const resultado = await enviarPushAUsuario(cliente, "usuario-1", {
      titulo: "Aviso",
      cuerpo: "Texto",
      url: "/dashboard",
      etiqueta: "thp-x",
      tipo: "SYSTEM",
    });

    expect(resultado).toMatchObject({ enviados: 0, fallidos: 1, desactivados: 1 });
    expect(resultado.motivos[0]).toMatch(/dispositivo retirado/);
    expect(cambios[0].data.activa).toBe(false);
  });

  it("no envía nada sin dispositivos ni sin claves", async () => {
    const vacio = prismaFalso([]);
    const sinDispositivos = await enviarPushAUsuario(vacio.cliente, "usuario-1", {
      titulo: "Aviso",
      cuerpo: "Texto",
      url: "/dashboard",
      etiqueta: "thp-x",
      tipo: "SYSTEM",
    });
    expect(sinDispositivos.motivos).toContain("sin dispositivos suscritos");
    expect(peticiones).toHaveLength(0);

    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const sinClaves = await enviarPushAUsuario(vacio.cliente, "usuario-1", {
      titulo: "Aviso",
      cuerpo: "Texto",
      url: "/dashboard",
      etiqueta: "thp-x",
      tipo: "SYSTEM",
    });
    expect(sinClaves.motivos).toContain("sin claves VAPID");
  });
});
