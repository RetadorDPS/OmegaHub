import { create } from 'zustand';

/**
 * guia     · visita guiada por paradas
 * orbita   · exploración libre desde fuera
 * caminar  · exploración libre a pie, con colisiones
 * maqueta  · vista superior sin cubierta
 * obra     · visualización por etapas
 */
export type Mode = 'guia' | 'orbita' | 'caminar' | 'maqueta' | 'obra';
export type Quality = 'alta' | 'media' | 'baja';

export interface ViewerUI {
  mode: Mode;
  /** Parada más cercana de la visita. */
  stop: number;
  moving: boolean;
  playing: boolean;
  /** Etapa de obra seleccionada. */
  stage: number;
  /** Fundido a negro activo (cortes de cámara). */
  fade: boolean;
  quality: Quality;
  showDimensions: boolean;
  helpOpen: boolean;
  finishesOpen: boolean;
  toast: string | null;
  ready: boolean;
  /** Se incrementa para pedir un redibujado desde fuera del lienzo. */
  tick: number;
}

export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'media';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (coarse || small) return cores <= 4 ? 'baja' : 'media';
  return cores >= 8 ? 'alta' : 'media';
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

const initial = (): ViewerUI => ({
  mode: 'guia',
  stop: 0,
  moving: false,
  playing: false,
  stage: 0,
  fade: false,
  quality: detectQuality(),
  showDimensions: true,
  helpOpen: false,
  finishesOpen: false,
  toast: null,
  ready: false,
  tick: 0,
});

export const useViewer = create<ViewerUI>(() => initial());

export const resetViewerUI = (patch: Partial<ViewerUI> = {}) =>
  useViewer.setState({ ...initial(), ...patch }, true);

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string, ms = 3200) {
  clearTimeout(toastTimer);
  useViewer.setState({ toast: message });
  toastTimer = setTimeout(() => useViewer.setState({ toast: null }), ms);
}
