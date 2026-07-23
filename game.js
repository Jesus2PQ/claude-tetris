'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7c9fe0', // J - pale blue
  '#ffb74d', // L - orange
  '#9e9e9e', // Tuerca - gris metálico
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (nut) - hueco central
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Paletas alternativas para cada skin (paralelas a COLORS, índice 1-8)
const NEON_COLORS = [
  null,
  '#00f6ff', // I - cyan neon
  '#faff00', // O - amarillo neon
  '#ff2bd6', // T - magenta neon
  '#39ff14', // S - verde neon
  '#ff2079', // Z - rojo/rosa neon
  '#4d7bff', // J - azul neon
  '#ff9100', // L - naranja neon
  '#c9c9ff', // Tuerca - plateado neon
];

const PASTEL_COLORS = [
  null,
  '#a8e6f0', // I
  '#fff3b0', // O
  '#e0bbf0', // T
  '#c5e8c8', // S
  '#f5b8b8', // Z
  '#bcd4f0', // J
  '#ffd9b3', // L
  '#dcdce4', // Tuerca
];

// Config de cada skin: paleta de colores + parámetros de dibujo para drawBlock
const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    boardBg: null,
    radius: 0,
    glow: false,
    texture: false,
  },
  neon: {
    label: 'Neon',
    colors: NEON_COLORS,
    boardBg: '#000000',
    radius: 0,
    glow: true,
    texture: false,
  },
  pastel: {
    label: 'Pastel',
    colors: PASTEL_COLORS,
    boardBg: null,
    radius: 6,
    glow: false,
    texture: false,
  },
  pixel: {
    label: 'Pixel Art',
    colors: COLORS,
    boardBg: null,
    radius: 0,
    glow: false,
    texture: true,
  },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';
let activeSkin = 'retro';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, gridLineColor;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// Traza un rectángulo con esquinas redondeadas (independiente de soporte nativo de roundRect)
function roundedRectPath(context, x, y, w, h, r) {
  const { tl = 0, tr = 0, br = 0, bl = 0 } = r;
  context.beginPath();
  context.moveTo(x + tl, y);
  context.lineTo(x + w - tr, y);
  context.arcTo(x + w, y, x + w, y + tr, tr);
  context.lineTo(x + w, y + h - br);
  context.arcTo(x + w, y + h, x + w - br, y + h, br);
  context.lineTo(x + bl, y + h);
  context.arcTo(x, y + h, x, y + h - bl, bl);
  context.lineTo(x, y + tl);
  context.arcTo(x, y, x + tl, y, tl);
  context.closePath();
}

// Dibuja una rejilla de píxeles más claros/oscuros dentro del bloque (skin "pixel art")
function drawPixelTexture(context, x, y, size) {
  context.save();
  const cell = Math.max(2, Math.floor(size / 6));
  for (let i = 0; i < size; i += cell) {
    for (let j = 0; j < size; j += cell) {
      const dark = (Math.floor(i / cell) + Math.floor(j / cell)) % 2 === 0;
      context.fillStyle = dark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)';
      context.fillRect(x + i, y + j, cell, cell);
    }
  }
  context.restore();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[activeSkin];
  const color = skin.colors[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;

  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;

  if (skin.glow) {
    context.shadowBlur = 12;
    context.shadowColor = color;
  }

  if (skin.radius) {
    const r = Math.min(skin.radius, s / 2);
    roundedRectPath(context, px, py, s, s, { tl: r, tr: r, br: r, bl: r });
    context.fill();
  } else {
    context.fillRect(px, py, s, s);
  }

  if (skin.glow) {
    context.shadowBlur = 0;
  }

  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  if (skin.radius) {
    const r = Math.min(skin.radius, s / 2, 4);
    roundedRectPath(context, px, py, s, 4, { tl: r, tr: r, br: 0, bl: 0 });
    context.fill();
  } else {
    context.fillRect(px, py, s, 4);
  }

  if (skin.texture) {
    drawPixelTexture(context, px, py, s);
  }

  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridLineColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.checked = theme === 'light';
  gridLineColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

function applySkin(name) {
  if (!SKINS[name]) name = 'retro';
  activeSkin = name;
  const skin = SKINS[name];
  canvas.style.backgroundColor = skin.boardBg || '';
  nextCanvas.style.backgroundColor = skin.boardBg || '';
  if (skinSelect) skinSelect.value = name;
  // Repinta de inmediato sin recargar, si ya hay una partida en curso
  if (current) {
    draw();
    drawNext();
  }
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(saved && SKINS[saved] ? saved : 'retro');
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    localStorage.setItem(SKIN_KEY, skinSelect.value);
    applySkin(skinSelect.value);
  });
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

initTheme();
initSkin();
init();
