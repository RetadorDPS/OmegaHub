import { useSyncExternalStore } from 'react';

/** Rutas por hash: la app funciona servida como archivos estáticos desde cualquier carpeta. */
export type Route =
  | { name: 'portada' }
  | { name: 'demo' }
  | { name: 'proyectos' }
  | { name: 'proyecto'; id: string; view: 'plano' | '3d' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'demo') return { name: 'demo' };
  if (parts[0] === 'proyectos') return { name: 'proyectos' };
  if (parts[0] === 'proyecto' && parts[1]) {
    return { name: 'proyecto', id: decodeURIComponent(parts[1]), view: parts[2] === '3d' ? '3d' : 'plano' };
  }
  return { name: 'portada' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'demo':
      return '#/demo';
    case 'proyectos':
      return '#/proyectos';
    case 'proyecto':
      return `#/proyecto/${encodeURIComponent(route.id)}${route.view === '3d' ? '/3d' : ''}`;
    default:
      return '#/';
  }
}

export function navigate(route: Route, replace = false) {
  const href = hrefFor(route);
  if (replace) window.location.replace(href);
  else window.location.hash = href;
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
