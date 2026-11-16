/*
 * ===============================================================
 *  LOTERIAS MARE - Centros dobles (port de loterias/centros_dobles.py)
 * ===============================================================
 *
 * Cada hoja trae 4 cartas de 4x4: A arriba-izquierda, B arriba-derecha,
 * C abajo-izquierda, D abajo-derecha. Hoja de 2320 x 3275 px con fondo
 * negro (el negro forma las lineas entre cartas); cada figura mide 280 x 400.
 *
 * REGLAS DEL REPARTO (las mismas que en Python):
 *  - Se barajan las 54 figuras y se reparten: A=13, B=14, C=14, D=13.
 *  - Cada carta lleva una figura DOBLE en el centro (casillas 6 y 7 de 16).
 *    La doble no esta en su propia carta, ni en la carta de su pareja
 *    (A con B, C con D), ni es doble de otra carta de la misma hoja.
 *  - A y D llevan una figura extra en la ultima casilla (13 + 2 + 1 = 16).
 *    La extra solo evita las figuras de su propia carta y las dobles ya
 *    elegidas en ese momento.
 */
(function (root) {
  "use strict";
  var Loteria = root.Loteria;

  var ANCHO_HOJA = 2320, ALTO_HOJA = 3275;
  var TAM_IMAGEN = [280, 400];
  var COLUMNAS_CARTA = 4;
  var ORIGENES = [[25, 25], [1175, 25], [25, 1647], [1175, 1647]];   // A, B, C, D
  var FIGURAS_ANTES_DE_DOBLE = 5;

  /* Figura al azar que no este en ninguna de las listas (como figura_nueva). */
  function figuraNueva(rng, excluidas1, excluidas2, dobles) {
    for (;;) {
      var n = Loteria.enteroAzar(rng, 1, Loteria.TOTAL_FIGURAS);
      if (excluidas1.indexOf(n) < 0 && excluidas2.indexOf(n) < 0 && dobles.indexOf(n) < 0) return n;
    }
  }

  /* Convierte 13 o 14 figuras en las 16 casillas de una carta (como armar_carta). */
  function armarCarta(rng, base, excluidas1, excluidas2, dobles, conExtra) {
    var carta = base.slice(0, FIGURAS_ANTES_DE_DOBLE);
    var doble = figuraNueva(rng, excluidas1, excluidas2, dobles);
    dobles.push(doble);
    carta.push(doble, doble);
    carta = carta.concat(base.slice(FIGURAS_ANTES_DE_DOBLE));
    if (conExtra) carta.push(figuraNueva(rng, base, [], dobles));
    return carta;
  }

  Loteria.generadores.centros_dobles = {
    hoja: { ancho: ANCHO_HOJA, alto: ALTO_HOJA },
    dpi: 72,   // 1 pixel = 1 punto: pagina de 2320 x 3275, como en Python.
    imagenes: [{ conjunto: "cd", carpeta: "img/cd", ancho: TAM_IMAGEN[0], alto: TAM_IMAGEN[1] }],

    /* Reparte UNA hoja (como repartir_hoja). Devuelve {cartas: [A1, B1, C1, D1]}. */
    repartir: function (opciones, rng) {
      var r = Loteria.barajar(rng, Loteria.TOTAL_FIGURAS);
      var A = r.slice(0, 13), B = r.slice(13, 27), C = r.slice(27, 41), D = r.slice(41, 54);
      var dobles = [];
      var A1 = armarCarta(rng, A, A, B, dobles, true);
      var B1 = armarCarta(rng, B, A, B, dobles, false);
      var C1 = armarCarta(rng, C, C, D, dobles, false);
      var D1 = armarCarta(rng, D, C, D, dobles, true);
      return { cartas: [A1, B1, C1, D1] };
    },

    /* Donde va cada figura (como pegar_carta): izquierda a derecha, arriba a abajo. */
    colocar: function (asignacion) {
      var lista = [];
      asignacion.cartas.forEach(function (figuras, c) {
        var ox = ORIGENES[c][0], oy = ORIGENES[c][1];
        figuras.forEach(function (numero, p) {
          lista.push({
            conjunto: "cd", figura: numero,
            x: ox + (p % COLUMNAS_CARTA) * TAM_IMAGEN[0],
            y: oy + Math.floor(p / COLUMNAS_CARTA) * TAM_IMAGEN[1]
          });
        });
      });
      return lista;
    }
  };
})(typeof self !== "undefined" ? self : globalThis);
