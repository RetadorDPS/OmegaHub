import { hrefFor } from '../router';

/**
 * Portada: un único encuadre arquitectónico a pantalla completa. El póster es
 * una captura de la propia escena 3D de Casa Mirador (ver scripts/capturas.mjs).
 */
export function Cover() {
  return (
    <main className="cover" data-testid="portada">
      <img className="cover__poster" src="./poster-villa-mirador.jpg" alt="" fetchPriority="high" decoding="async" />
      <header className="cover__top">
        <a className="wordmark" href={hrefFor({ name: 'portada' })}>
          Studio Sección <small>Recorridos de arquitectura</small>
        </a>
        <a className="cover__link" href={hrefFor({ name: 'proyectos' })} data-testid="ir-proyectos">
          Mis proyectos
        </a>
      </header>
      <section className="cover__body">
        <p className="mono cover__kicker">Proyecto de muestra · villa de una planta con piscina</p>
        <h1 className="cover__title">Villa Mirador</h1>
        <p className="cover__lede">
          Entra, recorre la casa y mira cómo se levanta por etapas. Después, traza tu propio plano y camina por él.
        </p>
        <div className="cover__cta">
          <a className="btn btn--light" href={hrefFor({ name: 'demo' })} data-testid="entrar-demo">
            Entrar al proyecto
          </a>
          <a className="btn btn--ghost" href={hrefFor({ name: 'proyectos' })} data-testid="subir-plano">
            Subir un plano
          </a>
          <a className="btn btn--ghost" href={hrefFor({ name: 'edificio' })} data-testid="ver-edificio">
            Ver una promoción de pisos
          </a>
        </div>
      </section>
      <footer className="cover__foot mono">
        <span>
          <b>187 m²</b> construidos · terraza de <b>118 m²</b> con piscina
        </span>
        <span>
          <b>6</b> estancias
        </span>
        <span>
          Visita guiada · exploración libre · obra por etapas · foto realista
        </span>
      </footer>
    </main>
  );
}
