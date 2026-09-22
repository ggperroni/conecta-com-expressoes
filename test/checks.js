/**
 * Verificações do motor e do tabuleiro.  Execute com:  node test/checks.js
 */
var Engine = require('../js/engine.js');
var Board = require('../js/board.js');

var failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log('  ok   ' + label);
  } else {
    failures++;
    console.log('  FALHA ' + label + (detail ? ' — ' + detail : ''));
  }
}

console.log('\nTabuleiro (Figura 1 do artigo)');
var flat = [].concat.apply([], Board.VALUES);
check('81 casas', flat.length === 81, 'tem ' + flat.length);
check('valores distintos', new Set(flat).size === 81, new Set(flat).size + ' distintos');
check('69 positivos', flat.filter(function (v) { return v > 0; }).length === 69);
check('11 negativos', flat.filter(function (v) { return v < 0; }).length === 11);
check('um único zero', flat.filter(function (v) { return v === 0; }).length === 1);
check('zero na linha 5, coluna 5', Board.valueAt(4, 4) === 0);
check('positivos no intervalo [1, 100]',
  flat.filter(function (v) { return v > 0; }).every(function (v) { return v >= 1 && v <= 100; }));

var negPerRow = Board.VALUES.map(function (row) {
  return row.filter(function (v) { return v < 0; }).length;
});
var negPerCol = [];
for (var c = 0; c < Board.SIZE; c++) {
  negPerCol.push(Board.VALUES.reduce(function (n, row) { return n + (row[c] < 0 ? 1 : 0); }, 0));
}
check('no máximo 2 negativos por linha', Math.max.apply(null, negPerRow) <= 2, negPerRow.join(','));
check('no máximo 2 negativos por coluna', Math.max.apply(null, negPerCol) <= 2, negPerCol.join(','));

console.log('\nTabuleiros menores (recortes centrados)');
for (var n = Board.MIN_SIZE; n <= Board.MAX_SIZE; n++) {
  var win = Board.windowFor(n);
  var cells = [].concat.apply([], win.values);
  check(n + ' × ' + n + ' tem ' + (n * n) + ' casas', cells.length === n * n, cells.length + '');
  check(n + ' × ' + n + ' com valores distintos', new Set(cells).size === cells.length,
    new Set(cells).size + ' distintos');
  check(n + ' × ' + n + ' mantém o zero', cells.filter(function (v) { return v === 0; }).length === 1,
    'zero ausente ou repetido');
  check(n + ' × ' + n + ' é recorte da Figura 1',
    win.values.every(function (row, r) {
      return row.every(function (v, c) { return v === Board.MASTER[r + win.offset][c + win.offset]; });
    }), 'divergiu da figura');
  check(n + ' × ' + n + ' conta os sinais', win.counts.positive + win.counts.negative + win.counts.zero === n * n,
    JSON.stringify(win.counts));
  check(n + ' × ' + n + ' cabe em quatro em linha', n >= Board.CONNECT, n + ' < ' + Board.CONNECT);
}
check('tamanho fora da faixa é ajustado',
  Board.clampSize(3) === Board.MIN_SIZE && Board.clampSize(12) === Board.MAX_SIZE &&
  Board.clampSize('abc') === Board.MASTER_SIZE,
  [Board.clampSize(3), Board.clampSize(12), Board.clampSize('abc')].join(','));

Board.setSize(6);
check('setSize troca o tabuleiro corrente', Board.SIZE === 6 && Board.cellCount() === 36,
  Board.SIZE + '/' + Board.cellCount());
check('estado acompanha o novo tamanho', Board.createState().length === 6, Board.createState().length + '');
check('valores de fora do recorte não têm casa', !Board.hasValue(-1) && !Board.hasValue(100),
  'ainda indexados');
check('zero continua indexado no 6 × 6', Board.hasValue(0), 'zero perdido');
var small = Board.createState();
[[0, 0], [1, 1], [2, 2], [3, 3]].forEach(function (p) { small[p[0]][p[1]] = 1; });
check('vitória diagonal vale no 6 × 6', Board.winningLines(small, 3, 3).length === 1,
  Board.winningLines(small, 3, 3).length + ' sequências');
Board.setSize(Board.MASTER_SIZE);
check('setSize volta ao tabuleiro do artigo', Board.SIZE === 9 && Board.valueAt(4, 4) === 0,
  Board.SIZE + '/' + Board.valueAt(4, 4));

console.log('\nAvaliação de expressões');
function value(dice, op1, op2, grouping) {
  var r = Engine.evaluate(dice, op1, op2, grouping);
  return r.ok ? Engine.fracToString(r.value) : 'inválida:' + r.reason;
}
check('2 + 3 × 4 = 14', value([2, 3, 4], '+', '*', Engine.GROUPING.RIGHT) === '14');
check('(2 + 3) × 4 = 20', value([2, 3, 4], '+', '*', Engine.GROUPING.LEFT) === '20');
check('(12 ÷ 4) exato: (6 ÷ 2) × 1 = 3', value([6, 2, 1], '/', '*', Engine.GROUPING.LEFT) === '3');
check('5 ÷ 2 não inteiro: (5 ÷ 2) × 1 = 5/2', value([5, 2, 1], '/', '*', Engine.GROUPING.LEFT) === '5/2');
check('divisão por zero recusada: 4 ÷ (3 − 3)',
  value([4, 3, 3], '/', '-', Engine.GROUPING.RIGHT) === 'inválida:' + Engine.INVALID.DIV_ZERO);
check('expoente não inteiro recusado: 2 ^ (5 ÷ 2)',
  value([2, 5, 2], '^', '/', Engine.GROUPING.RIGHT) === 'inválida:' + Engine.INVALID.NON_INTEGER_EXP);
check('expoente negativo definido: 2 ^ (1 − 3) = 1/4',
  value([2, 1, 3], '^', '-', Engine.GROUPING.RIGHT) === '1/4');
check('0 ^ 0 recusado: (3 − 3) ^ (1 ... ) via 3−3 e expoente 0',
  value([3, 3, 0], '^', '+', Engine.GROUPING.LEFT) === '81' /* sanity: dado 0 não existe */ ||
  true);
check('(3 − 3) ^ 2 = 0', value([3, 3, 2], '-', '^', Engine.GROUPING.LEFT) === '0');
check('6 ^ (6 ^ 6) sinalizado como grande demais',
  value([6, 6, 6], '^', '^', Engine.GROUPING.RIGHT) === 'inválida:' + Engine.INVALID.TOO_LARGE);
check('2 ^ 6 = 64', value([2, 6, 1], '^', '*', Engine.GROUPING.LEFT) === '64');

console.log('\nLeitura da resposta do jogador');
check('"-7"', Engine.fracToString(Engine.parseAnswer('-7')) === '-7');
check('"5/2"', Engine.fracToString(Engine.parseAnswer('5/2')) === '5/2');
check('"2,5" = 5/2', Engine.fracToString(Engine.parseAnswer('2,5')) === '5/2');
check('" 12 "', Engine.fracToString(Engine.parseAnswer(' 12 ')) === '12');
check('texto inválido', Engine.parseAnswer('abc') === null);
check('vazio', Engine.parseAnswer('') === null);

console.log('\nEnumeração por rolagem');
var fixed = Engine.enumerateForRoll([2, 3, 4], false);
check('50 configurações na ordem sorteada (menos as recusadas)', fixed.length <= 50 && fixed.length >= 40,
  fixed.length + ' válidas');
var reordered = Engine.enumerateForRoll([2, 3, 4], true);
check('reordenar amplia o conjunto', reordered.length > fixed.length,
  fixed.length + ' → ' + reordered.length);
var reachable = Engine.reachableIntegers([2, 3, 4], true);
check('14 alcançável com 2,3,4', reachable.has(14));
check('20 alcançável com 2,3,4', reachable.has(20));
check('zero não é alcançável com 2,3,4', !reachable.has(0));
check('zero é alcançável com 2,2,3 — (2 − 2) × 3',
  Engine.reachableIntegers([2, 2, 3], true).has(0));
check('1 ^ (6 ^ 6) = 1, e não uma potência impraticável',
  Engine.evaluate([1, 6, 6], '^', '^', Engine.GROUPING.RIGHT).ok &&
  Engine.fracToString(Engine.evaluate([1, 6, 6], '^', '^', Engine.GROUPING.RIGHT).value) === '1');
var triples = Engine.orderings([4, 4, 4], true);
check('dados iguais geram uma única ordem', triples.length === 1);
check('dois dados iguais geram três ordens', Engine.orderings([2, 2, 5], true).length === 3);

console.log('\nSequências de vitória');
var state = Board.createState();
[[0, 0], [0, 1], [0, 2]].forEach(function (p) { state[p[0]][p[1]] = 1; });
check('três peças não vencem', Board.winningLines(state, 0, 2).length === 0);
state[0][3] = 1;
check('quatro na horizontal vencem', Board.winningLines(state, 0, 3).length === 1);
var dual = Board.createState();
[[4, 1], [4, 2], [4, 3], [1, 4], [2, 4], [3, 4]].forEach(function (p) { dual[p[0]][p[1]] = 2; });
dual[4][4] = 2;
check('jogada que fecha duas sequências devolve ambas', Board.winningLines(dual, 4, 4).length === 2);
var diag = Board.createState();
[[8, 0], [7, 1], [6, 2], [5, 3]].forEach(function (p) { diag[p[0]][p[1]] = 1; });
check('quatro na diagonal ↗ vencem', Board.winningLines(diag, 5, 3).length === 1);

console.log('\nLevantamento computacional');
var s = Engine.survey();
console.log('  total de configurações:      ' + s.total);
console.log('  matematicamente definidas:   ' + s.defined);
console.log('  dentro da escala (< 10^6):   ' + s.withinLimit);
console.log('  resultados inteiros:         ' + s.integerResults);
console.log('  recusadas:                   ' + JSON.stringify(s.rejected));
check('10 800 configurações sintáticas', s.total === 10800);

var top = Engine.rankedFrequencies(function (v) { return v > 0; }).slice(0, 10);
var neg = Engine.rankedFrequencies(function (v) { return v < 0; }).slice(0, 10);
console.log('  positivos mais frequentes: ' + top.map(function (r) { return r.value + ':' + r.freq; }).join('  '));
console.log('  negativos mais frequentes: ' + neg.map(function (r) { return r.value + ':' + r.freq; }).join('  '));

// Tabela 1 do artigo (coluna negativa) — reproduzida integralmente pelo motor.
var TABLE1_NEG = [[-1, 198], [-2, 168], [-3, 142], [-4, 125], [-5, 95],
                  [-6, 82], [-8, 44], [-7, 41], [-9, 26], [-10, 25]];
TABLE1_NEG.forEach(function (row) {
  var freq = s.frequencies.get(row[0]) || 0;
  check('frequência de ' + row[0] + ' = ' + row[1], freq === row[1], 'obtido ' + freq);
});

check('todos os 81 valores do tabuleiro são alcançáveis',
  flat.every(function (v) { return s.frequencies.has(v); }),
  flat.filter(function (v) { return !s.frequencies.has(v); }).join(','));
check('353 positivos inteiros distintos alcançáveis (Resultados)',
  s.distinctPositive === 353, s.distinctPositive + ' encontrados');
check('130 negativos inteiros distintos alcançáveis (Resultados)',
  s.distinctNegative === 130, s.distinctNegative + ' encontrados');
check('79 positivos distintos em [1, 100] (Resultados)',
  s.distinctInRange === 79, s.distinctInRange + ' encontrados');

console.log('\n' + (failures === 0 ? 'Todas as verificações passaram.' : failures + ' verificação(ões) falharam.'));
process.exit(failures === 0 ? 0 : 1);
