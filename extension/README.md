# Extensión TrendHunter Pro (Chrome, MV3)

Detecta tiendas Shopify mientras navegas y abre el
**Shop Analyzer** de tu TrendHunter Pro con un clic.

> **100 % local**: no recoge ni envía ningún dato.
> Ver `privacy.md` y `store-listing.md` (publicación
> en la Chrome Web Store, 5 $ una vez).

## Instalación local (modo desarrollador)

1. Chrome → `chrome://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** → selecciona esta carpeta `extension/`.
4. Pincha el icono ⚡, pon la URL de tu app
   (ej. `https://tudominio.com`) y guárdala.
5. Abre cualquier tienda Shopify: verás la etiqueta
   «Shopify detectada» y podrás analizarla al instante.

## Cómo funciona

- `content.js` detecta Shopify (meta generator o cart.js).
- `popup.html/js` guarda la URL de tu app y abre
  `/dashboard/shop-analyzer?url=…` (deep link que
  prefija el campo y autoanaliza).
- Permisos: `activeTab` (solo la pestaña actual, al
  pulsar) y `storage` (recordar tu URL).

## Publicación

Ver `store-listing.md`: cuenta de desarrollador (5 $),
ficha, capturas y checklist de revisión.
