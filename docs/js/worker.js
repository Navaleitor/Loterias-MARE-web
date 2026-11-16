/*
 * ===============================================================
 *  LOTERIAS MARE - Web Worker (genera el PDF sin trabar la pagina)
 * ===============================================================
 *
 * Mensajes que recibe:
 *   {accion: "probar"}                         -> responde si puede usar OffscreenCanvas
 *   {accion: "generar", tipoId, cantidad, blobs} -> genera el PDF
 *
 * Mensajes que manda:
 *   {tipo: "prueba", ok}
 *   {tipo: "progreso", hechas, total}
 *   {tipo: "armando"}                (todas las hojas listas, armando el PDF)
 *   {tipo: "listo", pdf}             (Blob del PDF)
 *   {tipo: "error", codigo}
 *
 * Para cancelar, la pagina simplemente termina este worker (terminate()).
 */
/* global importScripts, Loteria */
"use strict";

var base = new URL("../", self.location.href);
importScripts(new URL("js/tipos.js", base).href,
              new URL("js/pdf.js", base).href,
              new URL("js/motor.js", base).href);
importScripts.apply(null, Loteria.scriptsGeneradores().map(function (s) { return new URL(s, base).href; }));

var cacheImagenes = {};   // imagenes ya decodificadas (se reutilizan entre trabajos)

function puedeUsarOffscreen() {
  try {
    if (typeof OffscreenCanvas === "undefined") return false;
    var c = new OffscreenCanvas(8, 8);
    var ctx = c.getContext("2d");
    return !!(ctx && c.convertToBlob && typeof createImageBitmap === "function");
  } catch (e) {
    return false;
  }
}

self.onmessage = function (ev) {
  var m = ev.data || {};

  if (m.accion === "probar") {
    self.postMessage({ tipo: "prueba", ok: puedeUsarOffscreen() });
    return;
  }

  if (m.accion === "generar") {
    var tipo = Loteria.buscarTipo(m.tipoId);
    var gen = tipo && Loteria.generadores[tipo.generador];
    if (!gen) { self.postMessage({ tipo: "error", codigo: "desconocido" }); return; }

    Loteria.prepararImagenes(gen, m.blobs, cacheImagenes).then(function (imagenes) {
      return Loteria.generarPdf({
        tipo: tipo,
        cantidad: m.cantidad,
        imagenes: imagenes,
        alAvanzar: function (hechas, total) {
          self.postMessage({ tipo: "progreso", hechas: hechas, total: total });
        },
        alArmar: function () { self.postMessage({ tipo: "armando" }); }
      });
    }).then(function (pdf) {
      self.postMessage({ tipo: "listo", pdf: pdf });
    }).catch(function (e) {
      self.postMessage({ tipo: "error", codigo: Loteria.codigoDeError(e) });
    });
  }
};
