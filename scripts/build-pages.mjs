/**
 * Genera el sitio estático para GitHub Pages a partir de la aplicación real.
 *
 * El sitio se construye en una copia de trabajo (`.pages/`) para no tocar el
 * código de producción, se exporta con `next build` en modo `output: "export"`
 * y el resultado se copia a `docs/`, que es la carpeta que GitHub Pages publica
 * cuando la fuente es "Deploy from a branch" → rama + `/docs`.
 *
 * Ajustes que necesita una exportación estática (la aplicación real no los usa):
 *
 *   · `basePath`: GitHub Pages sirve el proyecto en /<repositorio>.
 *   · Se retiran las rutas de API y el proxy: no existen sin servidor.
 *   · `auth()` se sustituye por una sesión de demostración fija.
 *   · Las páginas que leen `searchParams` (filtros por URL) se exportan con los
 *     filtros por defecto: sin servidor no hay reconsulta.
 *   · Las rutas dinámicas (ficha de producto y de tienda) se prerenderizan a
 *     partir de los identificadores reales de la base de datos.
 *   · Un pequeño intercepto de `fetch` avisa con un mensaje claro cuando una
 *     acción necesita el backend en lugar de fallar en silencio.
 *
 *     npm run build:pages
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const TRABAJO = path.join(RAIZ, ".pages");
const SALIDA = path.join(TRABAJO, "out");
const DESTINO = path.join(RAIZ, "docs");
/** Ruta pública en GitHub Pages: https://<usuario>.github.io/<repositorio>/. */
const BASE_PATH = "/OmegaHub";

const COPIAR = ["src", "public", "prisma", "package.json", "tsconfig.json", "postcss.config.mjs", "prisma.config.ts"];

/** Sustituye texto en un fichero y falla si el patrón no aparece. */
function parchear(relativa, buscar, reemplazar, descripcion) {
  const ruta = path.join(TRABAJO, relativa);
  const contenido = readFileSync(ruta, "utf8");
  if (!contenido.includes(buscar)) {
    throw new Error(`[build:pages] No se encontró el fragmento esperado en ${relativa} (${descripcion}).`);
  }
  writeFileSync(ruta, contenido.replace(buscar, reemplazar));
}

console.log("[build:pages] 1/6 · Preparando la copia de trabajo…");
rmSync(TRABAJO, { recursive: true, force: true });
rmSync(DESTINO, { recursive: true, force: true });
mkdirSync(TRABAJO, { recursive: true });

for (const entrada of COPIAR) {
  const origen = path.join(RAIZ, entrada);
  if (!existsSync(origen)) continue;
  cpSync(origen, path.join(TRABAJO, entrada), { recursive: true });
}

// Dependencias compartidas con el proyecto principal.
symlinkSync(path.join(RAIZ, "node_modules"), path.join(TRABAJO, "node_modules"), "dir");

// El cliente de Prisma y la base de datos se generan/copian para poder
// prerenderizar con datos reales.
if (!existsSync(path.join(TRABAJO, "src", "generated"))) {
  execFileSync("node", ["scripts/prisma-generate.mjs"], { cwd: RAIZ, stdio: "inherit" });
  cpSync(path.join(RAIZ, "src", "generated"), path.join(TRABAJO, "src", "generated"), { recursive: true });
}

console.log("[build:pages] 2/6 · Configurando Next.js para exportación estática…");
writeFileSync(
  path.join(TRABAJO, "next.config.ts"),
  `import type { NextConfig } from "next";

/**
 * Configuración del sitio estático publicado en GitHub Pages.
 * Se genera automáticamente con \`npm run build:pages\`.
 */
const nextConfig: NextConfig = {
  output: "export",
  basePath: ${JSON.stringify(BASE_PATH)},
  // El manifiesto y el service worker se publican bajo /OmegaHub/.
  env: { NEXT_PUBLIC_BASE_PATH: ${JSON.stringify(BASE_PATH)} },
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  images: {
    // GitHub Pages no ejecuta el optimizador de imágenes de Next.js.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**.unsplash.com" },
      { protocol: "https", hostname: "**.alicdn.com" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
`,
);

console.log("[build:pages] 3/6 · Retirando lo que necesita servidor…");
rmSync(path.join(TRABAJO, "src", "app", "api"), { recursive: true, force: true });
rmSync(path.join(TRABAJO, "src", "proxy.ts"), { force: true });

writeFileSync(
  path.join(TRABAJO, "src", "auth.ts"),
  `/**
 * Sesión de demostración para el sitio estático de GitHub Pages.
 *
 * La exportación estática no tiene servidor ni cookies, así que \`auth()\`
 * devuelve siempre la cuenta de administración real del seed (ADMIN ·
 * BUSINESS) para que el panel completo —incluido el módulo de administración—
 * sea navegable y las consultas usen un usuario que existe en la base de datos.
 * Este fichero sustituye a \`src/auth.ts\` solo dentro de \`npm run build:pages\`.
 */
import prisma from "@/lib/prisma";
import type { PlanType, Role } from "@/types";

const CORREO_DEMOSTRACION = "admin@trendhunter.pro";

/**
 * Sesión que consume el proveedor de cliente. Solo se usa para mostrar el
 * nombre, el plan y el rol en la interfaz: las consultas de servidor usan
 * \`auth()\`, que lee el usuario administrador real de la base de datos.
 */
export const SESION_ESTATICA = {
  user: {
    id: "usuario-demostracion",
    name: "Ariadna Ferrer",
    email: CORREO_DEMOSTRACION,
    image: null as string | null,
    role: "ADMIN" as Role,
    planType: "BUSINESS" as PlanType,
    isEmailVerified: true,
  },
  expires: "2099-12-31T23:59:59.999Z",
};

/** Usuario de demostración (el administrador del seed). */
async function usuarioDemostracion() {
  const usuario = await prisma.user.findUnique({
    where: { email: CORREO_DEMOSTRACION },
    select: { id: true, name: true, email: true, image: true, role: true, planType: true },
  });
  if (!usuario) throw new Error("El sitio estático necesita los datos de demo: ejecuta \`npm run setup\`.");
  return usuario;
}

/** Misma interfaz que la autenticación real, sin acceso a cookies. */
export async function auth() {
  const usuario = await usuarioDemostracion();
  return {
    user: {
      id: usuario.id,
      name: usuario.name,
      email: usuario.email,
      image: usuario.image,
      role: usuario.role,
      planType: usuario.planType,
      isEmailVerified: true,
    },
    expires: "2099-12-31T23:59:59.999Z",
  };
}

export async function signIn() {
  return { ok: false, error: "El acceso requiere el servidor de TrendHunter Pro." };
}

export async function signOut() {
  return undefined;
}

export const handlers = {
  GET: async () => new Response("{}", { headers: { "content-type": "application/json" } }),
  POST: async () => new Response("{}", { headers: { "content-type": "application/json" } }),
};
`,
);

console.log("[build:pages] 4/6 · Adaptando las páginas al modo estático…");

// Rutas dinámicas: se prerenderizan con los identificadores reales.
const rutasDinamicas = [
  ["src/app/dashboard/winning-products/[id]/page.tsx", "product"],
  ["src/app/dashboard/store-tracker/[id]/page.tsx", "store"],
];

for (const [relativa, tipo] of rutasDinamicas) {
  const ruta = path.join(TRABAJO, relativa);
  if (!existsSync(ruta)) continue;
  let contenido = readFileSync(ruta, "utf8");
  const generador =
    tipo === "product"
      ? `
/** Identificadores reales del catálogo para prerenderizar cada ficha. */
export async function generateStaticParams() {
  const { default: prisma } = await import("@/lib/prisma");
  const productos = await prisma.product.findMany({ select: { id: true } });
  return productos.map((producto) => ({ id: producto.id }));
}
`
      : `
/** Identificadores reales de las tiendas seguidas para prerenderizar su ficha. */
export async function generateStaticParams() {
  const { default: prisma } = await import("@/lib/prisma");
  const tiendas = await prisma.store.findMany({ select: { id: true } });
  return tiendas.map((tienda) => ({ id: tienda.id }));
}
`;
  contenido = contenido.replace("interface PageProps {", `${generador}\ninterface PageProps {`);
  writeFileSync(ruta, contenido);
}

// Páginas que dependen de parámetros de la URL: se exportan con los filtros por
// defecto (sin servidor no hay reconsulta posible).
const paginasConParametros = [
  "src/app/dashboard/winning-products/page.tsx",
  "src/app/dashboard/ads-spy/page.tsx",
  "src/app/dashboard/suppliers/page.tsx",
  "src/app/dashboard/settings/billing/page.tsx",
];

// El Shop Analyzer recibe ?url= desde la extensión: en el
// sitio estático no hay parámetros, se sirve sin prefijo.
{
  const ruta = path.join(TRABAJO, "src/app/dashboard/shop-analyzer/page.tsx");
  if (existsSync(ruta)) {
    let contenido = readFileSync(ruta, "utf8");
    contenido = contenido.replace(
      /const \{ url: urlInicial \} = await searchParams;/,
      "// Sitio estático: sin deep link, sin prefijo.\n  const urlInicial: string | undefined = undefined;",
    );
    writeFileSync(ruta, contenido);
  }
}

for (const relativa of paginasConParametros) {
  const ruta = path.join(TRABAJO, relativa);
  if (!existsSync(ruta)) continue;
  let contenido = readFileSync(ruta, "utf8");
  contenido = contenido.replace(
    /const params = await searchParams;/,
    "// Sitio estático: los filtros por URL se sirven con los valores por defecto.\n  const params: Record<string, string | string[] | undefined> = {};",
  );
  contenido = contenido.replace(/searchParams: Promise<Record<string, string \| string\[\] \| undefined>>;/, "searchParams?: Promise<Record<string, string | string[] | undefined>>;");
  writeFileSync(ruta, contenido);
}

// Componentes cliente que leen parámetros de la URL: en un sitio estático no
// existen, así que se les entrega una colección vacía (equivale a los filtros
// por defecto) y desaparece la necesidad de un límite de Suspense.
const componentesConParametros = [
  "src/components/auth/login-form.tsx",
  "src/components/auth/register-form.tsx",
  "src/components/auth/reset-password-form.tsx",
  "src/components/domain/ad-filters.tsx",
  "src/components/domain/product-filters.tsx",
  "src/components/domain/product-sort.tsx",
  "src/components/domain/suppliers-browser.tsx",
];

for (const relativa of componentesConParametros) {
  const ruta = path.join(TRABAJO, relativa);
  if (!existsSync(ruta)) continue;
  let contenido = readFileSync(ruta, "utf8");
  contenido = contenido
    .replace(/const (parametros|searchParams) = useSearchParams\(\);/g, "// Sitio estático: sin parámetros de URL.\n  const $1 = new URLSearchParams();")
    .replace(/import \{ usePathname, useRouter, useSearchParams \} from "next\/navigation";/, 'import { usePathname, useRouter } from "next/navigation";')
    .replace(/import \{ useRouter, useSearchParams \} from "next\/navigation";/, 'import { useRouter } from "next/navigation";');
  writeFileSync(ruta, contenido);
}

// --- Aviso, sesión estática e intercepto de peticiones al backend ----------
const URL_APP = process.env.URL_APP_COMPLETA ?? "https://github.com/RetadorDPS/OmegaHub";

/** Código que avisa cuando una acción necesita el backend real. */
const CODIGO_INTERCEPTOR = [
  "(function () {",
  '  var sesion = { user: { name: "Ariadna Ferrer", email: "admin@trendhunter.pro", role: "ADMIN", planType: "BUSINESS" }, expires: "2099-12-31T23:59:59.999Z" };',
  '  var aviso = "Estás viendo la versión estática publicada en GitHub Pages: esta acción necesita el servidor de TrendHunter Pro.";',
  "  var original = window.fetch.bind(window);",
  "  function respuesta(datos, estado) {",
  '    return new Response(JSON.stringify(datos), { status: estado, headers: { "Content-Type": "application/json" } });',
  "  }",
  "  window.fetch = function (recurso, opciones) {",
  '    var url = typeof recurso === "string" ? recurso : (recurso && recurso.url) || "";',
  '    if (url.indexOf("/api/") !== -1) {',
  '      if (url.indexOf("/api/auth/session") !== -1) return Promise.resolve(respuesta(sesion, 200));',
  '      if (url.indexOf("/api/auth/csrf") !== -1) return Promise.resolve(respuesta({ csrfToken: "estatico" }, 200));',
  '      return Promise.resolve(respuesta({ error: "Modo demostración estática", detalle: aviso, estatico: true }, 501));',
  "    }",
  "    return original(recurso, opciones);",
  "  };",
  "})();",
].join("\n");

console.log("[build:pages] 4b/6 · Añadiendo sesión de demostración y aviso…");
parchear(
  "src/app/layout.tsx",
  'import { SessionProvider } from "next-auth/react";',
  'import { SessionProvider } from "next-auth/react";\nimport { SESION_ESTATICA } from "@/auth";',
  "import de la sesión estática",
);
parchear(
  "src/app/layout.tsx",
  "<SessionProvider>",
  "<SessionProvider session={SESION_ESTATICA as never}>",
  "proveedor de sesión con datos fijos",
);
parchear(
  "src/app/layout.tsx",
  "export const metadata: Metadata = {",
  `/** Intercepto de peticiones: sustituye a la API en la versión estática. */\nconst CODIGO_INTERCEPTOR = ${JSON.stringify(CODIGO_INTERCEPTOR)};\n\nexport const metadata: Metadata = {`,
  "definición del intercepto",
);
parchear(
  "src/app/layout.tsx",
  '<body className="min-h-screen antialiased">',
  `<body className="min-h-screen antialiased">\n        {/* Aviso de que se trata de la versión estática publicada en GitHub Pages. */}\n        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">\n          <span className="font-semibold">Versión estática en GitHub Pages.</span> Datos reales del entorno de\n          demostración; la IA, los filtros del servidor, el guardado y los pagos necesitan el backend.{" "}\n          <a className="underline underline-offset-2" href=${JSON.stringify(URL_APP)}>\n            Abrir la aplicación completa\n          </a>\n        </div>\n        <script dangerouslySetInnerHTML={{ __html: CODIGO_INTERCEPTOR }} />`,
  "aviso de versión estática",
);

console.log("[build:pages] 5/6 · Compilando la exportación estática…");
execFileSync("npx", ["next", "build"], {
  cwd: TRABAJO,
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_PROVIDER: "sqlite",
    DATABASE_URL: `file:${path.join(RAIZ, "prisma", "trendhunter.db")}`,
    NEXT_TELEMETRY_DISABLED: "1",
  },
});

if (!existsSync(SALIDA)) throw new Error("[build:pages] La exportación no generó la carpeta out/.");

console.log("[build:pages] 6/6 · Publicando en docs/…");
cpSync(SALIDA, DESTINO, { recursive: true });
// `_next` empieza por guion bajo: sin este fichero Jekyll lo ignoraría.
writeFileSync(path.join(DESTINO, ".nojekyll"), "");

// Las imágenes de `public/` se referencian con rutas absolutas (/images/…).
// En GitHub Pages el sitio vive bajo /<repositorio>, así que se reescriben
// tanto en el HTML como en las cargas RSC que usa la navegación del cliente.
const ficherosDeTexto = execFileSync("find", [DESTINO, "-name", "*.html", "-o", "-name", "*.txt"], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);

let reescritos = 0;
for (const fichero of ficherosDeTexto) {
  const contenido = readFileSync(fichero, "utf8");
  if (!contenido.includes('"/images/')) continue;
  writeFileSync(fichero, contenido.replaceAll('"/images/', `"${BASE_PATH}/images/`));
  reescritos += 1;
}
console.log(`[build:pages] Rutas de imágenes ajustadas en ${reescritos} ficheros.`);

const rutas = execFileSync("find", [DESTINO, "-name", "index.html"], { encoding: "utf8" }).trim().split("\n");
console.log(`[build:pages] Listo: ${rutas.length} páginas en docs/ (base path ${BASE_PATH}).`);
