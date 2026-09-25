/**
 * Gera favicon.png a partir do mesmo desenho de favicon.svg — a face 5 de um
 * dado, num quadrado de cantos arredondados.
 *
 * O PNG existe porque nem todo navegador aceita ícone em SVG (o Safari não), e
 * um ícone de aba não vale um passo de build: este script é avulso, corre só
 * quando o desenho muda e o resultado vai versionado.
 *
 *   node test/make-favicon.js
 *
 * As cores são as do tema claro. Um PNG não tem media query, e o azul saturado
 * também se vê numa barra de abas escura; é o SVG que troca de cor com o tema.
 */
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var SIZE = 32;          // o tamanho que o navegador pede para a aba
var GRID = 32;          // o viewBox do SVG, para as medidas serem as mesmas
var SAMPLES = 8;        // subamostras por lado: as bordas saem suaves sem desenhar curvas
var DIE = [0x1d, 0x4e, 0xd8];
var PIP = [0xff, 0xff, 0xff];

var body = { x: 2, y: 2, w: 28, h: 28, r: 7 };
var pips = [[10, 10], [22, 10], [16, 16], [10, 22], [22, 22]];
var PIP_R = 3.1;

/** O ponto está dentro do quadrado de cantos arredondados? */
function inBody(x, y) {
  var left = body.x + body.r, right = body.x + body.w - body.r;
  var top = body.y + body.r, bottom = body.y + body.h - body.r;
  var cx = Math.min(Math.max(x, left), right);
  var cy = Math.min(Math.max(y, top), bottom);
  /* Fora da cruz central, o que decide é a distância ao centro do canto. */
  if (x < left || x > right) {
    if (y < top || y > bottom) {
      var dx = x - cx, dy = y - cy;
      return dx * dx + dy * dy <= body.r * body.r;
    }
  }
  return x >= body.x && x <= body.x + body.w && y >= body.y && y <= body.y + body.h;
}

function inPip(x, y) {
  return pips.some(function (p) {
    var dx = x - p[0], dy = y - p[1];
    return dx * dx + dy * dy <= PIP_R * PIP_R;
  });
}

/* RGBA com o canal alfa já resolvido por subamostragem: cada pixel guarda a
   média das cores e da cobertura das SAMPLES² sondas que caem nele. */
var raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (var py = 0; py < SIZE; py++) {
  var row = py * (1 + SIZE * 4);
  raw[row] = 0;                                      /* filtro 0: sem predição */
  for (var px = 0; px < SIZE; px++) {
    var r = 0, g = 0, b = 0, hits = 0;
    for (var sy = 0; sy < SAMPLES; sy++) {
      for (var sx = 0; sx < SAMPLES; sx++) {
        var x = (px + (sx + 0.5) / SAMPLES) * GRID / SIZE;
        var y = (py + (sy + 0.5) / SAMPLES) * GRID / SIZE;
        if (!inBody(x, y)) continue;
        var color = inPip(x, y) ? PIP : DIE;
        r += color[0]; g += color[1]; b += color[2];
        hits++;
      }
    }
    var offset = row + 1 + px * 4;
    if (hits) {
      raw[offset] = Math.round(r / hits);
      raw[offset + 1] = Math.round(g / hits);
      raw[offset + 2] = Math.round(b / hits);
      raw[offset + 3] = Math.round(255 * hits / (SAMPLES * SAMPLES));
    }
  }
}

/** Um chunk de PNG: tamanho, tipo, dados e o CRC dos dois últimos. */
function chunk(type, data) {
  var length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  var payload = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([length, payload, crc]);
}

var CRC_TABLE = (function () {
  var table = new Int32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  var c = -1;
  for (var i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

var header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8;    /* 8 bits por canal */
header[9] = 6;    /* cor verdadeira com alfa */

var png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

var out = path.join(__dirname, '..', 'favicon.png');
fs.writeFileSync(out, png);
console.log('favicon.png gerado (' + SIZE + ' × ' + SIZE + ', ' + png.length + ' bytes)');
