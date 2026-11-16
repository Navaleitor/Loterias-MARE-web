"""
===============================================================
 LOTERIAS MARE - Pozitos (diseño vertical)
===============================================================

QUE HACE ESTE PROGRAMA
----------------------
Genera cartas de lotería mexicana ("pozitos", diseño vertical) y las junta
todas en UN SOLO PDF listo para imprimir en hoja carta horizontal.

COMO ESTA FORMADA CADA CARTA
----------------------------
Cada carta (una hoja) tiene 6 columnas. Cada columna tiene 5 casillas.
Cada casilla se divide en dos partes:

    +-----------+----------+
    |           |    B     |    <- arriba a la derecha
    |     A     +----------+
    |           |    C     |    <- abajo a la derecha
    +-----------+----------+

Los tipos de figura son:
    A       = UNICA   -> aparece 1 sola vez en toda la carta.
    B1, B2  = TRIPLES -> cada una aparece 3 veces (dentro de su columna).
    C1, C2  = DOBLES  -> cada una aparece 2 veces (dentro de su columna).

El patron de las 5 casillas de cada columna es siempre el mismo:

    Casilla 1:  A | B1 / C1
    Casilla 2:  A | B2 / C1
    Casilla 3:  A | B1 / B2
    Casilla 4:  A | B1 / C2
    Casilla 5:  A | B2 / C2

Contando una columna:
    - 5 figuras A distintas              (5 unicas)
    - B1 sale 3 veces (casillas 1, 3, 4) (1 triple)
    - B2 sale 3 veces (casillas 2, 3, 5) (1 triple)
    - C1 sale 2 veces (casillas 1, 2)    (1 doble)
    - C2 sale 2 veces (casillas 4, 5)    (1 doble)
  Total por columna: 5 + 2 + 2 = 9 figuras DISTINTAS.

Con 6 columnas: 6 x 9 = 54 figuras, que son justo las 54 figuras del juego.
Ninguna figura se repite entre columnas, y cada figura aparece en su
columna con las repeticiones que le tocan (A:1, B:3, C:2).

PATRONES
--------
Hay dos variantes, que solo cambian el orden de las figuras de la derecha:
    v2: casillas 2 y 5 -> B2 / C1  y  B2 / C2   (patron de arriba)
    v3: casillas 2 y 5 -> C1 / B2  y  C2 / B2   (invertidas)
Las repeticiones (A:1, B:3, C:2) son las mismas en las dos.

COMO CUIDA LA VELOCIDAD Y LA MEMORIA
------------------------------------
- Cache: las 54 imagenes se abren y redimensionan UNA sola vez al inicio.
- Memoria: cada hoja se comprime a JPEG apenas se genera y la imagen grande
  se descarta; al final se juntan en un solo PDF.
"""

import os
import random
from PIL import Image

from .comun import (TOTAL_FIGURAS, ErrorLoteria, hoja_a_jpeg, escribir_pdf,
                    revisar_cancelado, verificar_imagenes)


# ===============================================================
#  CONFIGURACION  (aqui se cambian rutas y medidas)
# ===============================================================


# ---- Tamaño de la hoja (en pixeles, a 300 dpi) ----
# Hoja carta horizontal exacta: 11 x 8.5 pulgadas = 3300 x 2550 px.
# Al ser una medida exacta, el PDF no tiene fracciones de punto y no sale
# la franja blanca al abrirlo o imprimirlo.
ANCHO_HOJA = 3300
ALTO_HOJA = 2550

# ---- Tamaño de las imagenes dentro de cada casilla ----
TAM_A = (340, 476)   # Figura A (la grande, de la izquierda): ancho, alto.
TAM_BC = (200, 238)  # Figuras B y C (las chicas, de la derecha): ancho, alto.

# ---- Posicion y separaciones ----
# El fondo de la hoja es NEGRO. Las "lineas negras" que se ven entre las
# casillas son ese fondo asomandose por los espacios que dejamos.
INICIO_X = 27        # Donde empieza la primera columna (margen izquierdo).
INICIO_Y = 35        # Donde empieza la primera fila (margen de arriba).
                     # (27 y 35 centran el diseño dentro de la hoja carta.)
PASO_X = 545         # Distancia de una columna a la siguiente (520 de casilla + 25 de linea negra).
PASO_Y = 501         # Distancia de una fila a la siguiente   (476 de casilla + 25 de linea negra).
DESPLAZ_BC_X = 320   # B y C empiezan 320 px a la derecha del inicio de la casilla
                     # (justo donde termina la figura A ya recortada).
ALTO_BC = 238        # Altura de B; C se pega 238 px mas abajo, debajo de B.

# ---- Estructura de la carta ----
COLUMNAS = 6         # Columnas por carta.
FILAS = 5            # Casillas por columna.

# Patron de las 5 casillas de una columna.
# Cada pareja es (figura de arriba a la derecha, figura de abajo a la derecha).
# "B1", "B2", "C1", "C2" son nombres: mas abajo se cambian por numeros de figura reales.
PATRON_V2 = [
    ("B1", "C1"),   # Casilla 1
    ("B2", "C1"),   # Casilla 2
    ("B1", "B2"),   # Casilla 3
    ("B1", "C2"),   # Casilla 4
    ("B2", "C2"),   # Casilla 5
]

PATRON_V3 = [
    ("B1", "C1"),   # Casilla 1
    ("C1", "B2"),   # Casilla 2  (invertida respecto a la v2)
    ("B1", "B2"),   # Casilla 3
    ("B1", "C2"),   # Casilla 4
    ("C2", "B2"),   # Casilla 5  (invertida respecto a la v2)
]


# ===============================================================
#  CARGA DE IMAGENES
# ===============================================================

# Memoria (cache) para no abrir y redimensionar la misma imagen una y otra vez.
# Como cada figura se repite varias veces, esto hace el programa mucho mas rapido.
_cache = {}
_carpeta = ""   # Carpeta de imagenes de la generacion en curso (la fija generar_pdf).


def cargar(numero, tamano):
    """
    Abre la imagen "<numero>.jpg", la pasa a RGB y la redimensiona a
    'tamano' (ancho, alto). Si ya se habia cargado con ese mismo tamaño,
    devuelve la que tiene guardada en memoria.
    """
    clave = (numero, tamano)
    if clave not in _cache:
        ruta = os.path.join(_carpeta, str(numero) + ".jpg")
        _cache[clave] = Image.open(ruta).convert("RGB").resize(tamano)
    return _cache[clave]


def cargar_a(numero):
    """
    Carga la figura A (340 x 476) y la recorta por el centro.

    Las figuras B y C empiezan 20 px antes de donde termina A (A mide 340
    pero B/C arrancan en 320). En vez de que B y C tapen 20 px del lado
    derecho de A, aqui se quitan 10 px de la IZQUIERDA y 10 px de la DERECHA.
    Asi A queda de 320 x 476, termina justo donde empiezan B y C, y el
    recorte se reparte parejo (no se pierde todo por un solo lado).
    """
    clave = ("A_centrada", numero)
    if clave not in _cache:
        # Se abre y redimensiona sin guardar la version completa en la
        # cache: solo se guarda la ya recortada (ocupa menos memoria).
        ruta = os.path.join(_carpeta, str(numero) + ".jpg")
        completa = Image.open(ruta).convert("RGB").resize(TAM_A)
        # crop((izquierda, arriba, derecha, abajo)) -> se queda con esa zona.
        _cache[clave] = completa.crop((10, 0, TAM_A[0] - 10, TAM_A[1]))
    return _cache[clave]


# ===============================================================
#  REPARTO DE FIGURAS
# ===============================================================

def generar_columnas():
    """
    Reparte las 54 figuras entre las 6 columnas de UNA carta.

    Revuelve los numeros del 1 al 54 y los corta en 6 bloques de 9. Dentro
    de cada bloque, las 9 figuras tienen un papel fijo:
        posiciones 0 a 4 -> las 5 figuras A (unicas)
        posicion 5       -> B1 (triple)
        posicion 6       -> B2 (triple)
        posicion 7       -> C1 (doble)
        posicion 8       -> C2 (doble)

    Como salen de una sola barajada sin repetir, ninguna figura queda
    en dos columnas distintas.

    Devuelve una lista de 6 diccionarios, por ejemplo:
        {"A": [12, 5, 33, 8, 41], "B1": 7, "B2": 19, "C1": 2, "C2": 50}
    """
    figuras = random.sample(range(1, 55), 54)   # 54 numeros al azar, sin repetir
    columnas = []
    for c in range(COLUMNAS):
        bloque = figuras[c * 9:(c + 1) * 9]     # le toca un bloque de 9 figuras
        columnas.append({
            "A": bloque[0:5],   # 5 unicas, una por casilla
            "B1": bloque[5],    # triple 1
            "B2": bloque[6],    # triple 2
            "C1": bloque[7],    # doble 1
            "C2": bloque[8],    # doble 2
        })
    return columnas


# ===============================================================
#  ARMADO DE UNA CARTA (UNA HOJA)
# ===============================================================

def generar_carta(numero_carta, patron):
    """
    Construye la imagen de UNA carta completa (una hoja) y la devuelve.
    ('numero_carta' no se usa para armar la carta; queda por si despues
    se quiere numerar o nombrar cada carta.)
    """
    # Hoja en blanco con fondo NEGRO: el negro forma las lineas entre casillas.
    hoja = Image.new("RGB", (ANCHO_HOJA, ALTO_HOJA), "black")

    # Reparto de figuras de esta carta (cada carta sale distinta, al azar).
    columnas = generar_columnas()

    for c, col in enumerate(columnas):               # recorre las 6 columnas
        x = INICIO_X + c * PASO_X                    # posicion horizontal de la columna

        for f in range(FILAS):                       # recorre las 5 casillas de la columna
            y = INICIO_Y + f * PASO_Y                # posicion vertical de la casilla

            # Segun el patron, que figuras van arriba y abajo a la derecha.
            # Ejemplo: en la casilla 3 -> arriba = "B1", abajo = "B2".
            arriba, abajo = patron[f]

            # Figura A (izquierda): la que le toca a esta casilla.
            hoja.paste(cargar_a(col["A"][f]), (x, y))

            # Figura de arriba a la derecha (B1/B2). col[arriba] es el numero real.
            hoja.paste(cargar(col[arriba], TAM_BC), (x + DESPLAZ_BC_X, y))

            # Figura de abajo a la derecha (B2/C1/C2), debajo de la anterior.
            hoja.paste(cargar(col[abajo], TAM_BC), (x + DESPLAZ_BC_X, y + ALTO_BC))

    return hoja


# ===============================================================
#  GENERACION DEL PDF
# ===============================================================

def precargar_imagenes():
    """
    Abre y redimensiona las 54 imagenes UNA sola vez al inicio y las deja en
    la cache. Asi, durante la generacion ya no se toca el disco, y si falta
    alguna imagen el error sale al principio y no a la mitad del proceso.
    """
    for numero in range(1, TOTAL_FIGURAS + 1):
        cargar_a(numero)
        cargar(numero, TAM_BC)


def generar_pdf(cantidad, ruta_pdf, carpeta_imagenes, patron,
                progreso=None, cancelado=None):
    """
    Genera 'cantidad' cartas y las guarda en UN SOLO PDF en 'ruta_pdf'.

    progreso(actual, total) -> se llama despues de cada carta (opcional).
    cancelado()             -> si devuelve True, se detiene (opcional).
    Solo debe correr un trabajo a la vez (usa una cache compartida).
    """
    global _carpeta
    faltan = verificar_imagenes(carpeta_imagenes)
    if faltan:
        raise ErrorLoteria("Faltan %d imagenes en la carpeta (por ejemplo: %s.jpg)."
                           % (len(faltan), ", ".join(str(n) for n in faltan[:5])))

    _cache.clear()                    # por si cambiaron las imagenes de la carpeta
    _carpeta = carpeta_imagenes
    precargar_imagenes()

    # Cada hoja se comprime a JPEG al momento y la imagen grande se descarta.
    paginas = []
    if progreso:
        progreso(0, cantidad)
    for m in range(cantidad):
        revisar_cancelado(cancelado)
        hoja = generar_carta(m, patron)
        paginas.append(hoja_a_jpeg(hoja))
        del hoja
        if progreso:
            progreso(m + 1, cantidad)

    revisar_cancelado(cancelado)
    os.makedirs(os.path.dirname(os.path.abspath(ruta_pdf)), exist_ok=True)
    escribir_pdf(paginas, ANCHO_HOJA, ALTO_HOJA, ruta_pdf)
