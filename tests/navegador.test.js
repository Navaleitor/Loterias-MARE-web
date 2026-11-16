/*
 * Prueba 4 - Flujo completo en un navegador real (Chromium con Playwright).
 *
 *   node tests/navegador.test.js [carpeta_para_los_pdf]      (todo, incluye 100 Pozitos)
 *   RAPIDO=1 node tests/navegador.test.js                    (sin la prueba de 100 hojas)
 *
 * Escritorio (1280x800) y celular (Pixel 7):
 *   - carga de imagenes con progreso "Cargando imagenes N/162"
 *   - generar cada tipo -> descarga automatica con el nombre <archivo>_<n>.pdf
 *   - barra de progreso, un solo trabajo a la vez, boton "Descargar de nuevo"
 *   - cancelar (no hay descarga) y volver a generar
 *   - cantidades invalidas y limite (300 escritorio / 100 celular)
 *   - modo sin worker (?modo=principal)
 *   - error de carga de imagenes y "Intentar de nuevo"
 *   - 100 hojas de Pozitos midiendo la memoria de Chromium
 * Cada PDF descargado se valida con tests/validar_pdf.py (prueba 3).
 */
"use strict";
var fs = require("fs");
var os = require("os");
var path = require("path");
var execFileSync = require("child_process").execFileSync;
var pw = require("playwright");
var servidor = require("./servidor");

var SALIDA = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "loteria_nav_"));
var RAPIDO = !!process.env.RAPIDO;
var fallas = 0;
var pdfsAValidar = [];
var MEDIDAS = { centros_doble: [2320, 3275], pozitos_v2: [792, 612], pozitos_v3: [792, 612] };

function ok(cond, msg) {
  console.log((cond ? "  OK    " : "  FALLA ") + msg);
  if (!cond) fallas++;
}

/* Registra todos los textos que muestran la carga y el progreso (para revisarlos despues). */
function espiarTextos() {
  window.__textos = [];
  document.addEventListener("DOMContentLoaded", function () {
    ["carga-texto", "trabajo-texto"].forEach(function (id) {
      var el = document.getElementById(id);
      new MutationObserver(function () { window.__textos.push(el.textContent); })
        .observe(el, { childList: true, characterData: true, subtree: true });
    });
  });
}

async function abrir(contexto, url) {
  var p = await contexto.newPage();
  p.on("pageerror", function (e) { ok(false, "error de JavaScript en la pagina: " + e.message); });
  await p.goto(url);
  await p.waitForFunction(function () { return window.LoteriaApp && window.LoteriaApp.listo; }, null, { timeout: 60000 });
  return p;
}

async function generar(p, tipoId, cantidad, etiqueta) {
  await p.check("input[name=tipo][value=" + tipoId + "]");
  await p.fill("#cantidad", String(cantidad));
  await p.evaluate(function () { window.__textos = []; });
  var esperaDescarga = p.waitForEvent("download", { timeout: 600000 });
  var t0 = Date.now();
  await p.click("#btn-generar");
  // Mientras trabaja: solo un trabajo a la vez.
  if (cantidad >= 3) {
    // El clic ya dejo la pagina "ocupada" (el trabajo dura mucho mas que esta revision).
    ok(await p.isDisabled("#btn-generar"), etiqueta + ": 'Generar' bloqueado mientras trabaja");
    ok(await p.isDisabled("#cantidad"), etiqueta + ": cantidad bloqueada mientras trabaja");
  }
  var descarga = await esperaDescarga;
  var segundos = (Date.now() - t0) / 1000;
  var nombre = descarga.suggestedFilename();
  ok(nombre === tipoId + "_" + cantidad + ".pdf", etiqueta + ": descarga automatica '" + nombre + "' (" + segundos.toFixed(1) + " s)");
  var destino = path.join(SALIDA, etiqueta.replace(/\W+/g, "_") + "__" + nombre);
  await descarga.saveAs(destino);
  pdfsAValidar.push([destino, cantidad, MEDIDAS[tipoId]]);
  var textos = await p.evaluate(function () { return window.__textos; });
  ok(textos.some(function (t) { return t === "Generando carta " + cantidad + " de " + cantidad; }),
     etiqueta + ": la barra llego a 'Generando carta " + cantidad + " de " + cantidad + "'");
  await p.waitForSelector("#resultado:not([hidden])");
  var href = await p.getAttribute("#btn-descargar", "href");
  var dl = await p.getAttribute("#btn-descargar", "download");
  ok(/^blob:/.test(href || "") && dl === nombre, etiqueta + ": boton 'Descargar de nuevo' listo (" + dl + ")");
  ok(!(await p.isDisabled("#btn-generar")), etiqueta + ": 'Generar' disponible otra vez");
  return { segundos: segundos, destino: destino };
}

async function probarInvalidas(p, limite, etiqueta) {
  var casos = ["", "abc", "0", "-5", "2.5", "1e3", " 7x", String(limite + 1)];
  for (var v of casos) {
    await p.fill("#cantidad", v);
    await p.click("#btn-generar");
    var visible = await p.isVisible("#error-cantidad");
    var texto = visible ? await p.textContent("#error-cantidad") : "";
    var trabajando = await p.isVisible("#trabajo");
    ok(visible && !trabajando, etiqueta + ": cantidad invalida " + JSON.stringify(v) + " -> \"" + texto + "\"");
  }
  var lim = await p.textContent("#limite");
  ok(lim.indexOf("Máximo " + limite + " cartas") === 0, etiqueta + ": muestra el limite: \"" + lim + "\"");
}

async function probarCancelar(p, etiqueta) {
  await p.check("input[name=tipo][value=pozitos_v2]");
  await p.fill("#cantidad", "60");
  var descargas = 0;
  var contar = function () { descargas++; };
  p.on("download", contar);
  await p.click("#btn-generar");
  await p.waitForFunction(function () {
    var t = document.getElementById("trabajo-texto").textContent;
    var m = /Generando carta (\d+)/.exec(t);
    return m && +m[1] >= 3;
  }, null, { timeout: 120000 });
  await p.click("#btn-cancelar");
  await p.waitForSelector("#trabajo", { state: "hidden" });
  var aviso = await p.textContent("#aviso-texto");
  await p.waitForTimeout(3000);
  ok(descargas === 0 && /canceló/.test(aviso), etiqueta + ": cancelar no descarga nada (\"" + aviso + "\")");
  ok(await p.isHidden("#resultado"), etiqueta + ": no queda boton de descarga tras cancelar");
  p.off("download", contar);
}

/* Memoria total (RSS) de los procesos de Chromium, en MB. */
function memoriaChromium() {
  try {
    var salida = execFileSync("ps", ["-eo", "rss,comm"], { encoding: "utf8" });
    return salida.split("\n").filter(function (l) { return /chrom|headless_shell/i.test(l); })
      .reduce(function (s, l) { return s + (parseInt(l, 10) || 0); }, 0) / 1024;
  } catch (e) { return NaN; }
}

(async function () {
  var s = await servidor.iniciar();
  var navegador = await pw.chromium.launch();
  console.log("PDFs de prueba en: " + SALIDA);

  /* ---------------- Escritorio ---------------- */
  console.log("\n== Escritorio (1280x800) ==");
  var esc = await navegador.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  await esc.addInitScript(espiarTextos);
  var p = await abrir(esc, s.url);
  var textosCarga = await p.evaluate(function () { return window.__textos; });
  ok(textosCarga.indexOf("Cargando imágenes 40/162") >= 0 && textosCarga.indexOf("Cargando imágenes 162/162") >= 0,
     "precarga con progreso (… 40/162 … 162/162)");
  ok(await p.evaluate(function () { return window.LoteriaApp.modo; }) === "worker", "usa Web Worker con OffscreenCanvas");
  ok(await p.isHidden("#carga"), "la seccion de carga se oculta al terminar");
  await probarInvalidas(p, 300, "escritorio");
  await generar(p, "centros_doble", 3, "escritorio centros");
  await generar(p, "pozitos_v2", 3, "escritorio pozitos v2");
  await generar(p, "pozitos_v3", 4, "escritorio pozitos v3");
  // "Descargar de nuevo" vuelve a bajar el mismo archivo.
  var otra = p.waitForEvent("download");
  await p.click("#btn-descargar");
  ok((await otra).suggestedFilename() === "pozitos_v3_4.pdf", "escritorio: 'Descargar de nuevo' funciona");
  await probarCancelar(p, "escritorio");
  await generar(p, "centros_doble", 2, "escritorio despues de cancelar");
  await p.screenshot({ path: path.join(SALIDA, "escritorio.png"), fullPage: true });

  if (!RAPIDO) {
    console.log("\n== 100 hojas de Pozitos (memoria) ==");
    var pico = memoriaChromium(), inicial = pico;
    var vigia = setInterval(function () { pico = Math.max(pico, memoriaChromium()); }, 250);
    var r = await generar(p, "pozitos_v2", 100, "escritorio 100 pozitos");
    clearInterval(vigia);
    var tam = fs.statSync(r.destino).size / 1048576;
    console.log("  INFO  memoria Chromium: inicio " + inicial.toFixed(0) + " MB, pico " + pico.toFixed(0) +
                " MB; PDF de " + tam.toFixed(1) + " MB en " + r.segundos.toFixed(1) + " s");
    // Sin comprimir, 100 hojas serian ~3300 MB; aceptamos hasta inicio + PDF*2 + 600 MB de margen.
    ok(pico - inicial < tam * 2 + 600, "la memoria no explota con 100 hojas (crecio " + (pico - inicial).toFixed(0) + " MB)");
  }
  await esc.close();

  /* ---------------- Sin worker ---------------- */
  console.log("\n== Escritorio sin worker (?modo=principal) ==");
  var sin = await navegador.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  await sin.addInitScript(espiarTextos);
  p = await abrir(sin, s.url + "?modo=principal");
  ok(await p.evaluate(function () { return window.LoteriaApp.modo; }) === "principal", "modo hilo principal");
  await generar(p, "pozitos_v3", 3, "principal pozitos v3");
  await generar(p, "centros_doble", 3, "principal centros");
  await probarCancelar(p, "principal");
  await sin.close();

  /* ---------------- Celular ---------------- */
  console.log("\n== Celular (Pixel 7) ==");
  var cel = await navegador.newContext(Object.assign({}, pw.devices["Pixel 7"], { acceptDownloads: true }));
  await cel.addInitScript(espiarTextos);
  p = await abrir(cel, s.url);
  await probarInvalidas(p, 100, "celular");
  await p.fill("#cantidad", "100");
  await p.click("#btn-generar");
  await p.waitForSelector("#trabajo:not([hidden])");
  ok(await p.isHidden("#error-cantidad"), "celular: 100 es valido");
  await p.click("#btn-cancelar");
  await p.waitForSelector("#trabajo", { state: "hidden" });
  await generar(p, "centros_doble", 3, "celular centros");
  await generar(p, "pozitos_v2", 2, "celular pozitos v2");
  var anchoDoc = await p.evaluate(function () { return document.documentElement.scrollWidth; });
  ok(anchoDoc <= 412, "celular: sin scroll horizontal (ancho " + anchoDoc + ")");
  await p.screenshot({ path: path.join(SALIDA, "celular.png"), fullPage: true });
  await cel.close();

  /* ---------------- Error de carga ---------------- */
  console.log("\n== Error al cargar imagenes ==");
  var err = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
  var fallar = true;
  await err.route("**/img/pa/7.jpg", function (ruta) { return fallar ? ruta.fulfill({ status: 404, body: "" }) : ruta.continue(); });
  p = await err.newPage();
  await p.goto(s.url);
  await p.waitForSelector("#btn-reintentar:not([hidden])", { timeout: 60000 });
  var msg = await p.textContent("#aviso-texto");
  ok(/conexión/.test(msg) && await p.isDisabled("#btn-generar"), "imagen que no carga -> mensaje claro y 'Generar' bloqueado (\"" + msg + "\")");
  fallar = false;
  await p.click("#btn-reintentar");
  await p.waitForFunction(function () { return window.LoteriaApp.listo; }, null, { timeout: 60000 });
  ok(!(await p.isDisabled("#btn-generar")) && await p.isHidden("#aviso"), "'Intentar de nuevo' recupera la pagina");
  await err.close();

  await navegador.close();
  await s.cerrar();

  /* ---------------- Prueba 3: validar los PDF ---------------- */
  console.log("\n== Validacion de los PDF (qpdf via pikepdf + pdfinfo + xref) ==");
  pdfsAValidar.forEach(function (d) {
    try {
      var out = execFileSync("python3", [path.join(__dirname, "validar_pdf.py"), d[0], String(d[1]), String(d[2][0]), String(d[2][1])],
                             { encoding: "utf8" });
      process.stdout.write("  " + out);
    } catch (e) {
      fallas++;
      process.stdout.write("  " + (e.stdout || e.message));
    }
  });

  console.log(fallas ? "\n" + fallas + " FALLAS" : "\nTodo OK");
  process.exit(fallas ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
