/*
 * ===============================================================
 *  LOTERIAS MARE - Registro de tipos de loteria
 * ===============================================================
 *
 * Es el mismo concepto que TIPOS en loterias/__init__.py (Python).
 * La pagina y el worker leen esta lista; no hay que tocar nada mas.
 *
 * PARA AGREGAR UN TIPO NUEVO (Navidad, Halloween, personalizada...):
 *   1. Si el armado es nuevo, crea js/loterias/<nombre>.js que registre
 *      Loteria.generadores.<nombre> (copia centros_dobles.js o pozitos.js).
 *      Si solo cambia un patron, reutiliza un generador con otras "opciones".
 *   2. Si usa figuras nuevas, agrega su conjunto de imagenes en
 *      preparar_imagenes.py (y en "imagenes" del generador).
 *   3. Agrega una entrada aqui abajo.
 *
 * Campos de cada tipo:
 *   id           identificador interno (sin espacios)
 *   nombre       lo que ve el usuario
 *   descripcion  texto corto debajo del nombre
 *   archivo      prefijo del PDF: <archivo>_<cantidad>.pdf
 *   script       archivo JS con el generador (relativo a docs/)
 *   generador    nombre con el que ese archivo se registra
 *   opciones     datos extra para el generador (por ejemplo el patron)
 */
(function (root) {
  "use strict";
  var Loteria = root.Loteria = root.Loteria || {};
  Loteria.generadores = Loteria.generadores || {};

  Loteria.TOTAL_FIGURAS = 54;

  Loteria.TIPOS = [
    {
      id: "centros_doble",
      nombre: "Centros dobles",
      descripcion: "4 cartas de 4x4 por hoja, con la figura doble en el centro de cada carta.",
      archivo: "centros_doble",
      script: "js/loterias/centros_dobles.js",
      generador: "centros_dobles",
      opciones: {}
    },
    {
      id: "pozitos_v2",
      nombre: "Pozitos v2",
      descripcion: "Hoja carta horizontal, 6 columnas de 5 casillas: 1 figura única, 2 triples y 2 dobles por columna.",
      archivo: "pozitos_v2",
      script: "js/loterias/pozitos.js",
      generador: "pozitos",
      opciones: { patron: "v2" }
    },
    {
      id: "pozitos_v3",
      nombre: "Pozitos v3",
      descripcion: "Igual que Pozitos v2, pero con las figuras de la derecha invertidas en las casillas 2 y 5.",
      archivo: "pozitos_v3",
      script: "js/loterias/pozitos.js",
      generador: "pozitos",
      opciones: { patron: "v3" }
    }
  ];

  Loteria.buscarTipo = function (id) {
    for (var i = 0; i < Loteria.TIPOS.length; i++) {
      if (Loteria.TIPOS[i].id === id) return Loteria.TIPOS[i];
    }
    return null;
  };

  /* Lista sin repetir de los scripts de generadores que hay que cargar. */
  Loteria.scriptsGeneradores = function () {
    var vistos = {}, lista = [];
    Loteria.TIPOS.forEach(function (t) {
      if (!vistos[t.script]) { vistos[t.script] = true; lista.push(t.script); }
    });
    return lista;
  };

  /* ---------- Utilidades de azar compartidas por los generadores ---------- */

  /* Entero al azar entre a y b (incluidos), como random.randint de Python. */
  Loteria.enteroAzar = function (rng, a, b) {
    return a + Math.floor(rng() * (b - a + 1));
  };

  /* Los numeros 1..n revueltos sin repetir, como random.sample(range(1, n+1), n). */
  Loteria.barajar = function (rng, n) {
    var lista = [];
    for (var i = 1; i <= n; i++) lista.push(i);
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(rng() * (j + 1));
      var t = lista[j]; lista[j] = lista[k]; lista[k] = t;
    }
    return lista;
  };
})(typeof self !== "undefined" ? self : globalThis);
