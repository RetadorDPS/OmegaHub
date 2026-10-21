# Publicación en la Chrome Web Store · Checklist

> Coste: **5 $ una sola vez** (cuenta de desarrollador de Google).
> Todo el código de la extensión está en `extension/` y es 100 %
> local: no recoge ni envía ningún dato (ver `privacy.md`).

## 1 · Cuenta de desarrollador (una vez)

1. Ve a <https://chrome.google.com/webhub/devconsole/> con tu cuenta Google.
2. Paga la tasa única de **5 $**.
3. Verifica la cuenta (puede tardar hasta 24 h la primera vez).

## 2 · Empaquetar

La extensión ya está lista: sube la carpeta `extension/`
completa (manifest.json + popup + content.js + icons).
No hay dependencias ni paso de compilación.

Opcional: comprime la carpeta en ZIP para subir el paquete.

## 3 · Ficha de la tienda (copia y pega)

- **Nombre:** TrendHunter Pro — Shop Analyzer
- **Resumen (132 caracteres):**
  `Detecta tiendas Shopify y ábrelas en TrendHunter Pro con un clic.`
- **Descripción larga:**

  > TrendHunter Pro es una herramienta de investigación de
  > productos y tendencias para e-commerce. Esta extensión
  > detecta cuando visitas una tienda Shopify y te permite
  > analizarla en TrendHunter Pro: métricas de tráfico,
  > ingresos estimados, aplicaciones instaladas y productos
  > destacados.
  >
  > Cómo usarla:
  > 1. Abre cualquier tienda Shopify.
  > 2. Pulsa el icono de la extensión → «Analizar en
  >    TrendHunter Pro».
  > 3. Se abre la app con la URL ya cargada y el análisis
  >    comienza.
  >
  > La extensión funciona solo en tu navegador: no recopila,
  > almacena ni transmite ningún dato personal. Necesita leer
  > la URL de la pestaña actual para ofrecerte el botón de
  > análisis.

- **Categoría:** Compras
- **Idioma:** Español
- **Iconos:** `icons/icon16.png`, `icon48.png`, `icon128.png` (ya incluidos)
- **Capturas:** 2–3 de la extensión en acción (1280×800 o 640×400)

## 4 · Privacidad

- Permisos declarados: `activeTab` (solo la pestaña actual,
  solo al pulsar) y `storage` (guardar la URL de tu app).
- No hay trackers, no hay analytics, no hay llamadas salientes
  salvo a TU propia app cuando pulsas el botón.
- En la consola, sección «Privacidad»: marca
  **«No recopilo los siguientes datos»** y usa `extension/privacy.md`
  como política de privacidad.

## 5 · Revisión

- La revisión de Google suele tardar de 1 a 5 días.
- Si piden justificación de permisos: «activeTab se usa
  únicamente para ofrecer el botón de análisis en la pestaña
  que el usuario está visitando; storage guarda la URL de la
  instancia del usuario».

## 6 · Después de publicar

- Sube la nueva versión desde la consola si cambias
  `manifest.json` (sube también el `version`).
- Comparte el enlace desde la web de la app (deep link
  `/dashboard/shop-analyzer?url=` ya preparado).
