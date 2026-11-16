/*
 * Prueba 2 (parte navegador): abre la pagina en Chromium (Playwright) y
 * compone, con el motor JS y las imagenes de docs/img, la MISMA asignacion
 * que exporto Python. Guarda:
 *   <tipo>_js.png   la hoja tal cual quedo en el canvas (sin perdida)
 *   <tipo>_js.jpg   la hoja comprimida como va dentro del PDF (calidad 0.85)
 *
 * Uso: node tests/componer_js.js <carpeta_con_las_referencias>
 */
"use strict";
var fs = require("fs");
var path = require("path");
var chromium = require("playwright").chromium;
var servidor = require("./servidor");

(async function () {
  var dir = process.argv[2];
  var s = await servidor.iniciar();
  var navegador = await chromium.launch();
  var pagina = await navegador.newPage();
  await pagina.goto(s.url);
  await pagina.waitForFunction(function () { return window.LoteriaApp && window.LoteriaApp.listo; }, null, { timeout: 60000 });

  for (var id of ["centros_doble", "pozitos_v2", "pozitos_v3"]) {
    var asignacion = JSON.parse(fs.readFileSync(path.join(dir, id + ".json"), "utf8"));
    var r = await pagina.evaluate(async function (args) {
      var L = window.Loteria;
      var tipo = L.buscarTipo(args.id);
      var gen = L.generadores[tipo.generador];
      // El patron que exporto Python debe ser el mismo que usa el JS.
      if (args.asignacion.patron &&
          JSON.stringify(args.asignacion.patron) !== JSON.stringify(gen.PATRONES[tipo.opciones.patron])) {
        throw new Error("El patron JS no coincide con el de Python");
      }
      var imagenes = await L.prepararImagenes(gen, window.LoteriaApp.blobs, {});
      var l = L.crearLienzo(gen.hoja.ancho, gen.hoja.alto);
      L.pintarHoja(l, gen, gen.colocar(args.asignacion, tipo.opciones), imagenes);
      var png = l.lienzo.toDataURL("image/png");
      var jpg = await L.lienzoAJpeg(l);
      var buf = new Uint8Array(await jpg.arrayBuffer());
      var bin = "";
      for (var i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      L.liberarLienzo(l);
      return { png: png.split(",")[1], jpg: btoa(bin) };
    }, { id: id, asignacion: asignacion });
    fs.writeFileSync(path.join(dir, id + "_js.png"), Buffer.from(r.png, "base64"));
    fs.writeFileSync(path.join(dir, id + "_js.jpg"), Buffer.from(r.jpg, "base64"));
    console.log("Compuesta en el navegador: " + id);
  }
  await navegador.close();
  await s.cerrar();
})().catch(function (e) { console.error(e); process.exit(1); });
