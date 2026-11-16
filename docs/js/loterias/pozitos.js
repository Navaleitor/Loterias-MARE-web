/*
 * ===============================================================
 *  LOTERIAS MARE - Pozitos v2 / v3 (port de loterias/pozitos.py)
 * ===============================================================
 *
 * Hoja carta horizontal de 3300 x 2550 px (300 dpi) con fondo negro.
 * 6 columnas x 5 casillas. Cada casilla: figura A (320 x 476, ya recortada
 * 10 px por lado) a la izquierda y dos figuras chicas (200 x 238) a la derecha.
 *
 * Por columna: 5 A unicas, B1 y B2 triples, C1 y C2 dobles = 9 figuras.
 * 6 columnas x 9 = las 54 figuras, sin repetir entre columnas.
 *
 * Patrones (figura de arriba / abajo a la derecha en cada casilla):
 *   v2: B1/C1, B2/C1, B1/B2, B1/C2, B2/C2
 *   v3: B1/C1, C1/B2, B1/B2, B1/C2, C2/B2   (casillas 2 y 5 invertidas)
 */
(function (root) {
  "use strict";
  var Loteria = root.Loteria;

  var ANCHO_HOJA = 3300, ALTO_HOJA = 2550;
  var TAM_A = [320, 476];      // ya recortada (340 - 10 - 10)
  var TAM_BC = [200, 238];
  var INICIO_X = 27, INICIO_Y = 35;
  var PASO_X = 545, PASO_Y = 501;
  var DESPLAZ_BC_X = 320, ALTO_BC = 238;
  var COLUMNAS = 6, FILAS = 5;

  var PATRONES = {
    v2: [["B1", "C1"], ["B2", "C1"], ["B1", "B2"], ["B1", "C2"], ["B2", "C2"]],
    v3: [["B1", "C1"], ["C1", "B2"], ["B1", "B2"], ["B1", "C2"], ["C2", "B2"]]
  };

  Loteria.generadores.pozitos = {
    hoja: { ancho: ANCHO_HOJA, alto: ALTO_HOJA },
    dpi: 300,   // 3300 x 2550 px a 300 dpi = 792 x 612 pt (carta horizontal).
    imagenes: [
      { conjunto: "pa", carpeta: "img/pa", ancho: TAM_A[0], alto: TAM_A[1] },
      { conjunto: "pbc", carpeta: "img/pbc", ancho: TAM_BC[0], alto: TAM_BC[1] }
    ],
    PATRONES: PATRONES,

    /* Reparte UNA hoja (como generar_columnas). Devuelve {columnas: [...]}. */
    repartir: function (opciones, rng) {
      var figuras = Loteria.barajar(rng, Loteria.TOTAL_FIGURAS);
      var columnas = [];
      for (var c = 0; c < COLUMNAS; c++) {
        var b = figuras.slice(c * 9, (c + 1) * 9);
        columnas.push({ A: b.slice(0, 5), B1: b[5], B2: b[6], C1: b[7], C2: b[8] });
      }
      return { columnas: columnas };
    },

    /* Donde va cada figura (como generar_carta). */
    colocar: function (asignacion, opciones) {
      var patron = PATRONES[opciones.patron];
      if (!patron) throw new Error("Patron desconocido: " + opciones.patron);
      var lista = [];
      asignacion.columnas.forEach(function (col, c) {
        var x = INICIO_X + c * PASO_X;
        for (var f = 0; f < FILAS; f++) {
          var y = INICIO_Y + f * PASO_Y;
          lista.push({ conjunto: "pa", figura: col.A[f], x: x, y: y });
          lista.push({ conjunto: "pbc", figura: col[patron[f][0]], x: x + DESPLAZ_BC_X, y: y });
          lista.push({ conjunto: "pbc", figura: col[patron[f][1]], x: x + DESPLAZ_BC_X, y: y + ALTO_BC });
        }
      });
      return lista;
    }
  };
})(typeof self !== "undefined" ? self : globalThis);
