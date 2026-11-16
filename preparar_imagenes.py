"""
===============================================================
 LOTERIAS MARE - Preparar las imagenes de la pagina web (docs/img/)
===============================================================

La pagina web (GitHub Pages) arma las cartas en el navegador. Para que el
resultado sea igual al de la version Python, el navegador NO reescala nada:
solo pega imagenes que ya vienen del tamaño exacto. Este script las prepara
con las MISMAS operaciones que hacen los generadores de loterias/:

    Centros dobles   docs/img/cd/N.jpg    convert("RGB").resize(280x400)
    Pozitos A        docs/img/pa/N.jpg    convert("RGB").resize(340x476)
                                          + recorte de 10 px por lado -> 320x476
    Pozitos B / C    docs/img/pbc/N.jpg   convert("RGB").resize(200x238)

Las medidas se leen de loterias/centros_dobles.py y loterias/pozitos.py
(la fuente de verdad), no se repiten aqui.

Se guardan en JPEG calidad 95 con subsampling 4:4:4 (sin perder color).

USO
    python preparar_imagenes.py                      (lee imagenes_loteria/)
    python preparar_imagenes.py otra/carpeta         (lee de otra carpeta)

Correlo cada vez que cambies alguna figura en imagenes_loteria/.
"""

import os
import sys

from PIL import Image

from loterias import centros_dobles, pozitos
from loterias.comun import TOTAL_FIGURAS

BASE = os.path.dirname(os.path.abspath(__file__))
ORIGEN_PREDETERMINADO = os.path.join(BASE, "imagenes_loteria")
DESTINO = os.path.join(BASE, "docs", "img")

CALIDAD = 95
SUBSAMPLING_444 = 0   # 0 = 4:4:4 en Pillow


def recorte_a(imagen):
    """El mismo recorte que pozitos.cargar_a: 10 px de cada lado."""
    ancho, alto = pozitos.TAM_A
    return imagen.crop((10, 0, ancho - 10, alto))


# Cada conjunto: carpeta en docs/img y la operacion que se le aplica a la figura.
CONJUNTOS = {
    "cd": lambda img: img.resize(centros_dobles.TAM_IMAGEN),
    "pa": lambda img: recorte_a(img.resize(pozitos.TAM_A)),
    "pbc": lambda img: img.resize(pozitos.TAM_BC),
}


def preparar(origen):
    faltan = [n for n in range(1, TOTAL_FIGURAS + 1)
              if not os.path.isfile(os.path.join(origen, "%d.jpg" % n))]
    if faltan:
        sys.exit("Faltan imagenes en %s: %s" % (origen, ", ".join("%d.jpg" % n for n in faltan)))

    for carpeta in CONJUNTOS:
        os.makedirs(os.path.join(DESTINO, carpeta), exist_ok=True)

    for n in range(1, TOTAL_FIGURAS + 1):
        original = Image.open(os.path.join(origen, "%d.jpg" % n)).convert("RGB")
        for carpeta, operacion in CONJUNTOS.items():
            operacion(original).save(os.path.join(DESTINO, carpeta, "%d.jpg" % n),
                                     "JPEG", quality=CALIDAD, subsampling=SUBSAMPLING_444)
        print("\rPreparando %d de %d" % (n, TOTAL_FIGURAS), end="", flush=True)
    print("\nListo: %d imagenes en %s" % (TOTAL_FIGURAS * len(CONJUNTOS), DESTINO))


if __name__ == "__main__":
    preparar(sys.argv[1] if len(sys.argv) > 1 else ORIGEN_PREDETERMINADO)
