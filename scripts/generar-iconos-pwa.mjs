#!/usr/bin/env node
/**
 * ============================================================================
 *  GENERADOR DE ICONOS PWA
 * ============================================================================
 *  Dibuja los iconos de la aplicación sin dependencias externas (sin PIL,
 *  sin sharp): rasteriza en memoria y escribe PNG con `zlib`.
 *
 *   node scripts/generar-iconos-pwa.mjs
 *
 *  Salida en `public/icons/`:
 *    icon-192.png             · icono estándar (esquinas redondeadas)
 *    icon-512.png             · icono estándar en alta densidad
 *    icon-maskable-512.png    · full-bleed con zona segura (Android adaptativo)
 *    apple-touch-icon-180.png · iOS (sin transparencia, esquinas cuadradas)
 *    favicon-64.png           · pestaña del navegador
 *
 *  El diseño replica la marca: degradado índigo→violeta con el rayo blanco.
 * ============================================================================
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SALIDA = path.join(process.cwd(), "public", "icons");

// ---------------------------------------------------------------------------
//  Codificador PNG mínimo (RGBA de 8 bits)
// ---------------------------------------------------------------------------

/** Tabla CRC32 (polinomio PNG). */
const CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Trozo PNG: longitud + tipo + datos + CRC. */
function trozo(tipo, datos) {
  const longitud = Buffer.alloc(4);
  longitud.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([longitud, cuerpo, crc]);
}

/** Serializa píxeles RGBA (width × height × 4) a PNG. */
function aPng(ancho, alto, rgba) {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(alto, 4);
  cabecera[8] = 8; // bits por canal
  cabecera[9] = 6; // RGBA
  const filas = Buffer.alloc((ancho * 4 + 1) * alto);
  for (let y = 0; y < alto; y += 1) {
    const destino = y * (ancho * 4 + 1);
    filas[destino] = 0; // filtro «none»
    rgba.copy(filas, destino + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", cabecera),
    trozo("IDAT", deflateSync(filas, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
//  Dibujo: degradado + rayo
// ---------------------------------------------------------------------------

/** Rayo de la marca en coordenadas normalizadas (0–1). */
const RAYO = [
  [0.575, 0.075],
  [0.255, 0.555],
  [0.455, 0.555],
  [0.395, 0.925],
  [0.745, 0.435],
  [0.525, 0.435],
];

/** ¿El punto (x, y) está dentro del polígono? (ray casting). */
function dentroDelPoligono(x, y, poligono) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i, i += 1) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    const cruza = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/** Interpolación lineal entre dos colores RGB. */
function mezclar(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const INDIGO = [79, 70, 229];
const VIOLETA = [124, 58, 237];

/**
 * Genera un icono.
 *
 * @param tamano    Lado en píxeles.
 * @param opciones.radio      Radio de las esquinas (0–0.5 del lado).
 * @param opciones.opaco      Sin transparencia (iOS no admite alfa).
 * @param opciones.escalaRayo Tamaño del rayo respecto al lienzo.
 */
function generarIcono(tamano, { radio = 0.22, opaco = false, escalaRayo = 1 } = {}) {
  const pixeles = Buffer.alloc(tamano * tamano * 4);
  const muestras = 3; // supermuestreo 3×3 para bordes suaves
  const centro = tamano / 2;
  const ladoRayo = tamano * escalaRayo;
  const origenRayo = centro - ladoRayo / 2;
  const radioPx = radio * tamano;

  for (let y = 0; y < tamano; y += 1) {
    for (let x = 0; x < tamano; x += 1) {
      let cubierto = 0;
      let rayo = 0;
      for (let sy = 0; sy < muestras; sy += 1) {
        for (let sx = 0; sx < muestras; sx += 1) {
          const px = x + (sx + 0.5) / muestras;
          const py = y + (sy + 0.5) / muestras;

          // Esquinas redondeadas: distancia al rectángulo interior.
          let dentro = true;
          if (!opaco) {
            const dx = Math.max(radioPx - px, px - (tamano - radioPx), 0);
            const dy = Math.max(radioPx - py, py - (tamano - radioPx), 0);
            dentro = dx * dx + dy * dy <= radioPx * radioPx;
          }
          if (!dentro) continue;
          cubierto += 1;

          const nx = (px - origenRayo) / ladoRayo;
          const ny = (py - origenRayo) / ladoRayo;
          if (dentroDelPoligono(nx, ny, RAYO)) rayo += 1;
        }
      }

      const total = muestras * muestras;
      const indice = (y * tamano + x) * 4;
      if (cubierto === 0) {
        pixeles[indice + 3] = 0;
        continue;
      }

      // Degradado diagonal índigo → violeta.
      const t = (x / tamano) * 0.55 + (y / tamano) * 0.45;
      const fondo = mezclar(INDIGO, VIOLETA, Math.min(1, t));
      const proporcionRayo = rayo / total;
      const [r, g, b] = mezclar(fondo, [255, 255, 255], proporcionRayo);
      pixeles[indice] = r;
      pixeles[indice + 1] = g;
      pixeles[indice + 2] = b;
      pixeles[indice + 3] = opaco ? 255 : Math.round((cubierto / total) * 255);
    }
  }

  return aPng(tamano, tamano, pixeles);
}

mkdirSync(SALIDA, { recursive: true });

const iconos = [
  { archivo: "icon-192.png", tamano: 192, opciones: { radio: 0.22 } },
  { archivo: "icon-512.png", tamano: 512, opciones: { radio: 0.22 } },
  { archivo: "icon-maskable-512.png", tamano: 512, opciones: { radio: 0, escalaRayo: 0.72 } },
  { archivo: "apple-touch-icon-180.png", tamano: 180, opciones: { radio: 0, opaco: true } },
  { archivo: "favicon-64.png", tamano: 64, opciones: { radio: 0.24 } },
];

for (const { archivo, tamano, opciones } of iconos) {
  const png = generarIcono(tamano, opciones);
  writeFileSync(path.join(SALIDA, archivo), png);
  console.log(`[iconos] ${archivo.padEnd(30)} ${tamano}×${tamano} · ${(png.length / 1024).toFixed(1)} kB`);
}

// Favicon de 32 px también en la raíz (pestañas y lectores de feeds).
writeFileSync(path.join(process.cwd(), "public", "favicon.png"), generarIcono(32, { radio: 0.24 }));
console.log("[iconos] public/favicon.png            32×32");
