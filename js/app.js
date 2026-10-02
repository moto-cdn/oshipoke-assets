/* 推しポケランキング */
(() => {
'use strict';

const D = window.POKEDEX;
const ITEMS = D.items;
const SESSION_KEY = 'oshipoke:session:v2';
const PREF_KEY = 'oshipoke:prefs:v1';
const TOP_N = 9;

const TYPES = [null,
  ['ノーマル', '#9FA19F'], ['かくとう', '#FF8000'], ['ひこう', '#81B9EF'], ['どく', '#9141CB'], ['じめん', '#915121'],
  ['いわ', '#AFA981'], ['むし', '#91A119'], ['ゴースト', '#704170'], ['はがね', '#60A1B8'], ['ほのお', '#E62829'],
  ['みず', '#2980EF'], ['くさ', '#3FA129'], ['でんき', '#FAC000'], ['エスパー', '#EF4179'], ['こおり', '#3DCEF3'],
  ['ドラゴン', '#5060E1'], ['あく', '#624D4E'], ['フェアリー', '#EF70EF']];
const REGIONS = [null, 'カントー', 'ジョウト', 'ホウエン', 'シンオウ', 'イッシュ', 'カロス', 'アローラ', 'ガラル・ヒスイ', 'パルデア'];
const KINDS = [
  { k: 'b', label: '通常', desc: '' },
  { k: 'm', label: 'メガシンカ・ゲンシカイキ', desc: '' },
  { k: 'g', label: 'キョダイマックス', desc: '' },
  { k: 'r', label: 'リージョンフォーム', desc: 'アローラ・ガラルなど' },
  { k: 'f', label: 'フォルムチェンジ・性別', desc: 'ヒートロトム・メスのすがたなど' },
  { k: 'x', label: 'もっと細かいすがた違い', desc: 'アンノーンの文字・ビビヨンの模様など' },
];
const KIND_BADGE = { m: 'メガシンカ', g: 'キョダイマックス', r: 'リージョンフォーム', f: 'すがた違い', x: 'すがた違い' };
const EVO_LABEL = { all: '', final: '最終進化だけ', pre: '進化前だけ' };
const MODES = {
  saku: { name: 'サクッと', desc: 'サクッと好きなポケモンTOP9を決定！', rec: true },
  gachi: { name: 'ガチ', desc: 'ガチで好きなポケモンの順位づけを全て決定！途中保存OK！' },
};
const MODE_KEYS = ['saku', 'gachi'];
const SAKU_CAP = 3;          // サクッと: ふるい分けで1画面に選べる数
const PODIUM_MAX = 12;       // 残りがこの数以下なら、好きな順にタップして並べる（表彰台）
const LIKE_RATE = .2;        // 見積もり用: ふるい分けで「好き」が残る割合の想定
const TREE_K = 9;            // トーナメント木の1ノードの最大の子の数（= 1画面の最大枚数）
const SEC_SINGLE = 3, SEC_MULTI = 5.5, SEC_PODIUM = 20;
const DEFAULT_SETTINGS = { gens: [1, 2, 3, 4, 5, 6, 7, 8, 9], evo: 'all', type: 0, kinds: { b: true, m: true, g: true, r: true, f: true, x: false }, mode: 'saku' };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const imgUrl = i => D.imgBase + ITEMS[i].img;
const dexNo = n => 'No.' + String(n).padStart(4, '0');
// カードの背景色はポケモンの第1タイプの色。タイプで絞り込んだときは、第2タイプに関係なくそのタイプの色にそろえる
let uniformType = 0;
const typeColor = i => TYPES[uniformType || ITEMS[i].t[0]][1];
const fmt = n => n.toLocaleString('ja-JP');
const genName = g => g === 1 ? '初代' : `第${g}世代`;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存できない環境では何もしない */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* noop */ } },
};

/* ============================================================
 * 対象の絞りこみ
 * ============================================================ */
function evoOk(it, evo) {
  if (evo === 'final') return !it.x;                 // 進化先がない（進化しないポケモンを含む）
  if (evo === 'pre') return !!it.x || (!it.p && !it.x); // 進化先がある or 進化しない
  return true;
}
// タイプは「すべて」か1つだけ（そのタイプを持つポケモン。複合タイプの片方でもよい）
const typeOk = (it, type) => !type || it.t.includes(type);
function selectIds(st) {
  const out = [];
  ITEMS.forEach((it, i) => {
    if (st.gens.includes(it.g) && st.kinds[it.k] !== false && (it.k === 'b' || st.kinds[it.k]) && evoOk(it, st.evo) && typeOk(it, st.type)) out.push(i);
  });
  return out;
}
// 通常のすがたの「アナザーフォルム」等の表記は、同じポケモンの別フォルムが一緒に出るときだけ表示
function labelContext(ids) {
  const peers = new Set();
  for (const i of ids) if (ITEMS[i].k === 'f' || ITEMS[i].k === 'x') peers.add(ITEMS[i].no);
  return peers;
}
let labelPeers = new Set();
const formLabel = i => {
  const it = ITEMS[i];
  if (!it.f) return '';
  if (it.d && !labelPeers.has(it.no)) return '';
  return it.f;
};
const fullName = i => formLabel(i) ? `${ITEMS[i].n}（${formLabel(i)}）` : ITEMS[i].n;

function condText(st, n) {
  const g = st.gens.length === 9 ? '全国' : st.gens.length === 1 ? REGIONS[st.gens[0]] : `${st.gens.length}地方`;
  const parts = [g];
  if (st.evo !== 'all') parts.push(EVO_LABEL[st.evo]);
  if (st.type) parts.push(`${TYPES[st.type][0]}タイプ`);
  return `${parts.join('・')}・${fmt(n)}匹から`;
}

/* ============================================================
 * 選ぶ回数の見積もり
 * ============================================================ */
function balanced(n, size) {
  const g = Math.ceil(n / size), base = Math.floor(n / g), extra = n % g;
  return Array.from({ length: g }, (_, i) => base + (i < extra ? 1 : 0));
}
// トーナメント木: 1位が決まるまでの回数 = 木の内部ノード数、以降は1順位ごとに約「段数−0.25」回（シミュレーション実測）
function treeLevels(n) { let m = n, l = 0; do { m = Math.ceil(m / TREE_K); l++; } while (m > 1); return l; }
function treeInit(n) { let m = n, t = 0; while (m > 1) { m = Math.ceil(m / TREE_K); t += m; } return t; }
const treePer = n => Math.max(1, treeLevels(n) - .25);
const treeCost = (n, K) => n < 2 ? 0 : treeInit(n) + (Math.min(K, n) - 1) * treePer(n);
const screenPer = () => innerWidth >= 900 && innerHeight >= 760 ? 20 : 15;
// モードごとの見積もり: { actions: 操作回数, sec: 秒 }。ふるい分けで2割ほど「好き」が残る想定
// K: ガチでその順位まで決めるときの見積もり（省略時は好きなポケモン全員）
function estimateMode(mode, ids, K) {
  const n = ids.length;
  if (n < 2) return { actions: 0, sec: 0 };
  const F = mode === 'gachi' ? n : new Set(ids.map(i => ITEMS[i].fam)).size, per = screenPer();
  const screens = Math.ceil(F / per);
  let pool = Math.max(Math.min(n, TOP_N), Math.round(n * LIKE_RATE));
  if (mode === 'saku') pool = Math.min(pool, Math.max(Math.min(n, TOP_N), Math.round(screens * SAKU_CAP * n / F)));
  const rest = afterScreenCost(mode, pool, K);
  return { actions: Math.round(screens + rest.actions), sec: screens * SEC_MULTI + rest.sec };
}
// ガチで見送った子まで最後まで決めたときの見積もり
function gachiFullMode(ids) {
  const n = ids.length, liked = estimateMode('gachi', ids), rest = n - Math.max(Math.min(n, TOP_N), Math.round(n * LIKE_RATE));
  const a = rest >= 2 ? treeCost(rest, rest) : 0;
  return { actions: Math.round(liked.actions + a), sec: liked.sec + a * SEC_SINGLE };
}
// ふるい分けのあと: 少なければ表彰台（並べ替え1画面）、多ければトーナメント木
function afterScreenCost(mode, pool, K) {
  if (pool <= PODIUM_MAX) return { actions: 1, sec: SEC_PODIUM };
  const a = treeCost(pool, mode === 'gachi' ? K ?? pool : TOP_N);
  return { actions: a, sec: a * SEC_SINGLE };
}
const tourN = s => s.inT.reduce((a, b) => a + b, 0);
// 残りの操作回数（K を渡すとその順位までの回数）
function estimateRemaining(s, K) {
  if (s.phase === 'screen') {
    const U = s.scr.list.length, left = Math.ceil((U - s.scr.pos) / s.scr.per);
    const seen = s.scr.pos / U, likedN = s.scr.liked.reduce((a, u) => a + s.units[u].length, 0);
    const pool = Math.max(1, Math.round(seen > .05 ? likedN / seen : s.ids.length * LIKE_RATE));
    return Math.round(left + afterScreenCost(s.mode, pool).actions);
  }
  if (s.phase === 'podium') return 1;
  if (s.phase !== 'tree') return 0;
  const target = Math.min(K ?? s.K, s.K);
  if (s.ranked.length >= target) return 0;
  const unknown = s.tree.nodes.filter(nd => nd.head === -2).length;
  return Math.round(unknown + Math.max(0, target - s.ranked.length - 1) * treePer(s.tree.size));
}
const minutesText = c => secText(c * SEC_SINGLE);
// プレイ中の残り時間（ふるい分けの画面は1画面あたり長めに見積もる）
function remainingSec(s) {
  const rem = estimateRemaining(s);
  if (s.phase === 'podium') return SEC_PODIUM;
  if (s.phase !== 'screen') return rem * SEC_SINGLE;
  const left = Math.ceil((s.scr.list.length - s.scr.pos) / s.scr.per);
  return left * SEC_MULTI + (rem - left) * SEC_SINGLE;
}
// 「約◯分」。1分未満は「1分以内」（「約」をつけない）
const approx = sec => { const t = secText(sec).replace('ほど', ''); return t === '1分以内' ? t : `約${t}`; };
const secText = sec => {
  const m = Math.round(sec / 60);
  if (m < 1) return '1分以内';
  if (m < 60) return `${m}分ほど`;
  return `${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + '分' : ''}ほど`;
};

/* ============================================================
 * 好みの傾向（タグ）
 * ============================================================ */
const COLOR_ADJ = [null, '黒い', '青い', '茶色い', '灰色の', '緑色の', 'ピンク色の', '紫色の', '赤い', '白い', '黄色い'];
const STAT_TEXT = ['<b>HP</b>が高いタフな', '<b>こうげき</b>が得意な', '<b>ぼうぎょ</b>が高い、かたい', '<b>とくこう</b>が得意な', '<b>とくぼう</b>が高い', '<b>すばやさ</b>自慢の'];
const SHAPE_TEXT = { 1: '<b>まんまる</b>なフォルムの', 2: '<b>細長い体</b>の', 3: '<b>魚のような</b>すがたの', 5: '<b>ふしぎな形</b>の', 8: '<b>四足歩行</b>の',
  9: '<b>つばさ</b>をもつ', 10: '<b>触手やたくさんの足</b>をもつ', 11: '<b>頭がいくつもある</b>', 12: '<b>人に近いすがた</b>の', 14: '<b>よろいのような体</b>の' };

let tagCtx = null;
function buildTagContext(ids) {
  const hs = ids.map(i => ITEMS[i].h).sort((a, b) => a - b);
  const ws = ids.map(i => ITEMS[i].w).sort((a, b) => a - b);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  const gens = new Set(ids.map(i => ITEMS[i].g));
  return { multiGen: gens.size > 1, hLo: q(hs, .25), hHi: q(hs, .75), wLo: q(ws, .25), wHi: q(ws, .75), cache: new Map() };
}
function impression(it) {
  let cute = 0, cool = 0;
  for (const t of it.t) {
    if (t === 18) cute += 2; if (t === 1) cute += 1;
    if (t === 16) cool += 2; if (t === 17 || t === 9 || t === 2) cool += 1;
  }
  if (it.c === 6) cute += 2; if (it.c === 9 || it.c === 10) cute += 1; if (it.c === 1) cool += 1;
  if (it.h <= 0.5) cute += 2; else if (it.h <= 1.0) cute += 1; else if (it.h >= 1.8) cool += 2; else if (it.h >= 1.3) cool += 1;
  if (it.fl & 4) cute += 2;
  if (it.s === 2 || (it.fl & 3)) cool += 1;
  if (it.k === 'm') cool += 1;
  const bst = it.st.reduce((a, b) => a + b, 0);
  if (bst >= 530) cool += 1; if (bst <= 330) cute += 1;
  if (it.sh === 1) cute += 1; if (it.sh === 12 || it.sh === 14) cool += 1;
  return cute - cool >= 3 ? 'cute' : cool - cute >= 3 ? 'cool' : '';
}
function tagsOf(i) {
  const c = tagCtx.cache.get(i);
  if (c) return c;
  const it = ITEMS[i], tg = [];
  for (const t of it.t) tg.push('t:' + t);
  if (tagCtx.multiGen) tg.push('g:' + it.g);
  if (!it.p && !it.x) tg.push('e:single');
  if (it.x) tg.push('e:pre');
  if (it.s === 1) tg.push('e:1');
  if (it.s === 2) tg.push('e:2');
  if (it.fl & 3) tg.push('lm');
  if (it.fl & 8) tg.push('ub');
  if (it.fl & 16) tg.push('px');
  if (it.fl & 32) tg.push('st');
  if (it.fl & 64) tg.push('ps');
  if (it.fl & 128) tg.push('fo');
  if (it.fl & 4) tg.push('bb');
  for (const a of it.ab) tg.push('a:' + a);
  if (it.h <= tagCtx.hLo) tg.push('h:s'); else if (it.h >= tagCtx.hHi) tg.push('h:b');
  if (it.w <= tagCtx.wLo) tg.push('w:l'); else if (it.w >= tagCtx.wHi) tg.push('w:h');
  tg.push('c:' + it.c);
  tg.push('s:' + it.ev);
  const sh = it.sh === 13 ? 9 : it.sh;
  if (SHAPE_TEXT[sh]) tg.push('sh:' + sh);
  if (it.k === 'm' || it.k === 'g' || it.k === 'r') tg.push('k:' + it.k);
  const im = impression(it);
  if (im) tg.push('im:' + im);
  if (it.st.reduce((a, b) => a + b, 0) >= 580) tg.push('bst');
  tagCtx.cache.set(i, tg);
  return tg;
}
// 表示用: [名詞句(HTML), ハイライト色]
function tagPhrase(tag) {
  const [k, v] = tag.split(':');
  switch (k) {
    case 't': return [`<b>${TYPES[v][0]}</b>タイプのポケモン`, TYPES[v][1]];
    case 'g': return [`<b>${genName(v)}</b>（${REGIONS[v]}）のポケモン`];
    case 'e': return [{ single: '<b>進化しない</b>ポケモン', pre: '<b>進化前</b>のポケモン', 1: '<b>1回進化した</b>ポケモン', 2: '<b>2回進化した</b>ポケモン' }[v]];
    case 'lm': return ['<b>伝説・幻</b>のポケモン', '#c98a00'];
    case 'ub': return ['<b>ウルトラビースト</b>'];
    case 'px': return ['<b>パラドックスポケモン</b>'];
    case 'st': return ['<b>御三家</b>（最初のパートナー）のポケモン'];
    case 'ps': return ['<b>600族</b>と呼ばれる実力派のポケモン'];
    case 'fo': return ['<b>化石</b>から復元されたポケモン'];
    case 'bb': return ['<b>ベイビィ</b>ポケモン'];
    case 'a': return [`特性<b>「${esc(D.abilities[v])}」</b>をもつポケモン`];
    case 'h': return [v === 's' ? '平均より<b>小さめ</b>のポケモン' : '平均より<b>大きめ</b>のポケモン'];
    case 'w': return [v === 'l' ? '平均より<b>軽め</b>のポケモン' : '<b>ずっしり重い</b>ポケモン'];
    case 'c': return [`<b>${COLOR_ADJ[v]}</b>ポケモン`];
    case 's': return [`${STAT_TEXT[v]}ポケモン`];
    case 'sh': return [`${SHAPE_TEXT[v]}ポケモン`];
    case 'k': return [{ m: '<b>メガシンカ</b>したすがた', g: '<b>キョダイマックス</b>のすがた', r: '<b>リージョンフォーム</b>' }[v]];
    case 'im': return [v === 'cute' ? '<b>かわいい系</b>のポケモン' : '<b>かっこいい系</b>のポケモン', v === 'cute' ? '#e0569a' : '#4a5bd8'];
    case 'bst': return ['<b>能力が高い</b>強いポケモン'];
  }
  return [tag];
}
// winners は1匹でも複数でもよい（複数選んだ画面は、選んだ数ぶんまとめて加算）
function recordTags(group, winners) {
  if (!Array.isArray(winners)) winners = [winners];
  if (!winners.length) return;
  const T = state.tags;
  const inv = winners.length / group.length;
  for (const l of group) for (const t of tagsOf(state.ids[l])) (T[t] ||= [0, 0])[1] += inv;
  for (const w of winners) for (const t of tagsOf(state.ids[w])) T[t][0] += 1;
}
// 特性のような細かい分類は、たまたま偏りやすいので少し控えめに評価する
const TAG_WEIGHT = { a: .6, c: .85, sh: .85, s: .9 };
function rankedTags(minActual = 3, minLift = 1.35, diverse = false) {
  const out = [];
  for (const [t, [a, e]] of Object.entries(state.tags)) {
    const cat = t.split(':')[0];
    if (a < minActual + (cat === 'a' ? 1 : 0) || a / e < minLift) continue;
    out.push({ t, cat, a, e, lift: a / e, score: (a - e) / Math.sqrt(e + 1) * (TAG_WEIGHT[cat] || 1) });
  }
  out.sort((x, y) => y.score - x.score);
  return diverse ? diversify(out) : out;
}
// 同じ種類の特徴ばかり並ばないようにする（タイプは2つまで、ほかは1つずつ）
function diversify(list) {
  const used = {};
  return list.filter(x => (used[x.cat] = (used[x.cat] || 0) + 1) <= (x.cat === 't' ? 2 : 1));
}
// TOP9の共通点: 対象全体での割合から見込まれる数より、TOP9に多く入っている特徴
function top9Tags(ids, top) {
  const base = {}, hit = {};
  for (const i of ids) for (const t of tagsOf(i)) base[t] = (base[t] || 0) + 1;
  for (const i of top) for (const t of tagsOf(i)) hit[t] = (hit[t] || 0) + 1;
  const out = [];
  for (const [t, a] of Object.entries(hit)) {
    const e = base[t] / ids.length * top.length, cat = t.split(':')[0];
    if (a < 3 || a / e < 1.5) continue;
    out.push({ t, cat, a, e, lift: a / e, score: (a - e) / Math.sqrt(e + 1) * (TAG_WEIGHT[cat] || 1) });
  }
  return diversify(out.sort((x, y) => y.score - x.score));
}

/* ============================================================
 * ソート本体
 *  ・超サクッと/ノーマル: 進化・すがた違いをまとめたグループで「ふるい分け」（好きなだけ複数選択）
 *  ・ノーマル/ガチ: トーナメント木で1匹ずつ選ぶ。
 *    木の各ノードは「子の先頭どうしで一番好きなもの」を覚えていて、根の先頭が次の順位になる。
 *    取り出したらその経路だけを選び直すので、2位以降は1順位あたり「木の段数」ほどの回数で決まる。
 * ============================================================ */
let state = null;
let undoStack = [];

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function newState(settings) {
  const ids = shuffle(selectIds(settings));
  const n = ids.length, mode = MODE_KEYS.includes(settings.mode) ? settings.mode : 'saku';
  const zeros = () => new Array(n).fill(0);
  const s = {
    v: 2, dv: D.version, created: Date.now(), settings, mode, ids, K: Math.min(TOP_N, n),
    phase: 'tree', tree: null, group: null, qnode: -1, lastLv: -1,
    wins: zeros(), pts: zeros(), inT: zeros(), ranked: [], sel: [],
    choices: 0, tags: {}, ms: 0, tipAt: 0, lastTip: '',
  };
  if (mode === 'saku') {
    // サクッと: 進化の系統（すがた違いを含む）ごとに1グループにまとめて出す
    const fams = new Map();
    ids.map((i, l) => [i, l]).sort((a, b) => a[0] - b[0]).forEach(([i, l]) => {
      const f = ITEMS[i].fam;
      if (!fams.has(f)) fams.set(f, []);
      fams.get(f).push(l);
    });
    s.units = [...fams.values()];
  } else {
    // ガチ: 1匹ずつ「好き」を選ぶ
    s.units = ids.map((_, l) => [l]);
  }
  s.reps = s.units.map(u => repOf(s, u));
  s.phase = 'screen';
  // サクッとは1画面3つまで。ただし全部が1画面に収まるときは、候補が足りなくならないよう6つまで
  const per = screenPer();
  s.scr = { list: shuffle(s.units.map((_, u) => u)), pos: 0, per, liked: [], cap: mode === 'saku' ? (s.units.length <= per ? SAKU_CAP * 2 : SAKU_CAP) : null };
  return s;
}
// グループの代表: 進化前のすがた（ベイビィポケモンは除く。例: ピチューではなくピカチュウ）
// 段階 s はベイビィを数えないので、s===0 かつベイビィでないものが代表。グループ内は図鑑順
function repOf(s, unit) {
  const base = unit.filter(l => ITEMS[s.ids[l]].k === 'b');
  const pool = base.length ? base : unit;
  const it = l => ITEMS[s.ids[l]];
  return pool.find(l => it(l).s === 0 && !(it(l).fl & 4)) ?? pool.find(l => !it(l).p) ?? pool[0];
}
// トーナメント木を作る。node.head: -2=未確定, -1=空, それ以外=先頭のポケモン / node.src: 先頭を出した子の位置
function startTree(s, pool) {
  const nodes = [];
  let level = shuffle(pool), lv = 0, leaf = true;
  do {
    const next = [];
    let p = 0;
    for (const sz of balanced(level.length, TREE_K)) {
      nodes.push({ lv, leaf, ch: level.slice(p, p + sz), head: -2, src: -1 });
      next.push(nodes.length - 1);
      p += sz;
    }
    level = next; lv++; leaf = false;
  } while (level.length > 1);
  s.tree = { nodes, root: level[0], levels: lv, size: pool.length, done: new Array(s.ids.length).fill(0) };
  // ガチは木の全員（見送った子の追加分は、すでに決まった順位のあとに続く）、サクッとはTOP9まで
  Object.assign(s, { phase: 'tree', group: null, qnode: -1, lastLv: -1, K: s.mode === 'gachi' ? s.ranked.length + pool.length : Math.min(TOP_N, pool.length) });
  for (const l of pool) s.inT[l] = 1;
}
const childHead = (t, nd, c) => nd.leaf ? (t.done[c] ? -1 : c) : t.nodes[c].head;
function popTree(t, id) {
  const nd = t.nodes[id], c = nd.ch[nd.src];
  if (nd.leaf) t.done[c] = 1; else popTree(t, c);
  nd.head = -2;
  nd.src = -1;
}
// 保存データの形式が変わったものは読み込まない
const normalizeState = s => (s && s.v === 2 && s.dv === D.version && s.ids ? s : null);
function save() { if (state) store.set(SESSION_KEY, state); }
function pushHistory() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 60) undoStack.shift();
  $('#undoBtn').disabled = false;
}
function undo() {
  if (!undoStack.length || busy) return;
  state = JSON.parse(undoStack.pop());
  $('#undoBtn').disabled = !undoStack.length;
  save();
  renderGroup(true);
  toast('1つ戻しました');
}

// 次に出す組を決める。演出が必要なイベントを返す
function advance() {
  const s = state;
  const events = [];
  for (;;) {
    if (s.phase === 'screen') {
      if (s.scr.pos < s.scr.list.length) return events;
      const pool = s.scr.liked.flatMap(u => s.units[u]);
      for (const l of pool) s.inT[l] = 1;
      if (pool.length <= PODIUM_MAX) { events.push(toPodium(pool)); continue; }
      events.push({ type: 'screened', n: pool.length });
      startTree(s, pool);
      continue;
    }
    if (s.phase !== 'tree' || s.group) return events;
    const t = s.tree, n = tourN(s);
    if (s.ranked.length >= Math.min(s.K, n)) {
      s.phase = 'done';
      if (s.mode === 'gachi' && s.ids.length > n) events.push({ type: 'likedDone', rest: s.ids.length - n });
      return events;
    }
    const root = t.nodes[t.root];
    if (root.head >= 0) {
      const id = root.head;
      s.ranked.push(id);
      events.push(s.ranked.length === 1 ? { type: 'champion', id } : { type: 'ranked', id, rank: s.ranked.length });
      popTree(t, t.root);
      if (s.mode === 'gachi' && s.ranked.length === TOP_N && n > TOP_N) events.push({ type: 'top9' });
      continue;
    }
    if (root.head === -1) { s.phase = 'done'; return events; }
    // いちばん下の段から、子の先頭がそろったノードを選ぶ（最初は1回戦→2回戦…の順になる）
    let best = -1;
    t.nodes.forEach((nd, i) => {
      if (nd.head !== -2 || nd.ch.some(c => childHead(t, nd, c) === -2)) return;
      if (best < 0 || nd.lv < t.nodes[best].lv) best = i;
    });
    const nd = t.nodes[best];
    const heads = nd.ch.map(c => childHead(t, nd, c)).filter(h => h >= 0);
    if (heads.length <= 1) {
      nd.head = heads.length ? heads[0] : -1;
      nd.src = heads.length ? nd.ch.findIndex(c => childHead(t, nd, c) === heads[0]) : -1;
      continue;
    }
    if (!s.ranked.length && s.lastLv >= 0 && nd.lv > s.lastLv) events.push({ type: 'round', lv: nd.lv });
    s.lastLv = nd.lv;
    s.qnode = best;
    s.group = shuffle(heads);
    return events;
  }
}

// 表彰台: 残ったポケモンを好きな順にタップ。サクッとは9位まで（足りなければ見送った子から補充）、ガチは全員
function toPodium(pool) {
  const s = state;
  let fin = pool;
  if (s.mode === 'saku' && pool.length < TOP_N) {
    const inPool = new Set(pool);
    const extra = shuffle(s.ids.map((_, l) => l).filter(l => !inPool.has(l))).sort((a, b) => s.pts[b] - s.pts[a]).slice(0, TOP_N - pool.length);
    fin = [...pool, ...extra];
  }
  s.phase = 'podium';
  s.pod = { fin: shuffle(fin), order: [], need: s.mode === 'gachi' ? fin.length : Math.min(TOP_N, fin.length) };
  return { type: 'podium', n: fin.length };
}

// 数字キーで選べるのは、表示が9枚以下のときだけ
const keysEnabled = () => (['screen', 'podium'].includes(state.phase) ? currentKeys().length : state.group?.length ?? 0) <= 9;

/* ---- 複数選択の画面（ふるい分け・表彰台） ---- */
function currentKeys() {
  const s = state;
  if (s.phase === 'screen') return s.scr.list.slice(s.scr.pos, s.scr.pos + s.scr.per);
  if (s.phase === 'podium') return s.pod.fin;
  return [];
}
const keyLocal = key => state.phase === 'screen' ? state.reps[key] : key;
function togglePick(key) {
  if (busy) return;
  const s = state;
  const marks = s.phase === 'podium' ? s.pod.order : s.sel;
  const at = marks.indexOf(key);
  if (at >= 0) marks.splice(at, 1);
  else if (marks.length >= pickCap()) { toast(`この画面で選べるのは${pickCap()}つまでです`); return; }
  else marks.push(key);
  save();
  updatePickUI();
}
// 1画面で選べる数（JSONに保存すると Infinity は null になるので、null は「上限なし」）
const pickCap = () => state.phase === 'screen' ? state.scr.cap ?? Infinity : Infinity;
function updatePickUI() {
  const s = state, podium = s.phase === 'podium';
  const marks = podium ? s.pod.order : s.sel;
  document.querySelectorAll('#cards .card').forEach(c => {
    const key = Number(c.dataset.key), at = marks.indexOf(key);
    c.classList.toggle('picked', at >= 0);
    const pk = c.querySelector('.pick');
    if (podium && at >= 0) pk.dataset.n = at + 1; else delete pk.dataset.n;
  });
  const btn = $('#nextBtn'), info = $('#multiInfo');
  $('#podiumReset').hidden = !podium || !marks.length;
  if (podium) {
    const need = s.pod.need;
    info.textContent = marks.length >= need ? `${need}位まで決まりました` : `${marks.length + 1}位をタップ（${marks.length}/${need}）`;
    btn.textContent = 'この順位で決定';
    btn.disabled = marks.length < need;
    return;
  }
  const cap = pickCap();
  info.textContent = cap < Infinity
    ? (marks.length >= cap ? `${cap}つ選びました` : marks.length ? `${marks.length}つ選択中（あと${cap - marks.length}つ）` : `${cap}つまで選べます`)
    : (marks.length ? `${marks.length}匹選択中` : 'いくつでも選べます');
  btn.textContent = marks.length ? '次へ →' : 'スキップ →';
  btn.disabled = false;
}
function submitMulti() {
  const s = state;
  if (busy || !['screen', 'podium'].includes(s.phase)) return;
  if (s.phase === 'podium') {
    if (s.pod.order.length < s.pod.need) return;
    tick();
    pushHistory();
    let rest = s.pod.fin.slice();
    for (const x of s.pod.order) { recordTags(rest, x); rest = rest.filter(r => r !== x); }
    s.choices++;
    s.ranked = s.pod.order.slice();
    s.K = s.ranked.length;
    s.phase = 'done';
    save();
    animateMulti(s.ranked, () => showChampion(s.ranked[0]));
    return;
  }
  const keys = currentKeys();
  const last = s.scr.pos + s.scr.per >= s.scr.list.length;
  if (last && !s.scr.liked.length && !s.sel.length) { toast('1つ以上選んでください'); return; }
  tick();
  pushHistory();
  const sel = s.sel.slice();
  recordTags(keys.map(keyLocal), sel.map(keyLocal));
  s.choices++;
  s.scr.liked.push(...sel);
  for (const u of sel) for (const l of s.units[u]) s.pts[l]++;
  s.scr.pos += s.scr.per;
  s.sel = [];
  const events = advance();
  save();
  animateMulti(sel, () => handleEvents(events));
}
// ガチ: 好きな子の順位が決まったあと、見送ったポケモンも続けて順位づけする
function startRest() {
  const s = state;
  const rest = s.ids.map((_, l) => l).filter(l => !s.inT[l]);
  if (!rest.length) return false;
  startTree(s, rest);
  return true;
}
function animateMulti(sel, done) {
  busy = true;
  const box = $('#cards');
  box.classList.add('busy');
  box.querySelectorAll('.card').forEach(c => {
    c.classList.remove('enter', 'pressed');
    c.classList.add(sel.includes(Number(c.dataset.key)) ? 'chosen' : 'dismiss');
  });
  setTimeout(() => { busy = false; done(); }, 380);
}

// 実際に選んでいた時間（秒）を数える。1回の選択で60秒を超える分は放置とみなして数えない（bot判定に使う）
function tick() {
  const now = Date.now();
  if (state.lastAt) state.act = (state.act || 0) + Math.min(60000, now - state.lastAt);
  state.lastAt = now;
}
// Google アナリティクスへのイベント（読み込まれていなければ何もしない）
const track = (name, params = {}) => { try { window.gtag && window.gtag('event', name, params); } catch { /* noop */ } };

function choose(local) {
  if (!state || !state.group || !state.group.includes(local) || busy) return;
  tick();
  pushHistory();
  const s = state, t = s.tree, nd = t.nodes[s.qnode];
  recordTags(s.group, local);
  s.choices++;
  nd.head = local;
  nd.src = nd.ch.findIndex(c => childHead(t, nd, c) === local);
  s.wins[local] = Math.max(s.wins[local], nd.lv + 1);
  s.group = null;
  const events = advance();
  save();
  animateChoice(local, () => handleEvents(events));
}

/* ============================================================
 * ソート画面の描画
 * ============================================================ */
let busy = false;
function levelName(lv) {
  const L = state.tree.levels;
  return lv === L - 1 ? '決勝' : lv === L - 2 ? '準決勝' : `${lv + 1}回戦`;
}
function roundTitle() {
  const s = state;
  if (s.phase === 'screen') {
    const cur = Math.floor(s.scr.pos / s.scr.per) + 1, tot = Math.ceil(s.scr.list.length / s.scr.per);
    return [`ふるい分け ${cur}/${tot}`, s.mode === 'gachi' ? '好きなポケモンをぜんぶ選ぼう' : `好きなポケモンを${pickCap()}つまで選ぼう`];
  }
  if (s.phase === 'podium') return ['表彰台', '好きな順にタップしてください'];
  const gs = s.group ? s.group.length : 0;
  const sub = gs === 2 ? '好きなほうを1匹選ぼう' : `${gs}匹から1匹選ぼう`;
  if (s.ranked.length) return [`${fmt(s.ranked.length + 1)}位決定戦`, sub];
  return [levelName(s.tree.nodes[s.qnode]?.lv ?? 0), sub];
}
function updateProgress() {
  const s = state, rem = estimateRemaining(s);
  const p = s.choices / Math.max(1, s.choices + rem);
  $('#progressBar').style.width = Math.max(2, Math.min(100, p * 100)) + '%';
  $('#progressText').textContent = `${fmt(s.choices)}回 選びました`;
  $('#remainText').textContent = rem > 0 ? `あと約${fmt(rem)}回` + (rem >= 100 ? `（${secText(remainingSec(s))}）` : '') : 'まもなく完了';
  const [t, sub] = roundTitle();
  $('#roundLabel').textContent = t;
  $('#roundSub').textContent = sub;
  return p;
}

function splitLabel(s) {
  // 「・」や「のすがた」などの切れ目でだけ改行されるようにする
  return esc(s).replace(/・/g, '・<wbr>')
    .replace(/(の(?:すがた|もよう|はな|ミノ|うみ|いろ|めん|かた|たてがみ|つばさ|コア|ゆうしゃ|おう)|フォルム|スタイル|モード|キャップ|カット|タイプ|サイズ|フェイス|フェザー|けいたい|カセット|ミックス)/g, '<wbr>$1');
}
// members: グループ（進化・すがた違い）としてまとめて出すときの他のメンバー（dataset index）
function cardHTML(i, k, members = []) {
  const it = ITEMS[i], fl = members.length ? `ほか${members.length}匹` : formLabel(i);
  const dots = it.t.map(t => `<i style="--c:${TYPES[t][1]}"></i>`).join('');
  const thumbs = members.length ? `<div class="thumbs" aria-hidden="true">${members.slice(0, 3).map(m => `<img src="${imgUrl(m)}" alt="" loading="lazy" draggable="false">`).join('')}${members.length > 3 ? `<span>+${members.length - 3}</span>` : ''}</div>` : '';
  return `<div class="no">${k ? `<span class="key" aria-hidden="true">${k}</span>` : ''}${dexNo(it.no)}</div><div class="dots" aria-hidden="true">${dots}</div>
    <div class="art"><img src="${imgUrl(i)}" alt="" crossorigin="anonymous" decoding="async" draggable="false">${thumbs}</div>
    <div class="meta"><span class="name">${esc(it.n)}</span>${fl ? `<span class="form">${splitLabel(fl)}</span>` : ''}</div>
    <span class="pick" aria-hidden="true"></span>`;
}

function layoutCards() {
  $('#keyNums').hidden = !keysEnabled();
  const box = $('#cards'), stage = $('#stage');
  const n = box.children.length;
  if (!n) return;
  const W = stage.clientWidth, H = stage.clientHeight;
  // 枚数が多い画面（ふるい分けなど）は正方形寄りのカードにして、1枚あたりを大きくする
  const gap = W < 560 ? 8 : 14, ratio = n > 9 ? .95 : .78;
  let best = { w: 0, cols: 1 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = Math.min((W - gap * (cols - 1)) / cols, ((H - gap * (rows - 1)) / rows) * ratio);
    if (w > best.w + .5) best = { w, cols };
  }
  // 縦がとても狭い画面（スマホの横向きなど）では小さくしすぎず、カードの並びをスクロールできるようにする
  const MIN_W = 88;
  stage.classList.toggle('scroll', best.w < MIN_W);
  if (best.w < MIN_W) best = { w: MIN_W, cols: Math.max(1, Math.floor((W + gap) / (MIN_W + gap))) };
  const w = Math.floor(Math.min(best.w, 320));
  // 縦に余裕がある画面（スマホなど）では、カードを縦長にして画面を広く使う
  const rows = Math.ceil(n / best.cols);
  const h = stage.classList.contains('scroll') ? Math.floor(w / ratio) : Math.floor(Math.max(w / ratio, Math.min((H - gap * (rows - 1)) / rows, w / .6)));
  box.style.setProperty('--cw', w + 'px');
  box.style.setProperty('--ch', h + 'px');
  box.style.setProperty('--gap', gap + 'px');
  box.style.maxWidth = (w * best.cols + gap * (best.cols - 1) + 2) + 'px';
  box.classList.toggle('small', w < 124);
  fitNames(box);
}
function fitNames(root) {
  root.querySelectorAll('.name,.nm').forEach(el => {
    el.style.fontSize = '';
    el.style.whiteSpace = '';
    const avail = el.parentElement.clientWidth - parseFloat(getComputedStyle(el.parentElement).paddingLeft) * 2;
    const w = el.scrollWidth;
    if (w <= avail || !avail) return;
    const f = avail / w;
    const base = parseFloat(getComputedStyle(el).fontSize);
    if (f < .66 && el.textContent.includes('・')) {
      el.innerHTML = splitLabel(el.textContent);
      el.style.whiteSpace = 'normal';
      el.style.wordBreak = 'keep-all';
      el.style.fontSize = base * .82 + 'px';
    } else {
      el.style.fontSize = base * Math.max(.6, f * .98) + 'px';
    }
  });
  root.querySelectorAll('.form,.fm').forEach(el => {
    el.style.fontSize = '';
    el.style.whiteSpace = 'nowrap';
    const avail = el.parentElement.clientWidth * .96;
    const w = el.scrollWidth + 18;
    if (w > avail) {
      const f = avail / w;
      if (f >= .78) el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * f + 'px';
      else el.style.whiteSpace = 'normal';
    }
  });
}

function makeCard(i, k, key, members, onTap, onLong, animate) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'card' + (animate ? ' enter' : '');
  b.style.setProperty('--tc', typeColor(i));
  b.style.setProperty('--i', k);
  b.dataset.key = key;
  b.innerHTML = cardHTML(i, keysEnabled() ? k + 1 : 0, members);
  const img = b.querySelector('.art > img');
  const ok = () => img.classList.add('ok');
  img.addEventListener('load', ok);
  img.addEventListener('error', () => { img.classList.add('ok'); img.style.opacity = .2; });
  if (img.complete && img.naturalWidth) ok();
  bindCard(b, onTap, onLong);
  return b;
}
function renderMulti(animate = true) {
  const s = state, box = $('#cards'), unit = s.phase === 'screen';
  box.classList.remove('busy');
  box.innerHTML = '';
  currentKeys().forEach((key, k) => {
    const local = keyLocal(key), i = s.ids[local];
    const members = unit ? s.units[key].filter(l => l !== local).map(l => s.ids[l]) : [];
    const b = makeCard(i, k, key, members, () => togglePick(key), () => openPreview(local, key), animate);
    b.setAttribute('aria-label', unit ? `${ITEMS[i].n}のグループを選ぶ` : `${fullName(i)}を選ぶ`);
    box.appendChild(b);
  });
  $('#multiBar').hidden = false;
  $('#stopBtn').hidden = true;
  updatePickUI();
  layoutCards();
  $('#undoBtn').disabled = !undoStack.length;
  maybeThought(updateProgress());
  // 次の画面の画像を先読み
  const next = s.phase === 'screen' ? s.scr.list.slice(s.scr.pos + s.scr.per, s.scr.pos + s.scr.per * 2).map(u => s.reps[u]) : [];
  for (const l of next) { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = imgUrl(s.ids[l]); }
}

function renderGroup(animate = true) {
  const s = state;
  if (s.phase === 'done') { showResult(); return; }
  if (['screen', 'podium'].includes(s.phase)) { renderMulti(animate); return; }
  $('#multiBar').hidden = true;
  if (!s.group) { handleEvents(advance()); return; }
  const box = $('#cards');
  box.classList.remove('busy');
  box.innerHTML = '';
  s.group.forEach((local, k) => {
    const i = s.ids[local];
    const b = makeCard(i, k, local, [], () => choose(local), () => openPreview(local), animate);
    b.setAttribute('aria-label', `${fullName(i)}を選ぶ`);
    box.appendChild(b);
  });
  $('#stopBtn').hidden = !(s.phase === 'tree' && s.ranked.length >= 1);
  layoutCards();
  $('#undoBtn').disabled = !undoStack.length;
  const p = updateProgress();
  maybeThought(p);
}

function animateChoice(local, done) {
  busy = true;
  const box = $('#cards');
  box.classList.add('busy');
  box.querySelectorAll('.card').forEach(c => {
    c.classList.remove('enter', 'pressed');
    c.classList.add(Number(c.dataset.key) === local ? 'chosen' : 'dismiss');
  });
  setTimeout(() => { busy = false; done(); }, 380);
}

function handleEvents(events) {
  const champ = events.find(e => e.type === 'champion');
  if (champ) { showChampion(champ.id); return; }
  const ld = events.find(e => e.type === 'likedDone');
  if (ld && !champ) { likedDoneInterlude(ld.rest); return; }
  if (state.phase === 'done') { showResult(true); return; }
  const pod = events.find(e => e.type === 'podium'), scr = events.find(e => e.type === 'screened');
  if (pod) {
    interlude(`<div class="big">表彰台へ！</div><p>残った<b>${pod.n}匹</b>を好きな順にタップ</p>`, 2200, () => renderGroup());
    return;
  }
  if (scr) {
    interlude(`<div class="big">ふるい分け完了！</div><p><b>${fmt(scr.n)}匹</b>から1匹ずつ選んでいきます</p>`, 2200, () => renderGroup());
    return;
  }
  if (events.some(e => e.type === 'top9')) {
    interlude(`<div class="big">TOP9決定！</div><p>最後まで あと約${fmt(estimateRemaining(state))}回（${minutesText(estimateRemaining(state))}）</p>
      <div class="interlude-actions"><button class="btn btn-ghost" type="button" id="goTop9">結果を見る</button><button class="btn btn-primary" type="button" id="goOn">つづける →</button></div>`, 0, () => renderGroup());
    $('#goOn').onclick = e => { e.stopPropagation(); interludeDone(); };
    $('#goTop9').onclick = e => { e.stopPropagation(); $('#interlude').hidden = true; interludeDone = null; save(); showResult(true); };
    return;
  }
  const rd = events.find(e => e.type === 'round');
  if (rd) {
    const t = state.tree, name = levelName(rd.lv);
    const total = t.nodes.filter(nd => nd.lv === rd.lv - 1).length;
    const size = Math.max(...t.nodes.filter(nd => nd.lv === rd.lv).map(nd => nd.ch.length));
    interlude(`<div class="big">${name === '決勝' ? '決勝！' : `${name}へ！`}</div>
      <p>残り<b>${fmt(total)}匹</b>${name === '決勝' ? '' : `・最大${size}匹ずつ`}</p>`, 1500, () => renderGroup());
    return;
  }
  renderGroup();
  const rk = events.filter(e => e.type === 'ranked').pop();
  if (rk) say(`<b>${rk.rank}位</b>は${esc(fullName(state.ids[rk.id]))}！`);
}

function likedDoneInterlude(rest) {
  const a = Math.round(treeCost(rest, rest));
  interlude(`<div class="big">好きなポケモンの順位が決定！</div><p>見送った<b>${fmt(rest)}匹</b>もつづけますか？<br>あと約${fmt(a)}回（${minutesText(a)}）</p>
    <div class="interlude-actions"><button class="btn btn-ghost" type="button" id="goLiked">結果を見る</button><button class="btn btn-primary" type="button" id="goRest">つづける →</button></div>`, 0, null);
  $('#goLiked').onclick = e => { e.stopPropagation(); $('#interlude').hidden = true; interludeDone = null; showResult(true); };
  $('#goRest').onclick = e => { e.stopPropagation(); $('#interlude').hidden = true; interludeDone = null; startRest(); state.ms &= ~8; save(); renderGroup(); };
}

/* ---- カードの操作: タップで選択 / 押している間は拡大 / 長押しで詳細 ---- */
let press = null;
function bindCard(b, onTap, onLong) {
  b.addEventListener('pointerdown', e => {
    if (e.button !== 0 || busy) return;
    press = { b, x: e.clientX, y: e.clientY, long: false };
    b.classList.add('pressed');
    press.timer = setTimeout(() => {
      if (!press || press.b !== b) return;
      press.long = true;
      b.classList.remove('pressed');
      onLong();
    }, 480);
  });
  b.addEventListener('pointermove', e => {
    if (press && press.b === b && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 14) cancelPress();
  });
  b.addEventListener('pointerup', () => {
    if (!press || press.b !== b) return;
    const p = press;
    cancelPress();
    if (!p.long) onTap();
  });
  b.addEventListener('pointerleave', cancelPress);
  b.addEventListener('pointercancel', cancelPress);
  b.addEventListener('contextmenu', e => e.preventDefault());
  b.addEventListener('click', e => { if (e.detail === 0) onTap(); }); // キーボード操作
}
function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press.b.classList.remove('pressed');
  press = null;
}

function openPreview(local, key = null) {
  const s = state, i = s.ids[local], it = ITEMS[i];
  const multi = key != null || s.phase === 'podium';
  const unit = s.phase === 'screen' ? s.units[key] : null;
  const pv = $('#preview');
  pv.style.setProperty('--tc', typeColor(i));
  $('#previewImg').src = imgUrl(i);
  $('#previewImg').alt = fullName(i);
  $('#previewNo').textContent = dexNo(it.no) + (it.k !== 'b' ? '　' + KIND_BADGE[it.k] : '');
  $('#previewName').textContent = it.n;
  $('#previewForm').textContent = formLabel(i);
  $('#previewTypes').innerHTML = it.t.map(t => `<span class="type" style="--c:${TYPES[t][1]}">${TYPES[t][0]}</span>`).join('');
  $('#previewSpec').innerHTML = `<div><dt>高さ</dt><dd>${it.h.toFixed(1)}m</dd></div><div><dt>重さ</dt><dd>${it.w.toFixed(1)}kg</dd></div><div><dt>地方</dt><dd>${REGIONS[it.g]}</dd></div>`;
  const mem = $('#previewMembers');
  mem.hidden = !(unit && unit.length > 1);
  mem.innerHTML = unit && unit.length > 1 ? `<p>このグループのポケモン（${unit.length}匹）</p><div>${unit.map(l => `<figure><img src="${imgUrl(s.ids[l])}" alt="" loading="lazy"><figcaption>${esc(fullName(s.ids[l]))}</figcaption></figure>`).join('')}</div>` : '';
  const k = key ?? local;
  if (multi) {
    const on = s.phase === 'podium' ? s.pod.order.includes(k) : s.sel.includes(k);
    $('#previewChoose').textContent = on ? '選択を外す' : unit ? 'このグループを選ぶ' : 'この子を選ぶ';
    $('#previewChoose').onclick = () => { closePreview(); togglePick(k); };
  } else {
    $('#previewChoose').textContent = 'この子を選ぶ';
    $('#previewChoose').onclick = () => { closePreview(); choose(local); };
  }
  pv.hidden = false;
  $('#previewChoose').focus();
}
function closePreview() { $('#preview').hidden = true; }

/* ---- 考えごとの吹き出し ---- */
const ENDINGS = ['が好きなのかも？', 'がお気に入りなのかも？', 'に惹かれているのかも？'];
function say(html, color) {
  const th = $('#thought'), tx = $('#thoughtText');
  tx.innerHTML = html;
  th.style.setProperty('--hl', color || 'var(--brand)');
  th.classList.remove('pop');
  void th.offsetWidth;
  th.classList.add('pop');
}
function maybeThought(p) {
  const s = state;
  if (s.phase === 'podium' && !(s.ms & 16)) { s.ms |= 16; save(); say('順位を決めよう！1位からタップ！'); return; }
  const milestones = [[.25, '4分の1まで来ました！'], [.5, '半分まで来ました！'], [.75, 'あと少しです！']];
  for (let k = 0; k < milestones.length; k++) {
    if (p >= milestones[k][0] && !(s.ms & (1 << k))) { s.ms |= 1 << k; save(); say(milestones[k][1]); return; }
  }
  if (s.phase === 'tree' && s.ranked.length && !(s.ms & 8)) {
    s.ms |= 8; save();
    say(s.mode === 'gachi' ? `ここから<b>${s.ranked.length + 1}位</b>以降を決めます` : `ここから<b>${s.ranked.length + 1}〜${Math.min(s.K, tourN(s))}位</b>を決めます`);
    return;
  }
  if (s.choices < 8 || s.choices - s.tipAt < 4) {
    if (s.choices === 0) {
      const zoom = matchMedia('(hover: none)').matches ? '長押しで拡大！' : '';
      say(s.phase === 'screen'
        ? (s.mode === 'gachi' ? `好きなポケモンをぜんぶ選ぼう！${zoom}` : `進化系・すがた違いが好きなグループを${pickCap()}つまで選ぼう！${zoom}`)
        : '好きなポケモンを1匹選ぼう！');
    }
    return;
  }
  const tags = rankedTags(4, 1.5).slice(0, 4);
  if (!tags.length) return;
  const pick = tags.find(t => t.t !== s.lastTip) || tags[0];
  s.tipAt = s.choices;
  s.lastTip = pick.t;
  save();
  const [phrase, color] = tagPhrase(pick.t);
  say(phrase + ENDINGS[s.choices % ENDINGS.length], color);
}

/* ---- 演出 ---- */
let interludeDone = null;
function interlude(html, ms, then) {
  const ov = $('#interlude');
  $('#interludeCard').innerHTML = html + (ms ? '<span class="tap">タップで進む</span>' : '');
  ov.hidden = false;
  let finished = false;
  interludeDone = () => {
    if (finished) return;
    finished = true;
    ov.hidden = true;
    interludeDone = null;
    then && then();
  };
  if (ms) {
    const t = setTimeout(interludeDone, ms);
    ov.onclick = () => { clearTimeout(t); interludeDone(); };
  } else ov.onclick = null;
}
function showChampion(local) {
  const s = state, i = s.ids[local];
  confetti();
  const kcap = Math.min(s.K, tourN(s)), rem9 = estimateRemaining(s, TOP_N);
  const more = s.phase === 'tree'
    ? `<p>次は<b>2〜${s.mode === 'gachi' ? 9 : kcap}位</b>（あと約${fmt(rem9)}回・${minutesText(rem9)}）</p><button class="btn btn-primary" type="button" id="goRank">つづける →</button>`
    : '<button class="btn btn-primary" type="button" id="goRank">結果を見る →</button>';
  interlude(`<div class="big">あなたの推しポケNo.1は…</div>
    <img class="champ-img" src="${imgUrl(i)}" alt="" crossorigin="anonymous">
    <div class="champ-name">${esc(ITEMS[i].n)}</div><div class="champ-form">${esc(formLabel(i))}</div>${more}`, 0, () => {
      const rest = state.ids.length - tourN(state);
      if (state.phase === 'done' && state.mode === 'gachi' && rest > 0) likedDoneInterlude(rest);
      else if (state.phase === 'done') showResult(true); else renderGroup();
    });
  $('#goRank').onclick = e => { e.stopPropagation(); interludeDone(); };
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#ff4d5e', '#7b61ff', '#f2b705', '#2fbf71', '#2980ef', '#ff8a3d'];
  for (let k = 0; k < 90; k++) {
    const i = document.createElement('i');
    i.style.left = Math.random() * 100 + 'vw';
    i.style.background = colors[k % colors.length];
    i.style.setProperty('--x', (Math.random() * 40 - 20) + 'vw');
    i.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
    i.style.setProperty('--t', (1.8 + Math.random() * 1.6) + 's');
    i.style.setProperty('--d', (Math.random() * .5) + 's');
    box.appendChild(i);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}
function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, ms);
}

/* ============================================================
 * 画面切り替え
 * ============================================================ */
function show(id) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id;
  document.body.classList.toggle('sorting', id === 'sort');
  document.documentElement.style.overflow = id === 'sort' ? 'hidden' : '';
  window.scrollTo(0, 0);
}
function startSort(st) {
  if (st !== state) sendingK = 0;
  state = normalizeState(st);
  if (!state) { toast('保存データを読み込めませんでした'); goSetup(); return; }
  uniformType = state.settings.type || 0;
  state.lastAt = Date.now();
  if (!state.choices) track('sort_start', { mode: state.mode, count: state.ids.length });
  undoStack = [];
  labelPeers = labelContext(state.ids);
  tagCtx = buildTagContext(state.ids);
  show('sort');
  if (!(window.history.state && window.history.state.sort)) window.history.pushState({ sort: 1 }, '');
  handleEvents(state.group ? [] : advance());
  save();
}
window.addEventListener('popstate', () => {
  closePreview();
  if (!$('#sort').hidden || (!$('#result').hidden && !isShared)) goSetup();
});
function goSetup() {
  uniformType = 0;
  show('setup');
  renderSetup();
}

/* ============================================================
 * スタート画面
 * ============================================================ */
let settings = loadPrefs();
function loadPrefs() {
  const p = store.get(PREF_KEY);
  if (!p || !Array.isArray(p.gens) || !p.kinds) return structuredClone(DEFAULT_SETTINGS);
  return { gens: p.gens.filter(g => g >= 1 && g <= 9), evo: ['all', 'final', 'pre'].includes(p.evo) ? p.evo : 'all',
    type: Number.isInteger(p.type) && p.type >= 0 && p.type <= 18 ? p.type : 0, kinds: { ...DEFAULT_SETTINGS.kinds, ...p.kinds },
    mode: MODE_KEYS.includes(p.mode) ? p.mode : DEFAULT_SETTINGS.mode };
}
function buildSetup() {
  const chips = $('#genChips');
  chips.innerHTML = `<button type="button" class="chip chip-all" data-gen="all"><small>第1〜9世代</small><b>全国</b></button>` +
    REGIONS.slice(1).map((r, k) => `<button type="button" class="chip" data-gen="${k + 1}"><small>${genName(k + 1)}</small><b>${r.replace('・', '・<wbr>')}</b></button>`).join('');
  chips.addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const g = b.dataset.gen;
    if (g === 'all') settings.gens = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    else {
      const n = Number(g);
      if (settings.gens.length === 9) settings.gens = [n];
      else if (settings.gens.includes(n)) settings.gens = settings.gens.filter(x => x !== n);
      else settings.gens = [...settings.gens, n].sort((a, b) => a - b);
      if (!settings.gens.length) settings.gens = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    }
    renderSetup();
  });
  $('#typeSel').innerHTML = '<option value="0">すべてのタイプ</option>' + TYPES.slice(1).map((t, k) => `<option value="${k + 1}">${t[0]}</option>`).join('');
  $('#typeSel').addEventListener('change', e => { settings.type = Number(e.target.value); renderSetup(); });
  $('#evoSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.evo = b.dataset.evo;
    renderSetup();
  });
  $('#kindToggles').innerHTML = KINDS.map(k => `<label class="toggle"><input type="checkbox" data-kind="${k.k}"><span class="sw" aria-hidden="true"></span>
    <span class="toggle-text"><b>${k.label}</b><small>${k.desc}</small></span><span class="plus" data-plus="${k.k}"></span></label>`).join('');
  $('#kindToggles').addEventListener('change', e => {
    const k = e.target.dataset.kind;
    if (!k) return;
    settings.kinds[k] = e.target.checked;
    renderSetup();
  });
  $('#modeCards').innerHTML = MODE_KEYS.map(k => { const m = MODES[k]; return `<button type="button" role="radio" class="mode" data-mode="${k}">
    ${m.rec ? '<span class="rec">おすすめ</span>' : ''}<b>${m.name}</b><span class="mt" data-mt="${k}"></span><small>${m.desc}</small></button>`; }).join('');
  $('#modeCards').addEventListener('click', e => {
    const b = e.target.closest('.mode');
    if (!b) return;
    settings.mode = b.dataset.mode;
    renderSetup();
  });
  $('#startBtn').addEventListener('click', () => {
    const ids = selectIds(settings);
    if (ids.length < 2) { toast('2匹以上になるよう条件を変えてください'); return; }
    const saved = store.get(SESSION_KEY);
    if (saved && saved.phase !== 'done' && !confirm('前回の途中経過は消えてしまいます。新しくはじめますか？')) return;
    startSort(newState(structuredClone(settings)));
  });
  $('#resumeBtn').addEventListener('click', resume);
  $('#discardBtn').addEventListener('click', () => {
    if (!confirm('前回の途中経過を破棄しますか？')) return;
    store.del(SESSION_KEY);
    renderSetup();
  });
  heroArt();
  $('#heroArt').addEventListener('click', heroArt);
  showPlayCount();
}
// プレイした人数（サーバーが記録から数えた count.json）。少ないうちは表示しない
const PLAY_COUNT_MIN = 100;
async function showPlayCount() {
  try {
    const r = await fetch('count.json');
    const n = r.ok ? (await r.json()).n : 0;
    if (!(n >= PLAY_COUNT_MIN)) return;
    $('#playCount').innerHTML = `<b>${fmt(n)}人</b>がプレイしました！`;
    $('#playCount').hidden = false;
  } catch { /* 表示しないだけ */ }
}
function renderSetup() {
  store.set(PREF_KEY, settings);
  const all = settings.gens.length === 9;
  document.querySelectorAll('#genChips .chip').forEach(c => {
    const g = c.dataset.gen;
    c.setAttribute('aria-pressed', String(g === 'all' ? all : !all && settings.gens.includes(Number(g))));
  });
  document.querySelectorAll('#evoSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.evo === settings.evo)));
  document.querySelectorAll('#kindToggles input').forEach(i => { i.checked = !!settings.kinds[i.dataset.kind]; });
  $('#typeSel').value = String(settings.type || 0);
  const base = ITEMS.filter(it => settings.gens.includes(it.g) && evoOk(it, settings.evo) && typeOk(it, settings.type));
  for (const k of KINDS) $(`[data-plus="${k.k}"]`).textContent = (k.k === 'b' ? '' : '+') + fmt(base.filter(it => it.k === k.k).length);
  const ids = selectIds(settings), n = ids.length;
  $('#targetCount').textContent = fmt(n);
  document.querySelectorAll('#modeCards .mode').forEach(b => {
    const k = b.dataset.mode, e = estimateMode(k, ids);
    b.setAttribute('aria-checked', String(k === settings.mode));
    b.querySelector('.mt').innerHTML = n < 2 ? '' : k === 'gachi'
      ? `TOP9まで${approx(estimateMode('gachi', ids, TOP_N).sec)}<br>最後まで${approx(gachiFullMode(ids).sec)}`
      : approx(e.sec);
  });
  const est = estimateMode(settings.mode, ids);
  $('#estimate').textContent = n < 2 ? '2匹以上にしてください' : settings.mode === 'gachi'
    ? `TOP9まで${approx(estimateMode('gachi', ids, TOP_N).sec)}・最後まで${approx(gachiFullMode(ids).sec)}`
    : approx(est.sec);
  $('#startBtn').disabled = n < 2;

  const saved = store.get(SESSION_KEY);
  const rc = $('#resumeCard');
  if (normalizeState(saved)) {
    rc.hidden = false;
    const cond = `${MODES[saved.mode].name}モード・` + condText(saved.settings, saved.ids.length);
    if (saved.phase === 'done') {
      $('#resumeMeta').textContent = `${cond} ・ ランキング完成済み`;
      $('#resumeBtn').textContent = '結果を見る';
    } else {
      $('#resumeMeta').textContent = `${cond} ・ ${fmt(saved.choices)}回選択済み（あと約${fmt(estimateRemaining(saved))}回）`;
      $('#resumeBtn').textContent = '続きから再開';
    }
  } else rc.hidden = true;
}
function resume() {
  const saved = store.get(SESSION_KEY);
  if (!saved) return;
  if (!normalizeState(saved)) return;
  if (saved.phase === 'done') {
    state = saved;
    labelPeers = labelContext(state.ids);
    tagCtx = buildTagContext(state.ids);
    showResult();
  } else startSort(saved);
}
function heroArt() {
  const box = $('#heroArt');
  const spots = [[4, 18, 118], [34, 0, 92], [62, 14, 132], [18, 58, 96], [52, 60, 104], [80, 52, 84]];
  const bases = ITEMS.map((it, i) => i).filter(i => ITEMS[i].k === 'b' || ITEMS[i].k === 'm' || ITEMS[i].k === 'r');
  const pick = shuffle(bases).slice(0, spots.length);
  box.innerHTML = spots.map(([x, y, s], k) => `<span class="float" style="left:${x}%;--y:${y};--s:${s}px;--d:${(-k * .8).toFixed(1)}s;--tc:${typeColor(pick[k])}">
    <img src="${imgUrl(pick[k])}" alt="" loading="lazy"></span>`).join('');
}

/* ============================================================
 * 結果
 * ============================================================ */
// 暫定順位: 勝ち抜いた段数とふるい分けで選ばれた回数の合計が多い順
function resultModel(s) {
  const n = s.ids.length;
  const rk = new Set(s.ranked);
  const keyed = [];
  for (let l = 0; l < n; l++) if (!rk.has(l)) keyed.push({ l, w: s.wins[l] + s.pts[l] });
  keyed.sort((a, b) => b.w - a.w);
  return {
    settings: s.settings, mode: s.mode, total: n, choices: s.choices,
    ranked: s.ranked.map(l => s.ids[l]),
    ref: keyed.filter(x => x.w > 0).map(x => ({ i: s.ids[x.l], w: x.w })),
    rest: keyed.filter(x => x.w === 0).map(x => s.ids[x.l]),
  };
}
let currentModel = null, isShared = false;
// TOP9の枠: 確定した順位 → 足りなければ暫定順位で埋める
const topList = m => [...m.ranked, ...m.ref.map(r => r.i)].slice(0, TOP_N);
function showResult(celebrate) {
  isShared = false;
  currentModel = resultModel(state);
  show('result');
  renderResult(currentModel);
  if (celebrate) confetti();
  collectResult(currentModel);
}
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let imgSaveUrl = null;
function openImgSave(blob) {
  closeImgSave();
  imgSaveUrl = URL.createObjectURL(blob);
  $('#imgSaveImg').src = imgSaveUrl;
  $('#imgSave').hidden = false;
}
function closeImgSave() {
  $('#imgSave').hidden = true;
  if (imgSaveUrl) { URL.revokeObjectURL(imgSaveUrl); imgSaveUrl = null; }
}
/* ---- 結果の匿名集計 ----
 * TOP9（ポケモンのID）・選んだ条件・全順位データを送る。個人を特定する情報は送らない。
 * 同じ回で順位が増えたとき（ガチで見送ったポケモンまで決めたときなど）は、同じランダムIDでもう一度送る。
 */
const varint = v => { const out = []; do { out.push((v & 127) | (v > 127 ? 128 : 0)); v >>>= 7; } while (v); return out; };
async function pipeBytes(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(stream)).arrayBuffer());
}
// 全順位データ: 確定した順位（対象ポケモンの並び順を1つの整数にまとめたもの）＋ 残りのポイント（deflate圧縮）
// [確定数(可変長)][順位の長さ(可変長)][順位][圧縮あり1/なし0][残りのポイント]。対象の並びは「データ版＋条件」から復元する
async function encodeFull(m) {
  const sel = selectIds(m.settings), pos = new Map(sel.map((i, k) => [i, k]));
  const ranked = m.ranked.filter(i => pos.has(i));
  const avail = sel.map((_, k) => k);
  let V = 0n;
  for (const i of ranked) {
    const d = avail.indexOf(pos.get(i));
    V = V * BigInt(avail.length) + BigInt(d);
    avail.splice(d, 1);
  }
  let hex = V ? V.toString(16) : '';
  if (hex.length % 2) hex = '0' + hex;
  const order = hex ? hex.match(/../g).map(x => parseInt(x, 16)) : [];
  const w = new Map(m.ref.map(r => [r.i, r.w])), rankedSet = new Set(ranked);
  let rest = sel.filter(i => !rankedSet.has(i)).map(i => Math.min(255, w.get(i) || 0)), packed = 0;
  if (window.CompressionStream && rest.length) {
    try { const z = await pipeBytes(rest, new CompressionStream('deflate-raw')); if (z.length < rest.length) { rest = [...z]; packed = 1; } } catch { /* 圧縮できなければそのまま */ }
  }
  return b64url([...varint(ranked.length), ...varint(order.length), ...order, packed, ...rest]);
}
let sendingK = 0;   // 送信中の確定数（結果画面が続けて開かれても二重に送らないため）
async function collectResult(m) {
  const s = state;
  if (!s || !canShareURL() || !navigator.sendBeacon) return;
  const top = topList(m);
  if (!top.length || m.ranked.length < Math.min(TOP_N, top.length) || m.ranked.length <= Math.max(s.sentK || 0, sendingK)) return;
  sendingK = m.ranked.length;
  s.sid ||= Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('') + Date.now().toString(36).slice(-2);
  const st = m.settings;
  try {
    const body = new URLSearchParams({
      sid: s.sid, v: D.version, m: m.mode, g: st.gens.reduce((a, g) => a | (1 << (g - 1)), 0), e: ['all', 'final', 'pre'].indexOf(st.evo),
      t: st.type || 0, k: settingsByte(st) >> 2, top: top.map(i => ITEMS[i].id).join(','), n: m.ranked.length, full: await encodeFull(m),
      sec: Math.round((s.act || 0) / 1000), c: s.choices,
    });
    if (!s.sentK) track('sort_complete', { mode: m.mode, choices: s.choices });
    if (navigator.sendBeacon('collect.php', body)) { s.sentK = m.ranked.length; save(); } else sendingK = 0;
  } catch { sendingK = 0; }
}
function renderResult(m) {
  uniformType = m.settings.type || 0;
  labelPeers = labelContext([...m.ranked, ...m.ref.map(r => r.i), ...m.rest]);
  $('#resultCond').textContent = condText(m.settings, m.total) + ` ／ ${MODES[m.mode].name}` + (isShared ? '' : `・${fmt(m.choices)}回`);
  $('#resultTitle').innerHTML = isShared ? '推しポケ<em>TOP9</em>はこれ！' : '私の推しポケ<em>TOP9</em>';
  // 共有ページは TOP9 と「決めてみる！」ボタンだけ
  $('#shareActions').hidden = isShared;
  $('#rankingSection').hidden = isShared && !m.detail;
  const top = $('#top9');
  const cells = [];
  const list = topList(m);
  for (let k = 0; k < TOP_N; k++) {
    const i = list[k];
    if (i == null) { cells.push(`<div class="t9 empty" style="--i:${k}"><span class="rk">${k + 1}</span></div>`); continue; }
    const fl = formLabel(i), tentative = k >= m.ranked.length;
    cells.push(`<div class="t9 r${k + 1}${tentative ? ' tentative' : ''}" style="--i:${k};--tc:${typeColor(i)}"><span class="rk">${k + 1}</span>${tentative ? '<span class="tt">暫定</span>' : ''}
      <img src="${imgUrl(i)}" alt="" crossorigin="anonymous"><span class="nm">${esc(ITEMS[i].n)}</span>${fl ? `<span class="fm">${splitLabel(fl)}</span>` : ''}</div>`);
  }
  top.innerHTML = cells.join('');
  requestAnimationFrame(() => fitNames(top));

  // 共有・続き
  $('#moreActions').hidden = isShared;
  $('#sharedActions').hidden = !isShared;
  $('#shareNote').textContent = location.protocol === 'file:' ? '※ URL共有は公開後に使えます' : '';
  if (!isShared) {
    const s = state, n = tourN(s);
    const cb = $('#continueBtn');
    const restN = s.ids.length - n;
    if (s.phase === 'tree' && s.mode === 'gachi') {
      const rem = estimateRemaining(s);
      cb.hidden = false;
      cb.textContent = `つづけて最後まで決める（あと約${fmt(rem)}回・${minutesText(rem)}）`;
    } else if (s.tree && s.mode === 'saku' && s.ranked.length < n) {
      const from = s.ranked.length + 1, to = s.ranked.length < s.K ? s.K : Math.min(n, s.ranked.length + TOP_N);
      cb.hidden = false;
      cb.textContent = `つづけて${from}位〜${to}位を決める（約${Math.round((to - from + 1) * treePer(s.tree.size))}回）`;
    } else if (s.mode === 'gachi' && s.phase === 'done' && restN > 0) {
      const a = Math.round(treeCost(restN, restN));
      cb.hidden = false;
      cb.textContent = `見送った${fmt(restN)}匹も順位づけする（約${fmt(a)}回・${minutesText(a)}）`;
    } else cb.hidden = true;
  }

  // 好みの傾向（断定せず「〜かも？」で伝える）
  const sec = $('#insightSection'), rt = $('#resultThought');
  if (isShared || !state) { sec.hidden = true; rt.hidden = true; }
  else {
    sec.hidden = false;
    // サクッと: TOP9の共通点から / ガチ: これまでの選択の積み重ねから
    const byTop = state.mode === 'saku';
    const top = topList(m);
    const list = (byTop ? top9Tags(state.ids, top) : rankedTags(2, 1.3, true)).slice(0, 6);
    const [phrase, topColor] = list.length ? tagPhrase(list[0].t) : ['<b>いろんな</b>ポケモン'];
    $('#resultThoughtText').innerHTML = `${phrase}が好きなのかも？`;
    rt.style.setProperty('--hl', topColor || 'var(--brand)');
    rt.hidden = false;
    rt.classList.remove('pop'); void rt.offsetWidth; rt.classList.add('pop');
    $('#insightList').innerHTML = list.length ? list.map(t => {
      const [p, c] = tagPhrase(t.t);
      const w = Math.min(100, 30 + (t.lift - 1) * 35);
      return `<li style="--hl:${c || 'linear-gradient(90deg,var(--brand),var(--brand-2))'}"><span class="lbl">${p}が好き？</span><span class="val">${byTop ? `TOP${top.length}のうち${t.a}匹` : `平均の約${t.lift.toFixed(1)}倍 選んでいます`}</span><span class="bar"><i data-w="${w}"></i></span></li>`;
    }).join('') : '<li class="insight-empty">まだ傾向が見つかりませんでした</li>';
    requestAnimationFrame(() => document.querySelectorAll('#insightList .bar i').forEach(i => { i.style.width = i.dataset.w + '%'; }));
  }

  // 一覧
  const K = m.ranked.length, multi = true;
  $('#rankingLead').textContent = m.ref.length
    ? `1〜${K}位は確定、${K + 1}位以降は暫定順位です`
    : '';
  const row = (i, n, sure, sub) => {
    const fl = formLabel(i);
    return `<li class="rank-row${sure ? ' sure' : ''}" style="--tc:${typeColor(i)}"><span class="n">${n}${sub ? `<small>${sub}</small>` : ''}</span>
      <img src="${imgUrl(i)}" alt="" loading="lazy"><span><span class="nm">${esc(ITEMS[i].n)}</span>${fl ? `<span class="fm">${esc(fl)}</span>` : ''}</span>
      <span class="tp">${ITEMS[i].t.map(t => `<span class="type" style="--c:${TYPES[t][1]}">${TYPES[t][0]}</span>`).join('')}</span></li>`;
  };
  const rows = m.ranked.map((i, k) => row(i, k + 1, true));
  let lastW = -1;
  m.ref.forEach((r, k) => {
    if (r.w !== lastW) { rows.push(`<li class="rank-sep">${multi ? `${r.w}ポイント獲得` : `${r.w}回勝ち抜いたポケモン`}</li>`); lastW = r.w; }
    rows.push(row(r.i, K + k + 1, false, '暫定'));
  });
  $('#ranking').innerHTML = rows.join('');
  const rb = $('#restBox');
  rb.hidden = !m.rest.length;
  rb.open = false;
  $('#restSummary').textContent = `${multi ? 'ふるい分け' : '1回戦'}で見送ったポケモン（${fmt(m.rest.length)}匹）`;
  $('#restGrid').innerHTML = '';
  rb.ontoggle = () => {
    if (rb.open && !$('#restGrid').children.length) {
      $('#restGrid').innerHTML = m.rest.map(i => `<figure><img src="${imgUrl(i)}" alt="" loading="lazy"><figcaption>${esc(fullName(i))}</figcaption></figure>`).join('');
    }
  };
}

/* ---- 共有用URL ----
 * 共有するときに、決まった順位・暫定順位（上位30匹）・選んだ条件をサーバー（share.php）に保存し、短いURL（?s=10文字）にする。
 * 保存できなかったときは、TOP9と選んだ条件だけをURL（?r=…）にビット単位で詰めて入れる（24文字ほど。以前の共有URLもこの形）。
 * 形式7（ビット数）: [形式7:4][データ版の日付:8][地方:9][進化:2][すがた違い:6][タイプ:5][モード:1][件数:4] + 件数×[ポケモン番号:11]
 */
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = code => Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
// すがた違いのビット順は固定（集計データとも共通）。通常のすがたは「外した」ときにビットを立てる
const KBITS = ['m', 'g', 'r', 'f', 'x'];
const settingsByte = st => ['all', 'final', 'pre'].indexOf(st.evo) | (KBITS.reduce((a, k, j) => a | (st.kinds[k] ? 1 << j : 0), 0) << 2) | (st.kinds.b === false ? 128 : 0);
const byteSettings = (gm, ek, type = 0) => ({
  gens: [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(g => gm & (1 << (g - 1))),
  evo: ['all', 'final', 'pre'][ek & 3] || 'all',
  type,
  kinds: { b: !(ek & 128), ...Object.fromEntries(KBITS.map((k, j) => [k, !!((ek >> 2) & (1 << j))])) },
});
// データ版（YYYYMMDD）を「2026年からの日数」の下8ビットにする（古い共有URLかどうかの目安）
const versionDay = v => Math.floor((Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8)) - Date.UTC(2026, 0, 1)) / 864e5) & 255;
function writeBits(fields) {
  const bits = [];
  for (const [v, n] of fields) for (let b = n - 1; b >= 0; b--) bits.push((v >> b) & 1);
  const out = [];
  for (let k = 0; k < bits.length; k += 8) out.push(bits.slice(k, k + 8).reduce((a, b, j) => a | (b << (7 - j)), 0));
  return out;
}
function encodeShare(m) {
  const st = m.settings, top = topList(m), sb = settingsByte(st);
  return b64url(writeBits([[7, 4], [versionDay(D.version), 8], [st.gens.reduce((a, g) => a | (1 << (g - 1)), 0), 9], [sb & 3, 2], [sb >> 2, 6],
    [st.type || 0, 5], [Math.max(0, MODE_KEYS.indexOf(m.mode)), 1], [top.length, 4], ...top.map(i => [i, 11])]));
}
function decodeShareV7(by) {
  let pos = 0;
  const get = n => { let v = 0; for (let k = 0; k < n; k++, pos++) v = (v << 1) | ((by[pos >> 3] >> (7 - (pos & 7))) & 1); return v; };
  get(4);
  const day = get(8), gm = get(9), evo = get(2), kinds = get(6), type = get(5), mode = get(1), count = Math.min(TOP_N, get(4));
  const settings = byteSettings(gm, evo | (kinds << 2), type <= 18 ? type : 0);
  const ranked = Array.from({ length: count }, () => get(11)).filter(i => i < ITEMS.length);
  return { stale: day !== versionDay(D.version), settings, mode: MODE_KEYS[mode] || 'saku', total: selectIds(settings).length, choices: 0, ranked, ref: [], rest: [] };
}
function decodeShare(code) {
  const by = unb64url(code);
  if (by[0] >> 4 !== 7) throw new Error('format');
  return decodeShareV7(by);
}
const pageBase = () => `${location.origin}${location.pathname}`;
const shareLink = m => `${pageBase()}?r=${encodeShare(m)}`;
const SHARE_REF_MAX = 30;
const BY_ID = new Map(ITEMS.map((it, i) => [it.id, i]));
function sharePayload(m) {
  const st = m.settings, id = i => ITEMS[i].id;
  return {
    v: D.version, m: m.mode, g: st.gens.reduce((a, g) => a | (1 << (g - 1)), 0), sb: settingsByte(st), t: st.type || 0,
    n: m.total, c: m.choices, r: m.ranked.map(id), f: m.ref.slice(0, SHARE_REF_MAX).map(r => [id(r.i), r.w]),
  };
}
function modelFromShare(d, sid) {
  const idx = id => BY_ID.get(id);
  const ranked = (d.r || []).map(idx).filter(i => i != null);
  const ref = (d.f || []).map(([id, w]) => ({ i: idx(id), w })).filter(r => r.i != null);
  return {
    stale: ranked.length < (d.r || []).length, settings: byteSettings(d.g, d.sb, d.t <= 18 ? d.t : 0), mode: MODE_KEYS.includes(d.m) ? d.m : 'saku',
    total: d.n || 0, choices: d.c || 0, ranked, ref, rest: [], detail: true, sid,
  };
}
// 同じ結果は1回だけ保存する（順位が増えたら保存し直す）。保存した番号は途中経過と一緒に覚えておく
const shareCache = new Map();
function shareURL(m) {
  if (m.sid) return Promise.resolve(`${pageBase()}?s=${m.sid}`);
  if (isShared) return Promise.resolve(shareLink(m));
  const key = `${state?.created}|${m.ranked.length}|${m.ref.length}|${m.choices}`;
  const saved = state?.shares?.[key];
  if (saved) return Promise.resolve(`${pageBase()}?s=${saved}`);
  if (shareCache.has(key)) return shareCache.get(key);
  const p = (async () => {
    try {
      const r = await fetch('share.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sharePayload(m)) });
      const j = r.ok ? await r.json() : null;
      if (j && /^[a-z0-9]{10}$/.test(j.id)) {
        if (state) { state.shares = { [key]: j.id }; save(); }
        return `${pageBase()}?s=${j.id}`;
      }
    } catch { /* 保存できなければ短い形式で */ }
    shareCache.delete(key);
    return shareLink(m);
  })();
  shareCache.set(key, p);
  return p;
}
function canShareURL() { return location.protocol === 'http:' || location.protocol === 'https:'; }
const HASHTAG = '私の推しポケTOP9';
// ロゴのボール（img/icon.svg と同じもの。tools/make_icons.py で作る）
const LOGO_BALL = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="4" x2="28" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff4d5e"/><stop offset="1" stop-color="#7b61ff"/></linearGradient></defs><g transform="rotate(-22 16 16)"><circle cx="16" cy="16" r="14.72" fill="#14172b"/><circle cx="16" cy="16" r="12" fill="#fff"/><path d="M4 16a12 12 0 0 1 24 0z" fill="url(#g)"/><path d="M7.79 13.01A8.74 8.74 0 0 1 13.01 7.79" fill="none" stroke="#fff" stroke-opacity=".67" stroke-width="2.45"/><rect x="1.28" y="14.86" width="29.44" height="2.28" fill="#14172b"/><circle cx="16" cy="16" r="6" fill="#14172b"/><circle cx="16" cy="16" r="3.83" fill="#fff"/><circle cx="16" cy="16" r="1.61" fill="#ff4d5e"/></g></svg>');
function shareText(m) {
  return `私のNo.1推しポケは、${fullName(topList(m)[0])}でした！\nあなたも推しポケTOP9を決めてみる▼`;
}

/* ---- シェア画像 ---- */
function loadImg(src) {
  return new Promise(res => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fitFont(ctx, text, maxW, size, weight, family) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; if (ctx.measureText(text).width <= maxW) break; s -= 1; } while (s > 12);
  return s;
}
async function makeImage(m) {
  const cv = $('#shareCanvas'), ctx = cv.getContext('2d');
  const W = 1200, H = 1200;
  const DISP = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
  const BODY = '"Noto Sans JP", "Hiragino Sans", sans-serif';
  const list = topList(m);
  const glyphs = '私の推しポケTOP0123456789ランキング#' + list.map(i => ITEMS[i].n).join('');
  const sub = condText(m.settings, m.total) + '選びました.※位以下は暫定' + list.map(formLabel).join('') + location.host;
  try { await Promise.all([document.fonts.load(`800 60px "M PLUS Rounded 1c"`, glyphs), document.fonts.load(`700 24px "Noto Sans JP"`, sub)]); } catch { /* フォントがなくても描画は続ける */ }
  const imgs = await Promise.all(list.map(i => loadImg(imgUrl(i))));

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fff4f5'); bg.addColorStop(1, '#f0edff');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(20,23,43,.06)';
  for (let y = 12; y < H; y += 26) for (let x = 12; x < W; x += 26) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }

  ctx.fillStyle = '#14172b';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 66px ${DISP}`;
  ctx.fillText('私の推しポケ', 64, 118);
  const tw = ctx.measureText('私の推しポケ').width;
  const g = ctx.createLinearGradient(64 + tw, 0, 64 + tw + 220, 0);
  g.addColorStop(0, '#ff4d5e'); g.addColorStop(1, '#7b61ff');
  ctx.fillStyle = g;
  ctx.fillText('TOP9', 64 + tw + 14, 118);
  ctx.fillStyle = '#6b7190';
  ctx.font = `700 24px ${BODY}`;
  const d = new Date();
  const note = m.ranked.length < list.length ? `　※${m.ranked.length + 1}位以下は暫定` : '';
  ctx.fillText(`${condText(m.settings, m.total)}選びました　${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}${note}`, 66, 164);

  // ロゴ（右寄せ）
  ctx.font = `800 30px ${DISP}`;
  const lw = ctx.measureText('推しポケランキング').width, lx = W - 64 - lw - 50, ly = 72;
  const ball = await loadImg(LOGO_BALL);
  if (ball) ctx.drawImage(ball, lx - 2, ly - 2, 40, 40);
  ctx.fillStyle = '#14172b'; ctx.fillText('推しポケランキング', lx + 48, ly + 30);

  const gx = 56, gy = 200, gap = 22, cw = (W - gx * 2 - gap * 2) / 3, ch = (H - gy - 70 - gap * 2) / 3;
  const medal = ['#f2b705', '#a7b0c2', '#d08a4e'];
  for (let k = 0; k < TOP_N; k++) {
    const x = gx + (k % 3) * (cw + gap), y = gy + Math.floor(k / 3) * (ch + gap);
    const i = list[k];
    ctx.save();
    ctx.shadowColor = 'rgba(20,23,43,.12)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    roundRect(ctx, x, y, cw, ch, 28); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
    if (i == null) continue;
    ctx.save();
    roundRect(ctx, x, y, cw, ch, 28); ctx.clip();
    const tc = typeColor(i);
    const rg = ctx.createRadialGradient(x + cw / 2, y + ch * .38, 10, x + cw / 2, y + ch * .38, cw * .62);
    rg.addColorStop(0, tc + '44'); rg.addColorStop(1, tc + '00');
    ctx.fillStyle = rg; ctx.fillRect(x, y, cw, ch);
    ctx.restore();
    if (k === 0) { ctx.lineWidth = 5; ctx.strokeStyle = '#f2b705'; roundRect(ctx, x + 2.5, y + 2.5, cw - 5, ch - 5, 26); ctx.stroke(); }
    const im = imgs[k], fl = formLabel(i);
    const isz = ch - (fl ? 96 : 76);
    if (im) ctx.drawImage(im, x + (cw - isz) / 2, y + 12, isz, isz);
    ctx.fillStyle = '#14172b';
    ctx.textAlign = 'center';
    fitFont(ctx, ITEMS[i].n, cw - 32, 32, 800, DISP);
    ctx.fillText(ITEMS[i].n, x + cw / 2, y + ch - (fl ? 46 : 22));
    if (fl) { ctx.fillStyle = '#6b7190'; fitFont(ctx, fl, cw - 28, 19, 700, BODY); ctx.fillText(fl, x + cw / 2, y + ch - 18); }
    ctx.textAlign = 'left';
    ctx.beginPath(); ctx.arc(x + 34, y + 34, 22, 0, Math.PI * 2);
    ctx.fillStyle = k >= m.ranked.length ? '#9aa0b8' : medal[k] || '#14172b'; ctx.fill();
    ctx.fillStyle = k < 3 ? (k === 0 ? '#3b2a00' : k === 1 ? '#1d2330' : '#fff') : '#fff';
    ctx.font = `800 24px ${DISP}`; ctx.textAlign = 'center';
    ctx.fillText(String(k + 1), x + 34, y + 43);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = '#6b7190'; ctx.font = `700 22px ${BODY}`; ctx.textAlign = 'center';
  ctx.fillText(`#${HASHTAG}`, W / 2, H - 28);
  ctx.textAlign = 'left';
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function withBusy(btn, fn) {
  if (btn.disabled) return;
  const t = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = '作成中…';
  try { await fn(); } catch (e) { console.error(e); toast('作成できませんでした'); } finally { btn.disabled = false; btn.innerHTML = t; }
}
// X のポスト画面のURL（本文・共有URL・ハッシュタグ）
function intentURL(m, url) {
  const q = new URLSearchParams({ text: shareText(m), hashtags: HASHTAG });
  if (url) q.set('url', url);
  return `https://x.com/intent/post?${q}`;
}
async function post() {
  const m = currentModel;
  track('share', { method: 'post' });
  // 共有URLの保存は、画像づくりと同時に始める
  const urlP = canShareURL() ? shareURL(m) : Promise.resolve('');
  // スマホ: 共有メニューから画像ごとポスト
  if (matchMedia('(hover: none)').matches && navigator.canShare) {
    const [blob, url] = await Promise.all([makeImage(m), urlP]);
    const file = new File([blob], 'oshipoke_top9.png', { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      const text = [shareText(m), url, `#${HASHTAG}`].filter(Boolean).join('\n');
      try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    downloadBlob(blob, 'oshipoke_top9.png');
    openPostDialog(m, false, url);
    return;
  }
  // パソコン: 画像をクリップボードにコピーしてから、ポスト画面で貼り付けてもらう
  // （クリックの直後にコピーを始める必要があるので、画像の作成を待つ Promise ごと渡す）
  const blobP = makeImage(m);
  let copied = false;
  if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobP })]); copied = true; } catch {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await blobP })]); copied = true; } catch { /* コピーできない環境 */ }
    }
  }
  if (!copied) downloadBlob(await blobP, 'oshipoke_top9.png');
  openPostDialog(m, copied, await urlP);
}
function openPostDialog(m, copied, url) {
  const paste = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘V' : 'Ctrl+V';
  $('#postTitle').textContent = copied ? '画像をコピーしました' : '画像を保存しました';
  $('#postText').textContent = copied ? `ポスト画面で ${paste} を押すと、画像を貼り付けられます` : 'ポスト画面で、保存した画像を添付してください';
  $('#postOpen').href = intentURL(m, url);
  $('#postDialog').hidden = false;
}
const closePostDialog = () => { $('#postDialog').hidden = true; };

/* ============================================================
 * 起動
 * ============================================================ */
function bindGlobal() {
  $('#undoBtn').addEventListener('click', undo);
  $('#quitBtn').addEventListener('click', () => { save(); if (window.history.state && window.history.state.sort) window.history.back(); else goSetup(); toast('途中経過を保存しました'); });
  $('#previewClose').addEventListener('click', closePreview);
  $('#preview').addEventListener('click', e => { if (e.target.id === 'preview') closePreview(); });
  document.addEventListener('keydown', e => {
    if (!$('#imgSave').hidden) { if (e.key === 'Escape') closeImgSave(); return; }
    if (!$('#postDialog').hidden) { if (e.key === 'Escape') closePostDialog(); return; }
    if (!$('#preview').hidden) { if (e.key === 'Escape') closePreview(); return; }
    if (!$('#interlude').hidden) { if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') && interludeDone) { e.preventDefault(); interludeDone(); } return; }
    if ($('#sort').hidden || !state || e.metaKey || e.ctrlKey || e.altKey) return;
    const multi = ['screen', 'podium'].includes(state.phase);
    if (!multi && !state.group) return;
    if (/^[1-9]$/.test(e.key) && keysEnabled()) {
      const k = Number(e.key) - 1;
      if (multi) { const key = currentKeys()[k]; if (key != null) { e.preventDefault(); togglePick(key); } }
      else { const l = state.group[k]; if (l != null) { e.preventDefault(); choose(l); } }
    }
    else if (e.key === 'Enter' && multi) { e.preventDefault(); if (!$('#nextBtn').disabled) submitMulti(); }
    else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); undo(); }
  });
  // 吹き出しの高さが変わったときなども、カードを並べ直す
  let lastH = 0;
  new ResizeObserver(() => { const h = $('#stage').clientHeight; if (Math.abs(h - lastH) > 2 && !$('#sort').hidden) { lastH = h; layoutCards(); } }).observe($('#stage'));
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!$('#sort').hidden) layoutCards(); if (!$('#result').hidden) fitNames($('#top9')); }, 120); });

  $('#postBtn').addEventListener('click', e => withBusy(e.currentTarget, post));
  $('#saveImgBtn').addEventListener('click', e => withBusy(e.currentTarget, async () => {
    track('share', { method: 'save_image' });
    const blob = await makeImage(currentModel);
    // iPhone・iPad はファイル保存ではなく、画像を開いて長押しで「写真に保存」してもらう（画像は端末内で作るのでサーバー負荷なし）
    if (isIOS()) { openImgSave(blob); return; }
    downloadBlob(blob, 'oshipoke_top9.png');
    toast('画像を保存しました');
  }));
  $('#imgSaveClose').addEventListener('click', closeImgSave);
  $('#postClose').addEventListener('click', closePostDialog);
  $('#postOpen').addEventListener('click', () => setTimeout(closePostDialog, 300));
  $('#postDialog').addEventListener('click', e => { if (e.target.id === 'postDialog') closePostDialog(); });
  $('#imgSave').addEventListener('click', e => { if (e.target.id === 'imgSave') closeImgSave(); });
  $('#copyUrlBtn').addEventListener('click', async () => {
    if (!canShareURL()) { toast('URL共有は公開後に使えます'); return; }
    // Safari はクリック直後でないとコピーできないので、URLの作成を待つ Promise ごと渡す
    track('share', { method: 'copy_url' });
    const urlP = shareURL(currentModel);
    try {
      if (window.ClipboardItem && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': urlP.then(u => new Blob([u], { type: 'text/plain' })) })]);
      } else await navigator.clipboard.writeText(await urlP);
      toast('ランキングのURLをコピーしました');
    } catch { prompt('このURLをコピーしてください', await urlP); }
  });
  $('#copyTextBtn').addEventListener('click', async () => {
    const m = currentModel;
    const lines = [isShared ? '推しポケTOP9' : '私の推しポケTOP9', ...m.ranked.map((i, k) => `${k + 1}位 ${fullName(i)}`)];
    if (m.ref.length) lines.push('', '――暫定順位――', ...m.ref.slice(0, 21).map((r, k) => `${m.ranked.length + k + 1}位 ${fullName(r.i)}`));
    try { await navigator.clipboard.writeText(lines.join('\n')); toast('ランキングをコピーしました'); } catch { toast('コピーできませんでした'); }
  });
  $('#csvBtn').addEventListener('click', () => {
    const m = currentModel;
    const q = v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
    const row = (r, kind, i) => [r, kind, ITEMS[i].no, ITEMS[i].n, formLabel(i), ITEMS[i].t.map(t => TYPES[t][0]).join('/'), ITEMS[i].g].map(q).join(',');
    const rows = ['順位,区分,全国図鑑No.,名前,すがた,タイプ,世代',
      ...m.ranked.map((i, k) => row(k + 1, '確定', i)),
      ...m.ref.map((r, k) => row(m.ranked.length + k + 1, `暫定（${r.w}ポイント）`, r.i)),
      ...m.rest.map(i => row('', '見送り', i))];
    downloadBlob(new Blob(['﻿' + rows.join('\n')], { type: 'text/csv' }), 'oshipoke_ranking.csv');
  });
  $('#nextBtn').addEventListener('click', submitMulti);
  $('#podiumReset').addEventListener('click', () => { if (state?.pod) { state.pod.order = []; save(); updatePickUI(); } });
  // 途中で結果を見ても、あとから「つづけて」で再開できる（phase はそのまま）
  $('#stopBtn').addEventListener('click', () => {
    if (!state || state.phase !== 'tree') return;
    save();
    showResult();
  });
  $('#continueBtn').addEventListener('click', () => {
    const n = tourN(state);
    if (state.mode === 'gachi' && state.phase === 'done') { if (!startRest()) return; }
    else if (state.mode === 'saku' && state.ranked.length >= state.K) state.K = Math.min(n, state.ranked.length + TOP_N);
    state.phase = 'tree';
    state.ms &= ~8;
    startSort(state);
  });
  $('#againBtn').addEventListener('click', () => { undoStack = []; goSetup(); });
}

async function boot() {
  buildSetup();
  bindGlobal();
  // 共有URL: ?s=…（サーバーに保存したランキング）/ ?r=…（TOP9だけをURLに入れた形）
  const q = new URLSearchParams(location.search), sid = q.get('s'), code = q.get('r');
  if ((sid && /^[a-z0-9]{10}$/.test(sid)) || (code && /^[A-Za-z0-9_-]+$/.test(code))) {
    try {
      isShared = true;
      if (sid) {
        const r = await fetch(`share.php?id=${sid}`);
        if (!r.ok) throw new Error(r.status);
        currentModel = modelFromShare(await r.json(), sid);
      } else currentModel = decodeShare(code);
      show('result');
      renderResult(currentModel);
      if (currentModel.stale) toast('データ更新のため一部の表示が異なる場合があります', 4000);
      return;
    } catch (e) {
      console.warn(e);
      isShared = false;
      toast('ランキングのURLを読み込めませんでした');
    }
  }
  goSetup();
}
boot();
})();
