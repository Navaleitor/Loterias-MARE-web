/*
 * Prueba 1 - Reglas del reparto (Node, sin navegador).
 *
 * Genera miles de hojas de cada tipo con los generadores JS de docs/js/ y
 * revisa automaticamente que se cumplan las reglas de los generadores Python.
 *
 *   node tests/reglas.test.js            (5000 hojas por tipo)
 *   node tests/reglas.test.js 20000
 */
"use strict";
var path = require("path");
var DOCS = path.join(__dirname, "..", "docs");
require(path.join(DOCS, "js/tipos.js"));
var Loteria = globalThis.Loteria;
Loteria.scriptsGeneradores().forEach(function (s) { require(path.join(DOCS, s)); });

var HOJAS = parseInt(process.argv[2] || "5000", 10);
var N = Loteria.TOTAL_FIGURAS;
var fallas = 0;

function falla(tipo, i, msg, dato) {
  fallas++;
  if (fallas <= 20) console.error("FALLA [" + tipo + " hoja " + i + "] " + msg + (dato ? " -> " + JSON.stringify(dato) : ""));
}
function rango(x) { return Number.isInteger(x) && x >= 1 && x <= N; }

/* ---------------- Centros dobles ---------------- */
function revisarCentros(tipo, as, i) {
  var cartas = as.cartas;
  if (cartas.length !== 4) return falla(tipo, i, "no hay 4 cartas");
  var tam = [13, 14, 14, 13];
  var bases = [], dobles = [], extras = [];
  cartas.forEach(function (c, k) {
    if (c.length !== 16) falla(tipo, i, "carta " + "ABCD"[k] + " no tiene 16 casillas", c);
    if (!c.every(rango)) falla(tipo, i, "figura fuera de 1..54", c);
    if (c[5] !== c[6]) falla(tipo, i, "la doble no esta en las casillas 6 y 7", c);
    var conExtra = (k === 0 || k === 3);
    var base = c.slice(0, 5).concat(c.slice(7, conExtra ? 15 : 16));
    if (base.length !== tam[k]) falla(tipo, i, "carta " + "ABCD"[k] + " no tiene " + tam[k] + " figuras base");
    bases.push(base);
    dobles.push(c[5]);
    extras.push(conExtra ? c[15] : null);
  });
  // Las 4 bases juntas son las 54 figuras sin repetir.
  var todas = [].concat.apply([], bases).slice().sort(function (a, b) { return a - b; });
  for (var n = 1; n <= N; n++) if (todas[n - 1] !== n) { falla(tipo, i, "las bases no son las 54 figuras"); break; }
  // Las 4 dobles distintas.
  if (new Set(dobles).size !== 4) falla(tipo, i, "dobles repetidas", dobles);
  // Doble fuera de su carta y de la carta pareja (A-B, C-D).
  var parejas = [[0, 1], [0, 1], [2, 3], [2, 3]];
  dobles.forEach(function (d, k) {
    var p = parejas[k];
    if (bases[p[0]].indexOf(d) >= 0 || bases[p[1]].indexOf(d) >= 0)
      falla(tipo, i, "la doble de " + "ABCD"[k] + " esta en su carta o en su pareja", d);
  });
  // Extra de A: no esta en la base de A ni es la doble de A (las dobles elegidas hasta ese momento).
  if (bases[0].indexOf(extras[0]) >= 0 || extras[0] === dobles[0]) falla(tipo, i, "extra de A invalida", extras[0]);
  // Extra de D: no esta en la base de D ni en ninguna de las 4 dobles.
  if (bases[3].indexOf(extras[3]) >= 0 || dobles.indexOf(extras[3]) >= 0) falla(tipo, i, "extra de D invalida", extras[3]);
}

/* ---------------- Pozitos ---------------- */
function revisarPozitos(tipo, as, i, patron, colocaciones) {
  var cols = as.columnas;
  if (cols.length !== 6) return falla(tipo, i, "no hay 6 columnas");
  var vistas = new Set();
  cols.forEach(function (col, c) {
    var nueve = col.A.concat([col.B1, col.B2, col.C1, col.C2]);
    if (col.A.length !== 5) falla(tipo, i, "columna sin 5 A");
    if (!nueve.every(rango)) falla(tipo, i, "figura fuera de 1..54", col);
    if (new Set(nueve).size !== 9) falla(tipo, i, "columna con figuras repetidas", col);
    nueve.forEach(function (f) {
      if (vistas.has(f)) falla(tipo, i, "figura " + f + " en dos columnas");
      vistas.add(f);
    });
  });
  if (vistas.size !== N) falla(tipo, i, "no estan las 54 figuras");

  // Revisar lo que realmente se pega: por columna 5 A unicas, B triples, C dobles, patron correcto.
  var porColumna = [];
  for (var c = 0; c < 6; c++) porColumna.push([]);
  colocaciones.forEach(function (p) {
    var c = Math.round((p.x - 27) / 545);
    if (p.conjunto === "pbc") c = Math.round((p.x - 27 - 320) / 545);
    porColumna[c].push(p);
  });
  porColumna.forEach(function (lista, c) {
    var col = cols[c];
    var cuenta = {};
    lista.forEach(function (p) { cuenta[p.figura] = (cuenta[p.figura] || 0) + 1; });
    col.A.forEach(function (a) { if (cuenta[a] !== 1) falla(tipo, i, "A " + a + " no sale 1 vez"); });
    if (cuenta[col.B1] !== 3 || cuenta[col.B2] !== 3) falla(tipo, i, "B no sale 3 veces", cuenta);
    if (cuenta[col.C1] !== 2 || cuenta[col.C2] !== 2) falla(tipo, i, "C no sale 2 veces", cuenta);
    // Patron casilla por casilla.
    for (var f = 0; f < 5; f++) {
      var y = 35 + f * 501, x = 27 + c * 545;
      var arriba = lista.filter(function (p) { return p.conjunto === "pbc" && p.x === x + 320 && p.y === y; });
      var abajo = lista.filter(function (p) { return p.conjunto === "pbc" && p.x === x + 320 && p.y === y + 238; });
      var aa = lista.filter(function (p) { return p.conjunto === "pa" && p.x === x && p.y === y; });
      if (aa.length !== 1 || aa[0].figura !== col.A[f]) falla(tipo, i, "A mal colocada");
      if (arriba.length !== 1 || arriba[0].figura !== col[patron[f][0]]) falla(tipo, i, "patron arriba mal en casilla " + (f + 1));
      if (abajo.length !== 1 || abajo[0].figura !== col[patron[f][1]]) falla(tipo, i, "patron abajo mal en casilla " + (f + 1));
    }
  });
}

/* ---------------- Colocacion dentro de la hoja ---------------- */
function revisarColocacion(tipo, gen, colocaciones, i) {
  var tam = {};
  gen.imagenes.forEach(function (d) { tam[d.conjunto] = d; });
  colocaciones.forEach(function (p) {
    var d = tam[p.conjunto];
    if (p.x < 0 || p.y < 0 || p.x + d.ancho > gen.hoja.ancho || p.y + d.alto > gen.hoja.alto)
      falla(tipo, i, "figura fuera de la hoja", p);
  });
}

var ESPERADOS = {
  v2: [["B1", "C1"], ["B2", "C1"], ["B1", "B2"], ["B1", "C2"], ["B2", "C2"]],
  v3: [["B1", "C1"], ["C1", "B2"], ["B1", "B2"], ["B1", "C2"], ["C2", "B2"]]
};

Loteria.TIPOS.forEach(function (tipo) {
  var gen = Loteria.generadores[tipo.generador];
  var antes = fallas;
  var dobleFrecuencia = {};
  for (var i = 0; i < HOJAS; i++) {
    var as = gen.repartir(tipo.opciones, Math.random);
    var col = gen.colocar(as, tipo.opciones);
    revisarColocacion(tipo.id, gen, col, i);
    if (tipo.generador === "centros_dobles") {
      if (col.length !== 64) falla(tipo.id, i, "no son 64 figuras", col.length);
      revisarCentros(tipo.id, as, i);
      as.cartas.forEach(function (c) { dobleFrecuencia[c[5]] = true; });
    } else {
      if (col.length !== 90) falla(tipo.id, i, "no son 90 figuras", col.length);
      revisarPozitos(tipo.id, as, i, ESPERADOS[tipo.opciones.patron], col);
    }
  }
  if (tipo.generador === "centros_dobles" && Object.keys(dobleFrecuencia).length !== N)
    falla(tipo.id, -1, "no todas las figuras llegaron a ser dobles (azar sospechoso)");
  console.log((fallas === antes ? "OK   " : "FALLA") + " " + tipo.id + ": " + HOJAS + " hojas revisadas");
});

// El patron JS es el mismo que el de Python.
["v2", "v3"].forEach(function (p) {
  if (JSON.stringify(Loteria.generadores.pozitos.PATRONES[p]) !== JSON.stringify(ESPERADOS[p]))
    falla("pozitos", -1, "patron " + p + " distinto al de Python");
});

if (fallas) { console.error(fallas + " fallas"); process.exit(1); }
console.log("Todas las reglas se cumplen.");
