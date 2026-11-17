import { useMemo } from 'react';
import { patchMeta } from '../editor/store';
import type { Project } from '../model/types';
import type { Validation } from '../model/validate';
import { navigate } from '../router';
import { buildProjectScene } from '../viewer/sceneDef';
import { Viewer } from '../viewer/Viewer';

/**
 * Visor de un proyecto del usuario. La escena se reconstruye a partir de la
 * geometría del proyecto; los acabados se cambian sin regenerarla.
 */
export default function ProjectViewer({ project, validation }: { project: Project; validation: Validation }) {
  const { walls, openings, slab, rooms, name, id } = project;
  const def = useMemo(
    () => buildProjectScene(project),
    // Solo la geometría y el nombre regeneran el modelo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [walls, openings, slab, rooms, name, id],
  );
  const toPlan = () => navigate({ name: 'proyecto', id, view: 'plano' });
  const notices = validation.canWalk
    ? []
    : [
        'Este modelo aún no se puede recorrer a pie.',
        ...validation.issues.filter((i) => i.fix === 'room').map((i) => i.message),
        'Vuelve al plano para corregirlo; mientras tanto puedes ver el exterior y la maqueta.',
      ];
  return (
    <Viewer
      def={def}
      onExit={toPlan}
      exitLabel="Volver al plano"
      secondary={{ label: 'Editar plano', onClick: toPlan }}
      finishes={project.finishes}
      onFinishesChange={(finishes) => patchMeta({ finishes })}
      notices={notices}
      fallback={{ label: 'Volver al plano 2D', onClick: toPlan }}
    />
  );
}
