/* =========================================
   Prog Vocab - index/app.js (Landing only)
   - 単一言語選択 / 本日上限のバッジ表示＆選択不可
   - カレンダー / 進捗バー
   - main.js と同一ストレージスキーマ(v3)
   ========================================= */

/* ===== 共有キー（main.js と一致） ===== */
const LS_ITEMS = "prog_vocab_items_v3";   // 単語+学習状態
const LS_META  = "prog_vocab_meta_v3";    // { version, installedAt }
const LS_CATS  = "prog_vocab_cats";       // ["php"]
const LS_DAYS  = "prog_vocab_days_v1";    // 学習日(Y-M-D配列)
const LS_DAILY = "prog_vocab_daily_v1";   // { date, perLang:{php:{count}}, ... }
const LS_SETTINGS = "prog_vocab_settings"; // { capPerLang: 3 }

/* ===== カテゴリ（main と同じ） ===== */
const CATS = [
  { key: "php",    name: "PHP",    color: "#dc2626" },
  { key: "python", name: "Python", color: "#3b82f6" },
  { key: "java",   name: "Java",   color: "#f59e0b" },
  { key: "db",     name: "DB",     color: "#006d13" },
  { key: "js",     name: "JS",     color: "#ff2e85" },
  { key: "web",    name: "Web",    color: "#06b6d4" },
  { key: "tools",  name: "Tools",  color: "#8b5cf6" },
];

/* ===== 小道具 ===== */
const $  = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
function loadJSON(k, def){ try{ return JSON.parse(localStorage.getItem(k) || JSON.stringify(def)); }catch{ return def; } }
function saveJSON(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
function ymd(d=new Date()){ return d.toISOString().slice(0,10); }

/* ===== v2 -> v3 マイグレーション（古いキーから移行） ===== */
(function migrateIfNeeded(){
  const hasV3 = !!localStorage.getItem(LS_ITEMS);
  const v2 = localStorage.getItem("prog_vocab_v2");
  if (!hasV3 && v2) {
    try {
      const arr = JSON.parse(v2);
      const now = Date.now();
      const fixed = (arr || []).map(x => ({
        id: x.id || `${(x.tags?.[0]||"misc")}::${x.word}`,
        word: x.word,
        pron: x.pron || x.word,
        kana: x.kana || x.word,
        example: x.example || "",
        explanation: x.explanation || "",
        quiz: x.quiz || x.example || x.word,
        tags: Array.isArray(x.tags) && x.tags.length ? x.tags : ["misc"],
        box: x.box ?? 0,
        due: x.due ?? now,
        stats: x.stats || { seen:0, correct:0 }
      }));
      saveJSON(LS_ITEMS, fixed);
      saveJSON(LS_META, { version: "migrated-from-v2", installedAt: now });
      console.log(`[MIGRATE] v2 -> v3 : ${fixed.length} items`);
    } catch(e) {
      console.warn("v2 migration failed", e);
    }
  }
})();

/* ===== データ/進捗 ===== */
function loadItems(){ return loadJSON(LS_ITEMS, []); }
function countByCat(items, key) {
  const inCat = items.filter(x => (x.tags || []).includes(key));
  const total = inCat.length;
  const known = inCat.filter(x => (x.box ?? 0) >= 2).length; // box>=2 を“習得”扱い
  return { known, total };
}

/* ===== 日次上限（main.js と揃える） ===== */
function capPerLangValue(){
  const s = loadJSON(LS_SETTINGS, {});
  // 既定は 3（5にしたい場合は settings に {capPerLang:5} を保存）
  return Number.isFinite(s.capPerLang) ? s.capPerLang : 3;
}
function usedToday(tag){
  const daily = loadJSON(LS_DAILY, {});
  if (daily.date !== ymd()) return 0;
  return (daily.perLang?.[tag]?.count) || 0;
}
function remainingToday(tag){
  return Math.max(0, capPerLangValue() - usedToday(tag));
}

/* ===== 選択カテゴリ（単一選択に正規化） ===== */
const rawSel = loadJSON(LS_CATS, []);
const selected = new Set(
  (rawSel || [])
    .map(s => String(s).trim().toLowerCase())
    .filter(k => CATS.some(c => c.key === k))
);
// 単一選択：もし複数残っていたら先頭だけ採用
if (selected.size > 1) {
  const first = [...selected][0];
  selected.clear();
  selected.add(first);
}

/* ===== UI：カテゴリボタン（単一選択＋上限バッジ） ===== */
const catList = $("#catList");
function renderCatButtons() {
  const items = loadItems();
  const cap = capPerLangValue();

  catList.innerHTML = CATS.map(c => {
    const { known, total } = countByCat(items, c.key);
    const rem = remainingToday(c.key);
    const capped = rem === 0;
    const active = selected.size === 1 && selected.has(c.key);
    const pct = total ? Math.round((known / total) * 100) : 0;
    const disabledAttr = capped ? 'data-disabled="1"' : '';

    return `
      <button class="cat-btn ${active ? "active neon-rainbow" : ""}" data-cat="${c.key}" ${disabledAttr} style="--c:${c.color}">
        <div class="cat-head rowline-center">
          <span class="cat-remaining" aria-label="今日の残り">${rem}/${cap}</span>
          <span class="cat-name">${c.name}</span>
          <span class="cat-count">${known}/${total || 0}</span>
        </div>
        <div class="bar"><i style="width:${pct}%; background:${c.color}"></i></div>
      </button>
    `;
  }).join("");
}
renderCatButtons();

/* クリック：単一選択。上限の言語は弾く */
catList.addEventListener("click", (e) => {
  const btn = e.target.closest(".cat-btn");
  if (!btn) return;
  const k = btn.dataset.cat;
  const capped = btn.hasAttribute("data-disabled");
  if (capped) {
    alert("今日はこの言語は上限に達しています。別の言語を選ぶか、明日にどうぞ！");
    return;
  }
  selected.clear();
  selected.add(k);
  saveJSON(LS_CATS, [...selected]);
  renderCatButtons();
});

/* クリア（任意）：選択解除したい場合に使う。#allBtn を“クリア”ボタンとして運用 */
$("#allBtn")?.addEventListener("click", () => {
  selected.clear();
  saveJSON(LS_CATS, []); // ALL表示扱いだが開始は単一必須なのであくまでリセット用
  renderCatButtons();
});

/* 開始：単一選択必須＆上限チェック → main.html へ */
$("#startBtn")?.addEventListener("click", () => {
  if (selected.size !== 1) {
    alert("学習する言語を1つ選んでね！");
    return;
  }
  const [k] = [...selected];
  if (remainingToday(k) === 0) {
    alert("選んだ言語は今日は上限！復習は main で実施してね。別の言語も試してみてね。");
    return;
  }
  // 保存＆今日をマーク
  saveJSON(LS_CATS, [k]);
  markToday();
  location.href = "main.html";
});

/* ===== 学習カレンダー ===== */
function loadDays(){ return new Set(loadJSON(LS_DAYS, [])); }
function saveDays(set){ saveJSON(LS_DAYS, [...set]); }

function markToday(){
  const set = loadDays();
  set.add(ymd(new Date()));
  saveDays(set);
  renderCalendar();
}

function renderCalendar(){
  const wrap = $("#calendar");
  wrap.innerHTML = "";

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(); // 0-based
  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const marks = loadDays();

  // 曜日ヘッダ
  const head = document.createElement("div");
  head.className = "cal-head";
  head.innerHTML = ["日","月","火","水","木","金","土"].map(w=>`<div class="wk">${w}</div>`).join("");
  wrap.appendChild(head);

  // 本体
  const grid = document.createElement("div");
  grid.className = "cal-grid";

  // 空白
  for (let i=0;i<startDay;i++) grid.appendChild(document.createElement("div"));

  // 日付
  for (let d=1; d<=daysInMonth; d++){
    const cell = document.createElement("button");
    cell.className = "dcell";
    const key = ymd(new Date(y,m,d));
    const isMarked = marks.has(key);
    const isToday  = key === ymd(now);
    cell.innerHTML = `<span>${d}</span>${isMarked ? '<i class="dot"></i>' : ''}`;
    if (isToday) cell.classList.add("today");
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
}
renderCalendar();
