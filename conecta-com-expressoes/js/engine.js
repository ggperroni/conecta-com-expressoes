/**
 * Conecta com Expressões — motor matemático.
 *
 * Implementa o espaço de expressões descrito no artigo:
 *   para cada tripla de dados (a, b, c) e cada par de operações (op1, op2)
 *   em {+, -, ×, ÷, ^}, avaliam-se os dois agrupamentos
 *       (a op1 b) op2 c      e      a op1 (b op2 c).
 *
 * Toda a avaliação usa aritmética exata de frações (BigInt), de modo que
 * 12 ÷ 4 é reconhecido como o inteiro 3 e 5 ÷ 2 como não inteiro.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------ frações

  function bigAbs(v) { return v < 0n ? -v : v; }

  function gcd(a, b) {
    a = bigAbs(a); b = bigAbs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a;
  }

  /** Cria a fração n/d já reduzida, ou null se o denominador for zero. */
  function frac(n, d) {
    if (d === 0n) return null;
    if (d < 0n) { n = -n; d = -d; }
    var g = gcd(n, d) || 1n;
    return { n: n / g, d: d / g };
  }

  function fromInt(v) { return { n: BigInt(v), d: 1n }; }
  function isInteger(f) { return !!f && f.d === 1n; }
  function equals(x, y) { return !!x && !!y && x.n === y.n && x.d === y.d; }
  function toNumber(f) { return Number(f.n) / Number(f.d); }

  /** Texto legível: "3", "-7" ou "5/2". */
  function fracToString(f) {
    return f.d === 1n ? String(f.n) : f.n + '/' + f.d;
  }

  /**
   * Interpreta o que o jogador digitou: "12", "-7", "5/2" ou "2,5" / "2.5".
   * Devolve uma fração exata ou null.
   */
  function parseAnswer(text) {
    if (typeof text !== 'string') return null;
    var s = text.trim().replace(/\s+/g, '').replace(/,/g, '.');
    if (!s) return null;
    var m = s.match(/^([+-]?\d+)\/(\d+)$/);
    if (m) return frac(BigInt(m[1]), BigInt(m[2]));
    m = s.match(/^([+-]?)(\d*)\.(\d+)$/);
    if (m) {
      var sign = m[1] === '-' ? -1n : 1n;
      var whole = m[2] === '' ? '0' : m[2];
      var dec = m[3];
      var num = BigInt(whole + dec) * sign;
      var den = 10n ** BigInt(dec.length);
      return frac(num, den);
    }
    m = s.match(/^([+-]?\d+)$/);
    if (m) return frac(BigInt(m[1]), 1n);
    return null;
  }

  // --------------------------------------------------------------- operações

  var OPERATIONS = ['+', '-', '*', '/', '^'];

  /** Símbolo exibido para cada operação. */
  var OP_LABEL = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^' };

  /**
   * Limite de expoente. Dados de 1 a 6 permitem expoentes de até 6^6 = 46 656
   * (em a ^ (b ^ c)). Com base de módulo maior que 1, qualquer expoente acima
   * de 64 produz valor superior a 2^65 — muito além da escala do tabuleiro –,
   * então a potência é sinalizada em vez de calculada. Bases de módulo 1 são
   * resolvidas diretamente, pois 1 elevado a qualquer expoente vale 1.
   */
  var EXPONENT_LIMIT = 64n;

  /**
   * Corte de magnitude do levantamento: o artigo considera 353 valores
   * positivos e 130 negativos distintos alcançáveis, contagens que
   * correspondem a resultados de módulo inferior a 10^6.
   */
  var MAGNITUDE_LIMIT = 1000000n;

  /** Códigos de recusa de uma expressão. */
  var INVALID = {
    DIV_ZERO: 'DIV_ZERO',           // divisão por zero
    NON_INTEGER_EXP: 'NON_INT_EXP', // expoente não inteiro (raiz, não potência)
    ZERO_POWER: 'ZERO_POWER',       // 0^0 ou 0 com expoente negativo
    TOO_LARGE: 'TOO_LARGE'          // potência de magnitude impraticável
  };

  var INVALID_MESSAGE = {
    DIV_ZERO: 'não é possível dividir por zero',
    NON_INT_EXP: 'a potenciação exige expoente inteiro',
    ZERO_POWER: 'zero elevado a expoente nulo ou negativo não é definido',
    TOO_LARGE: 'a potência tem magnitude fora da escala do tabuleiro'
  };

  /** Aplica uma operação a duas frações. Devolve fração ou código de recusa. */
  function apply(op, x, y) {
    switch (op) {
      case '+': return frac(x.n * y.d + y.n * x.d, x.d * y.d);
      case '-': return frac(x.n * y.d - y.n * x.d, x.d * y.d);
      case '*': return frac(x.n * y.n, x.d * y.d);
      case '/':
        if (y.n === 0n) return INVALID.DIV_ZERO;
        return frac(x.n * y.d, x.d * y.n);
      case '^': {
        if (y.d !== 1n) return INVALID.NON_INTEGER_EXP;
        var e = y.n;
        if (x.n === 0n && e <= 0n) return INVALID.ZERO_POWER;
        var negative = e < 0n;
        if (negative) e = -e;
        if (x.d === 1n && (x.n === 1n || x.n === -1n)) {
          // 1^k = 1 e (−1)^k alterna, qualquer que seja o expoente.
          return frac(x.n === -1n && e % 2n === 1n ? -1n : 1n, 1n);
        }
        if (e > EXPONENT_LIMIT) return INVALID.TOO_LARGE;
        var n = 1n, d = 1n;
        for (var i = 0n; i < e; i++) { n *= x.n; d *= x.d; }
        return negative ? frac(d, n) : frac(n, d);
      }
      default: throw new Error('operação desconhecida: ' + op);
    }
  }

  // -------------------------------------------------------------- expressões

  var GROUPING = { LEFT: 'L', RIGHT: 'R' };

  /**
   * Avalia uma expressão completa.
   * @param {number[]} values tripla ordenada [a, b, c]
   * @param {string} op1 primeira operação
   * @param {string} op2 segunda operação
   * @param {string} grouping GROUPING.LEFT — (a op1 b) op2 c — ou GROUPING.RIGHT
   * @returns {{ok: boolean, value?: object, reason?: string}}
   */
  function evaluate(values, op1, op2, grouping) {
    var a = fromInt(values[0]), b = fromInt(values[1]), c = fromInt(values[2]);
    var inner, result;
    if (grouping === GROUPING.LEFT) {
      inner = apply(op1, a, b);
      if (typeof inner === 'string') return { ok: false, reason: inner };
      result = apply(op2, inner, c);
    } else {
      inner = apply(op2, b, c);
      if (typeof inner === 'string') return { ok: false, reason: inner };
      result = apply(op1, a, inner);
    }
    if (typeof result === 'string') return { ok: false, reason: result };
    return { ok: true, value: result };
  }

  /** Expressão em texto: "(2 + 3) × 4". */
  function expressionText(values, op1, op2, grouping) {
    var o1 = OP_LABEL[op1], o2 = OP_LABEL[op2];
    if (grouping === GROUPING.LEFT) {
      return '(' + values[0] + ' ' + o1 + ' ' + values[1] + ') ' + o2 + ' ' + values[2];
    }
    return values[0] + ' ' + o1 + ' (' + values[1] + ' ' + o2 + ' ' + values[2] + ')';
  }

  var PERMUTATIONS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

  /** Triplas distintas obtidas ao reordenar os dados (sem repetir ordens iguais). */
  function orderings(dice, allowReorder) {
    if (!allowReorder) return [dice.slice()];
    var seen = Object.create(null), out = [];
    PERMUTATIONS.forEach(function (p) {
      var t = [dice[p[0]], dice[p[1]], dice[p[2]]];
      var key = t.join(',');
      if (!seen[key]) { seen[key] = true; out.push(t); }
    });
    return out;
  }

  /**
   * Enumera todas as expressões válidas construíveis com uma rolagem.
   * @param {number[]} dice três valores de dados
   * @param {boolean} allowReorder se os dados podem ser usados em qualquer ordem
   * @returns {Array<{values, op1, op2, grouping, value, text, isInteger, integer}>}
   */
  function enumerateForRoll(dice, allowReorder) {
    var out = [];
    orderings(dice, allowReorder).forEach(function (values) {
      OPERATIONS.forEach(function (op1) {
        OPERATIONS.forEach(function (op2) {
          [GROUPING.LEFT, GROUPING.RIGHT].forEach(function (grouping) {
            var r = evaluate(values, op1, op2, grouping);
            if (!r.ok) return;
            out.push({
              values: values,
              op1: op1,
              op2: op2,
              grouping: grouping,
              value: r.value,
              text: expressionText(values, op1, op2, grouping),
              isInteger: isInteger(r.value),
              integer: isInteger(r.value) ? Number(r.value.n) : null
            });
          });
        });
      });
    });
    return out;
  }

  /**
   * Conjunto de inteiros alcançáveis com uma rolagem, cada um acompanhado de
   * um exemplo de expressão que o produz.
   * @returns {Map<number, object>}
   */
  function reachableIntegers(dice, allowReorder) {
    var map = new Map();
    enumerateForRoll(dice, allowReorder).forEach(function (expr) {
      if (expr.isInteger && !map.has(expr.integer)) map.set(expr.integer, expr);
    });
    return map;
  }

  /** Todas as expressões inteiras que produzem exatamente `target`. */
  function expressionsFor(dice, target, allowReorder) {
    return enumerateForRoll(dice, allowReorder).filter(function (expr) {
      return expr.isInteger && expr.integer === target;
    });
  }

  // ------------------------------------------------- levantamento de frequências

  var surveyCache = null;

  /** Módulo do valor está dentro da escala considerada no levantamento? */
  function withinScale(f) {
    var abs = f.n < 0n ? -f.n : f.n;
    return abs / f.d < MAGNITUDE_LIMIT;
  }

  /**
   * Reproduz o levantamento computacional do artigo: percorre as 216 triplas
   * ordenadas × 25 pares de operações × 2 agrupamentos = 10 800 configurações
   * e conta a frequência de cada resultado inteiro.
   */
  function survey() {
    if (surveyCache) return surveyCache;
    var frequencies = new Map();
    var total = 0, defined = 0, withinLimit = 0, integers = 0;
    var rejected = { DIV_ZERO: 0, NON_INT_EXP: 0, ZERO_POWER: 0, TOO_LARGE: 0 };
    for (var a = 1; a <= 6; a++) {
      for (var b = 1; b <= 6; b++) {
        for (var c = 1; c <= 6; c++) {
          for (var i = 0; i < OPERATIONS.length; i++) {
            for (var j = 0; j < OPERATIONS.length; j++) {
              for (var g = 0; g < 2; g++) {
                total++;
                var r = evaluate([a, b, c], OPERATIONS[i], OPERATIONS[j],
                  g === 0 ? GROUPING.LEFT : GROUPING.RIGHT);
                if (!r.ok) { rejected[r.reason] = (rejected[r.reason] || 0) + 1; continue; }
                defined++;
                if (!withinScale(r.value)) continue;
                withinLimit++;
                if (isInteger(r.value)) {
                  integers++;
                  var k = Number(r.value.n);
                  frequencies.set(k, (frequencies.get(k) || 0) + 1);
                }
              }
            }
          }
        }
      }
    }
    var distinctPositive = 0, distinctNegative = 0, distinctInRange = 0;
    frequencies.forEach(function (_freq, value) {
      if (value > 0) distinctPositive++;
      if (value < 0) distinctNegative++;
      if (value >= 1 && value <= 100) distinctInRange++;
    });
    surveyCache = {
      total: total,
      defined: defined,
      withinLimit: withinLimit,
      integerResults: integers,
      rejected: rejected,
      frequencies: frequencies,
      distinctPositive: distinctPositive,
      distinctNegative: distinctNegative,
      distinctInRange: distinctInRange
    };
    return surveyCache;
  }

  /** Pares (valor, frequência) ordenados por frequência decrescente. */
  function rankedFrequencies(predicate) {
    var rows = [];
    survey().frequencies.forEach(function (freq, value) {
      if (!predicate || predicate(value)) rows.push({ value: value, freq: freq });
    });
    rows.sort(function (x, y) { return y.freq - x.freq || x.value - y.value; });
    return rows;
  }

  return {
    OPERATIONS: OPERATIONS,
    OP_LABEL: OP_LABEL,
    GROUPING: GROUPING,
    MAGNITUDE_LIMIT: MAGNITUDE_LIMIT,
    withinScale: withinScale,
    INVALID: INVALID,
    INVALID_MESSAGE: INVALID_MESSAGE,
    frac: frac,
    fromInt: fromInt,
    isInteger: isInteger,
    equals: equals,
    toNumber: toNumber,
    fracToString: fracToString,
    parseAnswer: parseAnswer,
    evaluate: evaluate,
    expressionText: expressionText,
    orderings: orderings,
    enumerateForRoll: enumerateForRoll,
    reachableIntegers: reachableIntegers,
    expressionsFor: expressionsFor,
    survey: survey,
    rankedFrequencies: rankedFrequencies
  };
});
