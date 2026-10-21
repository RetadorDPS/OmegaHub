# Política de privacidad · Extensión TrendHunter Pro

## Resumen

La extensión **no recopila, no almacena y no transmite**
ningún dato personal. Funciona enteramente en tu navegador.

## Qué hace la extensión

1. **Detectar tiendas Shopify** en la pestaña que estás
   visitando (busca el meta tag `generator="Shopify"` y la
   ruta `/cart.js`, solo en esa página).
2. **Guardar la URL de tu instancia** de TrendHunter Pro en
   el almacenamiento local del navegador (`chrome.storage.local`),
   para construir el enlace de análisis.
3. **Abrir** `/dashboard/shop-analyzer?url=…` cuando pulsas
   el botón.

## Permisos y por qué

| Permiso | Motivo |
| --- | --- |
| `activeTab` | Leer la URL de la pestaña actual, solo cuando usas la extensión. |
| `storage` | Recordar la URL de tu app TrendHunter Pro. |

## Qué NO hace

- No hay servidores propios: ningún dato sale de tu navegador
  salvo la apertura de la URL de tu app cuando tú lo pides.
- No hay cookies, trackers, analytics ni publicidad.
- No leemos el contenido de otras pestañas ni el historial.

## Contacto

Para dudas o eliminación de datos: escribe al soporte de la
app TrendHunter Pro (el correo que aparece en la web de la app).
