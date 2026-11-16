"""
Prueba 3 - Valida un PDF generado en el navegador.

  python tests/validar_pdf.py <archivo.pdf> <paginas> <ancho_pt> <alto_pt>

Revisa:
  - qpdf (via pikepdf) lo abre sin reparar nada y check_pdf_syntax() no reporta problemas.
  - pdfinfo (poppler), si esta instalado: numero de paginas y tamaño.
  - La tabla xref apunta exactamente al inicio de cada objeto
    (si estuviera mal, los lectores tendrian que "reparar" el archivo).
  - Cada pagina tiene una imagen JPEG que se puede decodificar, del tamaño en pixeles
    que corresponde, cubriendo la pagina completa.
Sale con codigo 1 si algo falla.
"""

import io
import re
import shutil
import subprocess
import sys

import pikepdf
from PIL import Image

PIXELES = {(792, 612): (3300, 2550), (2320, 3275): (2320, 3275)}


def revisar_xref(datos):
    inicio = int(re.search(rb"startxref\s+(\d+)\s+%%EOF\s*$", datos).group(1))
    if not datos[inicio:].startswith(b"xref"):
        return ["startxref no apunta a la tabla xref"]
    lineas = datos[inicio:].split(b"\n")
    total = int(lineas[1].split()[1])
    errores = []
    for n in range(1, total):
        pos = int(lineas[2 + n][:10])
        if not datos[pos:].startswith(b"%d 0 obj" % n):
            errores.append("xref del objeto %d apunta a un lugar equivocado" % n)
    return errores


def revisar_con_qpdf(ruta, paginas, ancho, alto, errores):
    # attempt_recovery=False: si la estructura (xref) esta mal, qpdf falla en vez de repararla.
    with pikepdf.open(ruta, attempt_recovery=False, suppress_warnings=False) as pdf:
        problemas = pdf.check_pdf_syntax()   # revision de qpdf (como qpdf --check)
        errores += ["qpdf: " + str(p) for p in problemas]
        if len(pdf.pages) != paginas:
            errores.append("tiene %d paginas, se esperaban %d" % (len(pdf.pages), paginas))
        px = PIXELES[(ancho, alto)]
        revisar = list(range(len(pdf.pages)))
        if len(revisar) > 6:   # en PDFs grandes: primera, ultima y algunas en medio
            revisar = sorted(set([0, 1, len(revisar) // 2, len(revisar) - 2, len(revisar) - 1]))
        for i in revisar:
            p = pdf.pages[i]
            caja = [float(v) for v in p.MediaBox]
            if caja != [0, 0, ancho, alto]:
                errores.append("pagina %d: MediaBox %s" % (i + 1, caja))
            img = p.Resources.XObject.Im0
            if img.Filter != pikepdf.Name.DCTDecode:
                errores.append("pagina %d: la imagen no es JPEG" % (i + 1))
            jpeg = Image.open(io.BytesIO(img.read_raw_bytes()))
            jpeg.load()
            if jpeg.size != px or (int(img.Width), int(img.Height)) != px:
                errores.append("pagina %d: imagen de %s, se esperaba %s" % (i + 1, jpeg.size, px))


def validar(ruta, paginas, ancho, alto):
    errores = []
    datos = open(ruta, "rb").read()
    if not datos.startswith(b"%PDF-1.4"):
        errores.append("no empieza con %PDF-1.4")
    errores += revisar_xref(datos)

    try:
        revisar_con_qpdf(ruta, paginas, ancho, alto, errores)
    except Exception as e:   # qpdf no lo pudo leer sin repararlo
        errores.append("qpdf no lo pudo leer: %s: %s" % (type(e).__name__, str(e).strip()[:200]))

    if shutil.which("pdfinfo"):
        info = subprocess.run(["pdfinfo", ruta], capture_output=True, text=True)
        if info.returncode != 0 or info.stderr.strip():
            errores.append("pdfinfo: " + (info.stderr.strip() or "fallo"))
        m = re.search(r"Pages:\s+(\d+)", info.stdout)
        if not m or int(m.group(1)) != paginas:
            errores.append("pdfinfo: paginas = %s" % (m and m.group(1)))
        t = re.search(r"Page size:\s+([\d.]+) x ([\d.]+) pts", info.stdout)
        if not t or (float(t.group(1)), float(t.group(2))) != (ancho, alto):
            errores.append("pdfinfo: tamaño de pagina distinto: " + (t.group(0) if t else "?"))

    return errores


if __name__ == "__main__":
    ruta, paginas, ancho, alto = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    try:
        errores = validar(ruta, paginas, ancho, alto)
    except Exception as e:   # PDF que ni siquiera se puede leer bien
        errores = ["no se pudo leer: %s: %s" % (type(e).__name__, str(e).strip()[:200])]
    if errores:
        print("FALLA " + ruta)
        for e in errores:
            print("   - " + e)
        sys.exit(1)
    print("OK    %s  (%d paginas de %d x %d pt)" % (ruta, paginas, ancho, alto))
