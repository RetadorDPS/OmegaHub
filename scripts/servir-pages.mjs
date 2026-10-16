/**
 * Sirve localmente el sitio estático de `docs/` tal y como lo hará GitHub Pages:
 * bajo el prefijo `/OmegaHub/` y resolviendo rutas con barra final
 * (`/dashboard/` → `docs/dashboard/index.html`).
 *
 *     npm run preview:pages          → http://localhost:4000/OmegaHub/
 *
 * Sirve para comprobar la exportación antes de publicarla.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const PUERTO = Number(process.env.PUERTO ?? 4000);
const PREFIJO = process.env.BASE_PATH ?? "/OmegaHub";
const RAIZ = path.join(process.cwd(), "docs");
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

if (!existsSync(RAIZ)) {
  console.error("[preview:pages] No existe docs/. Ejecuta antes `npm run build:pages`.");
  process.exit(1);
}

createServer((peticion, respuesta) => {
  const url = new URL(peticion.url ?? "/", `http://localhost:${PUERTO}`);
  let ruta = decodeURIComponent(url.pathname);

  // Todo el sitio vive bajo el prefijo del repositorio.
  if (ruta.startsWith(PREFIJO)) ruta = ruta.slice(PREFIJO.length);

  const candidatos = [
    path.join(RAIZ, ruta),
    path.join(RAIZ, ruta, "index.html"),
    path.join(RAIZ, `${ruta}.html`),
  ];
  const fichero = candidatos.find((candidato) => existsSync(candidato) && statSync(candidato).isFile()) ??
    path.join(RAIZ, "404.html");

  const extension = path.extname(fichero);
  respuesta.writeHead(fichero.endsWith("404.html") ? 404 : 200, {
    "Content-Type": TIPOS[extension] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(fichero).pipe(respuesta);
}).listen(PUERTO, "0.0.0.0", () => {
  console.log(`[preview:pages] http://localhost:${PUERTO}${PREFIJO}/`);
});
