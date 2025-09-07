(() => {
  // Basic constants
  const BLUE = 'blue';
  const GREEN = 'green';

  // Modes (match gen.py geometry)
  const MODES = {
    m32: { name: '32点盤', rings: 4, dists: [720,540,360,180].map(d=>d/2048), piecesPerSide: 12, boardImage: 'images/board32.png' },
    m9:  { name: "Nine Men's", rings: 3, dists: [720,540,360].map(d=>d/2048), piecesPerSide: 9, boardImage: 'images/board24.png' },
  };

  // DOM
  const $ = (sel, root = document) => root.querySelector(sel);
  const byId = (id) => document.getElementById(id);
  const elBoard = byId('board');
  const elStatus = byId('status');
  const elBlueOn = byId('blue-onboard');
  const elGreenOn = byId('green-onboard');
  const elBlueHand = byId('blue-hand');
  const elGreenHand = byId('green-hand');
  const elRestart = byId('restart');
  const elStarter = byId('starter');
  const elMode = byId('mode');

  // Images
  const IMG = { [BLUE]: 'images/blue.png', [GREEN]: 'images/green.png' };

  // Mutable game/global state
  let currentMode = MODES.m32;
  let NODES = currentMode.rings * 8;
  let positions = [];
  let adj = [];
  let millTriples = [];
  let nodes = [];
  let isGameOverCache = false;

  const state = {
    board: Array(NODES).fill(null),
    current: BLUE,
    phase: 'placing', // 'placing' | 'moving' | 'removing'
    inHand: { [BLUE]: currentMode.piecesPerSide, [GREEN]: currentMode.piecesPerSide },
    onBoard: { [BLUE]: 0, [GREEN]: 0 },
    selected: null,
    historyCount: new Map(), // for threefold draw in moving phase
  };

  // Geometry builders (gen.py order: [NW, NE, SE, SW, N, E, S, W])
  function buildPositions(dists) {
    const pos = [];
    for (let s = 0; s < dists.length; s++) {
      const d = dists[s];
      const cx = 0.5, cy = 0.5;
      const NW = { x: cx - d, y: cy - d };
      const NE = { x: cx + d, y: cy - d };
      const SE = { x: cx + d, y: cy + d };
      const SW = { x: cx - d, y: cy + d };
      const N  = { x: cx,     y: cy - d };
      const E  = { x: cx + d, y: cy     };
      const S  = { x: cx,     y: cy + d };
      const W  = { x: cx - d, y: cy     };
      pos.push(NW, NE, SE, SW, N, E, S, W);
    }
    return pos;
  }

  function connect(g, a, b) {
    if (!g[a].includes(b)) g[a].push(b);
    if (!g[b].includes(a)) g[b].push(a);
  }

  function buildAdjacency(rings) {
    const g = Array.from({ length: rings * 8 }, () => []);
    // Ring edges: [NW(0), N(4), NE(1), E(5), SE(2), S(6), SW(3), W(7)]
    for (let s = 0; s < rings; s++) {
      const base = s * 8;
      const order = [0, 4, 1, 5, 2, 6, 3, 7];
      for (let i = 0; i < order.length; i++) {
        const a = base + order[i];
        const b = base + order[(i + 1) % order.length];
        connect(g, a, b);
      }
    }
    // Radial connectors along N,E,S,W (indices 4,5,6,7)
    const mids = [4, 5, 6, 7];
    for (const m of mids) {
      for (let s = 0; s < rings - 1; s++) {
        const a = s * 8 + m;
        const b = (s + 1) * 8 + m;
        connect(g, a, b);
      }
    }
    return g;
  }

  function buildMillTriples(rings) {
    const triples = [];
    for (let s = 0; s < rings; s++) {
      const o = s * 8;
      triples.push([o + 0, o + 4, o + 1]); // top
      triples.push([o + 1, o + 5, o + 2]); // right
      triples.push([o + 2, o + 6, o + 3]); // bottom
      triples.push([o + 3, o + 7, o + 0]); // left
    }
    // Radial: windows of 3 rings
    const mids = [4, 5, 6, 7];
    for (const m of mids) {
      const col = Array.from({ length: rings }, (_, s) => s * 8 + m);
      for (let i = 0; i + 2 < col.length; i++) {
        triples.push([col[i], col[i + 1], col[i + 2]]);
      }
    }
    return triples;
  }

  // Board DOM
  function createPoint(p, idx) {
    const el = document.createElement('div');
    el.className = 'pt empty';
    el.style.left = `${p.x * 100}%`;
    el.style.top = `${p.y * 100}%`;
    el.setAttribute('data-idx', String(idx));
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `交点${idx}`);
    el.addEventListener('click', onPointClick);
    return el;
  }

  function applyMode(modeObj) {
    currentMode = modeObj;
    NODES = currentMode.rings * 8;
    // Background
    elBoard.style.backgroundImage = `url('${currentMode.boardImage}')`;
    // Geometry
    positions = buildPositions(currentMode.dists);
    adj = buildAdjacency(currentMode.rings);
    millTriples = buildMillTriples(currentMode.rings);
    // Rebuild nodes
    elBoard.innerHTML = '';
    nodes = positions.map((p, i) => createPoint(p, i));
    nodes.forEach((n) => elBoard.appendChild(n));
  }

  // Rendering
  function render() {
    for (let i = 0; i < NODES; i++) {
      const el = nodes[i];
      el.classList.remove('selected', 'valid', 'selectable', 'enemy-removable');
      const occ = state.board[i];
      el.innerHTML = '';
      if (occ) {
        const img = document.createElement('img');
        img.className = 'piece';
        img.alt = occ === BLUE ? '青の駒' : '緑の駒';
        img.src = IMG[occ];
        el.appendChild(img);
        el.classList.remove('empty');
      } else {
        el.classList.add('empty');
      }
    }

    if (state.phase === 'moving') {
      for (let i = 0; i < NODES; i++) if (state.board[i] === state.current) nodes[i].classList.add('selectable');
    }

    if (state.selected != null) {
      const from = state.selected;
      nodes[from].classList.add('selected');
      for (const to of legalDestinations(from, state.current)) nodes[to].classList.add('valid');
    }

    if (state.phase === 'removing') {
      for (const i of removableEnemies(opponentOf(state.current))) nodes[i].classList.add('enemy-removable');
    }

    elBlueOn.textContent = String(state.onBoard[BLUE]);
    elGreenOn.textContent = String(state.onBoard[GREEN]);
    elBlueHand.textContent = String(state.inHand[BLUE]);
    elGreenHand.textContent = String(state.inHand[GREEN]);
    const jpPhase = state.phase === 'placing' ? '配置' : state.phase === 'moving' ? '移動' : '除去';
    const turnColor = state.current === BLUE ? '青' : '緑';
    elStatus.textContent = `${turnColor}の手番（${jpPhase}）`;
  }

  // Game logic
  function onPointClick(e) {
    const idx = Number(e.currentTarget.getAttribute('data-idx'));
    if (Number.isNaN(idx) || isGameOverCache) return;
    if (state.phase === 'placing') return handlePlacing(idx);
    if (state.phase === 'moving') return handleMoving(idx);
    if (state.phase === 'removing') return handleRemoving(idx);
  }

  function handlePlacing(idx) {
    if (state.board[idx] != null) return;
    if (state.inHand[state.current] <= 0) return;
    placeAt(idx, state.current);

    if (formsMillAt(idx, state.current)) {
      state.phase = 'removing';
      render();
      return;
    }

    if (state.inHand[BLUE] === 0 && state.inHand[GREEN] === 0) {
      state.phase = 'moving';
      if (checkGameOver()) return; // evaluate only in moving phase
    }
    switchTurn();
  }

  function handleMoving(idx) {
    const occ = state.board[idx];
    if (state.selected == null) {
      if (occ === state.current) {
        state.selected = idx;
        render();
      }
      return;
    }
    if (idx === state.selected) {
      state.selected = null; render(); return;
    }
    if (state.board[idx] == null && legalDestinations(state.selected, state.current).includes(idx)) {
      movePiece(state.selected, idx);
      state.selected = null;
      if (formsMillAt(idx, state.current)) { state.phase = 'removing'; render(); return; }
      if (checkGameOver()) return;
      switchTurn();
      return;
    }
    if (occ === state.current) { state.selected = idx; render(); }
  }

  function handleRemoving(idx) {
    const enemy = opponentOf(state.current);
    if (state.board[idx] !== enemy) return;
    const removable = new Set(removableEnemies(enemy));
    if (!removable.has(idx)) return;
    removeAt(idx);
    if (checkGameOver()) return;
    if (state.inHand[BLUE] === 0 && state.inHand[GREEN] === 0) {
      state.phase = 'moving';
      if (checkGameOver()) return;
    } else {
      state.phase = 'placing';
    }
    switchTurn();
  }

  function placeAt(idx, color) {
    state.board[idx] = color;
    state.inHand[color]--; state.onBoard[color]++;
    pushPositionHistory();
    render();
  }
  function movePiece(from, to) {
    const color = state.board[from];
    state.board[from] = null; state.board[to] = color;
    pushPositionHistory();
    render();
  }
  function removeAt(idx) {
    const color = state.board[idx]; if (!color) return;
    state.board[idx] = null; state.onBoard[color]--;
    pushPositionHistory();
    render();
  }

  function legalDestinations(from, color) {
    if (state.onBoard[color] === 3) {
      const moves = []; for (let i = 0; i < NODES; i++) if (state.board[i] == null) moves.push(i); return moves;
    }
    return adj[from].filter((i) => state.board[i] == null);
  }

  function formsMillAt(idx, color) {
    for (const t of millTriples) {
      if (!t.includes(idx)) continue;
      if (t.every(i => state.board[i] === color)) return true;
    }
    return false;
  }
  function indexPartOfAnyMill(idx, color) {
    for (const t of millTriples) {
      if (!t.includes(idx)) continue;
      if (t.every(i => state.board[i] === color)) return true;
    }
    return false;
  }
  function removableEnemies(color) {
    const all = [], outside = [];
    for (let i = 0; i < NODES; i++) if (state.board[i] === color) { all.push(i); if (!indexPartOfAnyMill(i, color)) outside.push(i); }
    return outside.length ? outside : all;
  }
  function opponentOf(c) { return c === BLUE ? GREEN : BLUE; }

  function hasAnyLegalMove(color) {
    const empties = state.board.filter(v => v == null).length; if (empties === 0) return false;
    if (state.onBoard[color] === 3) return empties > 0;
    for (let i = 0; i < NODES; i++) if (state.board[i] === color && adj[i].some(j => state.board[j] == null)) return true;
    return false;
  }

  function pushPositionHistory() {
    if (state.phase !== 'moving') return;
    const key = positionKey();
    state.historyCount.set(key, (state.historyCount.get(key) || 0) + 1);
  }
  function positionKey() {
    return `${state.board.map(v => v===BLUE?'b':v===GREEN?'g':'.').join('')}:${state.current}:${state.onBoard[BLUE]}:${state.onBoard[GREEN]}:${state.phase}`;
  }

  function checkGameOver() {
    if (state.phase === 'moving') {
      const opp = opponentOf(state.current);
      if (state.onBoard[opp] <= 2) { finish(`${colorJp(state.current)}の勝ち（相手の駒が2枚以下）`); return true; }
      if (!hasAnyLegalMove(opp)) { finish(`${colorJp(state.current)}の勝ち（相手が手詰まり）`); return true; }
      const key = positionKey(); const c = state.historyCount.get(key) || 0; if (c >= 3) { finish('引き分け（三fold）'); return true; }
    }
    return false;
  }

  function finish(message) { isGameOverCache = true; elStatus.textContent = message; }
  function colorJp(c) { return c === BLUE ? '青' : '緑'; }
  function switchTurn() { state.current = opponentOf(state.current); render(); }

  function resetGame(options = {}) {
    const starter = options.starter || state.current || BLUE;
    if (options.mode && options.mode !== currentMode) applyMode(options.mode);
    state.board = Array(NODES).fill(null);
    state.current = starter;
    state.phase = 'placing';
    state.inHand[BLUE] = currentMode.piecesPerSide;
    state.inHand[GREEN] = currentMode.piecesPerSide;
    state.onBoard[BLUE] = 0;
    state.onBoard[GREEN] = 0;
    state.selected = null;
    state.historyCount.clear();
    isGameOverCache = false;
    render();
  }

  // Events
  elRestart.addEventListener('click', () => { resetGame({ starter: elStarter.value }); });
  elStarter.addEventListener('change', () => {
    if (confirm('先手設定を変更しますか？（現在の対局はリセットされます）')) resetGame({ starter: elStarter.value });
    else elStarter.value = state.current;
  });
  elMode.addEventListener('change', () => {
    const target = MODES[elMode.value] || MODES.m32;
    if (confirm('ルールを変更します。現在の対局はリセットされます。')) resetGame({ starter: elStarter.value, mode: target });
    else elMode.value = currentMode === MODES.m32 ? 'm32' : 'm9';
  });

  // Init
  (function init() {
    elMode.value = 'm32';
    elStarter.value = BLUE;
    applyMode(MODES.m32);
    resetGame({ starter: BLUE });
  })();
})();

