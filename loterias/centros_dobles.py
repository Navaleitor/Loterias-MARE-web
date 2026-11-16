"""
===============================================================
 LOTERIAS MARE - Centros dobles
===============================================================

QUE HACE
--------
Genera hojas de lotería "centros dobles". Cada hoja trae 4 cartas de 4x4
(A arriba-izquierda, B arriba-derecha, C abajo-izquierda, D abajo-derecha)
y todas las hojas se juntan en UN SOLO PDF (cada hoja es una pagina),
listo para imprimir.

ES LO MISMO QUE EL PROGRAMA ORIGINAL, PERO MAS RAPIDO
-----------------------------------------------------
Las reglas, las medidas, las posiciones y el tamaño de la hoja son
EXACTAMENTE los del original (hoja de 2320 x 3275 px, imagenes de 280 x 400).
Solo cambia COMO trabaja por dentro:

 1. Cada imagen se abre y se redimensiona UNA sola vez (antes se abria y
    redimensionaba cada vez que aparecia: miles de veces por hoja).
 2. El PDF se guarda UNA sola vez, al final (antes se guardaba despues de
    pegar cada imagen: 64 veces por hoja, y era lo que mas tardaba).
 3. Las hojas se van generando una por una (igual que en Pozitos). Cada hoja
    terminada se comprime enseguida a JPEG y la imagen grande se descarta,
    asi que la memoria casi no crece aunque pidas cientos de hojas. Al final
    esas hojas comprimidas se escriben en un solo PDF.
 4. Las cuatro cartas A, B, C y D usan la misma funcion en vez de cuatro
    bloques de codigo casi iguales.

MEMORIA: una hoja sin comprimir ocupa unos 30 MB, pero aqui solo existe una
a la vez; las ya terminadas se guardan comprimidas (menos de 1 MB cada una).
Guardar las hojas sin comprimir en una lista llenaba la memoria con 100 hojas.

REGLAS DEL REPARTO (sin cambios)
--------------------------------
 - Se barajan las 54 figuras y se reparten: A=13, B=14, C=14, D=13.
 - Cada carta lleva una figura DOBLE en el centro (casillas 6 y 7 de las 16).
   La figura doble no esta en su propia carta, ni en la carta de su pareja
   (A con B, C con D), ni es doble de otra carta de la misma hoja.
 - A y D llevan ademas una figura extra en la ultima casilla, para completar
   las 16 casillas (13 + 2 dobles + 1 extra). B y C tienen 14 + 2 dobles = 16.

"""

import os
import random
from PIL import Image

from .comun import (TOTAL_FIGURAS, ErrorLoteria, hoja_a_jpeg, escribir_pdf,
                    revisar_cancelado, verificar_imagenes)


# ===============================================================
#  CONFIGURACION  (rutas y medidas, iguales al original)
# ===============================================================

ANCHO_HOJA = 2320             # Tamaño de la hoja en pixeles (sin cambios).
ALTO_HOJA = 3275
TAM_IMAGEN = (280, 400)       # Cada figura se redimensiona a 280 x 400.

COLUMNAS_CARTA = 4            # Cada carta es de 4 x 4 casillas.
FILAS_CARTA = 4

# Esquina superior izquierda de cada una de las 4 cartas dentro de la hoja.
ORIGEN_A = (25, 25)
ORIGEN_B = (1175, 25)
ORIGEN_C = (25, 1647)
ORIGEN_D = (1175, 1647)

# Cuantas figuras (de las 13/14 normales) van antes de la figura doble.
# Con 5 figuras antes, la doble cae en las casillas 6 y 7 (indices 5 y 6).
FIGURAS_ANTES_DE_DOBLE = 5


# ===============================================================
#  IMAGENES (se cargan una sola vez y se guardan en memoria: la "cache")
# ===============================================================

# Diccionario {numero de figura: imagen ya redimensionada a 280 x 400}.
_imagenes = {}
_carpeta = ""   # Carpeta de imagenes de la generacion en curso (la fija generar_pdf).


def cargar_imagenes():
    """
    Abre las 54 imagenes UNA vez, las redimensiona y las guarda en memoria.
    Si falta alguna imagen, el error aparece aqui al inicio y no a la mitad
    de la generacion.
    """
    for numero in range(1, TOTAL_FIGURAS + 1):
        ruta = os.path.join(_carpeta, str(numero) + ".jpg")
        _imagenes[numero] = Image.open(ruta).convert("RGB").resize(TAM_IMAGEN)


# ===============================================================
#  REPARTO DE FIGURAS (mismas reglas que el original)
# ===============================================================

def figura_nueva(excluidas_1, excluidas_2, dobles):
    """
    Elige una figura al azar (1 a 54) que NO este en 'excluidas_1',
    ni en 'excluidas_2', ni en la lista 'dobles'.
    Hace lo mismo que los ciclos "while numero in ..." del original.
    """
    while True:
        numero = random.randint(1, TOTAL_FIGURAS)
        if (numero not in excluidas_1 and numero not in excluidas_2
                and numero not in dobles):
            return numero


def armar_carta(base, excluidas_1, excluidas_2, dobles, con_extra):
    """
    Convierte la lista 'base' (13 o 14 figuras) en las 16 casillas de una carta.

    - Pone las primeras 5 figuras.
    - Mete una figura DOBLE (2 veces seguidas) en el centro.
    - Pone el resto de las figuras.
    - Si 'con_extra' es True, agrega una figura extra al final (la carta A y D
      traen 13 figuras + 2 dobles = 15, y necesitan 1 mas para llegar a 16).

    'dobles' es la lista de figuras dobles ya usadas en esta hoja; aqui se le
    agrega la nueva para que ninguna otra carta repita esa misma doble.
    """
    carta = list(base[:FIGURAS_ANTES_DE_DOBLE])

    doble = figura_nueva(excluidas_1, excluidas_2, dobles)
    dobles.append(doble)
    carta.append(doble)
    carta.append(doble)

    carta.extend(base[FIGURAS_ANTES_DE_DOBLE:])

    if con_extra:
        # La extra solo evita las figuras de su propia carta y las dobles.
        carta.append(figura_nueva(base, [], dobles))

    return carta


def repartir_hoja():
    """
    Reparte las figuras de UNA hoja completa y devuelve las 4 cartas
    (A1, B1, C1, D1), cada una con sus 16 casillas en orden.
    """
    # Baraja las 54 figuras sin repetir.
    revuelto = random.sample(range(1, TOTAL_FIGURAS + 1), TOTAL_FIGURAS)

    # Reparto base: A=13, B=14, C=14, D=13.
    A = revuelto[0:13]
    B = revuelto[13:27]
    C = revuelto[27:41]
    D = revuelto[41:54]

    dobles = []   # Figuras dobles ya usadas en esta hoja.

    # Cada carta evita repetir sus figuras y las de su pareja (A-B, C-D).
    A1 = armar_carta(A, A, B, dobles, con_extra=True)
    B1 = armar_carta(B, A, B, dobles, con_extra=False)
    C1 = armar_carta(C, C, D, dobles, con_extra=False)
    D1 = armar_carta(D, C, D, dobles, con_extra=True)

    return A1, B1, C1, D1


# ===============================================================
#  ARMADO DE LA HOJA
# ===============================================================

def pegar_carta(hoja, figuras, origen):
    """
    Pega las 16 figuras de UNA carta en la hoja, formando la cuadricula 4x4.
    'origen' es la esquina superior izquierda de la carta dentro de la hoja.
    Las figuras van de izquierda a derecha y de arriba hacia abajo.
    """
    ox, oy = origen
    ancho, alto = TAM_IMAGEN
    for posicion, numero in enumerate(figuras):
        columna = posicion % COLUMNAS_CARTA     # 0 a 3
        fila = posicion // COLUMNAS_CARTA       # 0 a 3
        hoja.paste(_imagenes[numero], (ox + columna * ancho, oy + fila * alto))


def generar_hoja():
    """
    Genera UNA hoja (4 cartas) y la devuelve como imagen.
    Todavia no la guarda: main() la comprime y las junta en un solo PDF.
    """
    A1, B1, C1, D1 = repartir_hoja()

    # Hoja con fondo NEGRO: el negro forma las lineas entre las cartas.
    hoja = Image.new("RGB", (ANCHO_HOJA, ALTO_HOJA), "black")

    pegar_carta(hoja, A1, ORIGEN_A)
    pegar_carta(hoja, B1, ORIGEN_B)
    pegar_carta(hoja, C1, ORIGEN_C)
    pegar_carta(hoja, D1, ORIGEN_D)

    return hoja


# ===============================================================
#  GENERACION DEL PDF
# ===============================================================

def generar_pdf(cantidad, ruta_pdf, carpeta_imagenes, progreso=None, cancelado=None):
    """
    Genera 'cantidad' hojas (4 cartas cada una) y las guarda en UN SOLO PDF
    en 'ruta_pdf'.

    progreso(actual, total) -> se llama despues de cada hoja (opcional).
    cancelado()             -> si devuelve True, se detiene (opcional).
    Solo debe correr un trabajo a la vez (usa una cache compartida).
    """
    global _carpeta
    faltan = verificar_imagenes(carpeta_imagenes)
    if faltan:
        raise ErrorLoteria("Faltan %d imagenes en la carpeta (por ejemplo: %s.jpg)."
                           % (len(faltan), ", ".join(str(n) for n in faltan[:5])))

    _imagenes.clear()                 # por si cambiaron las imagenes de la carpeta
    _carpeta = carpeta_imagenes
    cargar_imagenes()

    # Cada hoja se comprime a JPEG al momento y la imagen grande se descarta.
    paginas = []
    if progreso:
        progreso(0, cantidad)
    for m in range(cantidad):
        revisar_cancelado(cancelado)
        hoja = generar_hoja()
        paginas.append(hoja_a_jpeg(hoja))
        del hoja
        if progreso:
            progreso(m + 1, cantidad)

    revisar_cancelado(cancelado)
    os.makedirs(os.path.dirname(os.path.abspath(ruta_pdf)), exist_ok=True)
    # dpi=72: 1 pixel = 1 punto, el mismo tamaño de pagina que siempre ha tenido
    # este tipo de loteria (2320 x 3275). Pozitos usa 300 dpi (hoja carta).
    escribir_pdf(paginas, ANCHO_HOJA, ALTO_HOJA, ruta_pdf, dpi=72)
