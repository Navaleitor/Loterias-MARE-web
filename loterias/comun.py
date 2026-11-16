"""
Funciones compartidas por todos los tipos de loteria.

- hoja_a_jpeg:   comprime una hoja a JPEG en memoria (para no llenar la RAM).
- escribir_pdf:  junta todas las hojas comprimidas en UN SOLO PDF.
- barra_progreso: barra de progreso para cuando se corre desde la terminal.
- verificar_imagenes: revisa que existan 1.jpg ... 54.jpg en la carpeta.
"""

import io
import os

TOTAL_FIGURAS = 54


class ErrorLoteria(Exception):
    """Error con mensaje claro para mostrar al usuario (no un traceback)."""


class Cancelado(Exception):
    """El usuario cancelo la generacion."""


def verificar_imagenes(carpeta):
    """Devuelve la lista de numeros de imagen que faltan en la carpeta."""
    if not carpeta or not os.path.isdir(carpeta):
        raise ErrorLoteria("La carpeta de imagenes no existe: " + str(carpeta))
    faltan = [n for n in range(1, TOTAL_FIGURAS + 1)
              if not os.path.isfile(os.path.join(carpeta, str(n) + ".jpg"))]
    return faltan


def revisar_cancelado(cancelado):
    if cancelado is not None and cancelado():
        raise Cancelado()


def hoja_a_jpeg(hoja):
    """
    Comprime la hoja a JPEG (en memoria, sin crear archivo) y devuelve los
    bytes. Es la misma compresion que usaba Pillow dentro del PDF (calidad
    por defecto), asi que la imagen en el PDF se ve igual que antes.
    """
    buffer = io.BytesIO()
    hoja.save(buffer, "JPEG")
    return buffer.getvalue()


def escribir_pdf(paginas_jpeg, ancho_px, alto_px, ruta, dpi=300):
    """
    Escribe un PDF con una hoja por pagina, a partir de la lista de JPEG.

    Un PDF es un archivo con "objetos" numerados. Aqui se escriben:
        objeto 1 = catalogo (el punto de entrada del PDF)
        objeto 2 = lista de paginas
        por cada hoja, 3 objetos: la pagina, su contenido y la imagen JPEG.
    Al final va una tabla (xref) con la posicion de cada objeto en el archivo.

    El tamaño de la pagina sale de los pixeles y los dpi:
    3300 x 2550 px a 300 dpi = 792 x 612 puntos = hoja carta horizontal.
    """
    ancho_pt = "%g" % (ancho_px * 72 / dpi)
    alto_pt = "%g" % (alto_px * 72 / dpi)
    medida = (ancho_pt + " " + alto_pt).encode()
    posiciones = {}   # numero de objeto -> posicion en el archivo
    total = len(paginas_jpeg)

    with open(ruta, "wb") as f:
        def objeto(numero, contenido):
            posiciones[numero] = f.tell()
            f.write(str(numero).encode() + b" 0 obj\n" + contenido + b"\nendobj\n")

        f.write(b"%PDF-1.4\n")

        objeto(1, b"<< /Type /Catalog /Pages 2 0 R >>")
        kids = b" ".join(str(3 + 3 * i).encode() + b" 0 R" for i in range(total))
        objeto(2, b"<< /Type /Pages /Kids [" + kids + b"] /Count " + str(total).encode() + b" >>")

        for i, jpeg in enumerate(paginas_jpeg):
            n_pagina, n_contenido, n_imagen = 3 + 3 * i, 4 + 3 * i, 5 + 3 * i

            objeto(n_pagina,
                   b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + medida + b"]"
                   b" /Resources << /XObject << /Im0 " + str(n_imagen).encode() + b" 0 R >> >>"
                   b" /Contents " + str(n_contenido).encode() + b" 0 R >>")

            # "q ancho 0 0 alto 0 0 cm /Im0 Do Q" = dibuja la imagen cubriendo toda la pagina.
            dibujo = b"q " + medida.split()[0] + b" 0 0 " + medida.split()[1] + b" 0 0 cm /Im0 Do Q"
            objeto(n_contenido,
                   b"<< /Length " + str(len(dibujo)).encode() + b" >>\nstream\n" + dibujo + b"\nendstream")

            objeto(n_imagen,
                   b"<< /Type /XObject /Subtype /Image /Width " + str(ancho_px).encode() +
                   b" /Height " + str(alto_px).encode() +
                   b" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode"
                   b" /Length " + str(len(jpeg)).encode() + b" >>\nstream\n" + jpeg + b"\nendstream")

        # Tabla de posiciones (xref) y final del archivo.
        inicio_xref = f.tell()
        cantidad_objetos = 3 + 3 * total
        f.write(b"xref\n0 " + str(cantidad_objetos).encode() + b"\n")
        f.write(b"0000000000 65535 f \n")
        for numero in range(1, cantidad_objetos):
            f.write(str(posiciones[numero]).zfill(10).encode() + b" 00000 n \n")
        f.write(b"trailer\n<< /Size " + str(cantidad_objetos).encode() + b" /Root 1 0 R >>\n")
        f.write(b"startxref\n" + str(inicio_xref).encode() + b"\n%%EOF\n")


def barra_progreso(actual, total, largo=30):
    """
    Dibuja una barra de progreso en la terminal, en la misma linea
    (el "\r" regresa el cursor al inicio para reescribirla), por ejemplo:
        [###############---------------]  50%  (5 de 10)
    """
    porcentaje = actual / total
    llenos = int(largo * porcentaje)
    barra = "#" * llenos + "-" * (largo - llenos)
    print("\r[" + barra + "] " + str(int(porcentaje * 100)).rjust(3) + "%  ("
          + str(actual) + " de " + str(total) + ")", end="", flush=True)
