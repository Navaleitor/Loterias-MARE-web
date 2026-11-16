"""
Loterias Mare - generador de cartas (pagina web LOCAL).

Se corre en tu computadora:   python app.py
Abre solo el navegador en http://127.0.0.1:5000 (solo tu computadora lo ve).
Eliges el tipo de loteria y la cantidad, y te entrega UN PDF con el nombre
<tipo>_<cantidad>.pdf (por ejemplo centros_doble_10.pdf).
"""

import json
import logging
import os
import socket
import threading
import traceback
import webbrowser

from flask import Flask, jsonify, request, send_from_directory

from loterias import TIPOS
from loterias.comun import Cancelado, ErrorLoteria, verificar_imagenes

BASE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE, "config.json")
LOG_PATH = os.path.join(BASE, "registro.log")

MAX_CANTIDAD = 300   # Cada hoja comprimida ocupa memoria hasta el final: 300 es un tope seguro.

CONFIG_INICIAL = {
    "carpeta_imagenes": os.path.join(BASE, "Imagenes"),
    "carpeta_salida": os.path.join(BASE, "Cartas_generadas"),
}

logging.basicConfig(filename=LOG_PATH, level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")

app = Flask(__name__, static_folder="static", static_url_path="/static")


# ---------------------------------------------------------------
#  Configuracion (carpetas), guardada en config.json
# ---------------------------------------------------------------

def leer_config():
    config = dict(CONFIG_INICIAL)
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            guardada = json.load(f)
        for clave in config:
            if isinstance(guardada.get(clave), str) and guardada[clave].strip():
                config[clave] = guardada[clave].strip()
    except (OSError, ValueError):
        pass
    return config


def guardar_config(config):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
    except OSError:
        logging.exception("No se pudo guardar config.json")


def estado_imagenes(carpeta):
    """Resumen de la carpeta de imagenes para mostrarlo en la pagina."""
    if not os.path.isdir(carpeta):
        return {"existe": False, "faltan": 54, "ok": False}
    faltan = verificar_imagenes(carpeta)
    return {"existe": True, "faltan": len(faltan), "ok": not faltan}


# ---------------------------------------------------------------
#  Trabajo de generacion (uno a la vez, en un hilo aparte)
# ---------------------------------------------------------------

_candado = threading.Lock()
_cancelar = threading.Event()
_trabajo = {"estado": "inactivo", "fase": "", "actual": 0, "total": 0,
            "mensaje": "", "archivo": None, "ruta": None, "tipo": None}


def _poner(**cambios):
    with _candado:
        _trabajo.update(cambios)


def nombre_libre(carpeta, base):
    """<base>.pdf; si ya existe, <base> (2).pdf, <base> (3).pdf... (no pisa PDFs anteriores)."""
    nombre = base + ".pdf"
    n = 2
    while os.path.exists(os.path.join(carpeta, nombre)):
        nombre = "%s (%d).pdf" % (base, n)
        n += 1
    return nombre


def _trabajar(tipo_id, cantidad, carpeta_imagenes, carpeta_salida):
    tipo = TIPOS[tipo_id]
    ruta = None
    try:
        os.makedirs(carpeta_salida, exist_ok=True)
        nombre = nombre_libre(carpeta_salida, "%s_%d" % (tipo["archivo"], cantidad))
        ruta = os.path.join(carpeta_salida, nombre)

        def progreso(actual, total):
            _poner(actual=actual, total=total,
                   fase="guardando" if actual == total and total > 0 else "generando")

        tipo["generar"](cantidad, ruta, carpeta_imagenes, progreso, _cancelar.is_set)
        _poner(estado="terminado", fase="", archivo=nombre, ruta=ruta,
               mensaje="Listo: " + nombre)
        logging.info("PDF generado: %s", ruta)
    except Cancelado:
        _borrar(ruta)
        _poner(estado="cancelado", fase="", mensaje="Generacion cancelada.")
    except ErrorLoteria as e:
        _borrar(ruta)
        _poner(estado="error", fase="", mensaje=str(e))
    except MemoryError:
        _borrar(ruta)
        logging.exception("Sin memoria")
        _poner(estado="error", fase="",
               mensaje="Se acabo la memoria de la computadora. Prueba con menos cartas.")
    except PermissionError:
        _borrar(ruta)
        logging.exception("Sin permisos")
        _poner(estado="error", fase="",
               mensaje="No se pudo guardar el PDF: no hay permiso en la carpeta de salida.")
    except OSError as e:
        _borrar(ruta)
        logging.exception("Error de disco")
        _poner(estado="error", fase="",
               mensaje="No se pudo leer o guardar un archivo (¿disco lleno o imagen danada?). Detalle: %s" % e)
    except Exception:
        _borrar(ruta)
        logging.error(traceback.format_exc())
        _poner(estado="error", fase="",
               mensaje="Ocurrio un error inesperado. El detalle quedo en registro.log.")


def _borrar(ruta):
    try:
        if ruta and os.path.exists(ruta):
            os.remove(ruta)
    except OSError:
        pass


# ---------------------------------------------------------------
#  Seguridad basica: solo se acepta trafico dirigido a esta computadora
# ---------------------------------------------------------------

@app.before_request
def solo_local():
    host = (request.host or "").split(":")[0]
    if host not in ("127.0.0.1", "localhost"):
        return "Acceso no permitido", 403


# ---------------------------------------------------------------
#  Rutas
# ---------------------------------------------------------------

@app.route("/")
def inicio():
    return send_from_directory(os.path.join(BASE, "static"), "index.html")


@app.route("/api/tipos")
def api_tipos():
    return jsonify({
        "max": MAX_CANTIDAD,
        "tipos": [{"id": k, "nombre": v["nombre"], "descripcion": v["descripcion"],
                   "archivo": v["archivo"]} for k, v in TIPOS.items()],
    })


@app.route("/api/config", methods=["GET", "POST"])
def api_config():
    config = leer_config()
    if request.method == "POST":
        datos = request.get_json(silent=True) or {}
        for clave in config:
            valor = datos.get(clave)
            if isinstance(valor, str) and valor.strip():
                config[clave] = valor.strip()
        guardar_config(config)
    return jsonify({**config, "imagenes": estado_imagenes(config["carpeta_imagenes"])})


def entero_estricto(valor):
    """Devuelve un int solo si 'valor' es un entero de verdad (no 2.5, ni 'abc', ni True)."""
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int):
        return valor
    if isinstance(valor, float) and valor.is_integer():
        return int(valor)
    if isinstance(valor, str) and valor.strip().isdigit():
        return int(valor.strip())
    return None


@app.route("/api/generar", methods=["POST"])
def api_generar():
    datos = request.get_json(silent=True) or {}
    tipo_id = datos.get("tipo")
    if tipo_id not in TIPOS:
        return jsonify({"error": "Elige un tipo de loteria."}), 400
    cantidad = entero_estricto(datos.get("cantidad"))
    if cantidad is None:
        return jsonify({"error": "La cantidad debe ser un numero entero."}), 400
    if not 1 <= cantidad <= MAX_CANTIDAD:
        return jsonify({"error": "La cantidad debe estar entre 1 y %d." % MAX_CANTIDAD}), 400

    config = leer_config()
    imagenes = estado_imagenes(config["carpeta_imagenes"])
    if not imagenes["existe"]:
        return jsonify({"error": "No existe la carpeta de imagenes: " + config["carpeta_imagenes"]}), 400
    if not imagenes["ok"]:
        return jsonify({"error": "Faltan %d imagenes (1.jpg a 54.jpg) en la carpeta de imagenes." % imagenes["faltan"]}), 400

    with _candado:
        if _trabajo["estado"] == "corriendo":
            return jsonify({"error": "Ya hay una generacion en curso."}), 409
        _cancelar.clear()
        _trabajo.update(estado="corriendo", fase="generando", actual=0, total=cantidad,
                        mensaje="", archivo=None, ruta=None, tipo=tipo_id)

    threading.Thread(target=_trabajar, daemon=True,
                     args=(tipo_id, cantidad, config["carpeta_imagenes"], config["carpeta_salida"])).start()
    return jsonify({"ok": True})


@app.route("/api/estado")
def api_estado():
    with _candado:
        return jsonify(dict(_trabajo))


@app.route("/api/cancelar", methods=["POST"])
def api_cancelar():
    _cancelar.set()
    return jsonify({"ok": True})


@app.route("/descargar/<path:nombre>")
def descargar(nombre):
    config = leer_config()
    if not nombre.lower().endswith(".pdf"):
        return "No encontrado", 404
    return send_from_directory(config["carpeta_salida"], nombre, as_attachment=True)


# ---------------------------------------------------------------
#  Arranque
# ---------------------------------------------------------------

def puerto_libre(inicial=5000):
    for puerto in range(inicial, inicial + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", puerto)) != 0:
                return puerto
    return inicial


if __name__ == "__main__":
    puerto = puerto_libre()
    url = "http://127.0.0.1:%d" % puerto
    print("Loterias Mare - abre %s en tu navegador (se abre solo). Cierra esta ventana para salir." % url)
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    app.run(host="127.0.0.1", port=puerto, threaded=True, debug=False)
