/*
 * ===============================================================
 *  LOTERIAS MARE - Motor: arma las hojas en un canvas y hace el PDF
 * ===============================================================
 *
 * Se usa igual dentro del Web Worker (con OffscreenCanvas) y en el hilo
 * principal (con un <canvas>), segun lo que soporte el navegador.
 *
 * Memoria: solo existe UN canvas por trabajo. Cada hoja se pinta, se
 * comprime a JPEG enseguida y el canvas se reutiliza para la siguiente.
 * Nunca se guardan hojas sin comprimir. Al terminar, el canvas se libera.
 */
(function (root) {
  "use strict";
  var Loteria = root.Loteria = root.Loteria || {};

  var CALIDAD_JPEG = 0.85;

  /* Error con un codigo que la pagina traduce a un mensaje en lenguaje simple. */
  function ErrorLoteria(codigo, detalle) {
    this.name = "ErrorLoteria";
    this.codigo = codigo;
    this.message = codigo + (detalle ? ": " + detalle : "");
  }
  ErrorLoteria.prototype = Object.create(Error.prototype);
  Loteria.ErrorLoteria = ErrorLoteria;

  /* Convierte cualquier error en un codigo: sin_memoria, sin_canvas, imagenes, desconocido. */
  Loteria.codigoDeError = function (e) {
    if (!e) return "desconocido";
    if (e.codigo) return e.codigo;
    var texto = String((e.name || "") + " " + (e.message || e));
    if (e.name === "RangeError" || /memory|memoria|allocation|out of/i.test(texto)) return "sin_memoria";
    return "desconocido";
  };

  /* ---------------- Imagenes ---------------- */

  /* Decodifica un Blob JPEG a algo que drawImage pueda pegar. */
  function decodificar(blob) {
    if (typeof createImageBitmap === "function") {
      // colorSpaceConversion "none": los pixeles quedan tal cual (igual que Pillow).
      return createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" })
        .catch(function () { return createImageBitmap(blob); });
    }
    // Navegadores viejos sin createImageBitmap (solo en el hilo principal).
    return new Promise(function (resolver, rechazar) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolver(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rechazar(new ErrorLoteria("imagenes")); };
      img.src = url;
    });
  }

  /*
   * blobs: {conjunto: [Blob de la figura 1, ..., figura 54]}
   * cache: objeto donde se guardan las imagenes ya decodificadas (se reutiliza
   *        entre trabajos para no decodificar otra vez).
   * Devuelve una promesa con {conjunto: [null, img1, ..., img54]} (indice = numero de figura).
   */
  Loteria.prepararImagenes = function (generador, blobs, cache) {
    var tareas = generador.imagenes.map(function (def) {
      if (cache[def.conjunto]) return Promise.resolve();
      var lista = blobs[def.conjunto];
      if (!lista || lista.length !== Loteria.TOTAL_FIGURAS) return Promise.reject(new ErrorLoteria("imagenes"));
      return Promise.all(lista.map(decodificar)).then(function (imgs) {
        imgs.forEach(function (img) {
          if (img.width !== def.ancho || img.height !== def.alto) throw new ErrorLoteria("imagenes", "medida");
        });
        cache[def.conjunto] = [null].concat(imgs);
      }, function (e) {
        throw (e && e.codigo) ? e : new ErrorLoteria("imagenes");
      });
    });
    return Promise.all(tareas).then(function () { return cache; });
  };

  /* ---------------- Canvas ---------------- */

  Loteria.crearLienzo = function (ancho, alto) {
    var lienzo;
    if (typeof document !== "undefined") {
      lienzo = document.createElement("canvas");
      lienzo.width = ancho; lienzo.height = alto;
    } else if (typeof OffscreenCanvas !== "undefined") {
      lienzo = new OffscreenCanvas(ancho, alto);
    } else {
      throw new ErrorLoteria("sin_canvas");
    }
    var ctx = lienzo.getContext("2d", { alpha: false });
    if (!ctx) throw new ErrorLoteria("sin_canvas");
    ctx.imageSmoothingEnabled = false;
    return { lienzo: lienzo, ctx: ctx };
  };

  Loteria.liberarLienzo = function (l) {
    if (!l) return;
    try { l.lienzo.width = 0; l.lienzo.height = 0; } catch (e) { /* nada */ }
  };

  /* Pinta UNA hoja: fondo negro (forma las lineas) y las figuras en su lugar. */
  Loteria.pintarHoja = function (l, generador, colocaciones, imagenes) {
    var ctx = l.ctx;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, generador.hoja.ancho, generador.hoja.alto);
    for (var i = 0; i < colocaciones.length; i++) {
      var c = colocaciones[i];
      ctx.drawImage(imagenes[c.conjunto][c.figura], c.x, c.y);
    }
  };

  Loteria.lienzoAJpeg = function (l, calidad) {
    var q = calidad || CALIDAD_JPEG;
    var p;
    if (l.lienzo.convertToBlob) {
      p = l.lienzo.convertToBlob({ type: "image/jpeg", quality: q });
    } else {
      p = new Promise(function (resolver) { l.lienzo.toBlob(resolver, "image/jpeg", q); });
    }
    return p.then(function (b) {
      // Si el navegador no tiene memoria para comprimir, devuelve null.
      if (!b || !b.size) throw new ErrorLoteria("sin_memoria");
      if (b.type && b.type !== "image/jpeg") throw new ErrorLoteria("sin_canvas", b.type);
      return b;
    });
  };

  /* ---------------- Trabajo completo ---------------- */

  /*
   * Genera 'cantidad' hojas del tipo y devuelve una promesa con el PDF (Blob).
   *   op.tipo        entrada de Loteria.TIPOS
   *   op.cantidad    numero de hojas
   *   op.imagenes    resultado de prepararImagenes
   *   op.rng         funcion de azar (por defecto Math.random)
   *   op.alAvanzar   (hechas, total) despues de cada hoja
   *   op.cancelado   () -> true para detener
   *   op.ceder       () -> promesa; se espera entre hojas (para que la pagina respire)
   */
  Loteria.generarPdf = function (op) {
    var tipo = op.tipo;
    var gen = Loteria.generadores[tipo.generador];
    var rng = op.rng || Math.random;
    var paginas = [];
    var lienzo = Loteria.crearLienzo(gen.hoja.ancho, gen.hoja.alto);

    function cancelar() { var e = new ErrorLoteria("cancelado"); throw e; }

    function siguiente(m) {
      if (op.cancelado && op.cancelado()) cancelar();
      if (m >= op.cantidad) return Promise.resolve();
      var asignacion = gen.repartir(tipo.opciones, rng);
      Loteria.pintarHoja(lienzo, gen, gen.colocar(asignacion, tipo.opciones), op.imagenes);
      return Loteria.lienzoAJpeg(lienzo, op.calidad).then(function (jpeg) {
        paginas.push(jpeg);
        if (op.alAvanzar) op.alAvanzar(m + 1, op.cantidad);
        return op.ceder ? op.ceder() : null;
      }).then(function () { return siguiente(m + 1); });
    }

    if (op.alAvanzar) op.alAvanzar(0, op.cantidad);
    return siguiente(0).then(function () {
      Loteria.liberarLienzo(lienzo);
      if (op.cancelado && op.cancelado()) cancelar();
      if (op.alArmar) op.alArmar();
      return Loteria.crearPdf(paginas, gen.hoja.ancho, gen.hoja.alto, gen.dpi);
    }, function (e) {
      Loteria.liberarLienzo(lienzo);
      paginas.length = 0;
      throw e;
    });
  };
})(typeof self !== "undefined" ? self : globalThis);
