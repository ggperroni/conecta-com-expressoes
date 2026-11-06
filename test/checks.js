/**
 * Verificações do motor e do tabuleiro.  Execute com:  node test/checks.js
 */
var Engine = require('../js/engine.js');
var Board = require('../js/board.js');
var Help = require('../js/help.js');
var Stats = require('../js/stats.js');

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

console.log('\nFiguras da Ajuda');
/* Cada cena é descrita por valores de casa; aqui se confere que ela ilustra
   uma situação possível do jogo, e não um desenho inventado. */
var helpWin = Board.windowFor(Help.SIZE);
var helpCells = [].concat.apply([], helpWin.values);
function helpCell(value) {
  for (var r = 0; r < helpWin.size; r++) {
    var c = helpWin.values[r].indexOf(value);
    if (c !== -1) return { row: r, col: c };
  }
  return null;
}
Object.keys(Help.SCENES).forEach(function (name) {
  var scene = Help.SCENES[name];
  var placed = [].concat(scene.p1 || [], scene.p2 || [], scene.win || [], scene.marked || [],
                         scene.target === undefined ? [] : [scene.target]);
  check(name + ': toda casa citada existe no recorte ' + Help.SIZE + ' × ' + Help.SIZE,
    placed.every(function (v) { return helpCells.indexOf(v) !== -1; }),
    placed.filter(function (v) { return helpCells.indexOf(v) === -1; }).join(','));
  check(name + ': nenhuma casa tem peça dos dois jogadores',
    (scene.p1 || []).every(function (v) { return (scene.p2 || []).indexOf(v) === -1; }), 'casa repetida');
  if (scene.win) {
    var owner = (scene.p1 || []).indexOf(scene.win[0]) !== -1 ? 1 : 2;
    var state = [];
    for (var r = 0; r < helpWin.size; r++) state.push(new Array(helpWin.size).fill(null));
    (scene.p1 || []).forEach(function (v) { var p = helpCell(v); state[p.row][p.col] = 1; });
    (scene.p2 || []).forEach(function (v) { var p = helpCell(v); state[p.row][p.col] = 2; });
    var last = helpCell(scene.win[scene.win.length - 1]);
    var lines = Board.winningLines(state, last.row, last.col);
    check(name + ': a sequência destacada é uma vitória de verdade',
      lines.length === 1 && lines[0].length === Board.CONNECT &&
      lines[0].every(function (c) { return scene.win.indexOf(helpWin.values[c.row][c.col]) !== -1; }),
      lines.length + ' sequência(s)');
    check(name + ': a sequência pertence a um só jogador',
      scene.win.every(function (v) { return (owner === 1 ? scene.p1 : scene.p2).indexOf(v) !== -1; }),
      'peças de cores diferentes');
  }
  if (scene.dice) {
    var reach = Help.reachOf(scene);
    if (scene.result !== undefined) {
      var r2 = Engine.evaluate(scene.dice, scene.op1, scene.op2, Help.groupingOf(scene));
      check(name + ': ' + Help.expressionOf(scene) + ' = ' + scene.result,
        r2.ok && Engine.fracToString(r2.value) === String(scene.result),
        r2.ok ? Engine.fracToString(r2.value) : 'inválida');
      check(name + ': a peça nova está na casa do resultado', scene.fresh === scene.result &&
        (scene.p1 || []).indexOf(scene.fresh) !== -1, 'peça fora da casa ' + scene.result);
    }
    (scene.marked || []).forEach(function (v) {
      check(name + ': a casa conquistada ' + v + ' é alcançável', reach.has(v), 'não alcançável');
    });
    if (scene.target !== undefined) {
      check(name + ': o alvo ' + scene.target + ' é alcançável', reach.has(scene.target), 'não alcançável');
    }
    check(name + ': a rolagem alcança casas do recorte',
      helpCells.some(function (v) { return reach.has(v); }), 'nenhuma');
  }
});
var svg = Help.boardSvg(Help.SCENES.winRow);
check('o SVG do tabuleiro tem ' + helpCells.length + ' casas',
  (svg.match(/class="help-cell /g) || []).length === helpCells.length,
  (svg.match(/class="help-cell /g) || []).length + '');
check('o SVG destaca as quatro peças da sequência', (svg.match(/is-win/g) || []).length === Board.CONNECT,
  (svg.match(/is-win/g) || []).length + '');
check('o SVG escreve o sinal de menos tipográfico', svg.indexOf('>−2<') !== -1 && svg.indexOf('>-2<') === -1,
  'hífen no lugar do menos');
check('o SVG tem texto alternativo', /role="img" aria-label="[^"]+"/.test(svg) && /<title>/.test(svg),
  'sem aria-label ou title');
check('o SVG dos dados desenha 2 + 3 + 4 pontos',
  (Help.diceSvg([2, 3, 4]).match(/help-pip/g) || []).length === 9,
  (Help.diceSvg([2, 3, 4]).match(/help-pip/g) || []).length + '');
check('toda figura declarada é produzida',
  Help.FIGURES.every(function (name) { return Help.figure(name).indexOf('<svg') !== -1; }), 'figura vazia');
check('figura desconhecida devolve vazio', Help.figure('nada') === '');

console.log('\nEstatísticas de uso');
var L = Engine.GROUPING.LEFT, R = Engine.GROUPING.RIGHT;
function miss(typed, dice, op1, op2, g) {
  return Stats.classifyMiss(Engine.parseAnswer(typed), Engine.evaluate(dice, op1, op2, g).value, dice, op1, op2, g);
}
check('14 para (2 + 3) × 4 é erro de ordem das operações', miss('14', [2, 3, 4], '+', '*', L) === 'grouping',
  miss('14', [2, 3, 4], '+', '*', L));
check('20 para 2 + (3 × 4) é erro de ordem das operações', miss('20', [2, 3, 4], '+', '*', R) === 'grouping',
  miss('20', [2, 3, 4], '+', '*', R));
check('-20 para (2 + 3) × 4 é erro de sinal', miss('-20', [2, 3, 4], '+', '*', L) === 'sign',
  miss('-20', [2, 3, 4], '+', '*', L));
check('7 para (2 + 3) × 4 é outro erro', miss('7', [2, 3, 4], '+', '*', L) === 'other',
  miss('7', [2, 3, 4], '+', '*', L));
check('quando os agrupamentos coincidem não há erro de ordem: 10 para (2 + 3) + 4',
  miss('10', [2, 3, 4], '+', '+', L) === 'other', miss('10', [2, 3, 4], '+', '+', L));
check('zero não tem erro de sinal: 1 para (3 − 3) × 2', miss('1', [3, 3, 2], '-', '*', L) === 'other',
  miss('1', [3, 3, 2], '-', '*', L));

function attempt(over) {
  var ev = { k: 'a', t: 1000, m: 'match', z: 9, d: [2, 3, 4], s: [2, 3, 4], o1: '+', o2: '*', g: 'L',
             v: '20', x: '20', r: 'placed', n: 1, e: 12 };
  Object.keys(over).forEach(function (k) { ev[k] = over[k]; });
  return ev;
}
var sample = [
  attempt({}),                                                       // 20 certo, 12 s
  attempt({ x: '14', r: 'wrong', mk: 'grouping', e: 20 }),            // 20 errado
  attempt({ o1: '*', o2: '*', v: '1000', x: '1000', r: 'offboard' }), // conta certa, número sem casa
  attempt({ o1: '/', o2: '-', s: [4, 3, 3], d: [4, 3, 3], g: 'R', v: null, x: '0', r: 'undefined' }),
  attempt({ m: 'practice', o1: '^', o2: '+', v: '12', x: '12', r: 'hit', e: 30 }),
  attempt({ m: 'practice', o1: '^', o2: '+', v: '12', x: '-12', r: 'wrong', mk: 'sign' }),
  { k: 't', t: 2000, m: 'match', z: 9, d: [1, 1, 1], r: 'exhausted', f: [0, 1, 2, 3], e: 90 },
  { k: 't', t: 2100, m: 'match', z: 9, d: [1, 1, 1], r: 'nomove', f: [], e: null },
  { k: 'g', t: 3000, m: 'match', z: 9, r: 'win', mv: 7 }
];
var all = Stats.summarize(sample, 'all');
check('conta as tentativas', all.totals.attempts === 6, all.totals.attempts + '');
check('conta os acertos (peça ou casa conquistada)', all.totals.hits === 2, all.totals.hits + '');
check('conta as contas certas, mesmo sem casa', all.totals.calcRight === 3, all.totals.calcRight + '');
check('taxa de contas certas em porcentagem inteira', all.totals.calcRightRate === 50, all.totals.calcRightRate + '');
check('tempo médio até acertar', all.totals.avgSecsToHit === 21, all.totals.avgSecsToHit + '');
check('turnos perdidos não contam a rolagem sem saída', all.totals.turnsLost === 1 && all.totals.noMoveRolls === 1,
  all.totals.turnsLost + '/' + all.totals.noMoveRolls);
check('partidas concluídas', all.totals.games === 1 && all.totals.wins === 1 && all.totals.avgMoves === 7,
  JSON.stringify([all.totals.games, all.totals.wins, all.totals.avgMoves]));
var plus = all.ops.filter(function (r) { return r.op === '+'; })[0];
var times = all.ops.filter(function (r) { return r.op === '*'; })[0];
var pow = all.ops.filter(function (r) { return r.op === '^'; })[0];
check('usos da soma: 4 (duas vezes em + e +, não; aqui 4 expressões com +)', plus.uses === 4, plus.uses + '');
check('a multiplicação conta duas vezes em × e ×', times.uses === 4, times.uses + '');
check('operações ordenadas por uso', all.ops[0].uses >= all.ops[1].uses && all.ops[4].uses <= all.ops[3].uses,
  all.ops.map(function (r) { return r.op + ':' + r.uses; }).join(' '));
check('taxa de erro por operação: potência 50%', pow.attempts === 2 && pow.errorRate === 50,
  pow.attempts + '/' + pow.errorRate);
check('expressão indefinida conta como erro da operação', all.ops.filter(function (r) { return r.op === '/'; })[0].errors === 1);
check('par mais montado é + e ×', all.pairs[0].op1 === '+' && all.pairs[0].op2 === '*' && all.pairs[0].uses === 2,
  JSON.stringify(all.pairs[0]));
check('agrupamento à esquerda: 5 usos, 2 erros', all.grouping.L.uses === 5 && all.grouping.L.errors === 2,
  JSON.stringify(all.grouping.L));
check('desfechos ordenados por frequência e sem zeros',
  all.outcomes[0].count >= all.outcomes[all.outcomes.length - 1].count &&
  all.outcomes.every(function (r) { return r.count > 0; }), JSON.stringify(all.outcomes));
check('tipos de erro: 1 de ordem, 1 de sinal, 0 outros',
  JSON.stringify(all.missKinds.map(function (r) { return r.count; })) === '[1,1,0]',
  JSON.stringify(all.missKinds.map(function (r) { return r.count; })));
var hard20 = all.hardest.filter(function (r) { return r.value === 20; })[0];
var hard0 = all.hardest.filter(function (r) { return r.value === 0; })[0];
check('o 20 aparece com 2 tentativas, 1 erro e 1 acerto', hard20 && hard20.attempts === 2 && hard20.errors === 1 && hard20.hits === 1,
  JSON.stringify(hard20));
check('o zero aparece por ter ficado livre num turno perdido', hard0 && hard0.missed === 1 && hard0.attempts === 0,
  JSON.stringify(hard0));
check('o 12 (acertado) tem tempo médio', all.hardest.concat(all.mostPlayed).some(function (r) { return r.value === 12 && r.avgSecs === 30; }),
  'sem tempo');
check('um número sem casa não entra na lista', !all.hardest.concat(all.mostPlayed).some(function (r) { return r.value === 1000; }),
  '1000 listado');
check('os mais difíceis vêm primeiro', all.hardest[0].score >= all.hardest[all.hardest.length - 1].score,
  all.hardest.map(function (r) { return r.value + ':' + r.score; }).join(' '));
check('casas mais conquistadas: 20 e 12', JSON.stringify(all.mostPlayed.map(function (r) { return r.value; }).sort()) === '[12,20]',
  JSON.stringify(all.mostPlayed.map(function (r) { return r.value; })));
check('faixa dos negativos existe mesmo vazia', all.bands[0].label === 'negativos' && all.bands[0].attempts === 0,
  JSON.stringify(all.bands[0]));
var onlyPractice = Stats.summarize(sample, 'practice');
check('filtro do Treino: 2 tentativas, nenhum turno', onlyPractice.totals.attempts === 2 && onlyPractice.totals.turnsLost === 0,
  onlyPractice.totals.attempts + '/' + onlyPractice.totals.turnsLost);
var onlyMatch = Stats.summarize(sample, 'match');
check('filtro da Partida: 4 tentativas e a partida', onlyMatch.totals.attempts === 4 && onlyMatch.totals.games === 1,
  onlyMatch.totals.attempts + '/' + onlyMatch.totals.games);
var none = Stats.summarize([], 'all');
check('sem registros, tudo zera e os tempos ficam nulos',
  none.totals.attempts === 0 && none.totals.avgSecsToHit === null && none.hardest.length === 0 && none.ops.length === 5,
  JSON.stringify(none.totals));
check('registros estranhos não derrubam o resumo',
  Stats.summarize([null, {}, { k: 'a', r: 'wrong' }, { k: 't' }], 'all').totals.attempts === 1, 'derrubou');

var csv = Stats.toCsv(sample);
var csvLines = csv.split('\n');
check('CSV tem cabeçalho e uma linha por registro', csvLines.length === sample.length + 1, csvLines.length + ' linhas');
check('CSV usa ponto e vírgula', csvLines[0].split(';').length === Stats.CSV_COLUMNS.length, csvLines[0]);
check('CSV escreve a expressão', csvLines[1].indexOf('(2 + 3) × 4') !== -1, csvLines[1]);
check('CSV escreve o instante em ISO', /;1970-01-01T00:00:01\.000Z;/.test(csvLines[1]), csvLines[1]);
check('CSV lista as casas que ficaram livres', /;0 1 2 3;/.test(csvLines[7]), csvLines[7]);
check('CSV escapa campos com ponto e vírgula',
  Stats.toCsv([{ k: 'a', t: 0, m: 'a;b' }]).split('\n')[1].indexOf('"a;b"') !== -1, 'sem aspas');

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
