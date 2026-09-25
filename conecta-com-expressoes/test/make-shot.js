/**
 * Gera .shot.html: index.html com um roteiro que deixa a interface num estado
 * específico, para inspeção visual com --screenshot.
 *
 *   node test/make-shot.js match|small|practice [dark]
 */
var fs = require('fs');
var path = require('path');

var scenes = {
  // Partida em andamento: peças dos dois jogadores e um turno com tentativa gasta.
  match: `
    await play([2, 3, 2], 'L', '×', '×', '12');
    await play([1, 2, 3], 'R', '×', '×', '6');
    await play([1, 1, 1], 'L', '+', '−', '1');
    await play([2, 3, 1], 'L', '+', '×', '5');
    await roll(4, 3, 2);
    pickGrouping('L');
    pickOp(1, '−');
    pickOp(2, '^');
    answer('2');
  `,
  // Tabuleiro 6 × 6: recorte central da figura, com o cronômetro em contagem.
  small: `
    setNumber('#set-board-size', 6);
    await sleep(60);
    await play([1, 2, 3], 'R', '×', '×', '6');
    await play([2, 2, 3], 'L', '×', '×', '12');
    await roll(3, 3, 1);
    pickGrouping('L');
    pickOp(1, '×');
    pickOp(2, '+');
  `,
  // Treino: casas alcançáveis destacadas, um acerto marcado e um erro contado.
  practice: `
    click('.mode-btn[data-mode="practice"]');
    await roll(2, 3, 4);
    pickGrouping('L');
    pickOp(1, '+');
    pickOp(2, '×');
    answer('14');
    answer('20');
  `
};

var scene = process.argv[2] || 'match';
if (!scenes[scene]) {
  console.error('cena desconhecida: ' + scene + ' (use ' + Object.keys(scenes).join(' ou ') + ')');
  process.exit(1);
}

// O tema é ortogonal à cena: qualquer uma pode ser fotografada nos dois. Vale
// fixá-lo sempre, e não alternar: o Chrome headless se declara escuro, então uma
// alternância deixaria a foto clara justo quando se pediu a escura.
var theme = process.argv[3] === 'dark' ? 'dark' : 'light';
var steps = "    setNumber('#set-theme', '" + theme + "');\n    await sleep(30);\n" + scenes[scene];

var driver = `<script>
(function () {
  'use strict';
  // Corre antes de init(): a cena parte sempre dos ajustes padrão.
  try { localStorage.removeItem('conecta-com-expressoes:ajustes'); } catch (error) { /* sem storage */ }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function click(s) { $(s).click(); }
  function forceDice(a, b, c) {
    var queue = [a, b, c].map(function (f) { return (f - 1) / 6 + 0.01; });
    var i = 0;
    Math.random = function () { var v = i < queue.length ? queue[i] : 0.5; i++; return v; };
  }
  function pickGrouping(which) {
    var radio = $$('input[name="grouping"]').filter(function (r) { return r.value === which; })[0];
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function pickOp(slot, symbol) {
    $$('#ops-' + slot + ' .op-btn').filter(function (b) { return b.textContent === symbol; })[0].click();
  }
  function answer(text) { $('#answer').value = text; $('#btn-check').click(); }
  function setNumber(s, value) {
    $(s).value = String(value);
    $(s).dispatchEvent(new Event('change', { bubbles: true }));
  }
  async function roll(a, b, c) { forceDice(a, b, c); $('#btn-roll').click(); await sleep(700); }
  async function play(dice, grouping, op1, op2, typed) {
    await roll(dice[0], dice[1], dice[2]);
    pickGrouping(grouping); pickOp(1, op1); pickOp(2, op2); answer(typed);
    await sleep(60);
  }
  window.addEventListener('DOMContentLoaded', function () {
    (async function () {
${steps}
    })();
  });
})();
</script>`;

var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// A substituição usa função: numa string, "$$" seria lido como escape de "$".
fs.writeFileSync(path.join(root, '.shot.html'), html.replace('</body>', function () {
  return driver + '\n</body>';
}));
console.log('.shot.html gerado (cena: ' + scene + ', tema ' + theme + ')');
