/* =========================================
   Prog Vocab - main.js
   - words.js をローカルへ差分マージ
   - SRS優先 + dueが空の時は「重複なし巡回」
   - 予想→読み→例文→解説→タイプ の5ステップ
   ========================================= */

/* ===== ストレージキー ===== */
const LS_ITEMS = "prog_vocab_items_v3";   // 単語+学習状態
const LS_META  = "prog_vocab_meta_v3";    // {version, installedAt}
const LS_CATS  = "prog_vocab_cats";       // ["php","python",...]
const LS_CYCLE = "prog_vocab_cycle_v1";   // 巡回の順序と位置

/* ===== カテゴリ定義 ===== */
const CATS = [
  { key:"php",    name:"PHP",    color:"#dc2626" },
  { key:"python", name:"Python", color:"#3b82f6" },
  { key:"java",   name:"Java",   color:"#f59e0b" },
  { key:"db",     name:"DB",     color:"#006d13" },
  { key:"js",     name:"JS",     color:"#ff2e85" },
  { key:"web",    name:"Web",    color:"#06b6d4" },
  { key:"tools",  name:"Tools",  color:"#8b5cf6" },
];

/* ===== 小道具 ===== */
const $ = (s)=>document.querySelector(s);
function loadJSON(k, def){ try{ return JSON.parse(localStorage.getItem(k) || JSON.stringify(def)); }catch{ return def; } }
function saveJSON(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
const getCatColor = (tag)=> (CATS.find(c=>c.key===tag)?.color) || "#7cfcff";

/* カタカナ簡易変換（kana未指定の保険） */
const toKatakanaLoose = (w)=>{
  const s=(w||"").toLowerCase();
  const map={b:'ブ',c:'ク',d:'ド',f:'フ',g:'グ',h:'フ',j:'ジ',k:'ク',l:'ル',m:'ム',n:'ン',p:'プ',q:'ク',r:'ル',s:'ス',t:'ト',v:'ブ',w:'ウ',x:'クス',y:'イ',z:'ズ'};
  return s.replace(/tion\b/g,"ション").replace(/ing\b/g,"イング").replace(/er\b/g,"アー")
          .replace(/ph/g,"フ").replace(/ch/g,"チ").replace(/sh/g,"シュ").replace(/th/g,"ス")
          .replace(/[aā]/g,"ア").replace(/[iī]/g,"イ").replace(/[uū]/g,"ウ").replace(/[eē]/g,"エ").replace(/[oō]/g,"オ")
          .replace(/[bcdfghjklmnpqrstvwxyz]/g,(c)=>map[c]||c).toUpperCase();
};

/* ===== words.js → ローカル差分マージ ===== */
function normalizeFromWordsJS(catKey, raw){
  const cat = String(catKey||"").trim().toLowerCase();
  const now = Date.now();
  return (raw||[]).map(r=>({
    id: `${cat}::${r.word}`,
    word: r.word,
    pron: r.pron || r.word,
    kana: r.kana || toKatakanaLoose(r.word),
    example: r.example || "",
    explanation: r.explanation || "",
    quiz: r.quiz || r.example || r.word,
    tags: [cat],
    box: 0,
    due: now,
    stats: { seen:0, correct:0 }
  }));
}
function installOrMergeFromWORDS(){
  if (!window.WORDS) { console.warn("WORDS not found"); return; }
  const src  = window.WORDS;
  const meta = loadJSON(LS_META, {});
  const items= loadJSON(LS_ITEMS, []);
  const map  = new Map(items.map(x=>[x.id, x]));
  let added=0, touched=0;
  const cats = Object.keys(src).filter(k=>!k.startsWith("_"));
  for (const cat of cats){
    const list = normalizeFromWordsJS(cat, src[cat]);
    for (const it of list){
      const prev = map.get(it.id);
      if (!prev){ map.set(it.id, it); added++; }
      else{
        const merged = { ...prev,
          word: it.word, pron: it.pron, kana: it.kana,
          example: it.example, explanation: it.explanation, quiz: it.quiz,
          tags: it.tags
        };
        map.set(it.id, merged); touched++;
      }
    }
  }
  const out = Array.from(map.values());
  saveJSON(LS_ITEMS, out);
  saveJSON(LS_META, { version: src._version || "dev", installedAt: meta.installedAt || Date.now() });
  console.log(`[WORDS] merged. +${added} added, ~${touched} updated, total ${out.length}`);
}

/* ===== 巡回（重複なし） ===== */
function loadCycle(){ return loadJSON(LS_CYCLE, {}); }
function saveCycle(s){ saveJSON(LS_CYCLE, s); }
function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
function getCycleNext(items, selectedCatsSet){
  const byCat = {};
  for (const it of items){
    const cat = it.tags?.[0] || "misc";
    if (selectedCatsSet.size && !selectedCatsSet.has(cat)) continue;
    (byCat[cat] ||= []).push(it);
  }
  const cats = Object.keys(byCat);
  if (!cats.length) return null;
  const state = loadCycle();
  const cat = cats[Math.floor(Math.random()*cats.length)];
  const pool = byCat[cat];
  if (!state[cat] || !Array.isArray(state[cat].order) || !state[cat].order.length){
    state[cat] = { order: shuffle(pool.map(x=>x.id)), idx: 0 };
  }
  if (state[cat].idx >= state[cat].order.length){
    state[cat] = { order: shuffle(pool.map(x=>x.id)), idx: 0 }; // 再スタート
  }
  const nextId = state[cat].order[state[cat].idx++];
  saveCycle(state);
  return pool.find(x=>x.id===nextId) || null;
}

/* ===== SRS ===== */
const BOX_INTERVALS_MIN = [0, 5, 30, 12*60, 2*24*60, 5*24*60];

/* ===== 画面状態 ===== */
const STEPS = ["word","pron","example","explanation","quiz"];
let currentItem = null, currentStep = 0;
const container = $("#quizContainer");
const navBtns   = $("#navBtns");
const progress  = $("#progress");
const DAILY_GOAL= 10;

/* ===== selectedCats 正規化 ===== */
let selectedCats = new Set(
  (JSON.parse(localStorage.getItem(LS_CATS) || "[]") || [])
    .map(s=>String(s).trim().toLowerCase())
    .filter(k=>CATS.some(c=>c.key===k))
);

/* ===== ローカルI/O ===== */
function loadItems(){ return loadJSON(LS_ITEMS, []); }
function saveItems(v){ saveJSON(LS_ITEMS, v); }

/* ===== デバッグと空チェック ===== */
function debugReport(){
  const items = loadItems();
  const byCat = {};
  for (const it of items){ const k=it.tags?.[0]||"misc"; byCat[k]=(byCat[k]||0)+1; }
  console.table(byCat);
  console.log("[TOTAL]", items.length, "selectedCats:", Array.from(selectedCats));
}
function ensureNonEmptyOrExplain(){
  const all = loadItems();
  const filtered = all.filter(i => selectedCats.size===0 || i.tags.some(t=>selectedCats.has(t)));
  if (!filtered.length){
    container.innerHTML = `
      <div class="face front">
        <h2>データが見つからない</h2>
        <p class="muted">選択カテゴリに単語がありません。<br>words.js の配列が空か、カテゴリ名（php/python…）が一致していない可能性があります。</p>
      </div>`;
    return false;
  }
  return true;
}

/* ===== 出題 ===== */
function loadNextItem(){
  const all = loadItems();
  const now = Date.now();
  const filtered = all.filter(i => selectedCats.size===0 || i.tags.some(t=>selectedCats.has(t)));

  // 1) SRS優先（due <= now）
  let pool = filtered.filter(i => (i.due||0) <= now);
  if (pool.length){
    pool.sort((a,b)=> (a.box-b.box) || ((a.due||0)-(b.due||0)));
    const head = pool.slice(0, Math.min(7, pool.length));
    currentItem = { ...head[Math.floor(Math.random()*head.length)] };
  }else{
    // 2) dueが無ければ「巡回」へ
    const pick = getCycleNext(filtered, selectedCats);
    if (!pick){ toast("単語データが空です"); return; }
    currentItem = { ...pick };
  }

  currentStep = 0;
  let count = parseInt(sessionStorage.getItem('quizCount') || '0') + 1;
  sessionStorage.setItem('quizCount', String(count));
  renderStep();
  updateProgress();
}

/* ===== タイポ許容（正規化 + レーベンシュタイン） ===== */
function norm(s){
  return String(s||"")
    .toLowerCase()
    .replace(/[＿‗]/g, "_")
    .replace(/[ー―－‐]/g, "-")
    .replace(/[‐-‒–—―]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .trim();
}
const levenshtein = (a,b)=>{
  const A = a, B = b;
  const dp = Array(B.length+1).fill(0).map((_,i)=>[i]);
  for(let j=0;j<=A.length;j++) dp[0][j]=j;
  for(let i=1;i<=B.length;i++){
    for(let j=1;j<=A.length;j++){
      dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(A[j-1]===B[i-1]?0:1));
    }
  }
  return dp[B.length][A.length];
};
function isNearlyCorrect(user, answer){
  if (!user) return false;
  const u = norm(user);
  const a = norm(answer);
  if (u === a) return true;
  // 記号ゆれの許容
  if (u.replace(/[_-]/g,"") === a.replace(/[_-]/g,"")) return true;
  if (u.replace(/[()]/g,"") === a.replace(/[()]/g,"")) return true;
  if (a.length >= 5 && levenshtein(u, a) <= 1) return true;
  return false;
}
/* ===== safe toast ===== */
(function(){
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    // もしCSSが無い環境でも見えるよう最低限のスタイルを付ける
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.bottom = '20px';
    el.style.padding = '10px 16px';
    el.style.borderRadius = '12px';
    el.style.background = 'rgba(0,0,0,.75)';
    el.style.color = '#fff';
    el.style.backdropFilter = 'blur(6px)';
    el.style.zIndex = '9999';
    el.style.transition = 'opacity .2s';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    el.style.maxWidth = '90vw';
    el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Noto Sans JP, sans-serif';
    document.body.appendChild(el);
  }
  let timer = null;
  window.toast = function(msg){
    try{
      el.textContent = String(msg ?? '');
      el.style.opacity = '1';
      clearTimeout(timer);
      timer = setTimeout(()=>{ el.style.opacity = '0'; }, 1300);
    }catch(err){
      // どうしても表示できない場合の最後の砦
      console.error(err);
      alert(String(msg ?? ''));
    }
  };
})();

/* ===== レンダリング ===== */
function escapeReg(s){ return String(s||"").replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function renderStep(){
  const item = currentItem;
  if (!item || !item.word) {
    container.innerHTML = `<div class="face front"><h2>アイテムが空です</h2><p class="muted">words.js の取り込みやカテゴリを確認してね。</p></div>`;
    return;
  }
  const step = STEPS[currentStep];
  container.dataset.cat = item.tags?.[0] || "";
  container.style.setProperty('--neon-color', getCatColor(item.tags?.[0]));

  const wordRe  = new RegExp(`\\b${escapeReg(item.word)}\\b`, 'gi');
  const quizText= (item.quiz || "").replace(wordRe, '_____');

  let html = "";
  if (step === "word"){
    html = `
      <div class="face front big neon-text">${item.word}</div>
    `;
  }
  if (step === "pron"){
    const kana = item.kana || toKatakanaLoose(item.word);
    html = `
      <div class="face front code neon-text">${kana}</div>
    `;
  }
  if (step === "example"){
    html = `
      <div class="face front code neon-text">${item.example}</div>
    `;
  }
  if (step === "explanation"){
    html = `
      <div class="face front code neon-text">${item.explanation}</div>
    `;
  }
  if (step === "quiz"){
    html = `
      <div class="face front code neon-text">${quizText}</div>
        <input type="text" id="quizInput" class="w-full" placeholder="${item.word[0]}… (Enter)" aria-label="解答入力">
        <div class="row">
          <a id="submitQuiz" href="#" class="title-chip"   aria-label="解答を送信"             title="解答を送信">[ Submit ]</a>
          <a id="giveUpBtn"  href="#" class="title-chip" aria-label="ギブアップして正解を見る" title="ギブアップして正解を見る">[ key ]</a>
        </div>
      </div>`;
  }

  container.innerHTML = html;

  // ナビ（空ボタンを出さない）
  const hasPrev = currentStep > 0;
  const isLast  = currentStep === STEPS.length - 1;
  navBtns.innerHTML = [
    hasPrev
      ? `<a id="prevChip" href="#" class="title-chip ghost grow" aria-label="前のステップへ">[ Prev ]</a>`
      : "",
    `<a id="nextChip" href="#" class="title-chip ok grow" aria-label="${isLast ? "次の単語へ" : "次のステップへ"}">[ ${isLast ? "Done" : "Next"} ]</a>`
  ].join("");

  const onPrev = (e) => { e.preventDefault(); if (currentStep > 0) { currentStep--; renderStep(); } };
  const onNext = (e) => {
    e.preventDefault();
    if (currentStep === STEPS.length - 1) loadNextItem();
    else { currentStep++; renderStep(); }
  };

  document.getElementById("prevChip")?.addEventListener("click", onPrev);
  document.getElementById("nextChip")?.addEventListener("click", onNext);

  // キー操作
  const onKey = (e)=>{
    if (e.key === " " && document.activeElement?.id !== "quizInput") {
      e.preventDefault();
      $("#nextChip")?.click(); // id修正
    }
    if (e.key.toLowerCase() === "s" && step==="pron") $("#speakBtn")?.click();
    if (e.key.toLowerCase() === "h" && step==="pron") $("#hintBtn")?.click();
    if (e.key === "Enter" && step==="quiz") {
      e.preventDefault();
      $("#submitQuiz")?.click();
    }
  };
  document.removeEventListener("keydown", window._pvKey);
  window._pvKey = onKey;
  document.addEventListener("keydown", onKey);

  // クイズ
  if (step==="quiz"){
    const input = $("#quizInput");
    input && input.focus();

    const finish = (correct)=>{
      const all = loadItems();
      const idx = all.findIndex(x=>x.id===item.id);
      if (idx>=0){
        let box = all[idx].box ?? 0;
        if (correct) box = Math.min(box+1, 5); else box = 0;
        const mins = BOX_INTERVALS_MIN[box];
        const now = Date.now();
        all[idx] = { 
          ...all[idx], 
          box, 
          due: now + mins*60*1000,
          stats:{
            seen:(all[idx].stats?.seen||0)+1,
            correct:(all[idx].stats?.correct||0)+(correct?1:0),
            lastSeen: now,
            lastWrongAt: correct ? (all[idx].stats?.lastWrongAt || null) : now,
            history:[...(all[idx].stats?.history||[]).slice(-29), {t:now, ok:!!correct}]
          }
        };
        saveItems(all);
      }

      // ★ 見せ時間を確保してから次へ
      const SHOW_MS = correct ? 550 : 480;
      if (correct){
        container.classList.remove('wrong'); container.classList.add('correct');
        setTimeout(()=>container.classList.remove('correct'), SHOW_MS - 120);
      }else{
        container.classList.remove('correct'); container.classList.add('wrong','shake');
        setTimeout(()=>container.classList.remove('wrong','shake'), SHOW_MS - 140);
      }
      setTimeout(()=>{ loadNextItem(); }, SHOW_MS);
    };

    $("#submitQuiz")?.addEventListener("click", (e)=>{
      e.preventDefault(); // 既定動作抑止
      const user = (input?.value || "").trim();
      if (!user){ toast("入力してね"); return; }
      if (isNearlyCorrect(user, item.word)){ toast("✅ 正解！"); finish(true); }
      else { toast(`❌ 不正解… 正解は「${item.word}」`); finish(false); }
    });
    $("#giveUpBtn")?.addEventListener("click", (e)=>{
      e.preventDefault(); // 既定動作抑止
      toast(`▶ 正解: ${item.word}`);
      const all = loadItems();
      const idx = all.findIndex(x=>x.id===item.id);
      if (idx>=0){ all[idx].box=0; all[idx].due=Date.now()+2*60*1000; saveItems(all); }
      loadNextItem();
    });
  }
}

/* ===== 進捗 ===== */
function updateProgress(){
  const count = sessionStorage.getItem('quizCount') || '0';
  progress.textContent = `${count} / ${DAILY_GOAL}`;
}

/* ===== 起動 ===== */
document.addEventListener('DOMContentLoaded', ()=>{
  installOrMergeFromWORDS();
  if (!sessionStorage.getItem('quizCount')) sessionStorage.setItem('quizCount','0');

  debugReport();
  if (!ensureNonEmptyOrExplain()) return;

  loadNextItem();
  $("#backBtn")?.addEventListener('click', ()=> location.href="index.html");
});
