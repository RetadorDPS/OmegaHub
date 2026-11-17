import { useViewer } from './store';

/** Progreso y acciones del modo «Foto realista». */
export function PhotoPanel({ onClose }: { onClose: () => void }) {
  const photo = useViewer((s) => s.photo);
  const samples = useViewer((s) => s.photoSamples);
  const target = useViewer((s) => s.photoTarget);
  const tick = useViewer((s) => s.tick);
  return (
    <div className="photo" role="dialog" aria-label="Foto realista" data-testid="panel-foto">
      <div className="photo__card">
        <p className="mono photo__kicker">Foto realista · trazado de rayos</p>
        <p className="photo__status" data-testid="foto-estado">
          {target === 0 ? 'Preparando la escena…' : photo === 'done' ? `Listo · ${samples} muestras` : `Calculando la luz · ${samples} de ${target} muestras`}
        </p>
        <div className="photo__bar" aria-hidden="true">
          <span style={{ width: `${target ? Math.min(100, (samples / target) * 100) : 0}%` }} />
        </div>
        <p className="photo__hint">
          La imagen se afina sola: cuantas más muestras, menos grano. Se calcula en tu dispositivo; en un móvil puede tardar un par de minutos.
        </p>
        <div className="photo__actions">
          <button
            type="button"
            className="btn btn--light btn--small"
            data-testid="descargar-foto"
            disabled={target === 0}
            onClick={() => useViewer.setState({ capture: true, tick: tick + 1 })}
          >
            Descargar imagen
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            data-testid="cerrar-foto"
            onClick={() => {
              useViewer.setState({ photo: 'off', photoTarget: 0, photoSamples: 0 });
              onClose();
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
