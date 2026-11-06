/**
 * Conecta com Expressões — as figuras da Ajuda.
 *
 * As ilustrações são desenhadas em SVG a partir do próprio tabuleiro — o
 * recorte 6 × 6 da Figura 1, que é o menor e por isso o mais legível numa
 * janela — de modo que mostrem o jogo exatamente como ele é: as mesmas casas,
 * os mesmos valores, as mesmas peças. As classes usadas aqui apontam para as
 * variáveis de cor da folha de estilo, então as figuras acompanham o tema
 * claro e escuro sem nenhuma imagem a mais.
 *
 * O módulo só produz texto (SVG e HTML em string) e não toca no DOM: carrega
 * também em Node, onde test/checks.js confere que cada cena ilustra uma
 * situação possível — as sequências vencedoras são sequências de verdade, e as
 * casas destacadas são as que a rolagem desenhada realmente alcança.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(
    isNode ? require('./board.js') : root.Board,
    isNode ? require('./engine.js') : root.Engine
  );
  if (isNode) module.exports = api;
  else root.Help = api;
})(typeof self !== 'undefined' ? self : this, function (Board, Engine) {
  'use strict';

  var SIZE = Board.MIN_SIZE;   // 6 × 6: casas grandes, números legíveis
  var CELL = 40;
  var GAP = 4;
  var PAD = 6;
  var DIE = 56;

  /**
   * As cenas. Cada uma é um estado do tabuleiro descrito por valores de casa,
   * e não por coordenadas: é assim que o jogador pensa, e é o que torna a
   * descrição conferível (cada valor existe uma única vez no recorte).
   *
   *   p1, p2   casas com peça de cada jogador
   *   win      as quatro casas da sequência vencedora
   *   fresh    a peça recém-colocada, destacada
   *   dice     a rolagem desenhada
   *   reach    destacar as casas que a rolagem alcança (o motor diz quais),
   *            como o Treino faz
   *   marked   casas conquistadas no Treino
   *   target   a casa-alvo do Treino
   */
  var SCENES = {
    winRow: {
      alt: 'Tabuleiro com quatro peças azuis em linha na horizontal: 12, 1, −2 e 13.',
      caption: 'Na horizontal',
      p1: [12, 1, -2, 13], p2: [6, 28, 9], win: [12, 1, -2, 13]
    },
    winCol: {
      alt: 'Tabuleiro com quatro peças verdes em linha na vertical: 64, 13, 0 e 9.',
      caption: 'Na vertical',
      p1: [20, 55, 41], p2: [64, 13, 0, 9], win: [64, 13, 0, 9]
    },
    winDiag: {
      alt: 'Tabuleiro com quatro peças azuis em linha na diagonal: 44, 68, −2 e 0.',
      caption: 'Na diagonal',
      p1: [44, 68, -2, 0], p2: [12, 96, 18], win: [44, 68, -2, 0]
    },
    move: {
      alt: 'Tabuleiro depois da jogada (2 + 3) × 4 = 20: a peça azul entra na casa 20.',
      dice: [2, 3, 4], op1: '+', op2: '*', grouping: 'L', result: 20,
      p1: [20, 1], p2: [6, 55], fresh: 20
    },
    practice: {
      alt: 'Tabuleiro do Treino com os dados 2, 3 e 4: as casas alcançáveis têm um contorno azul, ' +
           'a casa 9 está marcada como conquistada e a casa 13 é o alvo.',
      caption: 'No Treino, com os dados 2 · 3 · 4, as casas com contorno são as que alguma expressão alcança.',
      dice: [2, 3, 4], reach: true, marked: [9], target: 13
    }
  };

  // ------------------------------------------------------------- utilidades

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /** O número como aparece no jogo: sinal de menos tipográfico. */
  function label(value) { return String(value).replace('-', '−'); }

  function has(list, value) { return Array.isArray(list) && list.indexOf(value) !== -1; }

  /** Valores alcançáveis pela rolagem da cena, com os dados em qualquer ordem. */
  function reachOf(scene) {
    if (!scene.dice) return new Map();
    return Engine.reachableIntegers(scene.dice, true);
  }

  /** Os valores a contornar na figura: só quando a cena pede o destaque. */
  function highlightOf(scene) {
    return scene.reach ? reachOf(scene) : new Map();
  }

  function groupingOf(scene) {
    return scene.grouping === 'R' ? Engine.GROUPING.RIGHT : Engine.GROUPING.LEFT;
  }

  /** O texto da expressão da cena, como o jogo o escreveria. */
  function expressionOf(scene) {
    return Engine.expressionText(scene.dice, scene.op1, scene.op2, groupingOf(scene));
  }

  // ------------------------------------------------------------- tabuleiro

  function boardSvg(scene) {
    var win = Board.windowFor(SIZE);
    var n = win.size;
    var side = PAD * 2 + n * CELL + (n - 1) * GAP;
    var reach = highlightOf(scene);
    var out = [];

    out.push('<svg class="help-board" viewBox="0 0 ' + side + ' ' + side + '" role="img" aria-label="' +
             esc(scene.alt) + '"><title>' + esc(scene.alt) + '</title>');
    out.push('<rect class="help-frame" width="' + side + '" height="' + side + '" rx="10"/>');

    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var value = win.values[r][c];
        var x = PAD + c * (CELL + GAP);
        var y = PAD + r * (CELL + GAP);
        var cx = x + CELL / 2;
        var cy = y + CELL / 2;

        var cls = 'help-cell help-cell--' + Board.kindOf(value);
        if (reach.has(value) && !has(scene.marked, value)) cls += ' is-reachable';
        if (has(scene.marked, value)) cls += ' is-marked';
        if (scene.target === value) cls += ' is-target';
        out.push('<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + CELL + '" height="' + CELL + '" rx="7"/>');

        var owner = has(scene.p1, value) ? 1 : has(scene.p2, value) ? 2 : 0;
        if (owner) {
          var piece = 'help-piece help-piece--p' + owner +
            (has(scene.win, value) ? ' is-win' : '') + (scene.fresh === value ? ' is-fresh' : '');
          var inset = CELL * 0.08;
          out.push(owner === 1
            ? '<circle class="' + piece + '" cx="' + cx + '" cy="' + cy + '" r="' + (CELL / 2 - inset) + '"/>'
            : '<rect class="' + piece + '" x="' + (x + inset) + '" y="' + (y + inset) + '" width="' +
              (CELL - 2 * inset) + '" height="' + (CELL - 2 * inset) + '" rx="' + (CELL * 0.22) + '"/>');
        }

        out.push('<text class="help-value' + (owner ? ' is-on-piece' : '') + '" x="' + cx + '" y="' + cy +
                 '" text-anchor="middle" dominant-baseline="central">' + label(value) + '</text>');
      }
    }
    out.push('</svg>');
    return out.join('');
  }

  // ----------------------------------------------------------------- dados

  var PIPS = {
    1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]]
  };

  function diceSvg(faces) {
    var gap = 10;
    var width = faces.length * DIE + (faces.length - 1) * gap;
    var alt = 'Dados: ' + faces.join(', ') + '.';
    var out = ['<svg class="help-dice" viewBox="0 0 ' + width + ' ' + DIE + '" role="img" aria-label="' +
               esc(alt) + '"><title>' + esc(alt) + '</title>'];
    faces.forEach(function (face, i) {
      var x = i * (DIE + gap);
      out.push('<rect class="help-die" x="' + x + '" width="' + DIE + '" height="' + DIE + '" rx="12"/>');
      PIPS[face].forEach(function (pip) {
        var cx = x + DIE * (0.25 + pip[1] * 0.25);
        var cy = DIE * (0.25 + pip[0] * 0.25);
        out.push('<circle class="help-pip" cx="' + cx + '" cy="' + cy + '" r="' + (DIE * 0.085) + '"/>');
      });
    });
    out.push('</svg>');
    return out.join('');
  }

  // --------------------------------------------------------------- figuras

  function figureHtml(scene, extraClass) {
    return '<figure class="help-figure' + (extraClass ? ' ' + extraClass : '') + '">' + boardSvg(scene) +
      (scene.caption ? '<figcaption>' + esc(scene.caption) + '</figcaption>' : '') + '</figure>';
  }

  /**
   * As figuras prontas, uma por marcador data-help do HTML da Ajuda.
   *   wins      as três direções de uma sequência vencedora, lado a lado
   *   move      uma jogada inteira: dados → expressão → peça no tabuleiro
   *   practice  o tabuleiro do Treino, com alcance, marca e alvo
   */
  var FIGURES = {
    wins: function () {
      return '<div class="help-trio">' +
        figureHtml(SCENES.winRow) + figureHtml(SCENES.winCol) + figureHtml(SCENES.winDiag) +
        '</div>';
    },
    move: function () {
      var scene = SCENES.move;
      return '<div class="help-move">' +
        '<div class="help-step"><span class="help-step-n">1</span>' + diceSvg(scene.dice) +
          '<figcaption>Role os dados</figcaption></div>' +
        '<div class="help-step"><span class="help-step-n">2</span>' +
          '<div class="help-expr">' + esc(expressionOf(scene)) + ' = <strong>' + label(scene.result) +
          '</strong></div><figcaption>Monte a expressão e calcule</figcaption></div>' +
        '<div class="help-step"><span class="help-step-n">3</span>' + boardSvg(scene) +
          '<figcaption>A peça entra na casa ' + label(scene.result) + '</figcaption></div>' +
        '</div>';
    },
    practice: function () {
      return figureHtml(SCENES.practice, 'help-figure--wide');
    }
  };

  function figure(name) {
    return FIGURES[name] ? FIGURES[name]() : '';
  }

  return {
    SIZE: SIZE,
    SCENES: SCENES,
    FIGURES: Object.keys(FIGURES),
    figure: figure,
    boardSvg: boardSvg,
    diceSvg: diceSvg,
    expressionOf: expressionOf,
    reachOf: reachOf,
    groupingOf: groupingOf
  };
});
