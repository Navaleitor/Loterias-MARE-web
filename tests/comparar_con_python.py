"""
Prueba 2 completa: misma composicion que Python, pixel por pixel.

  1. tests/referencia_python.py  -> hoja de Python (desde las imagenes originales)
  2. tests/componer_js.js         -> la misma asignacion compuesta en Chromium
  3. Aqui se comparan:
       a) canvas JS (sin comprimir) vs hoja Python (sin comprimir)
          -> la unica diferencia esperada es la del JPEG calidad 95 de docs/img
       b) JPEG del PDF web (0.85) vs JPEG del PDF de Python (calidad 75 de Pillow)
       c) canvas JS vs armado de Python con las MISMAS imagenes de docs/img
          -> debe ser IDENTICO (diferencia maxima 0): misma colocacion exacta
       d) lineas negras: los pixeles que en Python son fondo negro deben ser
          EXACTAMENTE negros en el canvas JS (misma colocacion, sin corrimientos)

Uso: python tests/comparar_con_python.py [carpeta_temporal]
Requiere: Pillow, numpy, node y Playwright.
"""

import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
TIPOS = ["centros_doble", "pozitos_v2", "pozitos_v3"]

# Umbrales: si se pasan, algo esta mal colocado (un corrimiento de 1 px da
# errores medios de 10 o mas y maximos de 255).
MAX_ERROR_MEDIO = 2.0


def cargar(ruta):
    return np.asarray(Image.open(ruta).convert("RGB"), dtype=np.int16)


def estadisticas(a, b):
    d = np.abs(a - b)
    return d.mean(), d.max(), np.percentile(d, 99.9)


def main():
    dir_ = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix="loteria_cmp_")
    subprocess.check_call([sys.executable, os.path.join(AQUI, "referencia_python.py"), dir_])
    subprocess.check_call(["node", os.path.join(AQUI, "componer_js.js"), dir_])

    ok = True
    print()
    print("%-14s %-34s %8s %6s %8s" % ("tipo", "comparacion", "medio", "max", "p99.9"))
    for t in TIPOS:
        py = cargar(os.path.join(dir_, t + ".png"))
        js = cargar(os.path.join(dir_, t + "_js.png"))
        if py.shape != js.shape:
            print("FALLA %s: tamaños distintos %s vs %s" % (t, py.shape, js.shape))
            ok = False
            continue
        medio, maximo, p999 = estadisticas(py, js)
        print("%-14s %-34s %8.3f %6d %8.1f" % (t, "canvas JS vs hoja Python", medio, maximo, p999))
        if medio > MAX_ERROR_MEDIO:
            ok = False

        dimg = cargar(os.path.join(dir_, t + "_docsimg.png"))
        medio4, maximo4, p4 = estadisticas(dimg, js)
        print("%-14s %-34s %8.3f %6d %8.1f" % (t, "canvas JS vs Python con docs/img", medio4, maximo4, p4))
        if maximo4 != 0:
            ok = False

        pyj = cargar(os.path.join(dir_, t + "_python.jpg"))
        jsj = cargar(os.path.join(dir_, t + "_js.jpg"))
        medio2, maximo2, p2 = estadisticas(pyj, jsj)
        print("%-14s %-34s %8.3f %6d %8.1f" % (t, "JPEG web 0.85 vs JPEG Python 75", medio2, maximo2, p2))
        medio3, maximo3, p3 = estadisticas(py, jsj)
        print("%-14s %-34s %8.3f %6d %8.1f" % (t, "JPEG web 0.85 vs hoja Python", medio3, maximo3, p3))

        # Lineas negras: fondo de Python (todo 0) en una mascara construida por
        # posicion, no por color, para no confundir figuras oscuras con fondo.
        fondo = mascara_fondo(t, py.shape)
        negros_js = int(np.count_nonzero(js[fondo]))
        negros_py = int(np.count_nonzero(py[fondo]))
        print("%-14s %-34s %8s" % (t, "pixeles de fondo no negros (JS/Py)", "%d/%d" % (negros_js, negros_py)))
        if negros_js or negros_py:
            ok = False

    print()
    print("Archivos de la comparacion en: " + dir_)
    if not ok:
        print("RESULTADO: FALLA")
        sys.exit(1)
    print("RESULTADO: OK (las diferencias solo vienen de la compresion JPEG)")


def mascara_fondo(tipo, forma):
    """True donde no cae ninguna figura (segun las medidas de loterias/*.py)."""
    sys.path.insert(0, os.path.dirname(AQUI))
    from loterias import centros_dobles as cd, pozitos as pz
    m = np.ones(forma[:2], dtype=bool)
    if tipo == "centros_doble":
        w, h = cd.TAM_IMAGEN
        for ox, oy in (cd.ORIGEN_A, cd.ORIGEN_B, cd.ORIGEN_C, cd.ORIGEN_D):
            m[oy:oy + 4 * h, ox:ox + 4 * w] = False
    else:
        for c in range(pz.COLUMNAS):
            x = pz.INICIO_X + c * pz.PASO_X
            for f in range(pz.FILAS):
                y = pz.INICIO_Y + f * pz.PASO_Y
                m[y:y + pz.TAM_A[1], x:x + pz.TAM_A[0] - 20] = False
                m[y:y + 2 * pz.ALTO_BC, x + pz.DESPLAZ_BC_X:x + pz.DESPLAZ_BC_X + pz.TAM_BC[0]] = False
    return m


if __name__ == "__main__":
    main()
