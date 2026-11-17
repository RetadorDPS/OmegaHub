import { useMemo, useState } from 'react';
import { balconyRect, buildingParts, findFlat, flatProject, FLAT_D } from '../demo/residencial';
import { rectCollider } from '../generate/collision';
import { hrefFor, navigate } from '../router';
import { buildProjectScene } from '../viewer/sceneDef';
import { Viewer } from '../viewer/Viewer';

const euros = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

/** Un piso de Residencial Alameda, recorrido a su altura real dentro del edificio. */
export default function FlatPage({ id }: { id: string }) {
  const unit = findFlat(id);
  const project = useMemo(() => (unit ? flatProject(unit) : null), [unit]);
  const [finishes, setFinishes] = useState(project?.finishes);
  const def = useMemo(() => {
    if (!unit || !project) return null;
    const context = buildingParts(unit);
    const b = balconyRect(unit.letter);
    const def = buildProjectScene(project, {
      elevation: unit.level,
      context: context.parts,
      contextColliders: [
        ...context.colliders,
        // Barandilla y laterales del balcón.
        rectCollider(b.x0, b.z1 - 0.06, b.x1, b.z1 + 0.06, 'barandilla'),
        rectCollider(b.x0 - 0.1, b.z0, b.x0, b.z1, 'barandilla'),
        rectCollider(b.x1, b.z0, b.x1 + 0.1, b.z1, 'barandilla'),
      ],
      floors: [{ rect: { x0: b.x0, x1: b.x1, z0: FLAT_D - 0.1, z1: b.z1 }, y: 0.02 }],
      exteriorPose: { pos: [unit.letter === 'A' ? -6 : 18, 2 - unit.level * 0.55, FLAT_D + 16], look: [6, 0.8, 4] },
    });
    def.entryPoints.push({ id: 'balcon', name: 'Balcón', point: { x: (b.x0 + b.x1) / 2, y: FLAT_D + 0.9 }, yaw: 0 });
    return def;
  }, [unit, project]);

  if (!unit || !def || !finishes) {
    return (
      <main className="blocked" role="alert">
        <h1>Ese piso no existe</h1>
        <p>Vuelve al edificio y elige una vivienda.</p>
        <a className="btn btn--dark" href={hrefFor({ name: 'edificio' })}>
          Ver Residencial Alameda
        </a>
      </main>
    );
  }
  return (
    <Viewer
      def={def}
      onExit={() => navigate({ name: 'edificio' })}
      exitLabel="Edificio"
      secondary={{ label: `${unit.area} m² · ${euros(unit.price)}`, onClick: () => navigate({ name: 'edificio' }) }}
      finishes={finishes}
      onFinishesChange={setFinishes}
      notices={[`Datos de ejemplo · ${unit.label} · planta ${unit.floor} · mobiliario ilustrativo`]}
      share={async () => `${window.location.origin}${window.location.pathname}${hrefFor({ name: 'piso', id: unit.id })}`}
      fallback={{ label: 'Volver al edificio', onClick: () => navigate({ name: 'edificio' }) }}
    />
  );
}
