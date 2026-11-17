import { lazy, Suspense } from 'react';
import { useRoute } from './router';
import { Cover } from './pages/Cover';

// El visor (Three.js) y el editor (PDF.js) se cargan solo cuando hacen falta:
// la portada llega con el póster y unos pocos KB de código.
const DemoPage = lazy(() => import('./pages/DemoPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const SharedPage = lazy(() => import('./pages/SharedPage'));
const BuildingPage = lazy(() => import('./pages/BuildingPage'));
const FlatPage = lazy(() => import('./pages/FlatPage'));
const ModelPage = lazy(() => import('./pages/ModelPage'));

function Loading({ what }: { what: string }) {
  return (
    <div className="loading" role="status">
      <b>Studio Sección</b>
      <span>Cargando {what}…</span>
    </div>
  );
}

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'demo':
      return (
        <Suspense fallback={<Loading what="Villa Mirador" />}>
          <DemoPage />
        </Suspense>
      );
    case 'proyectos':
      return (
        <Suspense fallback={<Loading what="tus proyectos" />}>
          <ProjectsPage />
        </Suspense>
      );
    case 'proyecto':
      return (
        <Suspense fallback={<Loading what="el proyecto" />}>
          <WorkspacePage key={route.id} id={route.id} view={route.view} />
        </Suspense>
      );
    case 'ver':
      return (
        <Suspense fallback={<Loading what="el recorrido" />}>
          <SharedPage key={route.token} token={route.token} />
        </Suspense>
      );
    case 'edificio':
      return (
        <Suspense fallback={<Loading what="Residencial Alameda" />}>
          <BuildingPage />
        </Suspense>
      );
    case 'piso':
      return (
        <Suspense fallback={<Loading what="el piso" />}>
          <FlatPage key={route.id} id={route.id} />
        </Suspense>
      );
    case 'modelo':
      return (
        <Suspense fallback={<Loading what="el modelo 3D" />}>
          <ModelPage key={route.id} id={route.id} />
        </Suspense>
      );
    default:
      return <Cover />;
  }
}
