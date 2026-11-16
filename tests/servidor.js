/*
 * Servidor estatico minimo para probar docs/ como lo sirve GitHub Pages.
 * Uso desde otra prueba:  const {iniciar} = require("./servidor"); const s = await iniciar();
 *                          s.url -> "http://127.0.0.1:PUERTO/"   s.cerrar()
 * Uso directo:            node tests/servidor.js [puerto]
 */
"use strict";
var http = require("http");
var fs = require("fs");
var path = require("path");

var RAIZ = path.join(__dirname, "..", "docs");
var TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json"
};

function iniciar(puerto) {
  return new Promise(function (resolver) {
    var servidor = http.createServer(function (req, res) {
      var ruta = decodeURIComponent(req.url.split("?")[0]);
      if (ruta.endsWith("/")) ruta += "index.html";
      var archivo = path.join(RAIZ, path.normalize(ruta));
      if (!archivo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
      fs.readFile(archivo, function (err, datos) {
        if (err) { res.writeHead(404); return res.end("no existe"); }
        res.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo)] || "application/octet-stream" });
        res.end(datos);
      });
    });
    servidor.listen(puerto || 0, "127.0.0.1", function () {
      resolver({
        url: "http://127.0.0.1:" + servidor.address().port + "/",
        cerrar: function () { return new Promise(function (r) { servidor.close(r); }); }
      });
    });
  });
}

module.exports = { iniciar: iniciar };

if (require.main === module) {
  iniciar(parseInt(process.argv[2] || "8000", 10)).then(function (s) { console.log("Sirviendo docs/ en " + s.url); });
}
