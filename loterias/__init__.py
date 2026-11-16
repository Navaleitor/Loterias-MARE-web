"""
Registro de tipos de loteria.

Para agregar un tipo nuevo (Navidad, Halloween, personalizada...):
  1. Crea un modulo en esta carpeta con una funcion
         generar(cantidad, ruta_pdf, carpeta_imagenes, progreso=None, cancelado=None)
  2. Agrega una entrada a TIPOS mas abajo.
La pagina web lo muestra automaticamente; no hay que tocar nada mas.

"archivo" es el prefijo del nombre del PDF: <archivo>_<cantidad>.pdf
(por ejemplo centros_doble_10.pdf).
"""

from . import centros_dobles, pozitos

TIPOS = {
    "centros_doble": {
        "nombre": "Centros dobles",
        "descripcion": "4 cartas de 4x4 por hoja, con la figura doble en el centro de cada carta.",
        "archivo": "centros_doble",
        "generar": centros_dobles.generar_pdf,
    },
    "pozitos_v2": {
        "nombre": "Pozitos v2",
        "descripcion": "Hoja carta horizontal, 6 columnas de 5 casillas: 1 figura unica, 2 triples y 2 dobles por columna.",
        "archivo": "pozitos_v2",
        "generar": lambda cantidad, ruta_pdf, carpeta, progreso=None, cancelado=None:
            pozitos.generar_pdf(cantidad, ruta_pdf, carpeta, pozitos.PATRON_V2, progreso, cancelado),
    },
    "pozitos_v3": {
        "nombre": "Pozitos v3",
        "descripcion": "Igual que Pozitos v2, pero con las figuras de la derecha invertidas en las casillas 2 y 5.",
        "archivo": "pozitos_v3",
        "generar": lambda cantidad, ruta_pdf, carpeta, progreso=None, cancelado=None:
            pozitos.generar_pdf(cantidad, ruta_pdf, carpeta, pozitos.PATRON_V3, progreso, cancelado),
    },
}
