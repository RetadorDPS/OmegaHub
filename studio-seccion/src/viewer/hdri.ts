/**
 * Cielos HDRI para la iluminación y los reflejos. Vienen del paquete
 * @pmndrs/assets (selección de Poly Haven, CC0, 512 × 512 en EXR) y se cargan
 * solo cuando el visor los pide. No hay descargas de terceros en ejecución:
 * el archivo forma parte del build de la app.
 */
import { EquirectangularReflectionMapping, type DataTexture } from 'three';

export type HdriName = 'sunset' | 'dawn' | 'park' | 'sky' | 'night';

const SOURCES: Record<HdriName, () => Promise<{ default: string }>> = {
  sunset: () => import('@pmndrs/assets/hdri/sunset.exr.js'),
  dawn: () => import('@pmndrs/assets/hdri/dawn.exr.js'),
  park: () => import('@pmndrs/assets/hdri/park.exr.js'),
  sky: () => import('@pmndrs/assets/hdri/sky.exr.js'),
  night: () => import('@pmndrs/assets/hdri/night.exr.js'),
};

const cache = new Map<HdriName, Promise<DataTexture>>();

/** Textura equirectangular en coma flotante (la usan PMREM y el trazador de rayos). */
export function loadHdri(name: HdriName): Promise<DataTexture> {
  let p = cache.get(name);
  if (!p) {
    p = (async () => {
      const [{ default: url }, { EXRLoader }] = await Promise.all([
        SOURCES[name](),
        import('three/examples/jsm/loaders/EXRLoader.js'),
      ]);
      const texture = (await new EXRLoader().loadAsync(url)) as DataTexture;
      texture.mapping = EquirectangularReflectionMapping;
      return texture;
    })();
    // Si falla, se permite reintentar más tarde.
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}
