"use strict";

// ==============================
// マップ定義
//   # = 壁 / . = 床 / S = スタート
//   R,B,Y,G,W = 欠片(赤・青・黄・緑・白)
// ==============================
const MAP_SOURCE = [
  "#########",
  "#S..#...#",
  "#.#.#.#R#",
  "#.#...#.#",
  "#.###.#.#",
  "#B..#.#.#",
  "###.#.#.#",
  "#Y......#",
  "#.#####.#",
  "#..G#..W#",
  "#########",
];

const COLS = MAP_SOURCE[0].length;
const ROWS = MAP_SOURCE.length;

const FRAGMENT_DEFS = {
  R: { color: "red",    name: "赤" },
  B: { color: "blue",   name: "青" },
  Y: { color: "yellow", name: "黄色" },
  G: { color: "green",  name: "緑" },
  W: { color: "white",  name: "白" },
};

// 向き: 上 → 右 → 下 → 左 の順で回転
const DIRS = [
  { name: "up",    dr: -1, dc: 0, label: "上" },
  { name: "right", dr: 0,  dc: 1, label: "右" },
  { name: "down",  dr: 1,  dc: 0, label: "下" },
  { name: "left",  dr: 0,  dc: -1, label: "左" },
];

// ==============================
// 要素参照
// ==============================
const titleScreen  = document.getElementById("title-screen");
const gameScreen   = document.getElementById("game-screen");
const endingScreen = document.getElementById("ending-screen");
const mapEl        = document.getElementById("map");
const playerEl     = document.getElementById("player");
const sheetEl      = document.getElementById("sheet");
const messageEl    = document.getElementById("message");
const songEl       = document.getElementById("concert-song");

// ==============================
// ゲーム状態
// ==============================
const state = {
  row: 0,
  col: 0,
  dirIndex: 2, // 初期は下向き
  walls: new Set(),
  fragments: new Map(), // "r,c" -> { color, name, el }
  collected: new Set(),
  finished: false,
  previewing: false, // シートが掛かるまでのマップ確認タイム中は操作不可
};

function key(r, c) {
  return r + "," + c;
}

// ==============================
// マップ生成
// ==============================
function buildMap() {
  // 既存のマス・欠片を削除(プレイヤー要素は残す)
  mapEl.querySelectorAll(".cell").forEach((el) => el.remove());
  state.walls.clear();
  state.fragments.clear();
  state.collected.clear();
  state.finished = false;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = MAP_SOURCE[r][c];
      const cell = document.createElement("div");
      cell.className = "cell " + (ch === "#" ? "wall" : "floor");
      mapEl.insertBefore(cell, playerEl);

      if (ch === "#") {
        state.walls.add(key(r, c));
        continue;
      }
      if (ch === "S") {
        state.row = r;
        state.col = c;
        continue;
      }
      if (FRAGMENT_DEFS[ch]) {
        const def = FRAGMENT_DEFS[ch];
        const frag = document.createElement("div");
        frag.className = "fragment";
        frag.innerHTML =
          '<div class="gem gem-' + def.color + '"></div>' +
          '<span class="note">♪</span>';
        cell.appendChild(frag);
        state.fragments.set(key(r, c), { color: def.color, name: def.name, el: frag });
      }
    }
  }

  document.querySelectorAll(".slot").forEach((s) => s.classList.remove("filled"));
  updatePlayer(false);
}

// ==============================
// 描画更新
// ==============================
function updatePlayer(animate) {
  if (!animate) playerEl.style.transition = "none";
  playerEl.style.left = (state.col / COLS) * 100 + "%";
  playerEl.style.top = (state.row / ROWS) * 100 + "%";
  if (!animate) {
    // 強制リフローで transition なしの移動を確定させる
    void playerEl.offsetWidth;
    playerEl.style.transition = "";
  }

  const dir = DIRS[state.dirIndex];
  playerEl.classList.remove("dir-up", "dir-right", "dir-down", "dir-left", "face-left");
  playerEl.classList.add("dir-" + dir.name);
  if (dir.name === "left") playerEl.classList.add("face-left");
}

function setMessage(text) {
  messageEl.textContent = text;
}

// ==============================
// 効果音(WebAudio・外部ファイル不使用)
// ==============================
let audioCtx = null;

function playChime(step) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const freqs = [523.25, 587.33, 659.25, 783.99, 1046.5]; // ド レ ミ ソ 高いド
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freqs[Math.min(step, freqs.length - 1)];
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    /* 効果音が鳴らなくてもゲームは続行 */
  }
}

// ==============================
// 操作
// ==============================
function turn() {
  if (state.finished || state.previewing) return;
  state.dirIndex = (state.dirIndex + 1) % DIRS.length;
  updatePlayer(true);
  setMessage("いまの向き: " + DIRS[state.dirIndex].label);
}

function move() {
  if (state.finished || state.previewing) return;
  const dir = DIRS[state.dirIndex];
  const nr = state.row + dir.dr;
  const nc = state.col + dir.dc;

  if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || state.walls.has(key(nr, nc))) {
    playerEl.classList.remove("bump");
    void playerEl.offsetWidth;
    playerEl.classList.add("bump");
    setMessage("そっちには進めない…");
    return;
  }

  state.row = nr;
  state.col = nc;
  updatePlayer(true);
  setMessage(DIRS[state.dirIndex].label + "に 1歩すすんだ");

  const frag = state.fragments.get(key(nr, nc));
  if (frag) {
    collectFragment(key(nr, nc), frag);
  }
}

function collectFragment(k, frag) {
  state.fragments.delete(k);
  state.collected.add(frag.color);
  frag.el.classList.add("picked");
  setTimeout(() => frag.el.remove(), 450);

  const slot = document.querySelector('.slot[data-color="' + frag.color + '"]');
  if (slot) slot.classList.add("filled");

  playChime(state.collected.size - 1);

  const remaining = 5 - state.collected.size;
  if (remaining > 0) {
    setMessage(frag.name + "の欠片を手に入れた! あと " + remaining + " 個");
  } else {
    setMessage("ぜんぶ集めた! コンサートがはじまる…!");
    state.finished = true;
    setTimeout(showEnding, 1100);
  }
}

// ==============================
// 画面遷移
// ==============================
function showScreen(screen) {
  [titleScreen, gameScreen, endingScreen].forEach((s) =>
    s.classList.toggle("hidden", s !== screen)
  );
}

let previewTimer = null;

function startGame() {
  buildMap();
  state.dirIndex = 2;
  updatePlayer(false);
  showScreen(gameScreen);

  // マップ確認タイム: 数秒だけ迷路とスタート位置を見せてからシートで覆う
  state.previewing = true;
  sheetEl.classList.remove("down");
  clearInterval(previewTimer);
  let count = 3;
  setMessage("マップをおぼえよう! " + count);
  const timer = previewTimer = setInterval(() => {
    count--;
    if (count > 0) {
      setMessage("マップをおぼえよう! " + count);
      return;
    }
    clearInterval(timer);
    sheetEl.classList.add("down"); // シートを上からかぶせる
    setTimeout(() => {
      state.previewing = false;
      setMessage("絵のどのあたりにいるか、思いうかべながらすすもう!");
    }, 850);
  }, 1000);
}

function showEnding() {
  showScreen(endingScreen);
  songEl.currentTime = 0;
  const p = songEl.play();
  if (p && p.catch) {
    p.catch(() => {
      // 自動再生がブロックされた場合はタップで再生
      setMessage("");
      endingScreen.addEventListener(
        "pointerdown",
        () => songEl.play().catch(() => {}),
        { once: true }
      );
    });
  }
}

function backToTitle() {
  clearInterval(previewTimer);
  songEl.pause();
  songEl.currentTime = 0;
  showScreen(titleScreen);
}

// ==============================
// 入力イベント
//   pointerdown で反応させ、スマホでの遅延を防ぐ
// ==============================
function onTap(el, handler) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handler();
  });
}

onTap(document.getElementById("start-btn"), startGame);
onTap(document.getElementById("turn-btn"), turn);
onTap(document.getElementById("move-btn"), move);
onTap(document.getElementById("restart-btn"), backToTitle);

// キーボード補助(任意対応): Z/←→で方向変更、X/↑/スペースで前進
document.addEventListener("keydown", (e) => {
  if (gameScreen.classList.contains("hidden")) return;
  if (e.key === "z" || e.key === "ArrowRight" || e.key === "ArrowLeft") turn();
  if (e.key === "x" || e.key === "ArrowUp" || e.key === " ") move();
});

// 初期表示
showScreen(titleScreen);
