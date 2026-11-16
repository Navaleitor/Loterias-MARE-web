# Loterías Mare · Generador de cartas

Genera cartas de lotería mexicana y te entrega **un solo PDF listo para imprimir**, con el
nombre `<tipo>_<cantidad>.pdf` (por ejemplo `centros_doble_10.pdf`).

Hay dos versiones que hacen lo mismo:

1. **Página web** (GitHub Pages): funciona desde cualquier celular, tablet o computadora con
   internet. Todo se genera **dentro del navegador**: no hay servidor, ni nube, ni login.
   👉 **https://navaleitor.github.io/Loterias-MARE-web/**
2. **Versión local en Python** (Flask + Pillow): la original, que sigue disponible y es la
   **referencia** de las reglas y medidas.

| Tipo | Archivo que genera | Hoja |
|---|---|---|
| Centros dobles | `centros_doble_<n>.pdf` | 4 cartas de 4x4 por hoja (2320 x 3275 px; página de 2320 x 3275 pt) |
| Pozitos v2 | `pozitos_v2_<n>.pdf` | Carta horizontal (3300 x 2550 px a 300 dpi = 792 x 612 pt), 6 columnas x 5 casillas |
| Pozitos v3 | `pozitos_v3_<n>.pdf` | Igual que v2 con las figuras de la derecha invertidas en las casillas 2 y 5 |

`<n>` es el número de hojas (cartas).

## Cómo usar la página web

1. Abre https://navaleitor.github.io/Loterias-MARE-web/ y espera a que diga que terminó de
   cargar las imágenes (la primera vez descarga unos 11 MB; después quedan en caché).
2. Elige el tipo de lotería.
3. Escribe cuántas cartas quieres. Máximo **300 en computadora** y **100 en celular o tablet**
   (la página muestra el límite de tu dispositivo). Si necesitas más, genera por tandas.
4. Presiona **Generar**. Verás la barra de progreso; puedes **Cancelar** en cualquier momento
   (si cancelas no se descarga nada).
5. Al terminar, el PDF se descarga solo. Si el navegador no lo descarga (pasa en algunos
   celulares, sobre todo iPhone), presiona **Descargar PDF** / **Descargar de nuevo**.

Tamaño aproximado del PDF: unos 2 MB por hoja (100 hojas ≈ 200 MB).
En celulares con poca memoria conviene generar tandas más pequeñas.

## Cómo usar la versión local (Python, Windows)

1. Instala [Python 3.10+](https://www.python.org/downloads/) (marca "Add Python to PATH").
2. Las 54 figuras ya vienen en `imagenes_loteria/` (`1.jpg` … `54.jpg`). Si usas otra carpeta,
   cámbiala desde la página local en "Carpetas (imágenes y PDFs)".
3. Doble clic en `iniciar.bat` (la primera vez instala Flask y Pillow), o bien
   `pip install -r requirements.txt` y luego `python app.py`.
4. Se abre `http://127.0.0.1:5000`. Elige tipo y cantidad y presiona **Generar PDF**.
   El PDF también queda guardado en `Cartas_generadas/`.

Solo tu computadora puede ver la página local (escucha en `127.0.0.1`).

## Imágenes

| Carpeta | Qué contiene |
|---|---|
| `imagenes_loteria/` | Las 54 figuras originales (`1.jpg` … `54.jpg`). Es la fuente de todo. |
| `docs/img/cd/` | Centros dobles: 280 x 400 |
| `docs/img/pa/` | Pozitos figura A: 340 x 476 recortada 10 px por lado = 320 x 476 |
| `docs/img/pbc/` | Pozitos figuras B y C: 200 x 238 |

La página web **no reescala nada**: pega imágenes que ya vienen del tamaño exacto, preparadas
con las mismas operaciones de Pillow que usan los generadores Python (`convert("RGB")`,
`resize`, y el recorte de la figura A). Así el resultado coincide con el de Python.

**Si cambias alguna figura**, reemplázala en `imagenes_loteria/` y regenera `docs/img/`:

```
pip install pillow
python preparar_imagenes.py
```

Luego sube los cambios (`imagenes_loteria/` y `docs/img/`). Las medidas se leen de
`loterias/centros_dobles.py` y `loterias/pozitos.py`, no hay que tocarlas en el script.

## Cómo agregar un tipo nuevo (Navidad, Halloween, personalizada…)

**En la página web** (`docs/`):

1. Si el armado es nuevo, crea `docs/js/loterias/<nombre>.js` copiando `centros_dobles.js` o
   `pozitos.js`. Registra `Loteria.generadores.<nombre>` con:
   - `hoja` (ancho y alto en px) y `dpi` (300 para carta a 300 dpi; 72 para 1 px = 1 pt),
   - `imagenes`: los conjuntos de figuras que usa (carpeta en `docs/img/` y medida),
   - `repartir(opciones, rng)`: el reparto al azar de una hoja,
   - `colocar(asignacion, opciones)`: la lista de `{conjunto, figura, x, y}` a pegar.

   Si solo cambia un patrón, no hace falta archivo nuevo: reutiliza un generador con otras
   `opciones` (así están hechos Pozitos v2 y v3).
2. Si usa figuras de otro tamaño o figuras nuevas, agrégalas en `CONJUNTOS` de
   `preparar_imagenes.py` y vuelve a correrlo.
3. Agrega una entrada a `Loteria.TIPOS` en `docs/js/tipos.js`
   (`id`, `nombre`, `descripcion`, `archivo`, `script`, `generador`, `opciones`).

La página, el worker, la precarga y el PDF lo toman automáticamente.

**En la versión local** (Python): crea un módulo en `loterias/` con
`generar(cantidad, ruta_pdf, carpeta_imagenes, progreso=None, cancelado=None)` (usa
`loterias/comun.py`) y agrégalo a `TIPOS` en `loterias/__init__.py`.

## Cómo funciona la página por dentro

- `docs/js/tipos.js`: registro de tipos (el equivalente a `TIPOS` de Python).
- `docs/js/loterias/*.js`: port fiel de los generadores (mismas reglas, medidas y patrones).
- `docs/js/motor.js`: pinta cada hoja en un canvas con fondo negro (el negro forma las
  líneas), la comprime a JPEG (calidad 0.85) y reutiliza el mismo canvas; nunca guarda hojas
  sin comprimir.
- `docs/js/pdf.js`: port de `escribir_pdf` (`loterias/comun.py`). Arma el PDF como un Blob
  por partes, sin copiar los JPEG.
- `docs/js/worker.js`: genera en un Web Worker con OffscreenCanvas para que la página no se
  trabe. Si el navegador no lo soporta, genera en la página misma.
- `docs/js/app.js`: la pantalla (precarga, validación, progreso, cancelar, descarga).

No usa librerías externas ni pasos de compilación: son archivos estáticos.

## Pruebas

Requieren Node, Python con Pillow, numpy y pikepdf, y Playwright con Chromium.

```
node tests/reglas.test.js 10000          # 1. reglas del reparto en miles de hojas por tipo
python tests/comparar_con_python.py      # 2. misma hoja que Python, pixel por pixel
node tests/navegador.test.js             # 3 y 4. flujo completo en Chromium + validación de los PDF
node tests/servidor.js 8000              # sirve docs/ en http://127.0.0.1:8000 para probar a mano
```

Resultado de la comparación con Python (misma asignación de figuras con semilla fija):

| Comparación | Error medio | Error máximo |
|---|---|---|
| Canvas del navegador vs armado de Python con las imágenes de `docs/img` | **0.000** | **0** (idéntico) |
| Canvas del navegador vs hoja de Python desde las imágenes originales | 1.6 – 1.7 | 24 – 27 |
| JPEG del PDF web (0.85) vs JPEG del PDF de Python (75) | 3.6 – 3.8 | 78 – 102 |

(Valores de 0 a 255 por canal.) La colocación es exactamente la misma; las únicas diferencias
vienen de la compresión JPEG (calidad 95 de `docs/img/` y la del PDF).

## Estructura

```
docs/                 la página web (GitHub Pages publica esta carpeta)
  index.html, css/, js/, img/
imagenes_loteria/     las 54 figuras originales
preparar_imagenes.py  genera docs/img/ desde imagenes_loteria/
loterias/             generadores Python (la referencia) y funciones compartidas (comun.py)
app.py, static/       versión local (Flask)
iniciar.bat           doble clic para abrir la versión local en Windows
tests/                pruebas automáticas
```
