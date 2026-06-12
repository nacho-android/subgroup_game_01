(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const splash = document.getElementById("splash");
  const result = document.getElementById("result");
  const startButton = document.getElementById("startButton");
  const restartButton = document.getElementById("restartButton");
  const soundButton = document.getElementById("soundButton");
  const resultEyebrow = document.getElementById("resultEyebrow");
  const resultTitle = document.getElementById("resultTitle");
  const resultCopy = document.getElementById("resultCopy");
  const finalScore = document.getElementById("finalScore");
  const finalStreak = document.getElementById("finalStreak");

  const BOARD = 7;
  const TYPES = 6;
  const TILE_SRC = 192;
  const TIME_LIMIT = 300;
  const ASSET_PATHS = {
    background: "assets/lab-background.png",
    sprites: "assets/sprites.png"
  };

  const TILE_NAMES = [
    "Myocytes",
    "Mitochondria",
    "Nuclei",
    "Hearts",
    "Pulse",
    "Molecules"
  ];

  const TILE_COLORS = ["#ff5b72", "#75ff46", "#aa54ff", "#ff4f8c", "#48d7ff", "#ffd64a"];

  const state = {
    mode: "loading",
    board: [],
    selected: null,
    pointer: null,
    score: 0,
    bestChain: 0,
    lastChain: 0,
    objectives: [],
    startAt: 0,
    timerDone: false,
    busy: false,
    shake: 0,
    lastTickSecond: null,
    particles: [],
    texts: [],
    layout: {},
    dpr: 1,
    width: 0,
    height: 0
  };

  const images = {};
  let audio;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function ease(current, target, amount) {
    return current + (target - current) * amount;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = Math.max(1, rect.width);
    state.height = Math.max(1, rect.height);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    computeLayout();
    syncTargets(true);
  }

  function computeLayout() {
    const w = state.width;
    const h = state.height;
    const safeTop = Math.max(16, Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sat")) || 16);
    const hudH = clamp(h * 0.14, 92, 124);
    const bottomH = clamp(h * 0.2, 158, 184);
    const boardSize = Math.floor(Math.min(w - 22, h - hudH - bottomH - 22));
    const boardX = Math.floor((w - boardSize) / 2);
    const boardY = Math.floor(hudH + 8);
    const cell = boardSize / BOARD;
    state.layout = {
      safeTop,
      hudH,
      boardX,
      boardY,
      boardSize,
      cell,
      bottomY: boardY + boardSize + 12
    };
  }

  function tileTarget(tile) {
    const { boardX, boardY, cell } = state.layout;
    return {
      x: boardX + tile.col * cell,
      y: boardY + tile.row * cell
    };
  }

  function syncTargets(snap = false) {
    forEachTile((tile) => {
      const target = tileTarget(tile);
      tile.tx = target.x;
      tile.ty = target.y;
      if (snap || !Number.isFinite(tile.x)) {
        tile.x = target.x;
        tile.y = target.y;
      }
    });
  }

  function makeTile(type, row, col, spawnOffset = 0) {
    const { boardX, boardY, cell } = state.layout;
    const x = boardX + col * cell;
    const y = boardY + (row - spawnOffset) * cell;
    return {
      id: cryptoRandomId(),
      type,
      row,
      col,
      x,
      y,
      tx: x,
      ty: boardY + row * cell,
      scale: 1,
      alpha: 1,
      born: performance.now()
    };
  }

  function cryptoRandomId() {
    if (window.crypto?.getRandomValues) {
      const values = new Uint32Array(2);
      window.crypto.getRandomValues(values);
      return `${values[0].toString(16)}${values[1].toString(16)}`;
    }
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  }

  function forEachTile(callback) {
    for (let r = 0; r < BOARD; r += 1) {
      for (let c = 0; c < BOARD; c += 1) {
        const tile = state.board[r]?.[c];
        if (tile) callback(tile, r, c);
      }
    }
  }

  function randomType(except = -1) {
    let type = Math.floor(Math.random() * TYPES);
    if (type === except) type = (type + 1 + Math.floor(Math.random() * (TYPES - 1))) % TYPES;
    return type;
  }

  function resetObjectives() {
    state.objectives = [
      { type: 0, label: "Regrow myocytes", need: 18, have: 0 },
      { type: 1, label: "Power mitochondria", need: 16, have: 0 },
      { type: 3, label: "Bank heart signals", need: 14, have: 0 }
    ];
  }

  function startGame() {
    result.classList.remove("is-active");
    result.setAttribute("aria-hidden", "true");
    splash.classList.remove("is-active");
    audio.unlock();
    audio.startMusic();
    state.mode = "playing";
    state.score = 0;
    state.bestChain = 0;
    state.lastChain = 0;
    state.timerDone = false;
    state.busy = false;
    state.shake = 0;
    state.selected = null;
    state.particles = [];
    state.texts = [];
    state.lastTickSecond = null;
    resetObjectives();
    fillFreshBoard();
    state.startAt = performance.now();
    audio.start();
    popText("5-minute lab meeting begins", state.width / 2, state.layout.boardY - 12, "#ffd844");
  }

  function fillFreshBoard() {
    state.board = Array.from({ length: BOARD }, () => Array(BOARD).fill(null));
    for (let r = 0; r < BOARD; r += 1) {
      for (let c = 0; c < BOARD; c += 1) {
        let type = randomType();
        let guard = 0;
        while (wouldMakeMatch(r, c, type) && guard < 20) {
          type = randomType(type);
          guard += 1;
        }
        state.board[r][c] = makeTile(type, r, c, 0);
      }
    }
    syncTargets(true);
    if (!hasPossibleMove()) shuffleBoard();
  }

  function wouldMakeMatch(row, col, type) {
    const rowTiles = state.board[row];
    if (col >= 2 && rowTiles[col - 1]?.type === type && rowTiles[col - 2]?.type === type) return true;
    if (row >= 2 && state.board[row - 1]?.[col]?.type === type && state.board[row - 2]?.[col]?.type === type) return true;
    return false;
  }

  function elapsedSeconds(now = performance.now()) {
    if (state.mode !== "playing" && state.mode !== "ended") return 0;
    return Math.max(0, (now - state.startAt) / 1000);
  }

  function timeRemaining(now = performance.now()) {
    return Math.max(0, TIME_LIMIT - elapsedSeconds(now));
  }

  function onPointerDown(event) {
    if (state.mode !== "playing" || state.busy) return;
    const point = pointerPoint(event);
    const cell = hitCell(point.x, point.y);
    if (!cell) return;
    state.pointer = { start: point, cell };
    canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerUp(event) {
    if (state.mode !== "playing" || state.busy || !state.pointer) return;
    const start = state.pointer;
    const point = pointerPoint(event);
    state.pointer = null;
    const dx = point.x - start.start.x;
    const dy = point.y - start.start.y;
    const threshold = state.layout.cell * 0.28;
    if (Math.hypot(dx, dy) > threshold) {
      const dir = Math.abs(dx) > Math.abs(dy)
        ? { r: 0, c: dx > 0 ? 1 : -1 }
        : { r: dy > 0 ? 1 : -1, c: 0 };
      const target = { r: start.cell.r + dir.r, c: start.cell.c + dir.c };
      if (isInside(target.r, target.c)) trySwap(start.cell, target);
      return;
    }
    handleTap(start.cell);
  }

  function pointerPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function hitCell(x, y) {
    const { boardX, boardY, boardSize, cell } = state.layout;
    if (x < boardX || y < boardY || x > boardX + boardSize || y > boardY + boardSize) return null;
    return {
      r: clamp(Math.floor((y - boardY) / cell), 0, BOARD - 1),
      c: clamp(Math.floor((x - boardX) / cell), 0, BOARD - 1)
    };
  }

  function isInside(row, col) {
    return row >= 0 && col >= 0 && row < BOARD && col < BOARD;
  }

  function handleTap(cell) {
    if (!state.selected) {
      state.selected = cell;
      audio.select();
      return;
    }
    if (state.selected.r === cell.r && state.selected.c === cell.c) {
      state.selected = null;
      return;
    }
    if (areAdjacent(state.selected, cell)) {
      trySwap(state.selected, cell);
    } else {
      state.selected = cell;
      audio.select();
    }
  }

  function areAdjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  async function trySwap(a, b) {
    if (state.busy || !isInside(a.r, a.c) || !isInside(b.r, b.c)) return;
    state.busy = true;
    state.selected = null;
    swapCells(a, b);
    audio.swap();
    await sleep(170);

    const matches = findMatches();
    if (!matches.length) {
      state.shake = 10;
      audio.bad();
      swapCells(a, b);
      await sleep(180);
      state.busy = false;
      return;
    }

    await resolveMatches(matches);
    if (objectivesDone()) endGame(true);
    state.busy = false;
  }

  function swapCells(a, b) {
    const tileA = state.board[a.r][a.c];
    const tileB = state.board[b.r][b.c];
    state.board[a.r][a.c] = tileB;
    state.board[b.r][b.c] = tileA;
    if (tileA) {
      tileA.row = b.r;
      tileA.col = b.c;
    }
    if (tileB) {
      tileB.row = a.r;
      tileB.col = a.c;
    }
    syncTargets();
  }

  async function resolveMatches(initialMatches = null) {
    let chain = 0;
    let matches = initialMatches;
    while (matches?.length || (matches = findMatches()).length) {
      chain += 1;
      state.lastChain = chain;
      state.bestChain = Math.max(state.bestChain, chain);

      const marked = markMatches(matches);
      const count = marked.size;
      const bonus = matches.some((group) => group.length >= 4);
      state.score += count * 80 * chain + matches.length * 140 + (bonus ? 650 : 0);

      collectObjectives(marked);
      burstMarkedTiles(marked, chain, bonus);
      audio.match(chain, count, bonus);
      await sleep(bonus ? 230 : 160);

      removeMarked(marked);
      collapseBoard();
      await sleep(Math.min(420, 230 + chain * 60));
      matches = findMatches();
    }

    state.lastChain = 0;
    if (!hasPossibleMove() && state.mode === "playing") {
      popText("Fresh culture plate", state.width / 2, state.layout.boardY + state.layout.boardSize / 2, "#58d7ff");
      shuffleBoard();
      audio.power();
    }
  }

  function markMatches(matches) {
    const marked = new Map();
    const add = (r, c) => {
      if (isInside(r, c) && state.board[r][c]) marked.set(`${r},${c}`, { r, c, type: state.board[r][c].type });
    };

    for (const group of matches) {
      for (const item of group) add(item.r, item.c);
      if (group.length >= 4) {
        const center = group[Math.floor(group.length / 2)];
        for (let rr = center.r - 1; rr <= center.r + 1; rr += 1) {
          for (let cc = center.c - 1; cc <= center.c + 1; cc += 1) add(rr, cc);
        }
        if (group.length >= 5) {
          for (let i = 0; i < BOARD; i += 1) {
            add(center.r, i);
            add(i, center.c);
          }
        }
      }
    }
    return marked;
  }

  function collectObjectives(marked) {
    const counts = new Map();
    for (const item of marked.values()) counts.set(item.type, (counts.get(item.type) || 0) + 1);
    for (const objective of state.objectives) {
      objective.have += counts.get(objective.type) || 0;
    }
  }

  function burstMarkedTiles(marked, chain, bonus) {
    for (const item of marked.values()) {
      const tile = state.board[item.r][item.c];
      if (!tile) continue;
      const center = tileCenter(tile);
      tile.scale = bonus ? 1.3 : 1.18;
      tile.alpha = 0.25;
      addParticles(center.x, center.y, tile.type, bonus ? 12 : 7);
    }
    const text = bonus ? "Defib Burst!" : chain > 1 ? `Cascade x${chain}` : "Match!";
    const y = state.layout.boardY + state.layout.boardSize * 0.42;
    popText(text, state.width / 2, y, bonus ? "#ffd844" : "#ffffff");
    if (bonus) state.shake = 16;
  }

  function removeMarked(marked) {
    for (const item of marked.values()) {
      state.board[item.r][item.c] = null;
    }
  }

  function collapseBoard() {
    for (let c = 0; c < BOARD; c += 1) {
      let write = BOARD - 1;
      for (let r = BOARD - 1; r >= 0; r -= 1) {
        const tile = state.board[r][c];
        if (!tile) continue;
        if (write !== r) {
          state.board[write][c] = tile;
          state.board[r][c] = null;
          tile.row = write;
          tile.col = c;
        }
        write -= 1;
      }

      let spawn = 1;
      for (let r = write; r >= 0; r -= 1) {
        const tile = makeTile(randomType(), r, c, spawn + 2);
        state.board[r][c] = tile;
        spawn += 1;
      }
    }
    syncTargets();
  }

  function findMatches() {
    const groups = [];

    for (let r = 0; r < BOARD; r += 1) {
      let start = 0;
      for (let c = 1; c <= BOARD; c += 1) {
        const prev = state.board[r][c - 1]?.type;
        const next = c < BOARD ? state.board[r][c]?.type : null;
        if (next !== prev) {
          const len = c - start;
          if (prev !== null && prev !== undefined && len >= 3) {
            groups.push(Array.from({ length: len }, (_, i) => ({ r, c: start + i, type: prev })));
          }
          start = c;
        }
      }
    }

    for (let c = 0; c < BOARD; c += 1) {
      let start = 0;
      for (let r = 1; r <= BOARD; r += 1) {
        const prev = state.board[r - 1][c]?.type;
        const next = r < BOARD ? state.board[r][c]?.type : null;
        if (next !== prev) {
          const len = r - start;
          if (prev !== null && prev !== undefined && len >= 3) {
            groups.push(Array.from({ length: len }, (_, i) => ({ r: start + i, c, type: prev })));
          }
          start = r;
        }
      }
    }

    return groups;
  }

  function hasPossibleMove() {
    for (let r = 0; r < BOARD; r += 1) {
      for (let c = 0; c < BOARD; c += 1) {
        if (c + 1 < BOARD && createsMatchAfterSwap(r, c, r, c + 1)) return true;
        if (r + 1 < BOARD && createsMatchAfterSwap(r, c, r + 1, c)) return true;
      }
    }
    return false;
  }

  function createsMatchAfterSwap(r1, c1, r2, c2) {
    const a = state.board[r1][c1];
    const b = state.board[r2][c2];
    if (!a || !b || a.type === b.type) return false;
    state.board[r1][c1] = b;
    state.board[r2][c2] = a;
    const found = findMatches().length > 0;
    state.board[r1][c1] = a;
    state.board[r2][c2] = b;
    return found;
  }

  function shuffleBoard() {
    const types = [];
    forEachTile((tile) => types.push(tile.type));
    let attempts = 0;
    do {
      for (let i = types.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
      }
      let index = 0;
      forEachTile((tile) => {
        tile.type = types[index];
        tile.alpha = 1;
        tile.scale = 1;
        index += 1;
      });
      attempts += 1;
    } while ((findMatches().length || !hasPossibleMove()) && attempts < 35);
  }

  function objectivesDone() {
    return state.objectives.every((objective) => objective.have >= objective.need);
  }

  function endGame(won) {
    if (state.mode === "ended") return;
    state.mode = "ended";
    state.busy = true;
    state.timerDone = !won;
    audio.stopMusicSoon();
    if (won) {
      audio.win();
      resultEyebrow.textContent = "Lab Meeting Saved";
      resultTitle.textContent = "Regeneration Complete";
      resultCopy.textContent = "The myocytes are thriving and the seminar room is applauding.";
      addFinaleBurst();
    } else {
      audio.lose();
      resultEyebrow.textContent = "Timer Expired";
      resultTitle.textContent = "Review Requested";
      resultCopy.textContent = "The cells need another pass. Swap faster and chase those cascades.";
    }
    finalScore.textContent = state.score.toLocaleString();
    finalStreak.textContent = state.bestChain.toString();
    window.setTimeout(() => {
      result.classList.add("is-active");
      result.setAttribute("aria-hidden", "false");
    }, 520);
  }

  function addFinaleBurst() {
    const { boardX, boardY, boardSize } = state.layout;
    for (let i = 0; i < 70; i += 1) {
      addParticle(
        boardX + boardSize / 2,
        boardY + boardSize / 2,
        Math.random() * Math.PI * 2,
        2.4 + Math.random() * 5.5,
        Math.floor(Math.random() * TYPES),
        980 + Math.random() * 520
      );
    }
  }

  function tileCenter(tile) {
    const { cell } = state.layout;
    return { x: tile.x + cell / 2, y: tile.y + cell / 2 };
  }

  function addParticles(x, y, type, count) {
    for (let i = 0; i < count; i += 1) {
      addParticle(x, y, Math.random() * Math.PI * 2, 1.2 + Math.random() * 3.5, type, 520 + Math.random() * 360);
    }
  }

  function addParticle(x, y, angle, speed, type, life) {
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.4,
      type,
      life,
      max: life,
      size: 5 + Math.random() * 9,
      spin: Math.random() * 6.28
    });
  }

  function popText(text, x, y, color = "#ffffff") {
    state.texts.push({ text, x, y, color, life: 900, max: 900 });
  }

  function update(dt, now) {
    forEachTile((tile) => {
      tile.x = ease(tile.x, tile.tx, 0.24);
      tile.y = ease(tile.y, tile.ty, 0.24);
      tile.scale = ease(tile.scale, 1, 0.16);
      tile.alpha = ease(tile.alpha, 1, 0.14);
    });

    state.shake = Math.max(0, state.shake - dt * 0.038);

    for (const particle of state.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt * 0.06;
      particle.y += particle.vy * dt * 0.06;
      particle.vy += dt * 0.004;
      particle.spin += dt * 0.006;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);

    for (const text of state.texts) {
      text.life -= dt;
      text.y -= dt * 0.045;
    }
    state.texts = state.texts.filter((text) => text.life > 0);

    if (state.mode === "playing") {
      const remaining = timeRemaining(now);
      const whole = Math.ceil(remaining);
      if (whole <= 10 && whole !== state.lastTickSecond) {
        state.lastTickSecond = whole;
        audio.tick();
      }
      if (remaining <= 0) endGame(false);
    }
  }

  function draw(now) {
    ctx.save();
    ctx.clearRect(0, 0, state.width, state.height);
    drawBackground(now);

    if (state.mode === "loading") {
      drawLoading();
      ctx.restore();
      return;
    }

    const sx = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    const sy = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    ctx.translate(sx, sy);
    drawHud(now);
    drawBoard(now);
    drawObjectives();
    drawParticles(now);
    drawFloatingTexts();
    ctx.restore();
  }

  function drawBackground(now) {
    const bg = images.background;
    if (bg) {
      drawCoverImage(bg, 0, 0, state.width, state.height);
    } else {
      const grad = ctx.createRadialGradient(state.width / 2, state.height * 0.42, 20, state.width / 2, state.height * 0.42, state.height * 0.8);
      grad.addColorStop(0, "#254aff");
      grad.addColorStop(0.48, "#07145f");
      grad.addColorStop(1, "#020830");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, state.width, state.height);
    }

    ctx.fillStyle = "rgba(2, 8, 48, 0.16)";
    ctx.fillRect(0, 0, state.width, state.height);

    const pulse = 0.5 + Math.sin(now * 0.003) * 0.5;
    const glow = ctx.createRadialGradient(state.width / 2, state.layout.boardY + state.layout.boardSize / 2, 20, state.width / 2, state.layout.boardY + state.layout.boardSize / 2, state.layout.boardSize * 0.75 || 300);
    glow.addColorStop(0, `rgba(255, 232, 90, ${0.16 + pulse * 0.08})`);
    glow.addColorStop(0.6, "rgba(88, 215, 255, 0.08)");
    glow.addColorStop(1, "rgba(2, 8, 48, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  function drawCoverImage(img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function drawLoading() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 28px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#07145f";
    ctx.lineWidth = 8;
    ctx.strokeText("Preparing culture plate...", state.width / 2, state.height / 2);
    ctx.fillText("Preparing culture plate...", state.width / 2, state.height / 2);
  }

  function drawHud(now) {
    const { safeTop, hudH } = state.layout;
    const y = safeTop;
    const remaining = timeRemaining(now);
    const danger = remaining <= 15;
    drawPanel(12, y, state.width - 24, hudH - 14, 8, danger ? "rgba(117, 12, 48, 0.8)" : "rgba(5, 18, 84, 0.72)");

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "900 16px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#bcecff";
    ctx.fillText("Score", 28, y + 14);
    ctx.font = "900 28px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#ffffff";
    strokeFillText(state.score.toLocaleString(), 28, y + 31, "#07145f", 5);

    ctx.textAlign = "center";
    ctx.font = "900 15px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#ffd844";
    ctx.fillText("LAB CLOCK", state.width / 2, y + 12);
    ctx.font = "900 34px Trebuchet MS, sans-serif";
    strokeFillText(formatTime(remaining), state.width / 2, y + 30, danger ? "#5a082e" : "#07145f", 6);

    const rightHudX = state.width - 116;
    ctx.textAlign = "right";
    ctx.font = "900 16px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#bcecff";
    ctx.fillText("Cascade", rightHudX, y + 14);
    ctx.font = "900 28px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#ffffff";
    strokeFillText(`${Math.max(state.lastChain, state.bestChain)}x`, rightHudX, y + 31, "#07145f", 5);
  }

  function formatTime(seconds) {
    const sec = Math.max(0, Math.ceil(seconds));
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${min}:${rem.toString().padStart(2, "0")}`;
  }

  function drawBoard(now) {
    const { boardX, boardY, boardSize, cell } = state.layout;
    drawPanel(boardX - 6, boardY - 6, boardSize + 12, boardSize + 12, 8, "rgba(4, 15, 85, 0.72)");

    ctx.save();
    roundRect(boardX, boardY, boardSize, boardSize, 8);
    ctx.clip();
    for (let r = 0; r < BOARD; r += 1) {
      for (let c = 0; c < BOARD; c += 1) {
        const x = boardX + c * cell;
        const y = boardY + r * cell;
        ctx.fillStyle = (r + c) % 2 === 0 ? "rgba(36, 71, 198, 0.7)" : "rgba(18, 45, 154, 0.72)";
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.strokeStyle = "rgba(88, 215, 255, 0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      }
    }

    const sortedTiles = [];
    forEachTile((tile) => sortedTiles.push(tile));
    sortedTiles.sort((a, b) => a.y - b.y);
    for (const tile of sortedTiles) drawTile(tile, now);
    ctx.restore();

    if (state.selected) drawSelection(state.selected, now);
  }

  function drawTile(tile, now) {
    const sprite = images.sprites;
    if (!sprite) return;
    const { cell } = state.layout;
    const frame = Math.floor(now / 150 + tile.row + tile.col + tile.type) % 4;
    const wobble = Math.sin(now * 0.004 + tile.row * 1.7 + tile.col) * 0.025;
    const size = cell * 1.08 * tile.scale;
    const center = { x: tile.x + cell / 2, y: tile.y + cell / 2 };
    ctx.save();
    ctx.globalAlpha = clamp(tile.alpha, 0, 1);
    ctx.translate(center.x, center.y);
    ctx.rotate(wobble);
    ctx.shadowColor = TILE_COLORS[tile.type];
    ctx.shadowBlur = 12;
    ctx.drawImage(
      sprite,
      frame * TILE_SRC,
      tile.type * TILE_SRC,
      TILE_SRC,
      TILE_SRC,
      -size / 2,
      -size / 2,
      size,
      size
    );
    ctx.restore();
  }

  function drawSelection(cell, now) {
    const { boardX, boardY, cell: size } = state.layout;
    const x = boardX + cell.c * size;
    const y = boardY + cell.r * size;
    const pulse = 0.55 + Math.sin(now * 0.01) * 0.25;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 216, 68, ${pulse})`;
    ctx.lineWidth = 5;
    roundRect(x + 5, y + 5, size - 10, size - 10, 8);
    ctx.stroke();
    ctx.shadowColor = "#ffd844";
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.restore();
  }

  function drawObjectives() {
    const { bottomY, boardX, boardSize } = state.layout;
    const chipH = 35;
    const gap = 8;
    const x = Math.max(12, boardX);
    const w = Math.min(state.width - 24, boardSize);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    ctx.font = "900 16px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#ffffff";
    strokeFillText("Lab objectives", x + 4, bottomY + 9, "#07145f", 4);

    state.objectives.forEach((objective, index) => {
      const y = bottomY + 24 + index * (chipH + gap);
      const complete = objective.have >= objective.need;
      drawPanel(x, y, w, chipH, 8, complete ? "rgba(6, 119, 73, 0.82)" : "rgba(5, 18, 84, 0.76)");
      drawMiniSprite(objective.type, x + 5, y + 3, 29);
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 13px Trebuchet MS, sans-serif";
      ctx.fillText(objective.label, x + 42, y + chipH / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = complete ? "#ffd844" : "#bcecff";
      ctx.fillText(`${Math.min(objective.have, objective.need)} / ${objective.need}`, x + w - 10, y + chipH / 2);
      ctx.textAlign = "left";
    });
  }

  function drawMiniSprite(type, x, y, size) {
    if (!images.sprites) return;
    ctx.drawImage(images.sprites, 0, type * TILE_SRC, TILE_SRC, TILE_SRC, x, y, size, size);
  }

  function drawParticles(now) {
    const sprite = images.sprites;
    for (const particle of state.particles) {
      const alpha = clamp(particle.life / particle.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.spin);
      if (sprite) {
        const row = Math.random() > 0.5 ? 7 : particle.type;
        const srcFrame = Math.floor(now / 90) % 4;
        const size = particle.size * (row === 7 ? 3.2 : 2.1);
        ctx.drawImage(sprite, srcFrame * TILE_SRC, row * TILE_SRC, TILE_SRC, TILE_SRC, -size / 2, -size / 2, size, size);
      } else {
        ctx.fillStyle = TILE_COLORS[particle.type] || "#ffffff";
        ctx.beginPath();
        ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawFloatingTexts() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const text of state.texts) {
      const alpha = clamp(text.life / text.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "900 26px Trebuchet MS, sans-serif";
      ctx.fillStyle = text.color;
      strokeFillText(text.text, text.x, text.y, "#07145f", 7);
      ctx.restore();
    }
  }

  function drawPanel(x, y, w, h, radius, fill) {
    ctx.save();
    ctx.shadowColor = "rgba(88, 215, 255, 0.62)";
    ctx.shadowBlur = 14;
    roundRect(x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function strokeFillText(text, x, y, stroke, lineWidth) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  function loop(now) {
    const last = loop.last || now;
    const dt = Math.min(48, now - last);
    loop.last = now;
    update(dt, now);
    draw(now);
    requestAnimationFrame(loop);
  }

  class AudioLab {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.timer = null;
      this.step = 0;
      this.nextTime = 0;
      this.muted = localStorage.getItem("matchMyocyteMuted") === "1";
    }

    unlock() {
      if (!window.AudioContext && !window.webkitAudioContext) return;
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();
        this.master = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.75;
        this.musicGain.gain.value = 0.28;
        this.musicGain.connect(this.master);
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    }

    setMuted(muted) {
      this.muted = muted;
      localStorage.setItem("matchMyocyteMuted", muted ? "1" : "0");
      soundButton.textContent = muted ? "Muted" : "Sound";
      if (this.master && this.ctx) {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.75, this.ctx.currentTime + 0.08);
      }
    }

    startMusic() {
      if (!this.ctx || this.timer) return;
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.04;
      this.timer = window.setInterval(() => this.schedule(), 45);
    }

    stopMusicSoon() {
      if (!this.ctx || !this.musicGain) return;
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.linearRampToValueAtTime(0.02, this.ctx.currentTime + 0.8);
    }

    schedule() {
      if (!this.ctx || !this.musicGain) return;
      const bpm = 134;
      const stepDur = 60 / bpm / 4;
      while (this.nextTime < this.ctx.currentTime + 0.18) {
        this.musicStep(this.step, this.nextTime, stepDur);
        this.nextTime += stepDur;
        this.step += 1;
      }
    }

    musicStep(step, time, dur) {
      const bass = [65.41, 65.41, 77.78, 98.0, 87.31, 87.31, 103.83, 116.54];
      const arp = [261.63, 311.13, 392.0, 523.25, 466.16, 392.0, 311.13, 261.63, 349.23, 415.3, 523.25, 698.46, 622.25, 523.25, 415.3, 349.23];
      if (step % 4 === 0) this.kick(time);
      if (step % 8 === 4) this.snare(time);
      if (step % 4 === 0) this.tone(bass[Math.floor(step / 4) % bass.length], 0.17, "sawtooth", 0.09, time, this.musicGain);
      this.tone(arp[step % arp.length], dur * 0.72, step % 3 ? "triangle" : "sine", 0.035, time, this.musicGain);
      if (step % 16 === 0) {
        [261.63, 311.13, 392.0].forEach((freq, index) => this.tone(freq, 0.9, "sine", 0.018, time + index * 0.015, this.musicGain));
      }
    }

    tone(freq, duration, type = "sine", volume = 0.1, when = null, destination = null, slideTo = null) {
      if (!this.ctx || !this.master) return;
      const t = when ?? this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain);
      gain.connect(destination || this.master);
      osc.start(t);
      osc.stop(t + duration + 0.03);
    }

    noise(duration, volume, when = null) {
      if (!this.ctx || !this.master) return;
      const t = when ?? this.ctx.currentTime;
      const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 1100;
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(t);
    }

    kick(when) {
      if (!this.ctx || !this.musicGain) return;
      this.tone(95, 0.15, "sine", 0.11, when, this.musicGain, 38);
    }

    snare(when) {
      this.noise(0.075, 0.022, when);
      this.tone(178, 0.07, "triangle", 0.03, when, this.musicGain);
    }

    start() {
      this.tone(392, 0.12, "triangle", 0.12);
      this.tone(523.25, 0.16, "triangle", 0.1, this.ctx?.currentTime + 0.08);
      this.tone(783.99, 0.22, "sine", 0.08, this.ctx?.currentTime + 0.16);
      if (this.musicGain && this.ctx) this.musicGain.gain.linearRampToValueAtTime(0.28, this.ctx.currentTime + 0.8);
    }

    select() {
      this.tone(620, 0.04, "sine", 0.035);
    }

    swap() {
      this.tone(440, 0.06, "triangle", 0.06, null, null, 700);
    }

    bad() {
      this.tone(160, 0.16, "sawtooth", 0.06, null, null, 85);
    }

    match(chain, count, bonus) {
      const base = bonus ? 523.25 : 392;
      for (let i = 0; i < Math.min(5, chain + 2); i += 1) {
        this.tone(base * Math.pow(1.122, i), 0.12, i % 2 ? "triangle" : "sine", bonus ? 0.09 : 0.055, this.ctx?.currentTime + i * 0.045);
      }
      if (bonus) {
        this.noise(0.22, 0.12);
        this.tone(130.81, 0.28, "sawtooth", 0.08, null, null, 65.41);
      } else if (count > 4) {
        this.noise(0.08, 0.055);
      }
    }

    power() {
      this.tone(261.63, 0.12, "triangle", 0.07);
      this.tone(523.25, 0.16, "triangle", 0.07, this.ctx?.currentTime + 0.08);
    }

    tick() {
      this.tone(880, 0.055, "square", 0.045);
    }

    win() {
      const notes = [392, 493.88, 587.33, 783.99, 987.77, 1174.66];
      notes.forEach((freq, index) => this.tone(freq, 0.22, "triangle", 0.08, this.ctx?.currentTime + index * 0.075));
      this.noise(0.42, 0.08, this.ctx?.currentTime + 0.18);
    }

    lose() {
      [220, 196, 164.81, 130.81].forEach((freq, index) => this.tone(freq, 0.22, "sawtooth", 0.055, this.ctx?.currentTime + index * 0.11));
    }
  }

  async function boot() {
    resize();
    soundButton.textContent = audio.muted ? "Muted" : "Sound";
    try {
      const [background, sprites] = await Promise.all([
        loadImage(ASSET_PATHS.background),
        loadImage(ASSET_PATHS.sprites)
      ]);
      images.background = background;
      images.sprites = sprites;
    } catch (error) {
      console.warn("Asset load failed, using fallback drawing.", error);
    }
    state.mode = "splash";
    requestAnimationFrame(loop);

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  audio = new AudioLab();

  startButton.addEventListener("click", startGame);
  restartButton.addEventListener("click", startGame);
  soundButton.addEventListener("click", () => {
    audio.unlock();
    audio.setMuted(!audio.muted);
  });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", () => {
    state.pointer = null;
  });
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && audio.ctx?.state === "running") audio.ctx.suspend();
    if (!document.hidden && audio.ctx?.state === "suspended" && !audio.muted) audio.ctx.resume();
  });

  boot();
})();
