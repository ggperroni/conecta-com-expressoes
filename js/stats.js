/**
 * Conecta com Expressões — estatísticas de uso.
 *
 * O jogo anota cada tentativa (dados, operações, agrupamento, valor certo,
 * valor digitado, desfecho e tempo), cada turno perdido — com as casas que
 * estavam alcançáveis e livres — e cada partida concluída. Tudo fica no
 * localStorage do navegador, sem servidor: é a turma daquele computador que
 * aparece na janela Estatísticas, e dali os registros saem em CSV para quem
 * quiser cruzar os de várias máquinas.
 *
 * Este módulo só agrega e classifica; não toca no DOM nem no armazenamento,
 * e por isso carrega também em Node, onde test/checks.js o confere.
 *
 * Um registro é um objeto curto, com chaves de uma ou duas letras para caber
 * muitos no armazenamento:
 *   k   'a' tentativa | 't' turno sem peça | 'g' partida concluída
 *   t   instante (ms)              m   'match' | 'practice'      z   lado do tabuleiro
 *   d   dados sorteados            s   dados na ordem usada
 *   o1, o2  operações              g   agrupamento 'L' | 'R'
 *   v   valor exato da expressão (texto), ou null se indefinida
 *   x   valor digitado (texto)     r   desfecho (ver OUTCOMES)
 *   n   número da tentativa nesta rolagem     e   segundos desde que os dados pararam
 *   mk  tipo do erro de cálculo (ver MISS_KINDS), só em r = 'wrong'
 *   tg  casa-alvo do Treino, se havia
 *   f   (turno) casas alcançáveis e livres que ficaram sem jogada
 *   mv  (partida) número de peças colocadas
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(
    isNode ? require('./engine.js') : root.Engine,
    isNode ? require('./board.js') : root.Board
  );
  if (isNode) module.exports = api;
  else root.Stats = api;
})(typeof self !== 'undefined' ? self : this, function (Engine, Board) {
  'use strict';

  var STORAGE_KEY = 'conecta-com-expressoes:registros';
  var LIMIT = 4000;   // registros guardados; os mais antigos saem primeiro

  /** Desfechos de uma tentativa, com o rótulo que a janela mostra. */
  var OUTCOMES = {
    placed:      'peça colocada',
    hit:         'casa conquistada',          // Treino
    wrong:       'cálculo errado',
    undefined:   'expressão indefinida',
    nonint:      'resultado não inteiro',
    offboard:    'número sem casa',
    occupied:    'casa já ocupada',
    'target-miss': 'certo, mas não era o alvo',   // Treino
    marked:      'casa já conquistada'            // Treino
  };

  /** Desfechos em que a conta estava certa. */
  var CALC_RIGHT = ['placed', 'hit', 'nonint', 'offboard', 'occupied', 'target-miss', 'marked'];
  /** Desfechos em que a peça entrou (ou a casa foi conquistada). */
  var SUCCESS = ['placed', 'hit'];

  var TURN_OUTCOMES = {
    exhausted: 'tentativas esgotadas',
    timeout:   'tempo esgotado',
    nomove:    'rolagem sem saída'
  };

  /**
   * Por que a conta saiu errada. Duas confusões têm diagnóstico:
   *   grouping  o valor digitado é o da expressão com o outro agrupamento —
   *             o jogador ignorou os parênteses (ou os inverteu);
   *   sign      o valor digitado é o simétrico do certo;
   *   other     qualquer outra coisa.
   */
  var MISS_KINDS = {
    grouping: 'ordem das operações',
    sign:     'sinal trocado',
    other:    'outro erro'
  };

  /**
   * Classifica um erro de cálculo.
   * @param typed    fração digitada (Engine.parseAnswer)
   * @param correct  fração certa
   * @param slots    dados na ordem usada; op1, op2, grouping: a expressão montada
   */
  function classifyMiss(typed, correct, slots, op1, op2, grouping) {
    var otherGrouping = grouping === Engine.GROUPING.LEFT ? Engine.GROUPING.RIGHT : Engine.GROUPING.LEFT;
    var alt = Engine.evaluate(slots, op1, op2, otherGrouping);
    if (alt.ok && Engine.equals(typed, alt.value) && !Engine.equals(alt.value, correct)) return 'grouping';
    var negated = Engine.frac(-correct.n, correct.d);
    if (Engine.equals(typed, negated) && !Engine.equals(correct, negated)) return 'sign';
    return 'other';
  }

  // -------------------------------------------------------------- agregação

  function pct(part, whole) { return whole ? Math.round(100 * part / whole) : 0; }

  function isInt(text) { return typeof text === 'string' && /^-?\d+$/.test(text); }

  var onBoardCache = null;
  /** Valores que existem no tabuleiro do artigo — o único universo que interessa. */
  function onBoard(value) {
    if (!onBoardCache) {
      onBoardCache = new Set();
      Board.MASTER.forEach(function (row) { row.forEach(function (v) { onBoardCache.add(v); }); });
    }
    return onBoardCache.has(value);
  }

  /**
   * Resume os registros. `scope` é 'all', 'match' ou 'practice'.
   * Tudo que a janela mostra sai daqui, de uma vez, para que os números
   * concordem entre si.
   */
  function summarize(events, scope) {
    var mode = scope === 'match' || scope === 'practice' ? scope : null;
    var all = (events || []).filter(function (ev) { return ev && (!mode || ev.m === mode); });
    var attempts = all.filter(function (ev) { return ev.k === 'a'; });
    var turns = all.filter(function (ev) { return ev.k === 't'; });
    var games = all.filter(function (ev) { return ev.k === 'g'; });

    // ---- totais
    var hits = attempts.filter(function (ev) { return SUCCESS.indexOf(ev.r) !== -1; });
    var calcRight = attempts.filter(function (ev) { return CALC_RIGHT.indexOf(ev.r) !== -1; });
    var wrong = attempts.filter(function (ev) { return ev.r === 'wrong'; });
    var timed = hits.filter(function (ev) { return typeof ev.e === 'number' && ev.e >= 0; });
    var totals = {
      events: all.length,
      attempts: attempts.length,
      hits: hits.length,
      hitRate: pct(hits.length, attempts.length),
      calcRight: calcRight.length,
      calcRightRate: pct(calcRight.length, attempts.length),
      avgSecsToHit: timed.length
        ? Math.round(timed.reduce(function (sum, ev) { return sum + ev.e; }, 0) / timed.length)
        : null,
      turnsLost: turns.filter(function (ev) { return ev.r !== 'nomove'; }).length,
      noMoveRolls: turns.filter(function (ev) { return ev.r === 'nomove'; }).length,
      games: games.length,
      wins: games.filter(function (ev) { return ev.r === 'win'; }).length,
      draws: games.filter(function (ev) { return ev.r === 'draw'; }).length,
      avgMoves: games.length
        ? Math.round(games.reduce(function (sum, ev) { return sum + (ev.mv || 0); }, 0) / games.length)
        : null,
      first: all.length ? Math.min.apply(null, all.map(function (ev) { return ev.t; })) : null,
      last: all.length ? Math.max.apply(null, all.map(function (ev) { return ev.t; })) : null
    };

    // ---- operações: cada tentativa usa duas; uma expressão com + e + conta + duas vezes
    var ops = Engine.OPERATIONS.map(function (op) {
      var rows = attempts.filter(function (ev) { return ev.o1 === op || ev.o2 === op; });
      var uses = attempts.reduce(function (n, ev) { return n + (ev.o1 === op ? 1 : 0) + (ev.o2 === op ? 1 : 0); }, 0);
      var errors = rows.filter(function (ev) { return ev.r === 'wrong' || ev.r === 'undefined'; }).length;
      return {
        op: op, label: Engine.OP_LABEL[op],
        uses: uses, share: pct(uses, attempts.length * 2),
        attempts: rows.length, errors: errors, errorRate: pct(errors, rows.length)
      };
    }).sort(function (a, b) { return b.uses - a.uses || a.op.localeCompare(b.op); });

    // ---- pares de operações mais montados
    var pairMap = new Map();
    attempts.forEach(function (ev) {
      if (!ev.o1 || !ev.o2) return;
      var key = ev.o1 + ev.o2;
      var row = pairMap.get(key) || { op1: ev.o1, op2: ev.o2, label: Engine.OP_LABEL[ev.o1] + ' e ' + Engine.OP_LABEL[ev.o2], uses: 0, errors: 0 };
      row.uses++;
      if (ev.r === 'wrong' || ev.r === 'undefined') row.errors++;
      pairMap.set(key, row);
    });
    var pairs = Array.from(pairMap.values()).map(function (row) {
      row.errorRate = pct(row.errors, row.uses);
      return row;
    }).sort(function (a, b) { return b.uses - a.uses; });

    // ---- agrupamento
    function groupingRow(g) {
      var rows = attempts.filter(function (ev) { return ev.g === g; });
      var errors = rows.filter(function (ev) { return ev.r === 'wrong'; }).length;
      return { grouping: g, uses: rows.length, share: pct(rows.length, attempts.length), errors: errors, errorRate: pct(errors, rows.length) };
    }
    var grouping = { L: groupingRow('L'), R: groupingRow('R') };

    // ---- desfechos
    var outcomes = Object.keys(OUTCOMES).map(function (r) {
      var count = attempts.filter(function (ev) { return ev.r === r; }).length;
      return { outcome: r, label: OUTCOMES[r], count: count, share: pct(count, attempts.length) };
    }).filter(function (row) { return row.count > 0; }).sort(function (a, b) { return b.count - a.count; });

    var turnOutcomes = Object.keys(TURN_OUTCOMES).map(function (r) {
      var count = turns.filter(function (ev) { return ev.r === r; }).length;
      return { outcome: r, label: TURN_OUTCOMES[r], count: count };
    }).filter(function (row) { return row.count > 0; });

    // ---- tipos de erro de cálculo
    var missKinds = Object.keys(MISS_KINDS).map(function (kind) {
      var count = wrong.filter(function (ev) { return (ev.mk || 'other') === kind; }).length;
      return { kind: kind, label: MISS_KINDS[kind], count: count, share: pct(count, wrong.length) };
    });

    // ---- os números: tentados, errados, deixados de lado
    var valueMap = new Map();
    function valueRow(value) {
      var row = valueMap.get(value);
      if (!row) {
        row = { value: value, attempts: 0, hits: 0, errors: 0, missed: 0, secs: [] };
        valueMap.set(value, row);
      }
      return row;
    }
    attempts.forEach(function (ev) {
      if (!isInt(ev.v)) return;
      var value = Number(ev.v);
      if (!onBoard(value)) return;
      var row = valueRow(value);
      row.attempts++;
      if (ev.r === 'wrong') row.errors++;
      if (SUCCESS.indexOf(ev.r) !== -1) {
        row.hits++;
        if (typeof ev.e === 'number') row.secs.push(ev.e);
      }
    });
    turns.forEach(function (ev) {
      (ev.f || []).forEach(function (value) { if (onBoard(value)) valueRow(value).missed++; });
    });
    var values = Array.from(valueMap.values()).map(function (row) {
      row.errorRate = pct(row.errors, row.attempts);
      row.avgSecs = row.secs.length
        ? Math.round(row.secs.reduce(function (s, e) { return s + e; }, 0) / row.secs.length) : null;
      delete row.secs;
      // Dificuldade: contas erradas e oportunidades perdidas pesam; acertos aliviam.
      row.score = row.errors * 2 + row.missed - row.hits;
      return row;
    });
    var hardest = values.filter(function (row) { return row.errors + row.missed > 0; })
      .sort(function (a, b) { return b.score - a.score || b.errors - a.errors || a.value - b.value; });
    var mostPlayed = values.filter(function (row) { return row.hits > 0; })
      .sort(function (a, b) { return b.hits - a.hits || a.value - b.value; });

    // ---- faixas: negativos, zero, pequenos, grandes
    function band(test, label) {
      var rows = values.filter(function (row) { return test(row.value); });
      var a = rows.reduce(function (n, r) { return n + r.attempts; }, 0);
      var e = rows.reduce(function (n, r) { return n + r.errors; }, 0);
      var m = rows.reduce(function (n, r) { return n + r.missed; }, 0);
      return { label: label, attempts: a, errors: e, missed: m, errorRate: pct(e, a) };
    }
    var bands = [
      band(function (v) { return v < 0; }, 'negativos'),
      band(function (v) { return v === 0; }, 'zero'),
      band(function (v) { return v >= 1 && v <= 20; }, 'de 1 a 20'),
      band(function (v) { return v > 20 && v <= 50; }, 'de 21 a 50'),
      band(function (v) { return v > 50; }, 'acima de 50')
    ];

    return {
      scope: mode || 'all',
      totals: totals,
      ops: ops,
      pairs: pairs,
      grouping: grouping,
      outcomes: outcomes,
      turnOutcomes: turnOutcomes,
      missKinds: missKinds,
      hardest: hardest,
      mostPlayed: mostPlayed,
      bands: bands
    };
  }

  // -------------------------------------------------------------------- CSV

  var CSV_COLUMNS = ['tipo', 'instante', 'modo', 'tabuleiro', 'dados', 'ordem', 'op1', 'op2', 'agrupamento',
                     'expressao', 'valor', 'digitado', 'desfecho', 'tentativa', 'segundos', 'erro', 'alvo',
                     'casas_perdidas', 'pecas'];

  function csvCell(value) {
    if (value === null || value === undefined) return '';
    var text = String(value);
    return /[";\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function isoOf(ms) {
    var d = new Date(ms);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }

  /** Os registros em CSV, com ponto e vírgula — o separador do Excel em português. */
  function toCsv(events) {
    var lines = [CSV_COLUMNS.join(';')];
    (events || []).forEach(function (ev) {
      var kind = ev.k === 'a' ? 'tentativa' : ev.k === 't' ? 'turno' : 'partida';
      var expr = ev.k === 'a' && ev.s && ev.o1 && ev.o2
        ? Engine.expressionText(ev.s, ev.o1, ev.o2, ev.g === 'R' ? Engine.GROUPING.RIGHT : Engine.GROUPING.LEFT)
        : '';
      var row = [kind, isoOf(ev.t), ev.m, ev.z, (ev.d || []).join('·'), (ev.s || []).join('·'),
                 ev.o1 ? Engine.OP_LABEL[ev.o1] : '', ev.o2 ? Engine.OP_LABEL[ev.o2] : '', ev.g,
                 expr, ev.v, ev.x, ev.r, ev.n, ev.e, ev.mk, ev.tg, (ev.f || []).join(' '), ev.mv];
      lines.push(row.map(csvCell).join(';'));
    });
    return lines.join('\n');
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    LIMIT: LIMIT,
    OUTCOMES: OUTCOMES,
    TURN_OUTCOMES: TURN_OUTCOMES,
    MISS_KINDS: MISS_KINDS,
    CALC_RIGHT: CALC_RIGHT,
    SUCCESS: SUCCESS,
    CSV_COLUMNS: CSV_COLUMNS,
    classifyMiss: classifyMiss,
    summarize: summarize,
    toCsv: toCsv
  };
});
