# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla Tetris implementation: HTML5 Canvas + CSS + JavaScript (ES6+), no dependencies, no build step, no `package.json`. Three files: `index.html`, `style.css`, `game.js`.

## Running

No build/install/test commands exist. Open directly or serve statically:

```bash
open index.html                 # macOS, just open the file
python3 -m http.server 8000     # or any static server
```

## Architecture

All game logic lives in `game.js` as a single module-scope script (no classes, no imports) operating on shared top-level `let` state: `board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId`.

- **Board model**: `ROWS × COLS` matrix, each cell `0` (empty) or a color index `1–7` identifying which piece locked there.
- **Pieces**: `PIECES` are square matrices; `rotateCW` rotates via transpose + row reversal (no piece-specific rotation tables).
- **Collision** (`collide`): checks board bounds and existing locked cells for a shape at a given offset. Used both for movement and for `ghostY` projection.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until one doesn't collide, else the rotation is discarded.
- **Game loop** (`loop`, driven by `requestAnimationFrame`): accumulates `dt` into `dropAccum`; once it exceeds `dropInterval`, advances the piece down or calls `lockPiece()`. Every frame calls `draw()` regardless.
- **Locking pipeline**: `lockPiece()` → `merge()` (write piece into board) → `clearLines()` (bottom-up scan, splice + unshift empty row, recompute score/level/dropInterval) → `spawn()` (promote `next` to `current`, generate new `next`; if the new piece collides immediately, calls `endGame()`).
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` indexed by lines-cleared-at-once, multiplied by `level`. Hard drop adds 2 pts/row dropped, soft drop 1 pt/row.
- **Level/speed**: level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Rendering**: `draw()` clears and redraws grid + locked board + ghost piece (alpha 0.2, via `ghostY()`) + current piece each frame; `drawNext()` renders the preview canvas separately, called only on `spawn()`.
- **Input**: single `keydown` listener switches on `e.code` (arrows, `KeyX` rotate, `Space` hard drop, `KeyP` pause); ignored while paused/game-over except pause toggle itself.

### Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK` (px per cell), `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).
