// Arranque común de Chromium para capturas y pruebas de extremo a extremo.
// Requiere Playwright (`npm i -D playwright && npx playwright install chromium`)
// o una instalación global accesible por NODE_PATH. CHROMIUM_PATH permite
// apuntar a un binario concreto.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try {
      return require(name);
    } catch {
      /* se prueba el siguiente */
    }
  }
  throw new Error('No se encontró Playwright. Instálalo con: npm i -D playwright && npx playwright install chromium');
}

export async function launch() {
  const { chromium } = loadPlaywright();
  return chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    // WebGL por software: funciona sin GPU (CI, contenedores).
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

export const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
