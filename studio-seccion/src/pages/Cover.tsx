import { hrefFor } from '../router';

/**
 * Portada: un único encuadre arquitectónico a pantalla completa. El póster es
 * una captura de la propia escena 3D de Casa Mirador (ver scripts/capturas.mjs).
 */
export function Cover() {
  return (
    <main className="cover" data-testid="portada">
      <img className="cover__poster" src="./poster-casa-mirador.jpg" alt="" fetchPriority="high" decoding="async" />
      <header className="cover__top">
        <a className="wordmark" href={hrefFor({ name: 'portada' })}>
          Studio Sección <small>Recorridos de arquitectura</small>
        </a>
        <a className="cover__link" href={hrefFor({ name: 'proyectos' })} data-testid="ir-proyectos">
          Mis proyectos
        </a>
      </header>
      <section className="cover__body">
        <p className="mono cover__kicker">Proyecto de muestra · vivienda de una planta</p>
        <h1 className="cover__title">Casa Mirador</h1>
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
        </div>
      </section>
      <footer className="cover__foot mono">
        <span>
          <b>81 m²</b> construidos · <b>29 m²</b> de terraza
        </span>
        <span>
          <b>3</b> estancias + terraza
        </span>
        <span>
          Visita guiada · exploración libre · obra por etapas
        </span>
      </footer>
    </main>
  );
}
