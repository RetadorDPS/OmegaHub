#!/usr/bin/env python3
"""
Procesa las imágenes descargadas (carpeta `image-search/`) y genera los assets
optimizados que usa la plataforma en `public/images/products/`.

- Convierte todo a JPEG (webp/png → jpg) con fondo blanco si hay transparencia.
- Reescala al ancho máximo indicado manteniendo la proporción.
- Nombra los ficheros como `<id-producto>-<n>.jpg` (p. ej. `p01-1.jpg`).
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "image-search"
DESTINO = RAIZ / "public" / "images" / "products"
ANCHO_MAXIMO = 900

# Prefijo del archivo descargado → id de producto del catálogo (p01..p20)
MAPA = [
    ("electric-neck-massager", "p01"),
    ("led-face-mask", "p02"),
    ("wireless-earbuds", "p03"),
    ("hot-air-brush", "p04"),
    ("fluffy-calming-donut-dog-bed", "p05"),
    ("galaxy-star-projector", "p06"),
    ("vibrating-percussion-muscle-massage-gun", "p07"),
    ("rotating-spice-rack", "p08"),
    ("automatic-smart-pet-feeder", "p09"),
    ("ipl-laser-hair-removal", "p10"),
    ("indoor-wifi-security-camera", "p11"),
    ("resistance-bands-set", "p12"),
    ("orthopedic-memory-foam-cervical", "p13"),
    ("face-sculpting-roller", "p14"),
    ("automatic-pet-water-fountain", "p15"),
    ("desk-lamp-with-wireless-charger", "p16"),
    ("handheld-cordless-car-vacuum", "p17"),
    ("magnesium-glycinate-supplement", "p18"),
    ("anti-theft-laptop-backpack", "p19"),
    ("pilates-bar-kit", "p20"),
]


def preparar_imagen(ruta: Path) -> Image.Image:
    """Abre una imagen y la convierte a RGB lista para guardar como JPEG."""
    imagen = Image.open(ruta)
    if imagen.mode in ("RGBA", "LA", "P"):
        # Aplanamos la transparencia sobre fondo blanco.
        imagen = imagen.convert("RGBA")
        fondo = Image.new("RGB", imagen.size, (255, 255, 255))
        fondo.paste(imagen, mask=imagen.split()[-1])
        return fondo
    return imagen.convert("RGB")


def redimensionar(imagen: Image.Image, ancho_maximo: int = ANCHO_MAXIMO) -> Image.Image:
    """Reescala la imagen si supera el ancho máximo indicado."""
    if imagen.width <= ancho_maximo:
        return imagen
    alto = round(imagen.height * (ancho_maximo / imagen.width))
    return imagen.resize((ancho_maximo, alto), Image.LANCZOS)


def main() -> int:
    if not ORIGEN.exists():
        print(f"[imagenes] No existe la carpeta de origen {ORIGEN}", file=sys.stderr)
        return 1

    DESTINO.mkdir(parents=True, exist_ok=True)
    ficheros = sorted(ORIGEN.iterdir())
    procesadas = 0

    for prefijo, producto in MAPA:
        candidatos = sorted(f for f in ficheros if f.name.startswith(prefijo))
        if not candidatos:
            print(f"[imagenes] AVISO: sin imágenes para {producto} ({prefijo})")
            continue
        for indice, fichero in enumerate(candidatos, start=1):
            salida = DESTINO / f"{producto}-{indice}.jpg"
            try:
                imagen = redimensionar(preparar_imagen(fichero))
                imagen.save(salida, "JPEG", quality=82, optimize=True, progressive=True)
                procesadas += 1
            except Exception as error:  # noqa: BLE001 — informe por consola suficiente
                print(f"[imagenes] ERROR con {fichero.name}: {error}", file=sys.stderr)

    total_bytes = sum(f.stat().st_size for f in DESTINO.glob("*.jpg"))
    print(f"[imagenes] {procesadas} imágenes procesadas en {DESTINO}")
    print(f"[imagenes] Peso total: {total_bytes / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
