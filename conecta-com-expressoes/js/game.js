/**
 * Conecta com Expressões — controle do jogo e da interface.
 *
 * Dois modos compartilham o mesmo tabuleiro e o mesmo construtor de expressões:
 *   • Partida — dois jogadores alternam turnos, cada rolagem dá três tentativas
 *     e a expressão é conferida sem que o valor seja revelado; uma rolagem que
 *     não alcança casa livre é refeita, sem perda da vez;
 *   • Treino — um jogador, tentativas ilimitadas, casas alcançáveis destacadas,
 *     valor exato sempre mostrado e sorteio de casa-alvo para a análise inversa.
 */
(function () {
  'use strict';

  var GROUPING = Engine.GROUPING;
  // A mesma chave que theme.js já leu no <head>: os ajustes moram todos juntos.
  var STORAGE_KEY = Theme.STORAGE_KEY;

  // --------------------------------------------------------------- estado

  var state = {
    mode: 'match',
    phase: 'idle',          // idle | building | turnEnd | over
    settings: {
      attempts: 3,            // 1, 2 ou 3
      boardSize: Board.MAX_SIZE,
      turnSeconds: 90,        // 30, 60 ou 90
      allowReorder: true,
      highlightInMatch: false,
      theme: 'auto',            // 'auto' segue o sistema; 'light' e 'dark' fixam
      names: { 1: 'Jogador 1', 2: 'Jogador 2' }
    },
    board: Board.createState(),
    current: 1,
    counts: { 1: 0, 2: 0 },
    dice: null,             // [a, b, c] como saíram nos dados
    slots: null,            // mesma tripla, na ordem escolhida pelo jogador
    pick: null,             // índice do dado selecionado para troca
    op1: null,
    op2: null,
    grouping: GROUPING.LEFT,
    attemptsLeft: 3,
    answerMode: 'type',     // 'type' digita o resultado; 'list' escolhe numa lista (toque)
    reach: new Map(),       // inteiro alcançável → expressão de exemplo
    winCells: [],
    result: null,           // {type: 'win' | 'draw', player}
    log: [],
    marks: new Set(),       // casas conquistadas no Treino ("linha,coluna")
    practice: { hits: 0, misses: 0, target: null },

    /**
     * Cronômetro do turno, disparado quando os dados param. Na Partida conta
     * para trás e encerra o turno em zero; no Treino conta o tempo decorrido,
     * sem consequência. `mode` é 'off' | 'down' | 'up'.
     */
    timer: { mode: 'off', handle: null, watch: null, endsAt: 0, startedAt: 0, frozen: null, seconds: 0 }
  };

  // ------------------------------------------------------------- elementos

  var el = {};
  function grab(id) { return document.getElementById(id); }

  function cacheElements() {
    ['board', 'dice', 'btn-roll', 'expression', 'swap-hint', 'ops-1', 'ops-2', 'answer',
     'answer-select', 'answer-form', 'btn-check', 'feedback', 'attempts', 'turn-status', 'turn-end',
     'btn-reveal', 'btn-pass', 'count-1', 'count-2', 'log', 'btn-copy-log',
     'practice-hits', 'practice-misses', 'practice-marked', 'practice-target',
     'btn-target', 'btn-clear-marks', 'btn-possibilities', 'poss-list', 'poss-summary',
     'freq-summary', 'freq-positive', 'freq-negative', 'set-attempts', 'set-reorder',
     'set-highlight', 'set-name-1', 'set-name-2', 'btn-restart', 'board-sub', 'board-title',
     'set-board-size', 'set-timer', 'set-theme', 'btn-theme', 'timer', 'timer-bar', 'timer-fill',
     'result-kicker', 'result-title', 'result-detail', 'btn-result-close',
     'btn-result-restart'].forEach(function (id) {
      el[id] = grab(id);
    });
    el.groupingInputs = Array.prototype.slice.call(document.querySelectorAll('input[name="grouping"]'));
    el.groupingFieldset = document.querySelector('.grouping');
    el.panel = document.querySelector('.panel');
    el.dialogs = {
      rules: grab('dialog-rules'),
      frequencies: grab('dialog-frequencies'),
      settings: grab('dialog-settings'),
      possibilities: grab('dialog-possibilities'),
      result: grab('dialog-result')
    };
    el.cells = [];
  }

  // ------------------------------------------------------------ utilidades

  function key(row, col) { return row + ',' + col; }
  function nameOf(player) { return state.settings.names[player]; }

  /** Nomes de jogador são digitados pelo usuário e entram em mensagens com marcação. */
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function nameHtml(player) { return escapeHtml(nameOf(player)); }
  function other(player) { return player === 1 ? 2 : 1; }
  function isPractice() { return state.mode === 'practice'; }

  /** Formata um inteiro com separador de milhar (1 234). */
  function formatInt(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function currentExpressionText() {
    if (!state.slots) return '';
    return Engine.expressionText(state.slots, state.op1 || '?', state.op2 || '?', state.grouping);
  }

  // ----------------------------------------------------- montagem inicial

  var PIP_LAYOUT = {
    1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]
  };

  function buildBoard() {
    el.board.textContent = '';
    el.cells = [];
    el.board.style.setProperty('--cols', Board.SIZE);
    el.board.setAttribute('aria-label',
      'Tabuleiro do jogo, ' + Board.SIZE + ' linhas por ' + Board.SIZE + ' colunas');
    var fragment = document.createDocumentFragment();
    for (var r = 0; r < Board.SIZE; r++) {
      el.cells[r] = [];
      for (var c = 0; c < Board.SIZE; c++) {
        var value = Board.valueAt(r, c);
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell cell--' + Board.kindOf(value);
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.dataset.value = value;
        cell.textContent = value;
        cell.setAttribute('role', 'gridcell');
        cell.addEventListener('click', onCellClick);
        el.cells[r][c] = cell;
        fragment.appendChild(cell);
      }
    }
    el.board.appendChild(fragment);
  }

  function buildOpButtons() {
    [1, 2].forEach(function (slot) {
      var host = el['ops-' + slot];
      Engine.OPERATIONS.forEach(function (op) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'op-btn';
        btn.dataset.op = op;
        btn.dataset.slot = slot;
        btn.textContent = Engine.OP_LABEL[op];
        btn.setAttribute('aria-label', 'operação ' + Engine.OP_LABEL[op]);
        btn.addEventListener('click', function () { chooseOp(slot, op); });
        host.appendChild(btn);
      });
    });
  }

  function renderDie(face) {
    var die = document.createElement('div');
    die.className = 'die' + (face ? '' : ' die--empty');
    if (face) {
      die.setAttribute('aria-label', face + (face === 1 ? ' ponto' : ' pontos'));
      PIP_LAYOUT[face].forEach(function (position) {
        var pip = document.createElement('span');
        pip.className = 'pip';
        pip.style.gridArea = Math.ceil(position / 3) + ' / ' + (((position - 1) % 3) + 1);
        die.appendChild(pip);
      });
    }
    return die;
  }

  function renderDice(faces) {
    el.dice.textContent = '';
    for (var i = 0; i < 3; i++) el.dice.appendChild(renderDie(faces ? faces[i] : null));
  }

  // -------------------------------------------------------- caber na janela

  /*
   * A janela é o limite: nada de rolagem, nada cortado. O tabuleiro já se
   * dimensiona pelo espaço livre (CSS), mas a coluna da direita tem conteúdo de
   * altura variável — uma mensagem de duas linhas, um nome comprido — e por isso
   * é medida de verdade em vez de adivinhada por faixas de altura.
   *
   * Cada degrau tem duas alavancas: `tier`, que o CSS lê em data-fit e que
   * dispensa elementos, e `u`, o fator que aperta o espaçamento. Ar sai antes de
   * informação: comprime-se o espaço entre os blocos até o limite antes de
   * esconder qualquer coisa, e o registro das jogadas — a única informação que
   * chega a sair — é o último de todos. O essencial (tabuleiro, dados, expressão,
   * resposta) nunca sai.
   */
  var FIT_LADDER = [
    { tier: 0, u: 1 },      // tudo à vista
    { tier: 1, u: 1 },      // saem o subtítulo do cabeçalho e a dica de troca
    { tier: 1, u: 0.94 },
    { tier: 1, u: 0.88 },
    { tier: 1, u: 0.82 },
    { tier: 1, u: 0.76 },
    { tier: 1, u: 0.70 },
    { tier: 2, u: 0.70 },   // tipos menores nos textos do painel
    { tier: 2, u: 0.62 },
    { tier: 3, u: 0.62 },   // saem os rótulos das operações e do agrupamento
    { tier: 3, u: 0.58 },
    { tier: 3, u: 0.54 },
    { tier: 3, u: 0.50 },
    { tier: 4, u: 0.54 },   // sai o registro das jogadas
    { tier: 4, u: 0.50 }
  ];

  function panelOverflows() {
    // 1 px de folga: alturas fracionárias arredondam para cima em alguns zooms.
    return el.panel.scrollHeight > el.panel.clientHeight + 1;
  }

  function applyFitStep(step) {
    var rung = FIT_LADDER[Math.min(step, FIT_LADDER.length - 1)];
    if (rung.tier === 0) delete document.body.dataset.fit;
    else document.body.dataset.fit = String(rung.tier);
    // No elemento raiz, e não no body: é lá que --u é declarada, e a substituição
    // de uma variável acontece no elemento onde está a declaração que a usa.
    if (rung.u === 1) document.documentElement.style.removeProperty('--fit-u');
    else document.documentElement.style.setProperty('--fit-u', String(rung.u));
  }

  /** Sobe degraus até a coluna caber. @returns {number} o degrau usado. */
  function fitToViewport() {
    for (var step = 0; step < FIT_LADDER.length; step++) {
      applyFitStep(step);
      if (!panelOverflows()) return step;
    }
    return FIT_LADDER.length - 1;
  }

  var fitPending = false;
  /*
   * Reavalia o encaixe uma vez só, por mais vezes que seja pedido no mesmo
   * quadro. O quadro é a hora certa — o ajuste entra antes da pintura —, mas em
   * aba oculta ele não chega, e sem a rede do tempo limite o pedido ficaria
   * pendente para sempre.
   */
  function scheduleFit() {
    if (fitPending) return;
    fitPending = true;
    function run() {
      if (!fitPending) return;
      fitPending = false;
      fitToViewport();
    }
    requestAnimationFrame(run);
    setTimeout(run, 60);
  }

  /*
   * Nem toda mudança de altura passa por render(): um aviso que quebra em duas
   * linhas, um nome comprido, o zoom do navegador. Observar os cartões cobre
   * todos esses casos de uma vez. O recálculo parte sempre do degrau 0, e é isso
   * que o mantém estável: cada degrau é medido por si, então ver o efeito da
   * própria mudança devolve o mesmo degrau e a sequência para.
   */
  function watchPanelSize() {
    if (typeof ResizeObserver !== 'function') return;
    var observer = new ResizeObserver(scheduleFit);
    observer.observe(el.panel);
    Array.prototype.forEach.call(el.panel.children, function (card) { observer.observe(card); });
  }

  // --------------------------------------------------------------------- tema

  /*
   * O botão do alto fixa um dos dois temas; o automático, que segue o sistema,
   * fica em Ajustes. Os dois caminhos passam por aqui, de modo que o seletor e a
   * preferência guardada nunca discordem do que está na tela.
   */
  function setTheme(preference) {
    state.settings.theme = Theme.apply(preference);
    el['set-theme'].value = state.settings.theme;
    saveSettings();
    renderTheme();
  }

  function toggleTheme() {
    setTheme(Theme.current() === 'dark' ? 'light' : 'dark');
  }

  /* A palavra visível do botão vem do CSS; aqui fica o rótulo acessível, que
     precisa da frase inteira. */
  function renderTheme() {
    var target = Theme.current() === 'dark' ? 'claro' : 'escuro';
    el['btn-theme'].setAttribute('aria-label', 'Mudar para o tema ' + target);
    el['btn-theme'].title = 'Mudar para o tema ' + target;
  }

  // ------------------------------------------------------------ renderização

  function render() {
    document.body.dataset.mode = state.mode;
    renderBoardHead();
    renderBoard();
    renderExpression();
    renderOps();
    renderAttempts();
    renderTimer();
    renderStatus();
    renderCounts();
    renderLog();
    renderPracticePanel();
    renderControls();
    renderAnswerField();
    renderTheme();
    scheduleFit();
  }

  /** Título e legenda do tabuleiro, que dependem do tamanho e do modo. */
  function renderBoardHead() {
    el['board-title'].textContent = 'Tabuleiro ' + Board.SIZE + ' × ' + Board.SIZE;
    if (isPractice()) {
      el['board-sub'].textContent = 'Clique em uma casa para transformá-la em alvo. ' +
        'As casas alcançáveis com a rolagem ficam destacadas.';
      return;
    }
    var tally = Board.counts();
    el['board-sub'].textContent = Board.cellCount() + ' casas: ' + tally.positive +
      ' valores positivos, ' + tally.negative + ' negativos e o zero' +
      (Board.SIZE === Board.MASTER_SIZE
        ? ' no centro.'
        : ' — recorte central do tabuleiro ' + Board.MASTER_SIZE + ' × ' + Board.MASTER_SIZE + '.');
  }

  function renderBoard() {
    var showReach = isPractice() || state.settings.highlightInMatch;
    var playable = playableValues();
    for (var r = 0; r < Board.SIZE; r++) {
      for (var c = 0; c < Board.SIZE; c++) {
        var cell = el.cells[r][c];
        var value = Board.valueAt(r, c);
        var owner = isPractice() ? null : state.board[r][c];

        cell.classList.toggle('is-taken', owner !== null);
        if (owner === null) delete cell.dataset.owner; else cell.dataset.owner = owner;

        cell.classList.toggle('is-marked', isPractice() && state.marks.has(key(r, c)));
        cell.classList.toggle('is-reachable', showReach && playable.has(value));
        cell.classList.toggle('is-target', isPractice() && state.practice.target === value);
        cell.classList.toggle('is-win', !isPractice() && state.winCells.indexOf(key(r, c)) !== -1);
        cell.classList.toggle('is-clickable', isPractice() && state.phase !== 'over');

        var label = value + (owner ? ' — peça de ' + nameOf(owner) : ' — livre');
        cell.setAttribute('aria-label', label);
      }
    }
  }

  /** Valores alcançáveis com a rolagem atual que correspondem a casas jogáveis. */
  function playableValues() {
    var out = new Set();
    if (!state.dice || state.phase === 'over') return out;
    state.reach.forEach(function (_expr, value) {
      if (!Board.hasValue(value)) return;
      var cell = Board.cellOf(value);
      var free = isPractice() ? !state.marks.has(key(cell.row, cell.col))
                              : Board.isFree(state.board, cell.row, cell.col);
      if (free) out.add(value);
    });
    return out;
  }

  function renderExpression() {
    el.expression.textContent = '';
    if (!state.slots) {
      var placeholder = document.createElement('span');
      placeholder.className = 'expr-op is-empty';
      placeholder.textContent = 'Role os dados para começar.';
      el.expression.appendChild(placeholder);
      el['swap-hint'].hidden = true;
      return;
    }

    var canEdit = state.phase === 'building';
    var parts = [];

    function paren(ch) {
      var span = document.createElement('span');
      span.className = 'expr-paren';
      span.textContent = ch;
      return span;
    }
    function die(index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'expr-die' + (state.pick === index ? ' is-picked' : '');
      btn.textContent = state.slots[index];
      btn.disabled = !canEdit || !state.settings.allowReorder;
      btn.setAttribute('aria-label', 'dado ' + state.slots[index] +
        (state.settings.allowReorder ? ', clique para trocar de posição' : ''));
      btn.addEventListener('click', function () { pickDie(index); });
      return btn;
    }
    function op(which) {
      var chosen = which === 1 ? state.op1 : state.op2;
      var span = document.createElement('span');
      span.className = 'expr-op' + (chosen ? '' : ' is-empty');
      span.textContent = chosen ? Engine.OP_LABEL[chosen] : '∘';
      return span;
    }

    if (state.grouping === GROUPING.LEFT) {
      parts.push(paren('('), die(0), op(1), die(1), paren(')'), op(2), die(2));
    } else {
      parts.push(die(0), op(1), paren('('), die(1), op(2), die(2), paren(')'));
    }
    var equals = document.createElement('span');
    equals.className = 'expr-equals';
    equals.textContent = '=';
    parts.push(equals);

    parts.forEach(function (node) { el.expression.appendChild(node); });
    el['swap-hint'].hidden = !(canEdit && state.settings.allowReorder);
  }

  function renderOps() {
    document.querySelectorAll('.op-btn').forEach(function (btn) {
      var chosen = btn.dataset.slot === '1' ? state.op1 : state.op2;
      btn.classList.toggle('is-selected', chosen === btn.dataset.op);
      btn.disabled = state.phase !== 'building';
    });
    el.groupingFieldset.disabled = state.phase !== 'building';
    el.groupingInputs.forEach(function (input) { input.checked = input.value === state.grouping; });
  }

  function renderAttempts() {
    var host = el.attempts;
    host.textContent = '';
    // Em 'idle' com dados na mesa a rolagem foi sem saída e vai ser refeita:
    // não há tentativas a mostrar.
    if (isPractice() || !state.dice || state.phase === 'over' || state.phase === 'idle') return;
    var label = document.createElement('span');
    label.className = 'attempts-label';
    label.textContent = 'tentativas';
    host.appendChild(label);
    for (var i = 0; i < state.settings.attempts; i++) {
      var dot = document.createElement('span');
      dot.className = 'attempt-dot' + (i < state.settings.attempts - state.attemptsLeft ? ' is-spent' : '');
      host.appendChild(dot);
    }
    host.setAttribute('aria-label', state.attemptsLeft + ' de ' + state.settings.attempts + ' tentativas restantes');
  }

  function renderStatus() {
    var text;
    if (state.phase === 'over') {
      el['turn-status'].textContent = state.result && state.result.type === 'draw'
        ? 'Partida empatada: as ' + Board.cellCount() + ' casas foram preenchidas.'
        : 'Partida encerrada: ' + nameOf(state.current) + ' formou quatro peças em linha.';
      return;
    }
    if (state.phase === 'idle') {
      text = 'Vez de ' + nameOf(state.current) + (state.dice
        ? ': a rolagem não abriu casa livre, role os dados novamente.'
        : ': role os dados.');
    }
    else if (state.phase === 'turnEnd') text = 'Turno encerrado. Passe a vez para ' + nameOf(other(state.current)) + '.';
    else text = 'Vez de ' + nameOf(state.current) + ': construa a expressão e confira o resultado.';
    el['turn-status'].textContent = text;
  }

  function renderCounts() {
    el['count-1'].textContent = state.counts[1];
    el['count-2'].textContent = state.counts[2];
    document.querySelectorAll('.player-chip').forEach(function (chip) {
      chip.classList.toggle('is-active', Number(chip.dataset.player) === state.current && state.phase !== 'over');
    });
    document.querySelectorAll('[data-player-name]').forEach(function (node) {
      node.textContent = nameOf(Number(node.dataset.playerName));
    });
  }

  function renderPracticePanel() {
    el['practice-hits'].textContent = state.practice.hits;
    el['practice-misses'].textContent = state.practice.misses;
    el['practice-marked'].textContent = state.marks.size;
    if (!isPractice()) return;

    var target = state.practice.target;
    if (target === null) {
      el['practice-target'].textContent = state.dice
        ? 'Nenhum alvo definido: clique em uma casa do tabuleiro ou sorteie um alvo.'
        : 'Role os dados e explore quais casas você consegue alcançar.';
    } else {
      el['practice-target'].innerHTML = 'Alvo: <strong>' + target +
        '</strong> — encontre operações e agrupamento que cheguem a esse valor.';
    }
  }

  function renderControls() {
    var rolling = state.phase === 'building';
    // Na Partida cada turno tem uma única rolagem: o botão só volta a valer no
    // turno seguinte. No Treino a rolagem é livre.
    el['btn-roll'].disabled = isPractice() ? state.phase === 'over' : state.phase !== 'idle';
    // "Rolar novamente" no Treino e na Partida quando a rolagem foi sem saída.
    el['btn-roll'].textContent = state.dice && (isPractice() || state.phase === 'idle')
      ? 'Rolar novamente' : 'Rolar os dados';

    el.answer.disabled = !rolling;
    el['btn-check'].disabled = !rolling;
    el['turn-end'].hidden = state.phase !== 'turnEnd';
    el['btn-possibilities'].disabled = !state.dice;
    el['btn-target'].disabled = !state.dice;
  }

  function renderLog() {
    var host = el.log;
    host.textContent = '';
    if (!state.log.length) {
      var empty = document.createElement('li');
      empty.className = 'log-empty';
      empty.textContent = 'Nenhuma jogada registrada.';
      host.appendChild(empty);
      return;
    }
    state.log.slice().reverse().forEach(function (entry) {
      var li = document.createElement('li');
      if (entry.player) {
        var dot = document.createElement('span');
        dot.className = 'log-dot';
        dot.dataset.player = entry.player;
        li.appendChild(dot);
      }
      var text = document.createElement('span');
      text.className = 'log-expr';
      text.textContent = entry.text;
      li.appendChild(text);
      if (entry.note) {
        var note = document.createElement('span');
        note.className = 'log-note';
        note.textContent = entry.note;
        li.appendChild(note);
      }
      host.appendChild(li);
    });
  }

  function addLog(text, note, player) {
    state.log.push({ text: text, note: note || '', player: player || null });
    renderLog();
  }

  // ----------------------------------------------------------- mensagens

  function say(message, tone, extra) {
    el.feedback.className = 'feedback' + (tone ? ' is-' + tone : '');
    el.feedback.textContent = '';
    var main = document.createElement('span');
    main.innerHTML = message;
    el.feedback.appendChild(main);
    if (extra) {
      var sub = document.createElement('span');
      sub.className = 'feedback-expr';
      sub.textContent = extra;
      el.feedback.appendChild(sub);
    }
  }

  function clearSay() { el.feedback.className = 'feedback'; el.feedback.textContent = ''; }

  // ----------------------------------------------------------- cronômetro

  var TICK_MS = 200;
  var WATCH_MS = 300;         // vigia que retoma a contagem ao fechar o modal
  var URGENT_AT = 10;         // segundos restantes que acendem o alerta

  function formatClock(seconds) {
    var whole = Math.max(0, Math.ceil(seconds));
    var mm = Math.floor(whole / 60);
    var ss = whole % 60;
    return mm + ':' + (ss < 10 ? '0' : '') + ss;
  }

  /** Dispara o cronômetro do turno. Chamado quando os dados param. */
  function startTimer() {
    stopTimer();
    var limit = state.settings.turnSeconds;
    if (isPractice()) {
      state.timer.mode = 'up';
      state.timer.startedAt = Date.now();
    } else if (limit > 0) {
      state.timer.mode = 'down';
      state.timer.endsAt = Date.now() + limit * 1000;
    } else {
      renderTimer();
      return;
    }
    state.timer.frozen = null;
    state.timer.handle = setInterval(onTick, TICK_MS);
    renderTimer();
  }

  function stopTimer() {
    if (state.timer.handle !== null) clearInterval(state.timer.handle);
    clearWatch();
    state.timer.handle = null;
    state.timer.mode = 'off';
    state.timer.frozen = null;
    renderTimer();
  }

  /** Congela a contagem sem apagar o mostrador (usado quando o turno termina). */
  function freezeTimer() {
    if (state.timer.mode === 'off') return;
    state.timer.frozen = timerSeconds();
    if (state.timer.handle !== null) clearInterval(state.timer.handle);
    clearWatch();
    state.timer.handle = null;
    renderTimer();
  }

  /**
   * Pausa enquanto um modal está aberto: ler as regras não consome o turno.
   * A retomada não depende do evento 'close' do <dialog> — que nem todo
   * navegador dispara em close() — e sim de uma vigia que observa se ainda há
   * algum modal aberto. Um cronômetro preso em pausa daria tempo infinito.
   */
  function pauseTimer() {
    if (state.timer.mode === 'off' || state.timer.handle === null) return;
    state.timer.frozen = timerSeconds();
    clearInterval(state.timer.handle);
    state.timer.handle = null;
    state.timer.watch = setInterval(function () {
      if (!anyDialogOpen()) resumeTimer();
    }, WATCH_MS);
    renderTimer();
  }

  function clearWatch() {
    if (state.timer.watch !== null) clearInterval(state.timer.watch);
    state.timer.watch = null;
  }

  function resumeTimer() {
    clearWatch();
    if (state.timer.mode === 'off' || state.timer.handle !== null || state.timer.frozen === null) return;
    if (state.timer.mode === 'down') state.timer.endsAt = Date.now() + state.timer.frozen * 1000;
    else state.timer.startedAt = Date.now() - state.timer.frozen * 1000;
    state.timer.frozen = null;
    state.timer.handle = setInterval(onTick, TICK_MS);
    renderTimer();
  }

  /** Segundos restantes (contagem regressiva) ou decorridos (Treino). */
  function timerSeconds() {
    if (state.timer.frozen !== null) return state.timer.frozen;
    if (state.timer.mode === 'down') return Math.max(0, (state.timer.endsAt - Date.now()) / 1000);
    if (state.timer.mode === 'up') return (Date.now() - state.timer.startedAt) / 1000;
    return 0;
  }

  function onTick() {
    if (state.timer.mode === 'down' && timerSeconds() <= 0) {
      timeUp();
      return;
    }
    renderTimer();
  }

  /** Tempo esgotado na Partida: o turno passa, como nas tentativas esgotadas. */
  function timeUp() {
    freezeTimer();
    if (state.phase !== 'building') return;
    state.phase = 'turnEnd';
    el.answer.value = '';
    say('Tempo esgotado para <strong>' + nameHtml(state.current) + '</strong>.', 'bad',
        'O turno passa para ' + nameOf(other(state.current)) + '.');
    addLog('Dados ' + state.dice.join('·') + ' — tempo esgotado', 'sem peça', state.current);
    render();
  }

  function renderTimer() {
    var host = el.timer;
    if (!host) return;
    var active = state.timer.mode !== 'off';
    host.hidden = !active;
    el['timer-bar'].hidden = state.timer.mode !== 'down';
    if (!active) return;

    var seconds = timerSeconds();
    state.timer.seconds = seconds;
    var counting = state.timer.mode === 'down';
    var urgent = counting && seconds <= URGENT_AT;

    host.textContent = formatClock(seconds);
    host.classList.toggle('is-urgent', urgent);
    host.classList.toggle('is-elapsed', !counting);
    host.setAttribute('aria-label', counting
      ? formatClock(seconds) + ' restantes neste turno'
      : formatClock(seconds) + ' de tempo decorrido');

    if (counting) {
      var fraction = state.settings.turnSeconds > 0 ? seconds / state.settings.turnSeconds : 0;
      el['timer-fill'].style.width = Math.max(0, Math.min(1, fraction)) * 100 + '%';
      el['timer-fill'].classList.toggle('is-urgent', urgent);
    }
  }

  // ------------------------------------------------------------- a rolagem

  function rollDice() {
    var faces = [0, 0, 0].map(function () { return 1 + Math.floor(Math.random() * 6); });
    var dice = el.dice.querySelectorAll('.die');
    dice.forEach(function (die) { die.classList.add('is-rolling'); });

    var ticks = 0;
    var spin = setInterval(function () {
      renderDice([0, 0, 0].map(function () { return 1 + Math.floor(Math.random() * 6); }));
      el.dice.querySelectorAll('.die').forEach(function (die) { die.classList.add('is-rolling'); });
      if (++ticks >= 4) {
        clearInterval(spin);
        renderDice(faces);
        settleRoll(faces);
      }
    }, 90);
  }

  function settleRoll(faces) {
    state.dice = faces.slice();
    state.slots = faces.slice();
    state.pick = null;
    state.op1 = null;
    state.op2 = null;
    state.grouping = GROUPING.LEFT;
    state.attemptsLeft = state.settings.attempts;
    state.reach = Engine.reachableIntegers(state.dice, state.settings.allowReorder);
    state.phase = 'building';
    state.answerMode = prefersList() ? 'list' : 'type';
    el.answer.value = '';
    clearSay();

    var playable = playableValues();
    if (!isPractice() && playable.size === 0) {
      // Rolagem sem saída: nenhuma expressão chega a uma casa livre. O jogador
      // não perde a vez — volta a 'idle' e rola de novo, quantas vezes preciso.
      state.phase = 'idle';
      say('Nenhuma expressão construída com <strong>' + faces.join(', ') +
          '</strong> alcança uma casa livre. Role os dados novamente: a vez continua sua.', 'warn');
      addLog('Dados ' + faces.join('·') + ' — nenhuma jogada possível', 'nova rolagem', state.current);
    } else if (isPractice()) {
      say('Dados: <strong>' + faces.join(' · ') + '</strong>. ' + playable.size +
          ' casa(s) destacada(s) podem ser alcançadas.', null);
    }

    if (state.phase === 'building') startTimer(); else stopTimer();

    render();
    // Só o campo de texto recebe foco: numa tela de toque isso chamaria o
    // teclado virtual, e ali o resultado é escolhido na lista.
    if (state.phase === 'building' && state.answerMode === 'type') el.answer.focus();
  }

  // ------------------------------------------------------ campo de resposta

  /*
   * Em telas de toque, digitar o resultado chama o teclado virtual, que cobre
   * metade da tela e esconde o tabuleiro. Ali o resultado é escolhido numa
   * lista com os valores das casas ainda livres — só as que existem no
   * tabuleiro e ainda não têm peça. No computador continua a digitação.
   */
  function prefersList() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  }

  /** Valores das casas ainda livres, em ordem crescente. */
  function freeBoardValues() {
    var out = [];
    for (var r = 0; r < Board.SIZE; r++) {
      for (var c = 0; c < Board.SIZE; c++) {
        var free = isPractice() ? !state.marks.has(key(r, c)) : Board.isFree(state.board, r, c);
        if (free) out.push(Board.valueAt(r, c));
      }
    }
    return out.sort(function (a, b) { return a - b; });
  }

  function renderAnswerField() {
    var select = el['answer-select'];
    var list = state.answerMode === 'list' && state.phase === 'building';
    el.answer.hidden = list;
    select.hidden = !list;
    select.disabled = !list;
    if (!list) return;

    var previous = select.value;
    select.textContent = '';
    var placeholder = new Option('Escolha o resultado…', '', true, true);
    placeholder.disabled = true;
    select.appendChild(placeholder);
    freeBoardValues().forEach(function (value) {
      select.appendChild(new Option(String(value), String(value)));
    });

    var stillThere = previous !== '' && Array.prototype.some.call(select.options, function (option) {
      return option.value === previous;
    });
    if (stillThere) select.value = previous;
  }

  /** A lista escreve no mesmo campo que a digitação: onSubmit lê um só lugar. */
  function onAnswerSelect() {
    el.answer.value = el['answer-select'].value;
  }

  // ---------------------------------------------- construção da expressão

  function chooseOp(slot, op) {
    if (state.phase !== 'building') return;
    if (slot === 1) state.op1 = op; else state.op2 = op;
    renderExpression();
    renderOps();
  }

  function pickDie(index) {
    if (state.phase !== 'building' || !state.settings.allowReorder) return;
    if (state.pick === null) {
      state.pick = index;
    } else if (state.pick === index) {
      state.pick = null;
    } else {
      var a = state.slots[state.pick];
      state.slots[state.pick] = state.slots[index];
      state.slots[index] = a;
      state.pick = null;
    }
    renderExpression();
  }

  function chooseGrouping(value) {
    if (state.phase !== 'building') return;
    state.grouping = value;
    renderExpression();
  }

  // -------------------------------------------------------- conferir jogada

  function onSubmit(event) {
    event.preventDefault();
    if (state.phase !== 'building') return;

    if (!state.op1 || !state.op2) {
      say('Escolha as duas operações antes de conferir.', 'warn');
      return;
    }

    var typed = Engine.parseAnswer(el.answer.value);
    if (!typed) {
      say(state.answerMode === 'list'
        ? 'Escolha na lista o resultado da sua expressão.'
        : 'Digite o resultado da sua expressão — um inteiro como <strong>-7</strong>, ou uma fração como <strong>5/2</strong>.', 'warn');
      return;
    }

    var expressionText = currentExpressionText();
    var result = Engine.evaluate(state.slots, state.op1, state.op2, state.grouping);

    // 1. a expressão está matematicamente definida?
    if (!result.ok) {
      var undefinedWhy = 'A expressão <strong>' + expressionText + '</strong> não está definida: ' +
        Engine.INVALID_MESSAGE[result.reason] + '.';
      if (isPractice()) return notePractice(undefinedWhy, 'Troque uma operação ou o agrupamento.', 'warn');
      return failAttempt(undefinedWhy, 'expressão indefinida');
    }

    // 2. o cálculo do jogador está certo?
    if (!Engine.equals(typed, result.value)) {
      if (isPractice()) {
        state.practice.misses++;
        say('<strong>' + expressionText + '</strong> não vale ' + Engine.fracToString(typed) + '.', 'bad',
            'O valor exato é ' + Engine.fracToString(result.value) + '. Confira a ordem das operações.');
        render();
        return;
      }
      return failAttempt('Esse não é o valor de <strong>' + expressionText + '</strong>. Refaça a conta.',
                         'cálculo incorreto');
    }

    // 3. o resultado corresponde a uma casa jogável?
    if (!Engine.isInteger(result.value)) {
      return unplayable(expressionText,
        'o tabuleiro só tem casas de valor inteiro, e ' + Engine.fracToString(result.value) + ' não é inteiro',
        'resultado não inteiro');
    }

    var value = Number(result.value.n);
    if (!Board.hasValue(value)) {
      return unplayable(expressionText,
        'não existe casa com o valor ' + formatInt(value), 'valor fora do tabuleiro');
    }

    var cell = Board.cellOf(value);
    if (isPractice()) return practiceHit(expressionText, value, cell);

    var owner = Board.occupant(state.board, cell.row, cell.col);
    if (owner !== null) {
      bumpCell(cell);
      return unplayable(expressionText,
        'a casa ' + value + ' já tem uma peça de ' + nameHtml(owner), 'casa ocupada');
    }

    placePiece(expressionText, value, cell);
  }

  /**
   * Cálculo correto, mas sem casa disponível. Na Partida consome tentativa;
   * no Treino é apenas uma constatação, sem penalidade.
   */
  function unplayable(expressionText, why, logNote) {
    var message = 'Cálculo certo — <strong>' + expressionText + '</strong> confere. Mas ' + why + '.';
    if (isPractice()) return notePractice(message, 'Procure um resultado que caia em uma casa livre.', 'warn');
    return failAttempt(message, logNote, true);
  }

  /** Observação no Treino: informa sem consumir tentativa nem encerrar turno. */
  function notePractice(message, extra, tone) {
    say(message, tone || null, extra);
    render();
  }

  function failAttempt(message, logNote, mathWasRight) {
    state.attemptsLeft--;
    var tone = mathWasRight ? 'warn' : 'bad';

    if (state.attemptsLeft > 0) {
      say(message, tone, state.attemptsLeft === 1
        ? 'Resta 1 tentativa neste turno.'
        : 'Restam ' + state.attemptsLeft + ' tentativas neste turno.');
      renderAttempts();
      if (state.answerMode === 'type') el.answer.select();
      return;
    }

    // tentativas esgotadas
    state.phase = 'turnEnd';
    freezeTimer();
    say(message, tone, 'Tentativas esgotadas: o turno passa para ' + nameOf(other(state.current)) + '.');
    el.answer.value = '';
    addLog('Dados ' + state.dice.join('·') + ' — ' + (logNote || 'sem jogada'),
           'sem peça', state.current);
    render();
  }

  function placePiece(expressionText, value, cell) {
    state.board[cell.row][cell.col] = state.current;
    state.counts[state.current]++;
    addLog(expressionText + ' = ' + value, 'casa ' + value, state.current);

    var lines = Board.winningLines(state.board, cell.row, cell.col);
    if (lines.length) {
      state.winCells = [];
      lines.forEach(function (line) {
        line.forEach(function (c) {
          if (state.winCells.indexOf(key(c.row, c.col)) === -1) state.winCells.push(key(c.row, c.col));
        });
      });
      state.phase = 'over';
      state.result = { type: 'win', player: state.current };
      stopTimer();
      say('<strong>' + expressionText + ' = ' + value + '</strong>. Sequência fechada!', 'good');
      render();
      showResult('Vitória de ' + nameOf(state.current) + '!',
        lines.length > 1
          ? 'A jogada na casa ' + value + ' fechou ' + lines.length + ' sequências ao mesmo tempo.'
          : 'Quatro peças em linha a partir da casa ' + value + '.');
      return;
    }

    if (Board.countFree(state.board) === 0) {
      state.phase = 'over';
      state.result = { type: 'draw', player: null };
      stopTimer();
      render();
      showResult('Empate', 'As ' + Board.cellCount() +
        ' casas foram preenchidas sem nenhuma sequência de quatro peças.');
      return;
    }

    say('<strong>' + expressionText + ' = ' + value + '</strong>. Peça colocada na casa ' + value + '.', 'good');
    nextTurn();
  }

  function nextTurn() {
    stopTimer();
    state.current = other(state.current);
    state.phase = 'idle';
    state.dice = null;
    state.slots = null;
    state.op1 = state.op2 = null;
    state.pick = null;
    state.reach = new Map();
    el.answer.value = '';
    renderDice(null);
    render();
  }

  function bumpCell(cell) {
    var node = el.cells[cell.row][cell.col];
    node.classList.remove('is-bump');
    void node.offsetWidth;
    node.classList.add('is-bump');
  }

  // ------------------------------------------------------------- treino

  function practiceHit(expressionText, value, cell) {
    var target = state.practice.target;
    var cellKey = key(cell.row, cell.col);

    if (target !== null && value !== target) {
      return notePractice('Cálculo certo: <strong>' + expressionText + ' = ' + value + '</strong>. ' +
        'Mas o alvo é ' + target + '.', 'Tente outras operações ou o outro agrupamento.', 'warn');
    }

    if (state.marks.has(cellKey)) {
      return notePractice('Cálculo certo: <strong>' + expressionText + ' = ' + value + '</strong>. ' +
        'Essa casa já estava conquistada.', 'Escolha outro alvo ou limpe as marcas.', 'warn');
    }

    state.practice.hits++;
    state.marks.add(cellKey);
    var suffix = target !== null ? ' Alvo alcançado!' : '';
    say('<strong>' + expressionText + ' = ' + value + '</strong>. Casa conquistada!' + suffix, 'good');
    addLog(expressionText + ' = ' + value, 'treino', null);
    if (target !== null) state.practice.target = null;
    render();
    if (state.answerMode === 'type') el.answer.select();
  }

  function drawTarget() {
    var options = Array.from(playableValues());
    if (!options.length) {
      say('Nenhuma casa livre é alcançável com esta rolagem — role os dados novamente.', 'warn');
      return;
    }
    state.practice.target = options[Math.floor(Math.random() * options.length)];
    clearSay();
    render();
  }

  function onCellClick(event) {
    if (!isPractice() || state.phase === 'over') return;
    var value = Number(event.currentTarget.dataset.value);
    state.practice.target = state.practice.target === value ? null : value;
    if (state.practice.target !== null && state.dice && !state.reach.has(value)) {
      say('A casa <strong>' + value + '</strong> não é alcançável com os dados ' +
          state.dice.join(', ') + '. Role novamente ou escolha outro alvo.', 'warn');
    } else {
      clearSay();
    }
    render();
  }

  // -------------------------------------------------- possibilidades e tabelas

  function showPossibilities() {
    if (!state.dice) return;
    var rows = [];
    state.reach.forEach(function (expr, value) { rows.push({ value: value, expr: expr }); });
    rows.sort(function (a, b) { return a.value - b.value; });

    var onBoard = rows.filter(function (row) { return Board.hasValue(row.value); });
    el['poss-summary'].innerHTML =
      'Dados <strong>' + state.dice.join(' · ') + '</strong>' +
      (state.settings.allowReorder ? ' (em qualquer ordem)' : ' (na ordem sorteada)') + ': ' +
      rows.length + ' resultados inteiros diferentes, dos quais ' + onBoard.length +
      ' correspondem a casas do tabuleiro.';

    var host = el['poss-list'];
    host.textContent = '';
    onBoard.forEach(function (row) {
      var cell = Board.cellOf(row.value);
      var taken = isPractice() ? state.marks.has(key(cell.row, cell.col))
                               : Board.occupant(state.board, cell.row, cell.col) !== null;
      var div = document.createElement('div');
      div.className = 'poss-row' + (taken ? '' : ' is-free');

      var value = document.createElement('span');
      value.className = 'poss-value';
      value.textContent = row.value;

      var expr = document.createElement('span');
      expr.className = 'poss-expr';
      expr.textContent = row.expr.text;

      var tag = document.createElement('span');
      tag.className = 'poss-tag ' + (taken ? 'poss-tag--taken' : 'poss-tag--free');
      tag.textContent = taken ? 'ocupada' : 'livre';

      div.appendChild(value);
      div.appendChild(expr);
      div.appendChild(tag);
      host.appendChild(div);
    });

    var offBoard = rows.filter(function (row) { return !Board.hasValue(row.value); });
    if (offBoard.length) {
      var note = document.createElement('div');
      note.className = 'poss-row';
      var label = document.createElement('span');
      label.className = 'poss-value';
      label.textContent = '—';
      var text = document.createElement('span');
      text.className = 'poss-expr';
      text.textContent = 'Fora do tabuleiro: ' +
        offBoard.map(function (row) { return formatInt(row.value); }).join(', ');
      var tag = document.createElement('span');
      tag.className = 'poss-tag poss-tag--off';
      tag.textContent = offBoard.length + ' valores';
      note.appendChild(label);
      note.appendChild(text);
      note.appendChild(tag);
      host.appendChild(note);
    }

    openDialog('possibilities');
  }

  function fillFrequencyTables() {
    var survey = Engine.survey();
    el['freq-summary'].innerHTML =
      survey.total + ' configurações sintáticas enumeradas; ' +
      survey.defined + ' matematicamente definidas; ' +
      survey.withinLimit + ' dentro da escala considerada; ' +
      survey.integerResults + ' com resultado inteiro.<br>' +
      'Valores inteiros distintos alcançáveis: ' + survey.distinctPositive + ' positivos, ' +
      survey.distinctNegative + ' negativos, ' + survey.distinctInRange + ' positivos no intervalo [1, 100].';

    function fill(table, rows) {
      table.textContent = '';
      var head = table.insertRow();
      ['Valor', 'Freq.'].forEach(function (title) {
        var th = document.createElement('th');
        th.textContent = title;
        head.appendChild(th);
      });
      rows.forEach(function (row) {
        var tr = table.insertRow();
        tr.insertCell().textContent = row.value;
        tr.insertCell().textContent = formatInt(row.freq);
      });
    }

    fill(el['freq-positive'], Engine.rankedFrequencies(function (v) { return v > 0; }).slice(0, 12));
    fill(el['freq-negative'], Engine.rankedFrequencies(function (v) { return v < 0; }).slice(0, 12));
  }

  function showResult(title, detail) {
    el['result-kicker'].textContent = state.mode === 'match' ? 'Fim de partida' : 'Fim';
    el['result-title'].textContent = title;
    el['result-detail'].textContent = detail;
    openDialog('result');
  }

  function anyDialogOpen() {
    return Object.keys(el.dialogs).some(function (name) { return el.dialogs[name].open; });
  }

  function openDialog(name) {
    pauseTimer();
    el.dialogs[name].showModal();
  }

  // ---------------------------------------------------------------- ajustes

  function loadSettings() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) {
        if (saved.attempts) state.settings.attempts = clampAttempts(saved.attempts);
        if (saved.boardSize) state.settings.boardSize = Board.clampSize(saved.boardSize);
        if (typeof saved.turnSeconds === 'number') state.settings.turnSeconds = clampSeconds(saved.turnSeconds);
        if (typeof saved.allowReorder === 'boolean') state.settings.allowReorder = saved.allowReorder;
        if (typeof saved.highlightInMatch === 'boolean') state.settings.highlightInMatch = saved.highlightInMatch;
        if (saved.theme) state.settings.theme = Theme.normalize(saved.theme);
        if (saved.names) {
          state.settings.names[1] = saved.names[1] || state.settings.names[1];
          state.settings.names[2] = saved.names[2] || state.settings.names[2];
        }
      }
    } catch (error) { /* ajustes corrompidos: seguem os padrões */ }

    Board.setSize(state.settings.boardSize);
    state.settings.boardSize = Board.SIZE;
    state.board = Board.createState();

    el['set-attempts'].value = state.settings.attempts;
    el['set-board-size'].value = String(state.settings.boardSize);
    el['set-timer'].value = state.settings.turnSeconds;
    el['set-reorder'].checked = state.settings.allowReorder;
    // theme.js já aplicou a preferência guardada; aqui o estado e o seletor
    // passam a concordar com ela mesmo que o armazenamento esteja indisponível.
    el['set-theme'].value = Theme.apply(state.settings.theme);
    el['set-highlight'].checked = state.settings.highlightInMatch;
    el['set-name-1'].value = state.settings.names[1] === 'Jogador 1' ? '' : state.settings.names[1];
    el['set-name-2'].value = state.settings.names[2] === 'Jogador 2' ? '' : state.settings.names[2];
    state.attemptsLeft = state.settings.attempts;
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); }
    catch (error) { /* armazenamento indisponível: ajustes valem só nesta sessão */ }
  }

  /*
   * Os dois ajustes numéricos são listas fechadas: 1 a 3 tentativas e 30, 60
   * ou 90 segundos. Um valor guardado por uma versão anterior (ou digitado à
   * mão no armazenamento) cai na opção válida mais próxima.
   */
  var ATTEMPT_OPTIONS = [1, 2, 3];
  var SECOND_OPTIONS = [30, 60, 90];

  function nearest(options, value, fallback) {
    var n = Number(value);
    if (!isFinite(n)) return fallback;
    return options.reduce(function (best, option) {
      return Math.abs(option - n) < Math.abs(best - n) ? option : best;
    });
  }

  function clampAttempts(value) { return nearest(ATTEMPT_OPTIONS, value, 3); }
  function clampSeconds(value) { return nearest(SECOND_OPTIONS, value, 90); }

  function onSettingsChange() {
    var attempts = clampAttempts(el['set-attempts'].value);
    el['set-attempts'].value = attempts;
    var seconds = clampSeconds(el['set-timer'].value);
    var size = Board.clampSize(el['set-board-size'].value);
    var reorderChanged = state.settings.allowReorder !== el['set-reorder'].checked;
    var secondsChanged = state.settings.turnSeconds !== seconds;
    var sizeChanged = state.settings.boardSize !== size;

    state.settings.attempts = attempts;
    state.settings.turnSeconds = seconds;
    state.settings.boardSize = size;
    state.settings.allowReorder = el['set-reorder'].checked;
    state.settings.highlightInMatch = el['set-highlight'].checked;
    state.settings.names[1] = el['set-name-1'].value.trim() || 'Jogador 1';
    state.settings.names[2] = el['set-name-2'].value.trim() || 'Jogador 2';
    state.settings.theme = Theme.apply(el['set-theme'].value);
    saveSettings();

    // Trocar o tamanho muda a geometria: o tabuleiro é remontado e a partida
    // recomeça, já que as peças em jogo não têm equivalente no novo recorte.
    if (sizeChanged) {
      Board.setSize(size);
      buildBoard();
      resetGame();
      say('Tabuleiro trocado para <strong>' + size + ' × ' + size + '</strong>. Nova partida.', null);
      return;
    }

    if (state.phase !== 'building') state.attemptsLeft = attempts;
    else state.attemptsLeft = Math.min(state.attemptsLeft, attempts);

    if (reorderChanged && state.dice) {
      state.slots = state.dice.slice();
      state.pick = null;
      state.reach = Engine.reachableIntegers(state.dice, state.settings.allowReorder);
    }

    // O novo limite de tempo vale já para o turno em curso.
    if (secondsChanged && state.phase === 'building') startTimer();

    render();
  }

  // ------------------------------------------------------------ ciclo de vida

  function resetGame() {
    stopTimer();
    state.board = Board.createState();
    state.current = 1;
    state.counts = { 1: 0, 2: 0 };
    state.dice = null;
    state.slots = null;
    state.pick = null;
    state.op1 = state.op2 = null;
    state.grouping = GROUPING.LEFT;
    state.attemptsLeft = state.settings.attempts;
    state.reach = new Map();
    state.winCells = [];
    state.result = null;
    state.log = [];
    state.marks = new Set();
    state.practice = { hits: 0, misses: 0, target: null };
    state.phase = 'idle';
    el.answer.value = '';
    clearSay();
    renderDice(null);
    render();
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    stopTimer();
    state.mode = mode;
    // Uma partida já encerrada continua encerrada ao voltar do Treino.
    state.phase = (!isPractice() && state.result) ? 'over' : 'idle';
    state.dice = null;
    state.slots = null;
    state.pick = null;
    state.op1 = state.op2 = null;
    state.reach = new Map();
    state.practice.target = null;
    el.answer.value = '';
    renderDice(null);
    clearSay();

    document.querySelectorAll('.mode-btn').forEach(function (btn) {
      var active = btn.dataset.mode === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    render();
  }

  function copyLog() {
    var lines = state.log.map(function (entry, index) {
      var who = entry.player ? nameOf(entry.player) + ': ' : '';
      return (index + 1) + '. ' + who + entry.text + (entry.note ? ' (' + entry.note + ')' : '');
    });
    var text = 'Conecta com Expressões — registro das jogadas\n' + (lines.join('\n') || 'sem jogadas');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        el['btn-copy-log'].textContent = 'Copiado!';
        setTimeout(function () { el['btn-copy-log'].textContent = 'Copiar'; }, 1600);
      });
    } else {
      window.prompt('Copie o registro:', text);
    }
  }

  function wireEvents() {
    el['btn-roll'].addEventListener('click', rollDice);
    el['answer-form'].addEventListener('submit', onSubmit);
    el['answer-select'].addEventListener('change', onAnswerSelect);
    el['btn-pass'].addEventListener('click', nextTurn);
    el['btn-reveal'].addEventListener('click', showPossibilities);
    el['btn-possibilities'].addEventListener('click', showPossibilities);
    el['btn-target'].addEventListener('click', drawTarget);
    el['btn-clear-marks'].addEventListener('click', function () {
      state.marks = new Set();
      render();
    });
    el['btn-copy-log'].addEventListener('click', copyLog);
    el['btn-restart'].addEventListener('click', function () {
      resetGame();
      el.dialogs.settings.close();
    });
    el['btn-result-close'].addEventListener('click', function () { el.dialogs.result.close(); });
    el['btn-result-restart'].addEventListener('click', function () {
      el.dialogs.result.close();
      resetGame();
    });

    el.groupingInputs.forEach(function (input) {
      input.addEventListener('change', function () { chooseGrouping(input.value); });
    });

    document.querySelectorAll('.mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { setMode(btn.dataset.mode); });
    });

    document.querySelectorAll('[data-dialog]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.dataset.dialog;
        if (name === 'frequencies') fillFrequencyTables();
        openDialog(name);
      });
    });

    // Enquanto um modal está aberto o cronômetro pausa: consultar as regras não
    // deve consumir o turno.
    Object.keys(el.dialogs).forEach(function (name) {
      el.dialogs[name].addEventListener('close', function () {
        if (!anyDialogOpen()) resumeTimer();
      });
    });

    ['set-attempts', 'set-reorder', 'set-highlight', 'set-name-1', 'set-name-2'].forEach(function (id) {
      el[id].addEventListener('change', onSettingsChange);
      el[id].addEventListener('input', onSettingsChange);
    });
    el['btn-theme'].addEventListener('click', toggleTheme);
    // Enquanto o tema for o automático, mudar o do sistema muda o da página.
    window.addEventListener('themechange', renderTheme);

    // Tamanho e tempo valem ao confirmar, não a cada tecla digitada.
    ['set-board-size', 'set-timer', 'set-theme'].forEach(function (id) {
      el[id].addEventListener('change', onSettingsChange);
    });

    // atalhos: 1–5 escolhem a operação em foco no campo de resposta
    document.addEventListener('keydown', function (event) {
      if (event.key === 'r' && event.target === document.body && !el['btn-roll'].disabled) rollDice();
    });

    window.addEventListener('resize', scheduleFit);
  }

  function init() {
    cacheElements();
    loadSettings();       // define o tamanho do tabuleiro antes de montá-lo
    buildBoard();
    buildOpButtons();
    renderDice(null);
    wireEvents();
    setModeInitial();
    render();
    fitToViewport();      // sem esperar o quadro: a primeira pintura já cabe
    watchPanelSize();
  }

  function setModeInitial() {
    document.body.dataset.mode = state.mode;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
