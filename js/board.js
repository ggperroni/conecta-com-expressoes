/**
 * Conecta com Expressões — o tabuleiro.
 *
 * Os valores reproduzem a Figura 1 do artigo: 69 valores inteiros positivos,
 * 11 negativos e o zero no centro geométrico (linha 5, coluna 5). Os 81 valores
 * são distintos, portanto cada resultado corresponde a no máximo uma casa.
 *
 * Tabuleiros menores, de 6 × 6 a 9 × 9, são recortes quadrados centrados dessa
 * figura — o zero, que fica no centro, aparece em todos eles, e os valores
 * continuam distintos dentro do recorte. O módulo guarda um tabuleiro corrente,
 * trocado por setSize().
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Board = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MASTER_SIZE = 9;
  var MIN_SIZE = 6;
  var MAX_SIZE = MASTER_SIZE;
  var CONNECT = 4;

  var MASTER = [
    [ -1,  54,  72,  26,  -3,  75,  49,  66,  65],
    [ 15,  44,  20,  45,  -8,  31,   2,  63,  -7],
    [ 17,  28,  68,  37,  64,   3,  29,  70,  -9],
    [ 81,  12,   1,  -2,  13,  30,   6,   4, 100],
    [ 67,  60,  55,  10,   0,  96,  38, -10,  69],
    [ 14,  22, -12,  83,   9,  40,  35,  90,  32],
    [ 82,  80,  42,  18,  19,  41,  -6,   5,   8],
    [ 33,  -4,  61,  25,  21,  39,  11,  50,  23],
    [ 48,  62,  16,  36,  24,  -5,  27,  34,   7]
  ];

  function clampSize(size) {
    var n = Math.round(Number(size));
    if (!isFinite(n)) return MASTER_SIZE;
    return Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));
  }

  /**
   * Recorte quadrado centrado da Figura 1, sem tocar no tabuleiro corrente.
   * @returns {{size, offset, values, counts}}
   */
  function windowFor(size) {
    var n = clampSize(size);
    var offset = Math.floor((MASTER_SIZE - n) / 2);
    var values = [];
    var counts = { positive: 0, negative: 0, zero: 0 };
    for (var r = 0; r < n; r++) {
      var row = MASTER[r + offset].slice(offset, offset + n);
      row.forEach(function (value) {
        if (value === 0) counts.zero++;
        else if (value < 0) counts.negative++;
        else counts.positive++;
      });
      values.push(row);
    }
    return { size: n, offset: offset, values: values, counts: counts };
  }

  var current;

  /** Troca o tabuleiro corrente. @returns {number} o tamanho efetivo. */
  function setSize(size) {
    var win = windowFor(size);
    win.index = new Map();
    for (var r = 0; r < win.size; r++) {
      for (var c = 0; c < win.size; c++) win.index.set(win.values[r][c], { row: r, col: c });
    }
    current = win;
    // Espelhados como propriedades para que quem apenas lê não precise chamar nada.
    api.SIZE = win.size;
    api.VALUES = win.values;
    api.OFFSET = win.offset;
    return win.size;
  }

  function size() { return current.size; }
  function counts() { return current.counts; }
  function cellCount() { return current.size * current.size; }

  function valueAt(row, col) { return current.values[row][col]; }
  function hasValue(value) { return current.index.has(value); }
  function cellOf(value) { return current.index.get(value) || null; }

  /** Estado vazio: matriz do tamanho corrente com null | 1 | 2. */
  function createState() {
    var rows = [];
    for (var r = 0; r < current.size; r++) rows.push(new Array(current.size).fill(null));
    return rows;
  }

  function occupant(state, row, col) { return state[row][col]; }
  function isFree(state, row, col) { return state[row][col] === null; }

  function countFree(state) {
    var n = 0;
    for (var r = 0; r < state.length; r++) {
      for (var c = 0; c < state.length; c++) if (state[r][c] === null) n++;
    }
    return n;
  }

  var DIRECTIONS = [
    { dr: 0, dc: 1 },  // horizontal
    { dr: 1, dc: 0 },  // vertical
    { dr: 1, dc: 1 },  // diagonal ↘
    { dr: 1, dc: -1 }  // diagonal ↗
  ];

  /**
   * Sequências de quatro ou mais peças da mesma cor que passam pela casa jogada.
   * Quando uma jogada fecha mais de uma sequência, todas são devolvidas.
   * @returns {Array<Array<{row, col}>>}
   */
  function winningLines(state, row, col) {
    var player = state[row][col];
    if (player === null) return [];
    var limit = state.length;
    var lines = [];
    DIRECTIONS.forEach(function (dir) {
      var cells = [{ row: row, col: col }];
      var r, c;
      for (r = row - dir.dr, c = col - dir.dc;
           r >= 0 && r < limit && c >= 0 && c < limit && state[r][c] === player;
           r -= dir.dr, c -= dir.dc) cells.unshift({ row: r, col: c });
      for (r = row + dir.dr, c = col + dir.dc;
           r >= 0 && r < limit && c >= 0 && c < limit && state[r][c] === player;
           r += dir.dr, c += dir.dc) cells.push({ row: r, col: c });
      if (cells.length >= CONNECT) lines.push(cells);
    });
    return lines;
  }

  /** Classificação visual de uma casa. */
  function kindOf(value) {
    if (value === 0) return 'zero';
    return value < 0 ? 'negative' : 'positive';
  }

  var api = {
    MASTER: MASTER,
    MASTER_SIZE: MASTER_SIZE,
    MIN_SIZE: MIN_SIZE,
    MAX_SIZE: MAX_SIZE,
    CONNECT: CONNECT,
    clampSize: clampSize,
    windowFor: windowFor,
    setSize: setSize,
    size: size,
    counts: counts,
    cellCount: cellCount,
    valueAt: valueAt,
    hasValue: hasValue,
    cellOf: cellOf,
    createState: createState,
    occupant: occupant,
    isFree: isFree,
    countFree: countFree,
    winningLines: winningLines,
    kindOf: kindOf
  };

  setSize(MASTER_SIZE);
  return api;
});
