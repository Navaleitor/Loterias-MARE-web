/*
 * ===============================================================
 *  LOTERIAS MARE - La pagina (lo que ve y toca el usuario)
 * ===============================================================
 *
 *  1. Carga los generadores y precarga las imagenes (con progreso).
 *  2. Muestra los tipos de Loteria.TIPOS y valida la cantidad.
 *  3. Genera el PDF en un Web Worker (o en esta pagina si el navegador no
 *     puede), con barra de progreso y boton Cancelar.
 *  4. Descarga el PDF automaticamente como <archivo>_<cantidad>.pdf y deja
 *     un boton para descargarlo otra vez.
 *
 *  Para pruebas: ?modo=principal obliga a generar sin worker.
 */
(function () {
  "use strict";
  var Loteria = window.Loteria;

  /* ---------------- Mensajes de error en lenguaje simple ---------------- */
  var MENSAJES = {
    sin_memoria: "Tu dispositivo se quedó sin memoria. Prueba con menos cartas o cierra otras pestañas y apps.",
    sin_canvas: "Este navegador no puede dibujar las cartas. Prueba con Chrome, Edge, Firefox o Safari actualizados.",
    imagenes: "No se pudieron leer las imágenes de las figuras. Recarga la página e inténtalo de nuevo.",
    sin_red: "No se pudieron descargar las imágenes. Revisa tu conexión a internet y presiona «Intentar de nuevo».",
    desconocido: "Algo salió mal al generar el PDF. Recarga la página e inténtalo de nuevo; si sigue pasando, prueba con menos cartas."
  };

  /* ---------------- Limite de cartas segun el dispositivo ---------------- */
  function esDispositivoMovil() {
    var gruesa = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    var tactil = (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
    var memoriaBaja = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
    return (tactil && gruesa) || memoriaBaja;
  }
  var MOVIL = esDispositivoMovil();
  var LIMITE = MOVIL ? 100 : 300;
  var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1);

  /* ---------------- Elementos ---------------- */
  function $(id) { return document.getElementById(id); }
  var el = {
    carga: $("carga"), cargaTexto: $("carga-texto"), cargaRelleno: $("carga-relleno"),
    reintentar: $("btn-reintentar"),
    form: $("formulario"), tipos: $("tipos"), cantidad: $("cantidad"), limite: $("limite"),
    errorCantidad: $("error-cantidad"), generar: $("btn-generar"),
    trabajo: $("trabajo"), trabajoTexto: $("trabajo-texto"), trabajoRelleno: $("trabajo-relleno"),
    cancelar: $("btn-cancelar"),
    resultado: $("resultado"), resultadoTexto: $("resultado-texto"), descargar: $("btn-descargar"),
    aviso: $("aviso"), avisoTexto: $("aviso-texto")
  };

  /* ---------------- Estado ---------------- */
  var estado = {
    blobs: null,          // {conjunto: [54 Blobs]} imagenes descargadas
    listo: false,         // imagenes cargadas
    ocupado: false,       // hay un trabajo en curso (solo uno a la vez)
    cancelado: false,
    modo: null,           // "worker" o "principal"
    worker: null,
    trabajoActual: null,  // {rechazar} para cancelar
    urlPdf: null,
    wakeLock: null
  };
  window.LoteriaApp = estado;   // para las pruebas automaticas

  /* ---------------- Utilidades de pantalla ---------------- */
  function barra(relleno, fraccion) {
    var p = Math.max(0, Math.min(100, Math.round(fraccion * 100)));
    relleno.style.width = p + "%";
    relleno.parentNode.setAttribute("aria-valuenow", String(p));
  }
  function verSeccion(seccion) {
    try { seccion.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) { /* nada */ }
  }
  function mostrarAviso(texto) {
    el.avisoTexto.textContent = texto;
    el.aviso.hidden = !texto;
    if (texto) verSeccion(el.aviso);
  }
  function tipoElegido() {
    var marcado = el.tipos.querySelector("input[name=tipo]:checked");
    return marcado ? Loteria.buscarTipo(marcado.value) : null;
  }
  function actualizarBotonGenerar() {
    el.generar.disabled = !estado.listo || estado.ocupado;
  }

  /* ---------------- 1. Cargar scripts de generadores ---------------- */
  function cargarScript(src) {
    return new Promise(function (resolver, rechazar) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolver;
      s.onerror = function () { rechazar(new Error("script " + src)); };
      document.head.appendChild(s);
    });
  }

  /* ---------------- 2. Precarga de imagenes ---------------- */
  function conjuntosNecesarios() {
    var vistos = {}, lista = [];
    Loteria.TIPOS.forEach(function (t) {
      var gen = Loteria.generadores[t.generador];
      gen.imagenes.forEach(function (def) {
        if (!vistos[def.conjunto]) { vistos[def.conjunto] = true; lista.push(def); }
      });
    });
    return lista;
  }

  function descargarImagen(url, intentos) {
    return fetch(url, { cache: "force-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.blob();
    }).then(function (b) {
      if (!b.size) throw new Error("vacia");
      return b;
    }).catch(function (e) {
      if (intentos > 0) return descargarImagen(url, intentos - 1);
      throw e;
    });
  }

  function precargarImagenes() {
    var defs = conjuntosNecesarios();
    var trabajos = [];
    defs.forEach(function (def) {
      for (var n = 1; n <= Loteria.TOTAL_FIGURAS; n++) {
        trabajos.push({ conjunto: def.conjunto, n: n, url: def.carpeta + "/" + n + ".jpg" });
      }
    });
    var total = trabajos.length, hechas = 0, siguiente = 0;
    var blobs = {};
    defs.forEach(function (def) { blobs[def.conjunto] = new Array(Loteria.TOTAL_FIGURAS); });

    el.carga.hidden = false;
    el.reintentar.hidden = true;
    el.cargaTexto.textContent = "Cargando imágenes 0/" + total;
    barra(el.cargaRelleno, 0);

    // Hasta 6 descargas al mismo tiempo.
    function hilo() {
      if (siguiente >= total) return Promise.resolve();
      var t = trabajos[siguiente++];
      return descargarImagen(t.url, 2).then(function (b) {
        blobs[t.conjunto][t.n - 1] = b;
        hechas++;
        el.cargaTexto.textContent = "Cargando imágenes " + hechas + "/" + total;
        barra(el.cargaRelleno, hechas / total);
        return hilo();
      });
    }
    var hilos = [];
    for (var i = 0; i < 6; i++) hilos.push(hilo());
    return Promise.all(hilos).then(function () { return blobs; });
  }

  /* ---------------- 3. ¿Worker con OffscreenCanvas o hilo principal? ---------------- */
  function crearWorker() {
    var w = new Worker("js/worker.js");
    return w;
  }

  function elegirModo() {
    if (/[?&]modo=principal\b/.test(location.search)) return Promise.resolve("principal");
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return Promise.resolve("principal");
    return new Promise(function (resolver) {
      var w;
      var listo = false;
      function terminar(modo) {
        if (listo) return;
        listo = true;
        if (modo === "worker") estado.worker = w; else if (w) w.terminate();
        resolver(modo);
      }
      try { w = crearWorker(); } catch (e) { terminar("principal"); return; }
      w.onmessage = function (ev) { terminar(ev.data && ev.data.tipo === "prueba" && ev.data.ok ? "worker" : "principal"); };
      w.onerror = function () { terminar("principal"); };
      w.postMessage({ accion: "probar" });
      setTimeout(function () { terminar("principal"); }, 5000);
    });
  }

  function puedeDibujarAqui() {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext && c.getContext("2d") && c.toBlob);
    } catch (e) { return false; }
  }

  /* ---------------- Pantalla inicial ---------------- */
  function pintarTipos() {
    Loteria.TIPOS.forEach(function (t, i) {
      var label = document.createElement("label");
      label.className = "opcion";
      var input = document.createElement("input");
      input.type = "radio"; input.name = "tipo"; input.value = t.id;
      if (i === 0) input.checked = true;
      // Vista previa: se dibuja una hoja de verdad cuando terminan de cargar las imagenes.
      var vista = document.createElement("span");
      vista.className = "opcion-vista";
      var lienzo = document.createElement("canvas");
      lienzo.setAttribute("data-tipo", t.id);
      lienzo.width = 1; lienzo.height = 1;
      lienzo.hidden = true;
      vista.appendChild(lienzo);
      var textos = document.createElement("span");
      textos.className = "opcion-textos";
      var nombre = document.createElement("span");
      nombre.className = "opcion-nombre"; nombre.textContent = t.nombre;
      var desc = document.createElement("span");
      desc.className = "opcion-desc"; desc.textContent = t.descripcion;
      textos.appendChild(nombre); textos.appendChild(desc);
      label.appendChild(vista); label.appendChild(textos); label.appendChild(input);
      el.tipos.appendChild(label);
    });
    el.limite.textContent = "Máximo " + LIMITE + " cartas" +
      (MOVIL ? " en este dispositivo (celular o tablet)." : " por PDF.");
  }

  /* ---------------- Adornos: papel picado, abanico de cartas ---------------- */
  var COLORES_PAPEL = ["#e4007c", "#f7941d", "#ffc20e", "#00a651", "#00a3ad", "#6b2c91", "#d7263d"];

  function papelPicado() {
    var cont = $("papel-picado");
    if (!cont) return;
    for (var i = 0; i < 40; i++) {
      var b = document.createElement("span");
      b.className = "bandera";
      b.style.color = COLORES_PAPEL[i % COLORES_PAPEL.length];
      b.innerHTML = '<svg viewBox="0 0 60 72" fill="currentColor"><use href="#bandera"></use></svg>';
      cont.appendChild(b);
    }
  }

  /* Figuras al azar distintas (para el abanico y el cantor). */
  function figurasAlAzar(cuantas) {
    return Loteria.barajar(Math.random, Loteria.TOTAL_FIGURAS).slice(0, cuantas);
  }
  function urlFigura(n) { return "img/cd/" + n + ".jpg"; }

  function abanico() {
    var cont = $("abanico");
    if (!cont) return;
    figurasAlAzar(5).forEach(function (n) {
      var img = document.createElement("img");
      img.src = urlFigura(n);
      img.alt = "";
      img.width = 84; img.height = 120;
      img.decoding = "async";
      cont.appendChild(img);
    });
  }

  /* Dibuja una hoja de ejemplo de cada tipo en su carta (vista previa). */
  function pintarVistasPrevias() {
    if (typeof createImageBitmap !== "function") return;
    var LADO = 240;   // pixeles del lado mas largo de la vista previa
    var porGenerador = {};
    Loteria.TIPOS.forEach(function (t) {
      (porGenerador[t.generador] = porGenerador[t.generador] || []).push(t);
    });
    Object.keys(porGenerador).forEach(function (nombreGen) {
      var gen = Loteria.generadores[nombreGen];
      var escala = LADO / Math.max(gen.hoja.ancho, gen.hoja.alto);
      var imagenes = {};
      Promise.all(gen.imagenes.map(function (def) {
        return Promise.all(estado.blobs[def.conjunto].map(function (b) {
          return createImageBitmap(b, {
            resizeWidth: Math.max(1, Math.round(def.ancho * escala)),
            resizeHeight: Math.max(1, Math.round(def.alto * escala)),
            resizeQuality: "high"
          }).catch(function () { return createImageBitmap(b); });
        })).then(function (lista) { imagenes[def.conjunto] = [null].concat(lista); });
      })).then(function () {
        var tamanos = {};
        gen.imagenes.forEach(function (d) { tamanos[d.conjunto] = d; });
        porGenerador[nombreGen].forEach(function (t) {
          var lienzo = el.tipos.querySelector('canvas[data-tipo="' + t.id + '"]');
          if (!lienzo) return;
          lienzo.width = Math.round(gen.hoja.ancho * escala);
          lienzo.height = Math.round(gen.hoja.alto * escala);
          var ctx = lienzo.getContext("2d");
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, lienzo.width, lienzo.height);
          gen.colocar(gen.repartir(t.opciones, Math.random), t.opciones).forEach(function (c) {
            var d = tamanos[c.conjunto];
            ctx.drawImage(imagenes[c.conjunto][c.figura], c.x * escala, c.y * escala, d.ancho * escala, d.alto * escala);
          });
          lienzo.hidden = false;
        });
        Object.keys(imagenes).forEach(function (k) {
          imagenes[k].forEach(function (img) { if (img && img.close) img.close(); });
        });
      }).catch(function () { /* la vista previa es solo un adorno */ });
    });
  }

  /* El cantor: cada hoja nueva "canta" una carta distinta. */
  var cantorUltima = -1;
  function cantarCarta(hechas) {
    if (hechas === cantorUltima) return;
    cantorUltima = hechas;
    var img = $("cantor-carta");
    if (!img) return;
    img.src = urlFigura(figurasAlAzar(1)[0]);
    img.classList.remove("volteo");
    void img.offsetWidth;   // reinicia la animacion
    img.classList.add("volteo");
  }

  /* ---------------- Cantidad: botones - / + y atajos ---------------- */
  function ponerCantidad(n) {
    el.cantidad.value = String(Math.max(1, Math.min(LIMITE, n)));
    leerCantidad();
  }
  function prepararCantidad() {
    [5, 10, 20, 50, 100, 300].filter(function (n) { return n <= LIMITE; }).forEach(function (n) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "atajo";
      b.textContent = String(n);
      b.addEventListener("click", function () { ponerCantidad(n); });
      $("atajos").appendChild(b);
    });
    el.form.querySelectorAll(".ajuste").forEach(function (b) {
      b.addEventListener("click", function () {
        var actual = parseInt(el.cantidad.value, 10);
        if (isNaN(actual)) actual = 0;
        ponerCantidad(actual + parseInt(b.getAttribute("data-paso"), 10));
      });
    });
  }
  function bloquearFormulario(bloquear) {
    el.form.querySelectorAll("input, .ajuste, .atajo").forEach(function (i) { i.disabled = bloquear; });
  }

  /* ---------------- Validacion de la cantidad ---------------- */
  function leerCantidad() {
    var texto = el.cantidad.value.trim();
    var error = null, n = NaN;
    if (texto === "") error = "Escribe cuántas cartas quieres.";
    else if (!/^\d+$/.test(texto)) error = "Escribe solo un número entero, sin letras, puntos ni signos.";
    else {
      n = parseInt(texto, 10);
      if (n < 1) error = "Tiene que ser al menos 1 carta.";
      else if (n > LIMITE) error = "El máximo es " + LIMITE + " cartas" + (MOVIL ? " en este dispositivo." : ".") +
        " Si necesitas más, genéralas en varias tandas.";
    }
    el.errorCantidad.textContent = error || "";
    el.errorCantidad.hidden = !error;
    el.cantidad.setAttribute("aria-invalid", error ? "true" : "false");
    return error ? null : n;
  }

  /* ---------------- 4. Generar ---------------- */
  function liberarPdfAnterior() {
    if (estado.urlPdf) { URL.revokeObjectURL(estado.urlPdf); estado.urlPdf = null; }
    el.descargar.removeAttribute("href");
    el.resultado.hidden = true;
  }

  function pedirPantallaEncendida() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request("screen").then(function (w) { estado.wakeLock = w; }, function () {});
      }
    } catch (e) { /* no pasa nada */ }
  }
  function soltarPantalla() {
    try { if (estado.wakeLock) estado.wakeLock.release(); } catch (e) { /* nada */ }
    estado.wakeLock = null;
  }

  function mostrarProgreso(hechas, total) {
    cantarCarta(hechas);
    el.trabajoTexto.textContent = "Generando carta " + hechas + " de " + total;
    barra(el.trabajoRelleno, total ? hechas / total : 0);
  }

  function generarEnWorker(tipo, cantidad) {
    return new Promise(function (resolver, rechazar) {
      if (!estado.worker) estado.worker = crearWorker();
      var w = estado.worker;
      estado.trabajoActual = { rechazar: rechazar };
      w.onmessage = function (ev) {
        var m = ev.data || {};
        if (m.tipo === "progreso") mostrarProgreso(m.hechas, m.total);
        else if (m.tipo === "armando") el.trabajoTexto.textContent = "Armando el PDF…";
        else if (m.tipo === "listo") resolver(m.pdf);
        else if (m.tipo === "error") rechazar(new Loteria.ErrorLoteria(m.codigo));
      };
      // Si el worker se cae (por ejemplo, sin memoria) se avisa y se crea otro la proxima vez.
      w.onerror = function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        estado.worker = null;
        try { w.terminate(); } catch (e) { /* nada */ }
        rechazar(new Loteria.ErrorLoteria("sin_memoria"));
      };
      var blobs = {};
      Loteria.generadores[tipo.generador].imagenes.forEach(function (def) {
        blobs[def.conjunto] = estado.blobs[def.conjunto];
      });
      w.postMessage({ accion: "generar", tipoId: tipo.id, cantidad: cantidad, blobs: blobs });
    });
  }

  var cacheImagenesPrincipal = {};
  function generarAqui(tipo, cantidad) {
    var gen = Loteria.generadores[tipo.generador];
    return new Promise(function (resolver, rechazar) {
      estado.trabajoActual = { rechazar: rechazar };
      Loteria.prepararImagenes(gen, estado.blobs, cacheImagenesPrincipal).then(function (imagenes) {
        return Loteria.generarPdf({
          tipo: tipo, cantidad: cantidad, imagenes: imagenes,
          alAvanzar: mostrarProgreso,
          alArmar: function () { el.trabajoTexto.textContent = "Armando el PDF…"; },
          cancelado: function () { return estado.cancelado; },
          // Cede el control entre hoja y hoja para que la barra se actualice.
          ceder: function () { return new Promise(function (r) { setTimeout(r, 0); }); }
        });
      }).then(resolver, rechazar);
    });
  }

  function descargarArchivo(url, nombre) {
    var a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); }, 0);
  }

  function alTerminar(pdf, tipo, cantidad) {
    var nombre = tipo.archivo + "_" + cantidad + ".pdf";
    estado.urlPdf = URL.createObjectURL(pdf);
    el.descargar.href = estado.urlPdf;
    el.descargar.setAttribute("download", nombre);
    if (IOS) {
      el.descargar.textContent = "Descargar PDF";
      el.resultadoTexto.textContent = "¡Listo! Tu PDF " + nombre + " está listo. Presiona el botón para guardarlo.";
    } else {
      el.descargar.textContent = "Descargar de nuevo";
      el.resultadoTexto.textContent = "¡Listo! Se descargó " + nombre +
        ". Si no lo ves en tus descargas, presiona el botón.";
    }
    el.resultado.hidden = false;
    verSeccion(el.resultado);
    descargarArchivo(estado.urlPdf, nombre);
  }

  function iniciar(ev) {
    ev.preventDefault();
    if (estado.ocupado || !estado.listo) return;
    mostrarAviso("");
    var tipo = tipoElegido();
    var cantidad = leerCantidad();
    if (!tipo || cantidad === null) { el.cantidad.focus(); return; }

    liberarPdfAnterior();
    estado.ocupado = true;
    estado.cancelado = false;
    actualizarBotonGenerar();
    bloquearFormulario(true);
    el.trabajo.hidden = false;
    verSeccion(el.trabajo);
    el.cancelar.disabled = false;
    el.trabajoTexto.textContent = "Preparando…";
    cantorUltima = -1;
    cantarCarta(0);
    barra(el.trabajoRelleno, 0);
    pedirPantallaEncendida();

    var promesa = estado.modo === "worker" ? generarEnWorker(tipo, cantidad) : generarAqui(tipo, cantidad);
    promesa.then(function (pdf) {
      if (estado.cancelado) return;
      alTerminar(pdf, tipo, cantidad);
    }, function (e) {
      var codigo = Loteria.codigoDeError(e);
      if (codigo === "cancelado" || estado.cancelado) {
        mostrarAviso("Se canceló. No se descargó nada.");
      } else {
        mostrarAviso(MENSAJES[codigo] || MENSAJES.desconocido);
        if (window.console) console.error(e);
      }
    }).then(function () {
      estado.ocupado = false;
      estado.trabajoActual = null;
      el.trabajo.hidden = true;
      bloquearFormulario(false);
      actualizarBotonGenerar();
      soltarPantalla();
    });
  }

  function cancelar() {
    if (!estado.ocupado) return;
    estado.cancelado = true;
    el.cancelar.disabled = true;
    el.trabajoTexto.textContent = "Cancelando…";
    if (estado.modo === "worker" && estado.worker) {
      // Terminar el worker descarta todo lo que llevaba; se crea otro la proxima vez.
      estado.worker.terminate();
      estado.worker = null;
    }
    if (estado.trabajoActual) estado.trabajoActual.rechazar(new Loteria.ErrorLoteria("cancelado"));
  }

  /* ---------------- Arranque ---------------- */
  function arrancar() {
    estado.listo = false;
    actualizarBotonGenerar();
    mostrarAviso("");
    precargarImagenes().then(function (blobs) {
      estado.blobs = blobs;
      return elegirModo();
    }).then(function (modo) {
      if (modo === "principal" && !puedeDibujarAqui()) {
        el.carga.hidden = true;
        mostrarAviso(MENSAJES.sin_canvas);
        return;
      }
      estado.modo = modo;
      pintarVistasPrevias();
      estado.listo = true;
      el.carga.hidden = true;
      actualizarBotonGenerar();
    }).catch(function () {
      el.cargaTexto.textContent = "No se pudieron cargar las imágenes.";
      mostrarAviso(MENSAJES.sin_red);
      el.reintentar.hidden = false;
    });
  }

  el.form.addEventListener("submit", iniciar);
  el.cantidad.addEventListener("input", function () {
    if (!el.errorCantidad.hidden) leerCantidad();
  });
  el.cancelar.addEventListener("click", cancelar);
  el.reintentar.addEventListener("click", arrancar);
  window.addEventListener("beforeunload", function (e) {
    if (estado.ocupado) { e.preventDefault(); e.returnValue = ""; }
  });
  window.addEventListener("pagehide", function () {
    if (estado.urlPdf) URL.revokeObjectURL(estado.urlPdf);
  });

  papelPicado();
  abanico();
  pintarTipos();
  prepararCantidad();
  Promise.all(Loteria.scriptsGeneradores().map(cargarScript)).then(arrancar, function () {
    el.carga.hidden = true;
    mostrarAviso(MENSAJES.sin_red);
  });
})();
