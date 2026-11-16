/*
 * ===============================================================
 *  LOTERIAS MARE - Escritor de PDF (port de escribir_pdf en loterias/comun.py)
 * ===============================================================
 *
 * Un PDF es un archivo con "objetos" numerados. Aqui se escriben:
 *     objeto 1 = catalogo (el punto de entrada del PDF)
 *     objeto 2 = lista de paginas
 *     por cada hoja, 3 objetos: la pagina, su contenido y la imagen JPEG.
 * Al final va una tabla (xref) con la posicion (en bytes) de cada objeto.
 *
 * El PDF se arma como un Blob hecho de "partes": los JPEG de cada hoja ya son
 * Blobs y se meten tal cual, sin copiarlos a un arreglo grande. Las posiciones
 * del xref se calculan sumando el tamaño de cada parte (blob.size).
 *
 * Tamaño de pagina en puntos = pixeles * 72 / dpi
 *   Pozitos:        3300 x 2550 px a 300 dpi = 792 x 612 pt (carta horizontal)
 *   Centros dobles: 2320 x 3275 px a 72 dpi  = 2320 x 3275 pt (1 px = 1 pt)
 */
(function (root) {
  "use strict";
  var Loteria = root.Loteria = root.Loteria || {};

  /* Igual que "%g" % numero en Python para estos casos (6 cifras significativas). */
  function formatoG(numero) {
    return String(Number(numero.toPrecision(6)));
  }

  /*
   * paginasJpeg: lista de Blobs JPEG (una hoja cada uno, todas del mismo tamaño).
   * Devuelve un Blob "application/pdf".
   */
  Loteria.crearPdf = function (paginasJpeg, anchoPx, altoPx, dpi) {
    var codificador = new TextEncoder();
    var partes = [];
    var posicion = 0;
    var posiciones = {};
    var total = paginasJpeg.length;

    function texto(s) {
      var bytes = codificador.encode(s);
      partes.push(bytes);
      posicion += bytes.length;
    }
    function blob(b) {
      partes.push(b);
      posicion += b.size;
    }
    function objeto(numero, contenido) {
      posiciones[numero] = posicion;
      texto(numero + " 0 obj\n" + contenido + "\nendobj\n");
    }

    var anchoPt = formatoG(anchoPx * 72 / dpi);
    var altoPt = formatoG(altoPx * 72 / dpi);
    var medida = anchoPt + " " + altoPt;

    texto("%PDF-1.4\n");
    objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
    var kids = [];
    for (var i = 0; i < total; i++) kids.push((3 + 3 * i) + " 0 R");
    objeto(2, "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + total + " >>");

    // "q ancho 0 0 alto 0 0 cm /Im0 Do Q" = dibuja la imagen cubriendo toda la pagina.
    var dibujo = "q " + anchoPt + " 0 0 " + altoPt + " 0 0 cm /Im0 Do Q";

    for (var p = 0; p < total; p++) {
      var nPagina = 3 + 3 * p, nContenido = 4 + 3 * p, nImagen = 5 + 3 * p;
      var jpeg = paginasJpeg[p];

      objeto(nPagina,
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + medida + "]" +
        " /Resources << /XObject << /Im0 " + nImagen + " 0 R >> >>" +
        " /Contents " + nContenido + " 0 R >>");

      objeto(nContenido,
        "<< /Length " + dibujo.length + " >>\nstream\n" + dibujo + "\nendstream");

      // La imagen se escribe en 3 partes para meter el JPEG (Blob) sin copiarlo.
      posiciones[nImagen] = posicion;
      texto(nImagen + " 0 obj\n" +
        "<< /Type /XObject /Subtype /Image /Width " + anchoPx + " /Height " + altoPx +
        " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode" +
        " /Length " + jpeg.size + " >>\nstream\n");
      blob(jpeg);
      texto("\nendstream\nendobj\n");
    }

    // Tabla de posiciones (xref) y final del archivo.
    var inicioXref = posicion;
    var cantidadObjetos = 3 + 3 * total;
    var xref = ["xref\n0 " + cantidadObjetos + "\n", "0000000000 65535 f \n"];
    for (var n = 1; n < cantidadObjetos; n++) {
      xref.push(("0000000000" + posiciones[n]).slice(-10) + " 00000 n \n");
    }
    xref.push("trailer\n<< /Size " + cantidadObjetos + " /Root 1 0 R >>\n");
    xref.push("startxref\n" + inicioXref + "\n%%EOF\n");
    texto(xref.join(""));

    return new Blob(partes, { type: "application/pdf" });
  };
})(typeof self !== "undefined" ? self : globalThis);
