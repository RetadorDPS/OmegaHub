/**
 * Verificación de punta a punta de la API pública v1.
 *
 * Comprueba el flujo completo real:
 *   1. El panel /dashboard/api crea una clave desde la interfaz.
 *   2. La clave se muestra una única vez y autentica las rutas /api/v1.
 *   3. Los filtros, la paginación y los errores del contrato funcionan.
 *   4. El límite por minuto responde 429 con Retry-After.
 *   5. Al revocar la clave, deja de funcionar de inmediato.
 *   6. El borrado de clientes (modo agencia) funciona.
 *
 *   npm run verify:api-v1        (requiere `npm run start` en :3000)
 *
 * Requiere el usuario admin del seed (BUSINESS) para crear claves.
 */
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [path.join(process.cwd(), ".chromium", "libs"), path.join(process.cwd(), ".chromium", "libs", "lib")].join(":");

const resultados = [];
/** Registra una comprobación y la imprime. */
function registrar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const navegador = await chromium.launch({
  executablePath: EJECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: { ...process.env, LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});

const contexto = await navegador.newContext({ locale: "es-ES", colorScheme: "dark" });
const pagina = await contexto.newPage();

// ---------------------------------------------------------------- sesión
await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await pagina.waitForTimeout(2500);
await pagina.fill("#email", "admin@trendhunter.pro");
await pagina.fill("#password", "admin1234");
await pagina.click('button[type="submit"]');
await pagina.waitForTimeout(4000);
registrar("Login del administrador", pagina.url().includes("/dashboard"), pagina.url());

// ---------------------------------------------------------------- panel
const respuestaPanel = await pagina.goto(`${BASE}/dashboard/api`, { waitUntil: "domcontentloaded" });
await pagina.waitForTimeout(2000);
const titulo = (await pagina.locator("h1").first().textContent().catch(() => "")) ?? "";
registrar(
  "GET /dashboard/api",
  respuestaPanel?.status() === 200 && titulo.includes("API"),
  `${respuestaPanel?.status()} · ${titulo.trim()}`,
);

// Crear la clave desde el diálogo real de la interfaz.
await pagina.getByRole("button", { name: "Crear clave" }).click();
await pagina.waitForTimeout(600);
await pagina.fill("#nombre-clave", `Verificación ${new Date().toISOString().slice(0, 16)}`);
await pagina.getByRole("button", { name: "Crear clave", exact: true }).last().click();
await pagina.waitForTimeout(2500);

const clave = (await pagina.locator("code", { hasText: "thp_live_" }).first().textContent().catch(() => ""))?.trim();
registrar("Crear clave desde el panel", Boolean(clave?.startsWith("thp_live_")), clave ? `${clave.slice(0, 18)}…` : "sin clave");

// Identificador de la clave recién creada (para revocarla al final).
// El prefijo visible es el principio de la clave completa: así se localiza
// sin depender de la longitud exacta del secreto.
const idClave = await pagina.evaluate(async (claveCompleta) => {
  const respuesta = await fetch("/api/api-keys");
  const cuerpo = await respuesta.json();
  const activa = (cuerpo.items ?? []).find(
    (item) => !item.revocadaEn && claveCompleta.startsWith(item.prefijo),
  );
  return activa?.id ?? "";
}, clave);

/** Petición a la API con la clave. */
async function llamar(ruta, cabeceras = {}) {
  const respuesta = await fetch(`${BASE}${ruta}`, { headers: cabeceras });
  const texto = await respuesta.text();
  let cuerpo = null;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    cuerpo = texto.slice(0, 200);
  }
  return { estado: respuesta.status, cuerpo, cabeceras: respuesta.headers };
}

const autenticada = (ruta) => llamar(ruta, { authorization: `Bearer ${clave}` });

// ---------------------------------------------------------------- contrato
const sinClave = await llamar("/api/v1/productos");
registrar(
  "Sin clave → 401 SIN_CLAVE",
  sinClave.estado === 401 && sinClave.cuerpo?.error?.codigo === "SIN_CLAVE",
  `${sinClave.estado} ${sinClave.cuerpo?.error?.codigo}`,
);

const claveFalsa = await llamar("/api/v1/productos", {
  authorization: "Bearer thp_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
});
registrar("Clave inexistente → 401", claveFalsa.estado === 401, `estado ${claveFalsa.estado}`);

const lista = await autenticada("/api/v1/productos?categoria=Belleza&orden=margen&porPagina=3");
registrar(
  "Catálogo filtrado y paginado",
  lista.estado === 200 &&
    Array.isArray(lista.cuerpo?.data) &&
    lista.cuerpo.data.length === 3 &&
    lista.cuerpo.data.every((item) => item.category === "Belleza"),
  `estado ${lista.estado} · ${lista.cuerpo?.data?.length} de ${lista.cuerpo?.meta?.total} · límite/min ${lista.cabeceras.get("x-ratelimit-limit")}`,
);

const producto = lista.cuerpo?.data?.[0];
const detalle = await llamar(`/api/v1/productos/${producto?.id}`, { "x-api-key": clave });
registrar(
  "Ficha con métricas y procedencia",
  detalle.estado === 200 &&
    detalle.cuerpo?.data?.producto?.id === producto?.id &&
    Array.isArray(detalle.cuerpo?.data?.metricas) &&
    detalle.cuerpo.data.metricas.every((metrica) => metrica.fuente && metrica.fechaMedicion && metrica.tipoDato),
  `${detalle.cuerpo?.data?.metricas?.length} métricas · fuentes: ${detalle.cuerpo?.data?.procedencia?.fuentes?.join(", ")}`,
);

const tiendas = await autenticada("/api/v1/tiendas?limite=3");
registrar("Tiendas analizadas", tiendas.estado === 200 && tiendas.cuerpo?.data?.length === 3, `${tiendas.cuerpo?.data?.length} tiendas`);

const tienda = await autenticada(`/api/v1/tiendas/${tiendas.cuerpo?.data?.[0]?.id}`);
registrar(
  "Ficha de tienda",
  tienda.estado === 200 && Boolean(tienda.cuerpo?.data?.tienda?.id),
  `${tienda.cuerpo?.data?.cambios?.length} cambios`,
);

const tendencias = await autenticada("/api/v1/tendencias?dias=30");
registrar(
  "Serie de tendencias con procedencia",
  tendencias.estado === 200 && Array.isArray(tendencias.cuerpo?.data),
  `${tendencias.cuerpo?.data?.length} puntos · última medición ${tendencias.cuerpo?.meta?.procedencia?.ultimaMedicion}`,
);

const delDia = await autenticada("/api/v1/tendencias/del-dia?geo=ES");
registrar(
  "Términos del día (200 o 502 si no hay red)",
  [200, 502].includes(delDia.estado),
  `estado ${delDia.estado}`,
);

const estadisticas = await autenticada("/api/v1/estadisticas");
registrar(
  "Estadísticas agregadas",
  estadisticas.estado === 200 && estadisticas.cuerpo?.data?.productosActivos > 0,
  `${estadisticas.cuerpo?.data?.productosActivos} productos`,
);

const indice = await llamar("/api/v1");
registrar(
  "Índice público de endpoints",
  indice.estado === 200 && indice.cuerpo?.data?.endpoints?.length >= 8,
  `${indice.cuerpo?.data?.endpoints?.length} endpoints`,
);

const openapi = await llamar("/api/v1/openapi");
registrar(
  "OpenAPI 3.1",
  openapi.estado === 200 && openapi.cuerpo?.openapi === "3.1.0",
  `${Object.keys(openapi.cuerpo?.paths ?? {}).length} rutas`,
);

const fueraRango = await autenticada("/api/v1/productos?porPagina=500");
registrar(
  "Parámetro fuera de rango → 400",
  fueraRango.estado === 400 && fueraRango.cuerpo?.error?.codigo === "PARAMETRO_INVALIDO",
  fueraRango.cuerpo?.error?.mensaje,
);

const categoriaMala = await autenticada("/api/v1/productos?categoria=Inventada");
registrar("Categoría inválida → 400", categoriaMala.estado === 400, categoriaMala.cuerpo?.error?.mensaje);

const noExiste = await autenticada("/api/v1/productos/no-existe");
registrar("Producto inexistente → 404", noExiste.estado === 404, noExiste.cuerpo?.error?.codigo);

// ---------------------------------------------------------------- cuota
let ultimo = null;
let bloqueos = 0;
for (let intento = 0; intento < 80; intento += 1) {
  ultimo = await autenticada("/api/v1/estadisticas");
  if (ultimo.estado === 429) {
    bloqueos += 1;
    break;
  }
}
registrar(
  "Límite por minuto → 429 con Retry-After",
  bloqueos === 1 &&
    ultimo?.cuerpo?.error?.codigo === "LIMITE_RITMO" &&
    Boolean(ultimo?.cabeceras.get("retry-after")),
  `estado ${ultimo?.estado} · Retry-After ${ultimo?.cabeceras.get("retry-after")} s`,
);

// ---------------------------------------------------------------- revocación
const revocada = await pagina.evaluate(async (id) => {
  const respuesta = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
  return { estado: respuesta.status, cuerpo: await respuesta.json().catch(() => ({})) };
}, idClave);
registrar("Revocar clave desde el panel", revocada.estado === 200 && revocada.cuerpo?.ok === true, `estado ${revocada.estado}`);

const trasRevocar = await autenticada("/api/v1/estadisticas");
registrar(
  "Clave revocada → 401 inmediato",
  trasRevocar.estado === 401 && trasRevocar.cuerpo?.error?.codigo === "CLAVE_REVOCADA",
  `${trasRevocar.estado} ${trasRevocar.cuerpo?.error?.codigo}`,
);

// ---------------------------------------------------------------- agencia
const cliente = await pagina.evaluate(async () => {
  const respuesta = await fetch("/api/clientes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nombre: "Cliente de verificación", dominio: "verificacion.test" }),
  });
  return { estado: respuesta.status, cuerpo: await respuesta.json().catch(() => ({})) };
});
const idCliente = cliente.cuerpo?.id ?? cliente.cuerpo?.cliente?.id ?? "";
registrar("Crear cliente (BUSINESS)", [200, 201].includes(cliente.estado) && Boolean(idCliente), `estado ${cliente.estado}`);

const borrado = await pagina.evaluate(async (id) => {
  const respuesta = await fetch(`/api/clientes/${id}`, { method: "DELETE" });
  return { estado: respuesta.status };
}, idCliente);
registrar("Eliminar cliente (DELETE real)", borrado.estado === 200, `estado ${borrado.estado}`);

const sigueExistiendo = await pagina.evaluate(async (id) => {
  const respuesta = await fetch("/api/clientes");
  const cuerpo = await respuesta.json();
  return (cuerpo.items ?? []).some((item) => item.id === id);
}, idCliente);
registrar("El cliente desaparece de la lista", sigueExistiendo === false);

await navegador.close();

const fallos = resultados.filter((fila) => !fila.ok);
console.log(`\n=== RESUMEN: ${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas ===`);
if (fallos.length > 0) {
  console.log("Fallos:");
  for (const fallo of fallos) console.log(` · ${fallo.nombre} ${fallo.detalle}`);
}
process.exit(fallos.length > 0 ? 1 : 0);
