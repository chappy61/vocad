/* ===== Prog Vocab - list.js ===== */
const LS_ITEMS = "prog_vocab_items_v3";
const $ = s => document.querySelector(s);
const list = $("#list"), q=$("#q"), cat=$("#cat"), sort=$("#sort");

function load(){ try{ return JSON.parse(localStorage.getItem(LS_ITEMS) || "[]"); }catch{ return []; } }
function save(v){ localStorage.setItem(LS_ITEMS, JSON.stringify(v)); }
function fmtDate(ts){ if(!ts) return "-"; const d=new Date(ts); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }

function render(){
  const items = load();
  const kw = (q.value||"").toLowerCase();
  const catKey = cat.value;

  let rows = items.filter(it=>{
    if (catKey && !(it.tags||[]).includes(catKey)) return false;
    if (!kw) return true;
    const bag = [it.word, it.example, it.explanation, it.kana, it.pron].join(" ").toLowerCase();
    return bag.includes(kw);
  });

  const keyOf = {
    "due-asc": (a)=> a.due ?? 0,
    "box-desc": (a)=> -(a.box ?? 0),
    "seen-desc": (a)=> -((a.stats?.seen)||0),
    "wrong-desc": (a)=> -((a.stats?.lastWrongAt)||0),
    "word-asc": (a)=> a.word?.toLowerCase() || ""
  };
  rows.sort((a,b)=>{
    const k = sort.value || "due-asc";
    const ka = keyOf[k](a), kb = keyOf[k](b);
    return ka<kb ? -1 : ka>kb ? 1 : 0;
  });

  const head = `
    <div style="display:grid;grid-template-columns: 140px 1fr 70px 120px 160px 160px;gap:0;border-bottom:1px solid var(--line);padding:12px 16px;">
      <strong>単語</strong><strong class="muted">例文</strong><strong>Box</strong><strong>Next Due</strong><strong>最終学習</strong><strong>操作</strong>
    </div>`;
  const body = rows.map(it=>{
    const seen = it.stats?.seen||0, ok = it.stats?.correct||0;
    const rate = seen ? Math.round((ok/seen)*100) : 0;
    return `
    <div class="row-item" data-id="${it.id}" style="display:grid;grid-template-columns: 140px 1fr 70px 120px 160px 160px;gap:0;align-items:center;border-bottom:1px solid rgba(255,255,255,.03);padding:12px 16px;">
      <div><strong>${it.word}</strong><div class="muted" style="font-size:12px">${(it.tags||[])[0]||""}</div></div>
      <div class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.example||""}</div>
      <div>${it.box ?? 0}<span class="muted" style="font-size:12px"> / ${rate}%</span></div>
      <div>${fmtDate(it.due)}</div>
      <div>${fmtDate(it.stats?.lastSeen)}</div>
      <div class="row">
        <button class="btn ghost mini" data-act="review">今すぐ</button>
        <button class="btn ghost mini" data-act="reset">リセット</button>
        <button class="btn ghost mini" data-act="copy">コピー</button>
      </div>
    </div>`;
  }).join("");

  list.innerHTML = `<div class="face">${head}<div>${body || `<div style="padding:18px" class="muted">該当なし</div>`}</div></div>`;

  // 操作
  list.querySelectorAll("[data-act]").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      const row = e.target.closest(".row-item");
      const id = row.dataset.id;
      const act = e.target.dataset.act;
      const all = load();
      const idx = all.findIndex(x=>x.id===id);
      if (idx<0) return;

      if (act==="review"){ all[idx].due = 0; save(all); e.target.textContent="キュー投入"; }
      if (act==="reset"){ all[idx].box=0; all[idx].due=Date.now(); save(all); e.target.textContent="初期化OK"; }
      if (act==="copy"){
        const data = JSON.stringify(all[idx], null, 2);
        navigator.clipboard?.writeText(data); e.target.textContent="Copied";
        setTimeout(()=> e.target.textContent="コピー", 800);
      }
    });
  });
}

q.addEventListener("input", render);
cat.addEventListener("change", render);
sort.addEventListener("change", render);

// Export
document.getElementById("exportBtn")?.addEventListener("click", ()=>{
  const blob = new Blob([localStorage.getItem(LS_ITEMS) || "[]"], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `prog-vocab-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
});

// Import (JSON/CSV)
document.getElementById("importFile")?.addEventListener("change", async (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  const text = await f.text();
  let add = [];
  if (f.name.endsWith(".csv")){
    // 期待列: word,pron,kana,example,explanation,quiz,tag
    add = text.split(/\r?\n/).slice(1).map(line=>{
      const [word,pron,kana,example,explanation,quiz,tag] = line.split(",");
      const cat = (tag||"misc").trim().toLowerCase();
      const id = `${cat}::${word}`;
      return { id, word, pron:pron||word, kana:kana||word, example, explanation, quiz, tags:[cat], box:0, due:Date.now(), stats:{seen:0,correct:0} };
    }).filter(x=>x.word);
  }else{
    add = JSON.parse(text||"[]");
  }
  const cur = load(); const map = new Map(cur.map(x=>[x.id,x]));
  add.forEach(x=> map.set(x.id, { ...(map.get(x.id)||{}), ...x })); // 既存は上書き
  save([...map.values()]);
  render();
});

document.addEventListener("DOMContentLoaded", render);
