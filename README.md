# Loterías Mare · Generador de cartas

Página web **local** (corre en tu computadora, sin nube) que genera cartas de lotería mexicana.
Eliges el tipo de lotería y la cantidad, y te entrega **un solo PDF listo para imprimir**, con el
nombre `<tipo>_<cantidad>.pdf`, por ejemplo `centros_doble_10.pdf`.

| Tipo | Archivo que genera | Hoja |
|---|---|---|
| Centros dobles | `centros_doble_<n>.pdf` | 4 cartas de 4x4 por hoja (2320 x 3275) |
| Pozitos v2 | `pozitos_v2_<n>.pdf` | Carta horizontal, 6 columnas x 5 casillas |
| Pozitos v3 | `pozitos_v3_<n>.pdf` | Igual que v2 con las figuras de la derecha invertidas en las casillas 2 y 5 |

`<n>` es el número de hojas (cartas). Si ya existe un PDF con ese nombre no lo pisa: crea `centros_doble_10 (2).pdf`.

## Cómo usarlo (Windows)

1. Instala [Python 3.10+](https://www.python.org/downloads/) (marca "Add Python to PATH").
2. Pon las 54 imágenes de las figuras en la carpeta `Imagenes/` junto a `app.py`, con los nombres
   `1.jpg`, `2.jpg` ... `54.jpg`. (Si están en otro lado, cambia la carpeta desde la página,
   en "Carpetas (imágenes y PDFs)".)
3. Doble clic en `iniciar.bat`. La primera vez instala Flask y Pillow; después abre directo.
   También sirve: `pip install -r requirements.txt` y luego `python app.py`.
4. Se abre el navegador en `http://127.0.0.1:5000`. Elige tipo, cantidad y presiona **Generar PDF**.
   Verás la barra de progreso y al terminar el PDF se descarga solo. También queda guardado en
   `Cartas_generadas/` (o la carpeta que elijas).

Solo tu computadora puede ver la página (escucha en `127.0.0.1`). Para cerrar, cierra la ventana negra.

## Notas

- Las **imágenes y los PDF no se suben a GitHub** (están en `.gitignore`).
- Máximo **300 cartas por PDF**. Cada hoja se comprime al generarse para no llenar la memoria;
  si necesitas más, genera por tandas.
- Un solo PDF a la vez. Hay botón **Cancelar**; si cancelas no queda un PDF a medias.
- Los errores técnicos se guardan en `registro.log`; la última configuración de carpetas en `config.json`.

## Cómo agregar un tipo nuevo (Navidad, Halloween, personalizada...)

1. Crea un módulo en `loterias/` con una función
   `generar(cantidad, ruta_pdf, carpeta_imagenes, progreso=None, cancelado=None)`.
   Usa `loterias/comun.py` (`hoja_a_jpeg`, `escribir_pdf`) para no llenar la memoria.
2. Agrégalo al diccionario `TIPOS` en `loterias/__init__.py`.

La página lo muestra automáticamente.

## Estructura

```
app.py              servidor local (Flask)
static/index.html   la página
loterias/           los generadores (centros_dobles.py, pozitos.py) y funciones compartidas (comun.py)
iniciar.bat         doble clic para abrir en Windows
```
