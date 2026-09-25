/**
 * Roteiro de teste da interface: dirige a página como um jogador faria
 * (rolar, escolher operações, digitar o resultado) e registra o desfecho em
 * #smoke-results, lido pelo Chrome em modo headless.
 *
 * Os dados são forçados substituindo Math.random, de modo que cada rolagem
 * produza uma tripla conhecida.
 */
(function () {
  'use strict';

  var results = [];
  function ok(label, condition, detail) {
    results.push((condition ? 'PASS' : 'FAIL') + ' | ' + label + (condition ? '' : ' | ' + detail));
  }

  // Este roteiro corre antes de init(): limpar os ajustes garante que o teste
  // parta sempre dos padrões, e não de preferências de uma execução anterior.
  try { localStorage.removeItem('conecta-com-expressoes:ajustes'); } catch (error) { /* sem storage */ }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); }
  function click(selector) { $(selector).click(); }
  function cellOf(value) {
    return $$('.cell').filter(function (c) { return Number(c.dataset.value) === value; })[0];
  }
  function feedbackText() { return $('#feedback').textContent; }
  function spentAttempts() { return $$('.attempt-dot.is-spent').length; }

  /** Faz a próxima rolagem cair em (a, b, c). */
  function forceDice(a, b, c) {
    var queue = [a, b, c].map(function (face) { return (face - 1) / 6 + 0.01; });
    var index = 0;
    Math.random = function () {
      var value = index < queue.length ? queue[index] : 0.5;
      index++;
      return value;
    };
  }

  function pickGrouping(which) {
    var radio = $$('input[name="grouping"]').filter(function (i) { return i.value === which; })[0];
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function pickOp(slot, symbol) {
    var button = $$('#ops-' + slot + ' .op-btn').filter(function (b) {
      return b.textContent === symbol;
    })[0];
    button.click();
  }

  function answer(text) {
    var input = $('#answer');
    input.value = text;
    $('#btn-check').click();
  }

  /** Ajuste que só vale no evento change (tempo, tamanho, tema). */
  function setOnChange(selector, value) {
    var input = $(selector);
    input.value = String(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function roll(a, b, c) {
    forceDice(a, b, c);
    $('#btn-roll').click();
    await sleep(700);
  }

  /** Uma jogada completa: rolagem, agrupamento, operações e resposta. */
  async function play(dice, grouping, op1, op2, typed) {
    await roll(dice[0], dice[1], dice[2]);
    pickGrouping(grouping);
    pickOp(1, op1);
    pickOp(2, op2);
    answer(typed);
    await sleep(60);
  }

  function diceFaces() {
    return $$('#dice .die').map(function (die) { return die.querySelectorAll('.pip').length; });
  }

  async function run() {
    // ------------------------------------------------ montagem da página
    ok('81 casas renderizadas', $$('.cell').length === 81, $$('.cell').length + ' casas');
    ok('zero no centro', cellOf(0) && cellOf(0).dataset.row === '4' && cellOf(0).dataset.col === '4',
      cellOf(0) ? cellOf(0).dataset.row + ',' + cellOf(0).dataset.col : 'ausente');
    ok('11 casas negativas', $$('.cell--negative').length === 11, $$('.cell--negative').length + '');
    ok('modo inicial é Partida', document.body.dataset.mode === 'match', document.body.dataset.mode);
    ok('campo de resposta bloqueado antes da rolagem', $('#answer').disabled === true, 'habilitado');
    ok('dez botões de operação', $$('.op-btn').length === 10, $$('.op-btn').length + '');
    ok('fim de turno oculto no início',
      getComputedStyle($('#turn-end')).display === 'none', getComputedStyle($('#turn-end')).display);
    ok('dica de troca oculta antes da rolagem',
      getComputedStyle($('#swap-hint')).display === 'none', getComputedStyle($('#swap-hint')).display);

    // --------------------------------------------------------- a rolagem
    await roll(2, 3, 4);
    ok('dados caíram em 2, 3 e 4', diceFaces().join(',') === '2,3,4', diceFaces().join(','));
    ok('campo de resposta liberado após rolar', $('#answer').disabled === false, 'bloqueado');
    ok('três tentativas disponíveis', $$('.attempt-dot').length === 3 && spentAttempts() === 0,
      $$('.attempt-dot').length + ' pontos, ' + spentAttempts() + ' gastos');
    ok('rolar novamente está bloqueado no mesmo turno', $('#btn-roll').disabled === true, 'liberado');

    // ------------------------------------------ conferir sem escolher operações
    answer('20');
    ok('sem operações não consome tentativa', spentAttempts() === 0, spentAttempts() + ' gastas');
    ok('aviso pede as operações', /Escolha as duas operações/.test(feedbackText()), feedbackText());

    // --------------------------------------------------- cálculo incorreto
    pickGrouping('L');
    pickOp(1, '+');
    pickOp(2, '×');
    answer('14');            // (2 + 3) × 4 = 20, não 14
    ok('cálculo errado consome uma tentativa', spentAttempts() === 1, spentAttempts() + ' gastas');
    ok('erro sinalizado em vermelho', $('#feedback').classList.contains('is-bad'), $('#feedback').className);
    ok('valor correto não é revelado', feedbackText().indexOf('20') === -1, feedbackText());

    // ----------------------------------------- resposta em branco não penaliza
    answer('');
    ok('resposta vazia não consome tentativa', spentAttempts() === 1, spentAttempts() + ' gastas');

    // ---------------------------------------------------- jogada bem-sucedida
    answer('20');
    ok('peça colocada na casa 20', cellOf(20).classList.contains('is-taken'), cellOf(20).className);
    ok('peça pertence ao jogador 1', cellOf(20).dataset.owner === '1', cellOf(20).dataset.owner);
    ok('contador do jogador 1 em 1', $('#count-1').textContent === '1', $('#count-1').textContent);
    ok('turno passou ao jogador 2', /Jogador 2/.test($('#turn-status').textContent), $('#turn-status').textContent);
    ok('dados limpos para o novo turno', $$('#dice .die--empty').length === 3, 'dados ainda visíveis');
    ok('registro anotou a expressão', /\(2 \+ 3\) × 4 = 20/.test($('#log').textContent), $('#log').textContent);

    // -------------------------------------------- casa ocupada consome tentativa
    await roll(2, 3, 4);
    pickGrouping('L');
    pickOp(1, '+');
    pickOp(2, '×');
    answer('20');
    ok('casa ocupada consome tentativa', spentAttempts() === 1, spentAttempts() + ' gastas');
    ok('mensagem reconhece o cálculo correto', /Cálculo certo/.test(feedbackText()), feedbackText());
    ok('mensagem informa a casa ocupada', /já tem uma peça/.test(feedbackText()), feedbackText());
    ok('nenhuma peça a mais no tabuleiro', $$('.cell.is-taken').length === 1, $$('.cell.is-taken').length + '');

    // --------------------------------------- resultado não inteiro e fora do tabuleiro
    pickGrouping('R');
    pickOp(1, '÷');
    pickOp(2, '+');
    answer('2/7');           // 2 ÷ (3 + 4) = 2/7, cálculo correto, casa inexistente
    ok('fração correta é aceita como cálculo', /Cálculo certo/.test(feedbackText()), feedbackText());
    ok('avisa que só há casas inteiras', /inteiro/.test(feedbackText()), feedbackText());
    ok('duas tentativas gastas', spentAttempts() === 2, spentAttempts() + ' gastas');

    // ------------------------------------------------- terceira falha encerra o turno
    pickGrouping('L');
    pickOp(1, '^');
    pickOp(2, '^');
    answer('1');             // (2 ^ 3) ^ 4 = 4096
    ok('turno encerrado após três falhas', $('#turn-end').hidden === false, 'ainda em construção');
    ok('rolagem bloqueada até passar a vez', $('#btn-roll').disabled === true, 'liberada');
    ok('aviso de tentativas esgotadas', /esgotadas/.test(feedbackText()), feedbackText());

    $('#btn-pass').click();
    await sleep(60);
    ok('a vez voltou ao jogador 1', /Jogador 1/.test($('#turn-status').textContent), $('#turn-status').textContent);
    ok('rolagem liberada no novo turno', $('#btn-roll').disabled === false, 'bloqueada');

    // ---------------------------------------------- expressão indefinida
    await roll(4, 3, 3);
    pickGrouping('R');
    pickOp(1, '÷');
    pickOp(2, '−');
    answer('0');             // 4 ÷ (3 − 3): divisão por zero
    ok('divisão por zero é recusada', /não está definida/.test(feedbackText()), feedbackText());
    ok('divisão por zero consome tentativa', spentAttempts() === 1, spentAttempts() + ' gastas');

    // ------------------------------------------------------------ cronômetro
    // O relógio virtual do Chrome avança Date.now(), então esperas curtas no
    // roteiro valem como segundos de jogo.
    ok('cronômetro visível durante o turno', $('#timer').hidden === false, 'oculto');
    ok('cronômetro conta para trás a partir do limite', /^1:(2\d|30)$/.test($('#timer').textContent),
      $('#timer').textContent);
    ok('barra de tempo visível na Partida', $('#timer-bar').hidden === false, 'oculta');

    var beforeSleep = $('#timer').textContent;
    await sleep(3000);
    ok('cronômetro avança com o tempo', $('#timer').textContent !== beforeSleep,
      'parado em ' + beforeSleep);

    // pausa enquanto um modal está aberto
    $$('[data-dialog="rules"]')[0].click();
    await sleep(30);
    ok('modal de regras abre', $('#dialog-rules').open === true, 'fechado');
    var paused = $('#timer').textContent;
    await sleep(4000);
    ok('cronômetro pausa com modal aberto', $('#timer').textContent === paused,
      paused + ' → ' + $('#timer').textContent);
    // A retomada vem da vigia de game.js: este Chrome não dispara 'close' em close().
    $('#dialog-rules').close();
    await sleep(1200);
    ok('cronômetro retoma ao fechar o modal', $('#timer').textContent !== paused,
      'ainda parado em ' + paused);

    // tempo esgotado encerra o turno
    ok('o tempo só oferece 30, 60 ou 90 segundos',
      $$('#set-timer option').map(function (o) { return o.value; }).join(',') === '30,60,90',
      $$('#set-timer option').map(function (o) { return o.value; }).join(','));
    ok('as tentativas só oferecem 1, 2 ou 3',
      $$('#set-attempts option').map(function (o) { return o.value; }).join(',') === '1,2,3',
      $$('#set-attempts option').map(function (o) { return o.value; }).join(','));
    setOnChange('#set-timer', 30);
    await sleep(600);
    ok('limite curto reinicia a contagem', $('#timer').textContent === '0:30', $('#timer').textContent);
    await sleep(31000);
    ok('tempo esgotado encerra o turno', $('#turn-end').hidden === false, 'turno segue aberto');
    ok('mensagem avisa do tempo esgotado', /Tempo esgotado/.test(feedbackText()), feedbackText());
    ok('registro anota o tempo esgotado', /tempo esgotado/.test($('#log').textContent), $('#log').textContent);
    ok('cronômetro zerado ao esgotar', $('#timer').textContent === '0:00', $('#timer').textContent);

    setOnChange('#set-timer', 90);
    await sleep(30);
    ok('a preferência de tempo é guardada',
      /"turnSeconds":90/.test(localStorage.getItem('conecta-com-expressoes:ajustes') || ''),
      localStorage.getItem('conecta-com-expressoes:ajustes') || 'sem ajustes');
    $('#btn-pass').click();
    await sleep(60);

    // ------------------------------------------------------- reiniciar tudo
    $('#btn-restart').click();
    await sleep(60);
    ok('reinício limpa o tabuleiro', $$('.cell.is-taken').length === 0, $$('.cell.is-taken').length + ' peças');
    ok('reinício zera o registro', /Nenhuma jogada registrada/.test($('#log').textContent), $('#log').textContent);
    ok('reinício volta ao jogador 1', $('#count-1').textContent === '0' && $('#count-2').textContent === '0',
      $('#count-1').textContent + '/' + $('#count-2').textContent);

    // -------------------------------- partida completa até a vitória (linha 4: 12, 1, −2, 13)
    await play([2, 3, 2], 'L', '×', '×', '12');   // J1 → 12
    ok('J1 tomou a casa 12', cellOf(12).dataset.owner === '1', cellOf(12).className);
    await play([1, 2, 3], 'R', '×', '×', '6');    // J2 → 6
    ok('J2 tomou a casa 6', cellOf(6).dataset.owner === '2', cellOf(6).className);
    await play([1, 1, 1], 'L', '+', '−', '1');    // J1 → 1
    ok('J1 tomou a casa 1', cellOf(1).dataset.owner === '1', cellOf(1).className);
    await play([2, 3, 1], 'L', '+', '×', '5');    // J2 → 5
    await play([1, 3, 1], 'L', '−', '×', '-2');   // J1 → −2
    ok('J1 tomou a casa −2', cellOf(-2).dataset.owner === '1', cellOf(-2).className);
    await play([2, 2, 1], 'L', '×', '×', '4');    // J2 → 4
    await play([1, 3, 4], 'R', '+', '×', '13');   // J1 → 13, fecha 12·1·−2·13
    ok('vitória detectada', $('#dialog-result').open === true, 'diálogo fechado');
    ok('título anuncia o vencedor', /Jogador 1/.test($('#result-title').textContent), $('#result-title').textContent);
    ok('quatro casas destacadas como sequência', $$('.cell.is-win').length === 4,
      $$('.cell.is-win').length + ' destacadas');
    ok('sequência é a esperada',
      [12, 1, -2, 13].every(function (v) { return cellOf(v).classList.contains('is-win'); }),
      'casas destacadas divergem');

    $('#btn-result-restart').click();
    await sleep(60);
    ok('nova partida limpa o tabuleiro', $$('.cell.is-taken').length === 0, $$('.cell.is-taken').length + '');

    // ------------------------------------------------------------- Treino
    $$('.mode-btn').filter(function (b) { return b.dataset.mode === 'practice'; })[0].click();
    await sleep(60);
    ok('modo Treino ativo', document.body.dataset.mode === 'practice', document.body.dataset.mode);
    ok('indicador de tentativas some no Treino', $('#attempts').textContent === '', $('#attempts').textContent);

    await roll(2, 3, 4);
    ok('casas alcançáveis destacadas', $$('.cell.is-reachable').length > 0,
      $$('.cell.is-reachable').length + ' destacadas');
    ok('rolar novamente é livre no Treino', $('#btn-roll').disabled === false, 'bloqueada');
    ok('Treino conta o tempo decorrido', $('#timer').classList.contains('is-elapsed'),
      $('#timer').className + ' ' + $('#timer').textContent);
    ok('Treino não mostra barra de limite', $('#timer-bar').hidden === true, 'barra visível');

    pickGrouping('L');
    pickOp(1, '+');
    pickOp(2, '×');
    answer('14');            // errado: (2 + 3) × 4 = 20
    ok('Treino revela o valor exato', /20/.test(feedbackText()), feedbackText());
    ok('Treino conta o erro', $('#practice-misses').textContent === '1', $('#practice-misses').textContent);

    answer('20');
    ok('Treino marca a casa conquistada', cellOf(20).classList.contains('is-marked'), cellOf(20).className);
    ok('Treino conta o acerto', $('#practice-hits').textContent === '1', $('#practice-hits').textContent);
    ok('Treino não coloca peças de jogador', $$('.cell.is-taken').length === 0, $$('.cell.is-taken').length + '');

    $('#btn-target').click();
    await sleep(30);
    ok('alvo sorteado é destacado', $$('.cell.is-target').length === 1, $$('.cell.is-target').length + '');
    var target = Number($$('.cell.is-target')[0].dataset.value);
    ok('alvo sorteado é alcançável', $$('.cell.is-target')[0].classList.contains('is-reachable'),
      'alvo ' + target + ' não alcançável');

    $('#btn-clear-marks').click();
    await sleep(30);
    ok('limpar marcas funciona', $$('.cell.is-marked').length === 0, $$('.cell.is-marked').length + '');

    $('#btn-possibilities').click();
    await sleep(30);
    ok('lista de possibilidades abre', $('#dialog-possibilities').open === true, 'fechada');
    ok('lista traz expressões', $$('#poss-list .poss-row').length > 0, 'vazia');
    $('#dialog-possibilities').close();

    // --------------------------------------------------- tabela de frequências
    $$('[data-dialog="frequencies"]')[0].click();
    await sleep(30);
    ok('tabela de frequências preenchida', $$('#freq-positive tr').length === 13,
      $$('#freq-positive tr').length + ' linhas');
    ok('frequência de 1 é 668', /668/.test($('#freq-positive').textContent), $('#freq-positive').textContent);
    ok('resumo cita 353 positivos distintos', /353/.test($('#freq-summary').textContent),
      $('#freq-summary').textContent);
    $('#dialog-frequencies').close();

    // ------------------------------------------------ ajuste: ordem dos dados
    $('#set-reorder').checked = false;
    $('#set-reorder').dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(30);
    ok('ordem fixa desabilita a troca de dados',
      $$('.expr-die').every(function (d) { return d.disabled; }), 'dados ainda clicáveis');

    // ------------------------------------------------- tamanho do tabuleiro
    click('.mode-btn[data-mode="match"]');
    await sleep(60);
    await play([2, 3, 2], 'L', '×', '×', '12');   // uma peça em jogo, para ver o reinício
    ok('peça em jogo antes de trocar o tamanho', $$('.cell.is-taken').length === 1,
      $$('.cell.is-taken').length + '');

    setOnChange('#set-board-size', 6);
    await sleep(60);
    ok('tabuleiro 6 × 6 tem 36 casas', $$('.cell').length === 36, $$('.cell').length + ' casas');
    ok('grade usa seis colunas', $('#board').style.getPropertyValue('--cols') === '6',
      $('#board').style.getPropertyValue('--cols'));
    ok('título acompanha o tamanho', /6 × 6/.test($('#board-title').textContent), $('#board-title').textContent);
    ok('legenda cita o recorte', /recorte central/.test($('#board-sub').textContent), $('#board-sub').textContent);
    ok('trocar o tamanho reinicia a partida', $$('.cell.is-taken').length === 0,
      $$('.cell.is-taken').length + ' peças');
    ok('zero continua no recorte', cellOf(0) !== undefined, 'zero ausente');
    ok('valores de fora do recorte desaparecem', cellOf(-1) === undefined && cellOf(100) === undefined,
      'ainda presentes');
    ok('o recorte mantém quatro negativos', $$('.cell--negative').length === 4,
      $$('.cell--negative').length + '');

    await play([1, 2, 3], 'R', '×', '×', '6');    // 6 está no recorte 6 × 6
    ok('jogada normal no tabuleiro menor', cellOf(6).classList.contains('is-taken'), cellOf(6).className);

    await roll(3, 3, 3);
    pickGrouping('L');
    pickOp(1, '×');
    pickOp(2, '×');
    answer('27');            // 27 existe no 9 × 9, mas não no recorte 6 × 6
    ok('valor fora do recorte não tem casa', /não existe casa/.test(feedbackText()), feedbackText());
    pickOp(1, '+');
    pickOp(2, '+');
    answer('9');             // (3 + 3) + 3 = 9 fecha o turno do jogador 2
    await sleep(60);

    // ------------------------------------------------ rolagem sem saída
    /* Com 1·1·1 só se chega a 0, 1, 2 e 3. Ocupadas essas quatro casas, a
       rolagem não tem saída — e a regra manda rolar de novo, não passar a vez. */
    await play([1, 1, 1], 'L', '+', '+', '3');   // J1
    await play([1, 1, 1], 'L', '+', '×', '2');   // J2
    await play([1, 1, 1], 'L', '×', '×', '1');   // J1
    await play([1, 1, 1], 'L', '−', '×', '0');   // J2
    ok('as quatro casas alcançáveis com 1·1·1 estão ocupadas',
      [0, 1, 2, 3].every(function (v) { return cellOf(v).classList.contains('is-taken'); }), 'alguma livre');
    ok('vez do jogador 1 antes da rolagem sem saída', /Jogador 1/.test($('#turn-status').textContent),
      $('#turn-status').textContent);

    await roll(1, 1, 1);
    ok('rolagem sem saída não encerra o turno', $('#turn-end').hidden === true, 'fim de turno à vista');
    ok('rolagem sem saída não passa a vez', /Jogador 1/.test($('#turn-status').textContent),
      $('#turn-status').textContent);
    ok('rolagem sem saída libera rolar de novo', $('#btn-roll').disabled === false, 'bloqueada');
    ok('botão convida a rolar novamente', $('#btn-roll').textContent === 'Rolar novamente',
      $('#btn-roll').textContent);
    ok('aviso pede nova rolagem', /Role os dados novamente/.test(feedbackText()), feedbackText());
    ok('campo de resposta segue bloqueado', $('#answer').disabled === true, 'liberado');
    ok('sem tentativas a mostrar na rolagem sem saída', $$('.attempt-dot').length === 0,
      $$('.attempt-dot').length + ' pontos');
    ok('registro anota a rolagem sem saída', /nenhuma jogada possível/.test($('#log').textContent),
      $('#log').textContent);
    ok('nenhuma peça a mais', $$('.cell.is-taken').length === 6, $$('.cell.is-taken').length + '');

    await play([2, 3, 4], 'L', '+', '×', '20');  // J1 joga na nova rolagem
    ok('a nova rolagem do mesmo jogador vale', cellOf(20).dataset.owner === '1', cellOf(20).className);
    ok('depois dela a vez passa normalmente', /Jogador 2/.test($('#turn-status').textContent),
      $('#turn-status').textContent);

    // ------------------------------------------------ lista em telas de toque
    /* A página pergunta ao navegador se o ponteiro é grosso (toque). Aqui a
       resposta é forjada para ver a lista sem um tablet de verdade. */
    var realMatchMedia = window.matchMedia;
    window.matchMedia = function (query) {
      if (query === '(pointer: coarse)') {
        return { matches: true, media: query, addEventListener: function () {}, addListener: function () {} };
      }
      return realMatchMedia.call(window, query);
    };
    function listValues() {
      return $$('#answer-select option').map(function (o) { return o.value; })
        .filter(function (v) { return v !== ''; });
    }

    await roll(2, 3, 4);                          // J2
    var select = $('#answer-select');
    ok('em tela de toque a lista aparece', select.hidden === false && select.disabled === false,
      'oculta ou bloqueada');
    ok('em tela de toque o campo de texto some', $('#answer').hidden === true, 'visível');
    ok('o campo de texto não recebe foco no toque', document.activeElement !== $('#answer'),
      'campo focado');
    var taken = $$('.cell.is-taken').map(function (c) { return c.dataset.value; });
    ok('a lista traz só casas livres', listValues().length === 36 - taken.length &&
      listValues().every(function (v) { return taken.indexOf(v) === -1; }),
      listValues().length + ' itens, ocupadas: ' + taken.join(','));
    ok('a lista exclui a casa ocupada 20', listValues().indexOf('20') === -1, listValues().join(','));
    ok('a lista traz uma casa livre negativa', listValues().indexOf('-8') !== -1, listValues().join(','));
    ok('a lista está em ordem crescente', listValues().every(function (v, i, all) {
      return i === 0 || Number(all[i - 1]) < Number(v);
    }), listValues().join(','));
    ok('a lista só tem o convite e as casas livres',
      $$('#answer-select option').length === listValues().length + 1, $$('#answer-select option').length + ' itens');

    pickGrouping('L');
    pickOp(1, '×');
    pickOp(2, '+');
    click('#btn-check');
    ok('sem escolha, o aviso fala da lista', /Escolha na lista/.test(feedbackText()), feedbackText());
    ok('conferir sem escolha não consome tentativa', spentAttempts() === 0, spentAttempts() + ' gastas');
    select.value = '10';                          // (2 × 3) + 4 = 10
    select.dispatchEvent(new Event('change', { bubbles: true }));
    click('#btn-check');
    await sleep(60);
    ok('o valor escolhido na lista é conferido', cellOf(10).dataset.owner === '2', cellOf(10).className);

    await roll(2, 3, 4);                          // J1
    ok('a lista volta a cada rolagem', $('#answer-select').hidden === false, 'oculta');
    ok('a lista já exclui a casa 10 recém-ocupada', listValues().indexOf('10') === -1, listValues().join(','));
    pickGrouping('L');
    pickOp(1, '^');
    pickOp(2, '+');
    $('#answer-select').value = '12';             // (2 ^ 3) + 4 = 12
    $('#answer-select').dispatchEvent(new Event('change', { bubbles: true }));
    click('#btn-check');
    await sleep(60);
    ok('outra escolha na lista vale', cellOf(12).dataset.owner === '1', cellOf(12).className);
    window.matchMedia = realMatchMedia;

    await roll(2, 3, 4);                          // J2, de volta ao ponteiro fino
    ok('com ponteiro fino o campo de texto volta', $('#answer').hidden === false && $('#answer-select').hidden === true,
      'lista à vista');

    setOnChange('#set-board-size', 9);
    await sleep(60);
    ok('volta para 81 casas', $$('.cell').length === 81, $$('.cell').length + ' casas');
    ok('valores do tabuleiro completo voltam', cellOf(-1) !== undefined && cellOf(100) !== undefined,
      'ainda ausentes');

    // ------------------------------------------------------- tema e crédito
    /* Nada aqui presume claro ou escuro: o roteiro parte do tema que o sistema
       declara — este Chrome se declara escuro — e verifica a troca em relação a
       ele. É o mesmo teste numa máquina de preferência oposta. */
    var root = document.documentElement;
    function paperOf() { return getComputedStyle(document.body).backgroundColor; }
    var fromSystem = root.dataset.theme;
    var opposite = fromSystem === 'dark' ? 'light' : 'dark';
    ok('o tema parte do automático, resolvido pelo sistema',
      $('#set-theme').value === 'auto' && (fromSystem === 'light' || fromSystem === 'dark'),
      $('#set-theme').value + ' → ' + fromSystem);
    var systemPaper = paperOf();

    click('#btn-theme');
    await sleep(60);
    ok('o botão leva ao outro tema', root.dataset.theme === opposite, root.dataset.theme);
    ok('o fundo da página muda com o tema', paperOf() !== systemPaper, paperOf());
    ok('o seletor de Ajustes acompanha o botão', $('#set-theme').value === opposite, $('#set-theme').value);
    ok('a preferência é guardada',
      new RegExp('"theme":"' + opposite + '"').test(localStorage.getItem('conecta-com-expressoes:ajustes') || ''),
      localStorage.getItem('conecta-com-expressoes:ajustes') || 'sem ajustes');
    ok('o rótulo do botão passa a oferecer a volta',
      $('#btn-theme').getAttribute('aria-label') ===
        'Mudar para o tema ' + (fromSystem === 'dark' ? 'escuro' : 'claro'),
      $('#btn-theme').getAttribute('aria-label'));
    ok('as casas do tabuleiro continuam legíveis',
      getComputedStyle($('.cell')).color !== getComputedStyle($('.cell')).backgroundColor,
      getComputedStyle($('.cell')).color);

    click('#btn-theme');
    await sleep(60);
    ok('o botão volta ao tema anterior', root.dataset.theme === fromSystem, root.dataset.theme);
    ok('o fundo volta a ser o mesmo de antes', paperOf() === systemPaper, paperOf());

    setOnChange('#set-theme', opposite);
    await sleep(60);
    ok('Ajustes também troca o tema', root.dataset.theme === opposite, root.dataset.theme);
    setOnChange('#set-theme', 'auto');
    await sleep(60);
    ok('o automático volta a seguir o sistema', root.dataset.theme === fromSystem, root.dataset.theme);

    var credit = $('.credit a');
    ok('o crédito está na página', /Guilherme Gaspar Perroni/.test($('.credit').textContent),
      $('.credit') ? $('.credit').textContent : 'ausente');
    ok('o crédito aponta para o LinkedIn',
      credit.href === 'https://www.linkedin.com/in/guilherme-perroni/', credit.href);
    ok('o link do crédito abre noutra aba', credit.target === '_blank' && /noopener/.test(credit.rel),
      credit.target + ' ' + credit.rel);

    /* Do ícone da aba dá para verificar o que é do documento: que os dois
       formatos estão declarados e que ambos os arquivos existem e decodificam
       no caminho dado. A aba em si não se mede daqui. */
    var icons = $$('link[rel="icon"]');
    ok('a página declara o ícone em SVG e em PNG',
      icons.length === 2 && /favicon\.svg$/.test(icons[0].href) && /favicon\.png$/.test(icons[1].href),
      icons.map(function (link) { return link.href; }).join(' ') || 'nenhum');
    var iconSizes = await Promise.all(icons.map(function (link) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { resolve(img.naturalWidth); };
        img.onerror = function () { resolve(0); };
        img.src = link.href;
      });
    }));
    ok('os dois arquivos do ícone carregam',
      iconSizes.length === 2 && iconSizes.every(function (width) { return width > 0; }),
      iconSizes.join(' '));

    // -------------------------------------------------------- caber na janela
    /* O encaixe acontece num quadro de animação; forçar o evento de
       redimensionamento é a maneira de esperar por ele sem depender desse
       relógio, que não avança sob o tempo virtual do Chrome headless. */
    function refit() { window.dispatchEvent(new Event('resize')); return sleep(150); }
    var panel = $('.panel');
    var wide = innerWidth > 900;   // abaixo disso a interface empilha e a coluna rola

    await refit();
    ok('a página não rola', document.documentElement.scrollHeight <= innerHeight + 1,
      document.documentElement.scrollHeight + ' > ' + innerHeight);
    var frame = $('.board-frame').getBoundingClientRect();
    var creditBottom = $('.credit').getBoundingClientRect().bottom;
    ok('o crédito cabe na janela', creditBottom <= innerHeight + 1,
      Math.round(creditBottom) + ' > ' + innerHeight);
    ok('o tabuleiro cabe na largura da janela', frame.right <= innerWidth + 1,
      Math.round(frame.right) + ' > ' + innerWidth);
    if (wide) {
      ok('o tabuleiro cabe na altura da janela', frame.bottom <= innerHeight + 1,
        Math.round(frame.bottom) + ' > ' + innerHeight);
      ok('a coluna da direita cabe', panel.scrollHeight <= panel.clientHeight + 1,
        panel.scrollHeight + ' > ' + panel.clientHeight);

      // Um aviso de várias linhas é o caso que nenhuma faixa de altura prevê: o
      // encaixe tem de ceder degrau até a coluna caber de novo.
      var kept = $('#feedback').innerHTML;
      $('#feedback').textContent = 'Aviso deliberadamente longo, escrito para ocupar ' +
        'três ou quatro linhas dentro do cartão e verificar se a interface cede ' +
        'espaço sozinha em vez de cortar o que está embaixo.';
      await refit();
      ok('conteúdo mais alto ainda cabe', panel.scrollHeight <= panel.clientHeight + 1,
        'degrau ' + (document.body.dataset.fit || '0') + ': ' +
        panel.scrollHeight + ' > ' + panel.clientHeight);
      $('#feedback').innerHTML = kept;
      await refit();

      /* O registro é o único conteúdo que cresce sozinho durante a partida. Ele
         tem de rolar por dentro: uma partida longa não pode apertar a interface
         nem empurrar nada para fora. */
      var list = $('#log');
      var entries = $$('#log li');
      var tier = document.body.dataset.fit || '0';
      var cardHeight = Math.round($('.log-card').getBoundingClientRect().height);
      for (var round = 0; round < 6; round++) {
        entries.forEach(function (entry) { list.appendChild(entry.cloneNode(true)); });
      }
      await refit();
      ok('um registro longo não mexe no encaixe', (document.body.dataset.fit || '0') === tier,
        'degrau ' + tier + ' → ' + (document.body.dataset.fit || '0'));
      ok('um registro longo não muda a altura do cartão',
        Math.abs(Math.round($('.log-card').getBoundingClientRect().height) - cardHeight) <= 1,
        cardHeight + ' → ' + Math.round($('.log-card').getBoundingClientRect().height));
      ok('o registro longo rola por dentro', list.scrollHeight > list.clientHeight + 1,
        list.scrollHeight + ' <= ' + list.clientHeight);
      ok('uma jogada inteira continua visível no registro',
        list.clientHeight + 1 >= entries[0].getBoundingClientRect().height,
        list.clientHeight + ' < ' + Math.round(entries[0].getBoundingClientRect().height));
      ok('a coluna cabe com o registro longo', panel.scrollHeight <= panel.clientHeight + 1,
        panel.scrollHeight + ' > ' + panel.clientHeight);
      while (list.children.length > entries.length) list.removeChild(list.lastChild);
      await refit();
    }

    // ---------------------------------------------------------------- erros
    ok('nenhum erro de JavaScript', window.__smokeErrors.length === 0, window.__smokeErrors.join(' ;; '));
  }

  window.__smokeErrors = [];
  window.addEventListener('error', function (event) {
    window.__smokeErrors.push(event.message + ' @' + event.filename + ':' + event.lineno);
  });

  function report() {
    var failures = results.filter(function (line) { return line.indexOf('FAIL') === 0; });
    var pre = document.createElement('pre');
    pre.id = 'smoke-results';
    pre.textContent = 'SMOKE ' + (failures.length ? 'FAILED ' + failures.length : 'OK') +
      ' (' + results.length + ' verificações)\n' + results.join('\n');
    document.body.appendChild(pre);
  }

  window.addEventListener('DOMContentLoaded', function () {
    run().then(report, function (error) {
      results.push('FAIL | exceção no roteiro | ' + (error && error.stack || error));
      report();
    });
  });
})();
