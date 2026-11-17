import { useMemo, useState } from 'react';
import { villaMirador } from '../demo/villaMirador';
import { navigate } from '../router';
import { buildDemoScene } from '../viewer/sceneDef';
import { Viewer } from '../viewer/Viewer';

export default function DemoPage() {
  const def = useMemo(() => buildDemoScene(), []);
  // En la demo los acabados solo viven mientras dura la visita.
  const [finishes, setFinishes] = useState(villaMirador.finishes);
  return (
    <Viewer
      def={def}
      onExit={() => navigate({ name: 'portada' })}
      exitLabel="Studio Sección"
      secondary={{ label: 'Crear desde mi plano', onClick: () => navigate({ name: 'proyectos' }) }}
      finishes={finishes}
      onFinishesChange={setFinishes}
      fallback={{ label: 'Crear desde mi plano (2D)', onClick: () => navigate({ name: 'proyectos' }) }}
      share={async () => `${window.location.origin}${window.location.pathname}#/demo`}
    />
  );
}
