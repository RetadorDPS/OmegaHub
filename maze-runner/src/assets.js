/* =============================================================
   Maze Runner Mobile — assets opcionales (ilustraciones extra)
   En esta reconstrucción no se incluyen imágenes generadas por IA.
   El juego funciona 100% con arte procedural; este módulo es un
   cargador seguro que no rompe nada si no hay nada que cargar.
   ============================================================= */

export const ASSET_DATA = {
  // title: 'data:image/jpeg;base64,...',
  // grieverScene: 'data:image/jpeg;base64,...',
};

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('no se pudo cargar el asset'));
    img.src = src;
  });
}

/** Carga todos los assets; si falla o no hay ninguno, devuelve {} y el juego sigue con arte procedural. */
export async function loadAssets() {
  const out = {};
  for (const k of Object.keys(ASSET_DATA)) {
    try { out[k] = await loadImage(ASSET_DATA[k]); } catch { /* fallback procedural */ }
  }
  return out;
}
