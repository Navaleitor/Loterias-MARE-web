"""
Prueba 2 (parte Python): exporta una hoja de referencia por tipo, hecha con
los generadores REALES de loterias/ (desde las imagenes originales).

Para cada tipo:
  1. random.seed(SEMILLA) y se llama la funcion de reparto -> asignacion fija.
  2. random.seed(SEMILLA) otra vez y se genera la hoja completa con la funcion
     de armado de Python (que repite el MISMO reparto por la semilla).
  3. Se guardan  <tipo>.json  (asignacion)  y  <tipo>.png  (hoja sin perdida).
  4. Se repite el armado de Python pero con las imagenes YA preparadas de
     docs/img (las que usa la pagina) -> <tipo>_docsimg.png. El canvas del
     navegador debe ser IDENTICO a esta hoja (mismo codigo de armado, mismas
     imagenes): asi se prueba que el JS coloca todo exactamente igual.

Uso: python tests/referencia_python.py <carpeta_salida>
"""

import json
import os
import random
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

from PIL import Image  # noqa: E402

from loterias import centros_dobles, pozitos  # noqa: E402

SEMILLA = 2024
IMAGENES = os.path.join(BASE, "imagenes_loteria")
DOCS_IMG = os.path.join(BASE, "docs", "img")


def abrir_docs(conjunto, n):
    return Image.open(os.path.join(DOCS_IMG, conjunto, "%d.jpg" % n)).convert("RGB")


def main(salida):
    os.makedirs(salida, exist_ok=True)

    # ---- Centros dobles ----
    centros_dobles._carpeta = IMAGENES
    centros_dobles._imagenes.clear()
    centros_dobles.cargar_imagenes()
    random.seed(SEMILLA)
    cartas = [list(c) for c in centros_dobles.repartir_hoja()]
    random.seed(SEMILLA)
    hoja = centros_dobles.generar_hoja()
    with open(os.path.join(salida, "centros_doble.json"), "w") as f:
        json.dump({"cartas": cartas}, f)
    hoja.save(os.path.join(salida, "centros_doble.png"))
    hoja.save(os.path.join(salida, "centros_doble_python.jpg"), "JPEG")   # como en el PDF de Python
    # Mismo armado de Python, con las imagenes de docs/img en la cache.
    for n in range(1, 55):
        centros_dobles._imagenes[n] = abrir_docs("cd", n)
    random.seed(SEMILLA)
    centros_dobles.generar_hoja().save(os.path.join(salida, "centros_doble_docsimg.png"))

    # ---- Pozitos v2 y v3 ----
    pozitos._carpeta = IMAGENES
    pozitos._cache.clear()
    pozitos.precargar_imagenes()
    for nombre, patron in (("pozitos_v2", pozitos.PATRON_V2), ("pozitos_v3", pozitos.PATRON_V3)):
        random.seed(SEMILLA)
        columnas = pozitos.generar_columnas()
        random.seed(SEMILLA)
        hoja = pozitos.generar_carta(0, patron)
        with open(os.path.join(salida, nombre + ".json"), "w") as f:
            json.dump({"columnas": columnas, "patron": [list(p) for p in patron]}, f)
        hoja.save(os.path.join(salida, nombre + ".png"))
        hoja.save(os.path.join(salida, nombre + "_python.jpg"), "JPEG")

    # Mismo armado de Python, con las imagenes de docs/img en la cache.
    for n in range(1, 55):
        pozitos._cache[("A_centrada", n)] = abrir_docs("pa", n)
        pozitos._cache[(n, pozitos.TAM_BC)] = abrir_docs("pbc", n)
    for nombre, patron in (("pozitos_v2", pozitos.PATRON_V2), ("pozitos_v3", pozitos.PATRON_V3)):
        random.seed(SEMILLA)
        pozitos.generar_carta(0, patron).save(os.path.join(salida, nombre + "_docsimg.png"))
    print("Referencias de Python en " + salida)


if __name__ == "__main__":
    main(sys.argv[1])
