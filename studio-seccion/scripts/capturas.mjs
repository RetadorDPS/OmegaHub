// Genera el póster de la portada a partir de la PROPIA escena 3D de Casa Mirador
// (parada «Acercamiento» de la visita guiada), sin interfaz encima.
//
//   npm run build && npm run preview     (en otra terminal)
//   npm run capturas
//
// Resultado: public/poster-villa-mirador.jpg (se empaqueta en el siguiente build).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BASE_URL, launch } from './lib/browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`${BASE_URL}#/demo`);
await page.waitForSelector('[data-testid="viewer"][data-ready="true"]', { timeout: 60000 });
const quality = async (q) => {
  await page.click('[data-testid="abrir-ayuda"]');
  await page.click(`[data-testid="calidad-${q}"]`);
  await page.keyboard.press('Escape');
};
/** Espera a que la escena deje de dibujar (render bajo demanda en reposo). */
const idle = async () => {
  let last = -1;
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(1500);
    const frames = await page.evaluate(() => window.__studio.controller.debug().frames);
    if (frames === last) return;
    last = frames;
  }
};
// El travelling se hace en calidad baja (rápido incluso sin GPU) y la calidad
// alta se activa solo para el fotograma final.
await quality('baja');
await page.click('[data-testid="siguiente"]');
await page.waitForFunction(
  () => {
    const d = window.__studio.controller.debug();
    return d.target === 1 && Math.abs(d.s - 1) < 1e-4;
  },
  null,
  { timeout: 180000 },
);
await quality('alta');
// Solo la escena: se oculta toda la interfaz del visor.
await page.addStyleTag({ content: '.viewer > :not(.viewer__stage) { display: none !important; }' });
await idle();
await page.screenshot({ path: join(root, 'public', 'poster-villa-mirador.jpg'), type: 'jpeg', quality: 84, timeout: 120000 });
await browser.close();
console.log('Póster generado: public/poster-villa-mirador.jpg');
