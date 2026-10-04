/* 工程光学刷题 —— 主逻辑
 *
 * 设计要点
 *  - 题库与界面分离：全部题目内容来自 data/questions.json 与 data/chapters.json。
 *  - 答案区与解析区互相独立：两个按钮各自开合，互不影响。
 *  - 默认隐藏：切换题目、切换分类、刷新、重开浏览器后都回到“答案隐藏、解析隐藏”。
 *    隐藏时不创建内容节点（不是靠白色/透明/模糊遮挡），因此不会出现在可视区、
 *    键盘焦点或辅助阅读流程中，也不会在加载时闪出答案。
 *  - 学习状态与稳定题目 ID 绑定，保存在浏览器 localStorage 中。
 */
'use strict';

/* ============================================================ 兼容与工具 */

var STORE_KEY = 'gopt.state.v1';
var STORE_CORRUPT_KEY = 'gopt.state.v1.corrupt';
var PREFS_KEY = 'gopt.prefs.v1';

var STATUS_FILTERS = [
  { id: 'all', name: '全部' },
  { id: 'none', name: '未标记' },
  { id: 'known', name: '会做' },
  { id: 'unknown', name: '不会做' },
  { id: 'shaky', name: '不熟练' }
];
var STATUSES = [
  { id: 'known', name: '会做' },
  { id: 'unknown', name: '不会做' },
  { id: 'shaky', name: '不熟练' }
];
var STATUS_NAME = { known: '会做', unknown: '不会做', shaky: '不熟练' };

var KATEX_MACROS = {
  '\\vect': '\\boldsymbol{#1}',
  '\\dd': '\\mathrm{d}',
  '\\iu': '\\mathrm{i}',
  '\\e': '\\mathrm{e}',
  '\\sinc': '\\operatorname{sinc}',
  '\\F': '\\mathcal{F}'
};

function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

/* ============================================================ 存储（容错） */

var store = {
  state: { status: {}, version: 1 },
  prefs: { scope: { type: 'all' }, statusFilter: 'all', openChapters: {} },
  readable: true,
  writable: true,
  message: '',
  isError: false
};

function safeParse(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: fallback, empty: true };
  try {
    var v = JSON.parse(raw);
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, value: fallback, error: e };
  }
}

function loadStore() {
  var msgs = [];
  var rawState = null, rawPrefs = null;
  try {
    rawState = window.localStorage.getItem(STORE_KEY);
    rawPrefs = window.localStorage.getItem(PREFS_KEY);
  } catch (e) {
    store.readable = false;
    store.writable = false;
    store.isError = true;
    store.message = '浏览器不允许读取本地存储（可能是隐私模式或已禁用网站数据），' +
      '本次的学习状态只保存在内存中，关闭页面后会丢失。';
    return;
  }

  var ps = safeParse(rawState, null);
  if (!ps.ok) {
    // 备份失败时禁止覆盖原始记录。
    var backedUp = false;
    try { window.localStorage.setItem(STORE_CORRUPT_KEY, String(rawState)); backedUp = true; } catch (e) {}
    if (!backedUp) store.writable = false;
    store.isError = true;
    store.message = backedUp
      ? '学习记录格式异常，已保留原始备份。本次从未标记状态开始。'
      : '学习记录格式异常，备份失败。为保留原记录，本次标记只在当前会话生效。';
  } else if (ps.value && typeof ps.value === 'object') {
    var v = ps.value;
    if (v.status && typeof v.status === 'object' && !Array.isArray(v.status)) store.state.status = v.status;
    else if (v.status !== undefined) msgs.push('学习状态字段格式异常，已忽略。');
  }

  var pp = safeParse(rawPrefs, null);
  if (pp.ok && pp.value && typeof pp.value === 'object') {
    var p = pp.value;
    if (typeof p.lastQuestionId === 'string') store.prefs.lastQuestionId = p.lastQuestionId;
    if (p.scope && typeof p.scope === 'object' && typeof p.scope.type === 'string') store.prefs.scope = p.scope;
    if (typeof p.statusFilter === 'string') store.prefs.statusFilter = p.statusFilter;
    if (p.openChapters && typeof p.openChapters === 'object' && !Array.isArray(p.openChapters)) store.prefs.openChapters = p.openChapters;
  }

  // 写入自检
  try {
    window.localStorage.setItem('gopt.probe', '1');
    window.localStorage.removeItem('gopt.probe');
  } catch (e) {
    store.writable = false;
    store.isError = true;
    msgs.push('浏览器拒绝写入本地存储，学习状态本次无法保存。');
  }
  if (msgs.length && !store.message) { store.message = msgs.join(' '); store.isError = true; }
}

function saveState() {
  if (!store.writable) return false;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store.state));
    if(window.OpticsCloud) OpticsCloud.capture();
    return true;
  } catch (e) {
    if (!store.isError) {
      store.isError = true;
      store.message = '保存学习状态失败（浏览器存储可能已满或被禁用）。当前标记在本次会话内仍然有效。';
      renderStoreNote();
    }
    return false;
  }
}

function savePrefs() {
  store.prefs.scope = ui.scope;
  store.prefs.statusFilter = ui.statusFilter;
  store.prefs.openChapters = ui.openChapters;
  if (!store.writable) return;
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(store.prefs)); } catch (e) {}
}

/* 学习状态与稳定题目 ID 绑定。跨来源同源题共用 statusKey，
   因此在任一来源标记后，另一来源看到的状态一致。 */
function statusKeyOf(q) {
  if (!q) return '';
  return q.statusKey || q.id;
}
function getStatus(qid) {
  var v = store.state.status[qid];
  return (v === 'known' || v === 'unknown' || v === 'shaky') ? v : '';
}
function setStatus(qid, val) {
  if (val) store.state.status[qid] = val;
  else delete store.state.status[qid];
  saveState();
}

/* ============================================================ 页面状态 */

var DATA = { questions: [], byId: {}, chapters: [], sources: [], typeNames: {} };
var ui = {
  scope: { type: 'all' },
  statusFilter: 'all',
  scopeIds: [],
  matchIds: [],
  index: 0,
  keepCurrent: false,      // 当前题已被改成不符合筛选，但暂时保留供继续阅读
  answerOpen: false,
  analysisOpen: false,
  choicePick: {},          // 当前题本次作答；切题后清空，重新进入时不透露答案
  choiceQuestionId: null,
  openChapters: {}
};

/* ============================================================ 内联文本渲染 */

var INLINE_RE = /(\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\*\*[^*]+\*\*|\[\[b\]\]|!\[[^\]]*\]\([^)]*\))/g;

function renderInline(text, into) {
  var parts = String(text).split(INLINE_RE);
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p) continue;
    if (p.length > 3 && p.slice(0, 2) === '$$' && p.slice(-2) === '$$') {
      into.appendChild(mathNode(p.slice(2, -2), true));
    } else if (p.charAt(0) === '$' && p.length > 2 && p.slice(-1) === '$') {
      into.appendChild(mathNode(p.slice(1, -1), false));
    } else if (p.length > 4 && p.slice(0, 2) === '**' && p.slice(-2) === '**') {
      var b = el('strong');
      renderInline(p.slice(2, -2), b);
      into.appendChild(b);
    } else if (p === '[[b]]') {
      into.appendChild(el('span', 'blank'));
    } else if (p.slice(0, 2) === '![') {
      var m = /^!\[([^\]]*)\]\(([^)]*)\)$/.exec(p);
      if (m) into.appendChild(figureNode(m[2].trim(), m[1].trim()));
    } else {
      into.appendChild(document.createTextNode(p));
    }
  }
}

function mathNode(tex, display) {
  var wrap = el('span', display ? 'math-block' : 'math-inline');
  try {
    window.katex.render(tex, wrap, {
      displayMode: !!display, throwOnError: false, strict: false, macros: KATEX_MACROS,
      errorColor: '#c0392b'
    });
  } catch (e) {
    wrap.textContent = tex;
    wrap.classList.add('math-failed');
  }
  return wrap;
}

function isAuditDiagram(src) { return /(?:^|\/)assets\/audit-diagrams\/[^?#]+\.svg(?:[?#]|$)/.test(src || ''); }
function figureAssetUrl(src) { return isAuditDiagram(src) ? src + (src.indexOf('?') < 0 ? '?' : '&') + 'v=svg-roof-confirmed-20261003-r2' : src; }

function figureNode(src, alt) {
  var fig = el('figure', 'figure');
  if (isAuditDiagram(src)) fig.classList.add('is-audit-diagram');
  var img = el('img');
  img.src = figureAssetUrl(src);
  img.alt = alt || '题目配图';
  img.loading = 'lazy';
  img.addEventListener('error', function () {
    fig.className = 'figure is-missing';
    clear(fig);
    fig.appendChild(el('div', null, '配图资源缺失：' + src + '（本地资源目录中未找到该文件，请检查 assets 目录）'));
  });
  img.addEventListener('click', function () { openLightbox(src, alt); });
  fig.appendChild(img);
  if (alt) {
    var cap = el('figcaption', null, alt);
    fig.appendChild(cap);
  }
  return fig;
}

function renderBlocks(blocks, into) {
  (blocks || []).forEach(function (b) {
    if (!b) return;
    if (b.k === 'm') { into.appendChild(mathNode(b.x, true)); return; }
    if (b.k === 'table') {
      var wrap=el('div','source-table-wrap'),table=el('table','source-table'),head=el('tr');
      (b.headers||[]).forEach(function(v){var th=el('th');renderInline(v,th);head.appendChild(th);});
      var thead=el('thead');thead.appendChild(head);table.appendChild(thead);var tbody=el('tbody');
      (b.rows||[]).forEach(function(row){var tr=el('tr');row.forEach(function(v){var td=el('td');renderInline(v,td);tr.appendChild(td);});tbody.appendChild(tr);});
      table.appendChild(tbody);wrap.appendChild(table);into.appendChild(wrap);return;
    }
    if (b.k === 'ul' || b.k === 'ol') {
      var list = el(b.k === 'ul' ? 'ul' : 'ol');
      (b.items || []).forEach(function (it) {
        var li = el('li');
        renderInline(it, li);
        list.appendChild(li);
      });
      into.appendChild(list);
      return;
    }
    if (b.k === 'h') { var h = el('h4'); renderInline(b.x, h); into.appendChild(h); return; }
    if (b.k === 'note') { var n = el('div', 'note'); renderInline(b.x, n); into.appendChild(n); return; }
    var p = el('p');
    renderInline(b.x, p);
    into.appendChild(p);
  });
}

/* ============================================================ 列表与筛选 */

function chapterOrderIndex(cid) {
  for (var i = 0; i < DATA.chapters.length; i++) if (DATA.chapters[i].id === cid) return DATA.chapters[i].order;
  return 999;
}

function buildScopeIds() {
  var ids;
  if (ui.scope.type === 'chapter') {
    ids = DATA.questions.filter(function (q) { return q.chapterId === ui.scope.chapterId; });
  } else if (ui.scope.type === 'kn') {
    var ch = findChapter(ui.scope.chapterId);
    var kn = ch ? ch.knowledge.filter(function (k) { return k.id === ui.scope.knId; })[0] : null;
    var set = {};
    (kn ? kn.questionIds : []).forEach(function (i) { set[i] = 1; });
    ids = DATA.questions.filter(function (q) { return set[q.id]; });
  } else {
    ids = DATA.questions.slice();
  }
  ids.sort(function (a, b) {
    var d = chapterOrderIndex(a.chapterId) - chapterOrderIndex(b.chapterId);
    if (d) return d;
    return a.order - b.order;
  });
  ui.scopeIds = ids.map(function (q) { return q.id; });
}

function matchesFilter(qid, filter) {
  if (filter === 'all') return true;
  var st = getStatus(statusKeyOf(DATA.byId[qid]));
  if (filter === 'none') return st === '';
  return st === filter;
}

function buildMatchIds() {
  ui.matchIds = ui.scopeIds.filter(function (id) { return matchesFilter(id, ui.statusFilter); });
}

function findChapter(cid) {
  for (var i = 0; i < DATA.chapters.length; i++) if (DATA.chapters[i].id === cid) return DATA.chapters[i];
  return null;
}
function findKn(cid, kid) {
  var ch = findChapter(cid);
  if (!ch) return null;
  for (var i = 0; i < ch.knowledge.length; i++) if (ch.knowledge[i].id === kid) return ch.knowledge[i];
  return null;
}

function scopeTitle() {
  if (ui.scope.type === 'all') return '全部题目';
  if (ui.scope.type === 'chapter') {
    var c = findChapter(ui.scope.chapterId);
    return c ? (c.num + ' ' + c.title) : '未知章节';
  }
  var ch = findChapter(ui.scope.chapterId);
  var kn = findKn(ui.scope.chapterId, ui.scope.knId);
  return (ch ? ch.num + ' ' + ch.title : '') + (kn ? ' · ' + kn.name : '');
}

function statusFilterName(id) {
  for (var i = 0; i < STATUS_FILTERS.length; i++) if (STATUS_FILTERS[i].id === id) return STATUS_FILTERS[i].name;
  return id;
}

/* 重新载入当前分类 + 筛选，并定位到指定题目（或第一题）。 */
function reselect(opts) {
  opts = opts || {};
  buildScopeIds();
  buildMatchIds();
  ui.keepCurrent = false;
  if (opts.keepQuestionId) {
    var at = ui.matchIds.indexOf(opts.keepQuestionId);
    ui.index = at >= 0 ? at : 0;
  } else {
    ui.index = 0;
    if (opts.preferReview) {
      var reviewAt = ui.matchIds.findIndex(function (id) {
        var status = getStatus(statusKeyOf(DATA.byId[id]));
        return status === 'unknown' || status === 'shaky';
      });
      if (reviewAt >= 0) ui.index = reviewAt;
    }
  }
  ui.answerOpen = false;
  ui.analysisOpen = false;
  render();
}

/* ============================================================ 渲染：目录 */

function orderedStudyChapters() {
  // Instruments belong to geometry in the directory; retain all original IDs.
  var ranks = { geom: 0, inst: 1, phys: 2 };
  return DATA.chapters.slice().sort(function (a, b) {
    var ar = Object.prototype.hasOwnProperty.call(ranks, a.source) ? ranks[a.source] : 3;
    var br = Object.prototype.hasOwnProperty.call(ranks, b.source) ? ranks[b.source] : 3;
    return ar - br;
  });
}

function renderTree() {
  var tree = $('tree');
  clear(tree);

  var rootNode = el('div', 'tree-node');
  var rootBtn = el('button', 'tree-root-btn tree-btn' + (ui.scope.type === 'all' ? ' is-current' : ''));
  rootBtn.type = 'button';
  rootBtn.appendChild(el('span', 'tree-name', '全部题目'));
  var allCnt = DATA.questions.length;
  var allMatch = DATA.questions.filter(function (q) { return matchesFilter(q.id, ui.statusFilter); }).length;
  rootBtn.appendChild(countBadge(allCnt, allMatch));
  rootBtn.addEventListener('click', function () { setScope({ type: 'all' }); });
  rootNode.appendChild(rootBtn);
  tree.appendChild(rootNode);

  var lastSource = '', group = tree, geometryGroup = null;
  orderedStudyChapters().forEach(function (ch) {
    if (ch.source !== lastSource) {
      lastSource = ch.source;
      var srcName = (DATA.sources.filter(function (s) { return s.id === ch.source; })[0] || {}).name || ch.source;
      if (ch.source === 'inst') {
        group = el('section', 'tree-instrument-section');
        group.setAttribute('aria-label', '光学仪器专题');
        group.appendChild(el('h3', 'tree-subsection-title', '光学仪器专题'));
        (geometryGroup || tree).appendChild(group);
      } else {
        group = el('section', 'tree-source-group');
        group.setAttribute('data-source', ch.source);
        if (ch.source === 'geom') { geometryGroup = group; srcName = '几何光学'; }
        group.setAttribute('aria-label', srcName);
        group.appendChild(el('div', 'tree-src', srcName));
        tree.appendChild(group);
      }
    }
    var node = el('div', 'tree-node');
    // Ordinary navigation buttons remain keyboard accessible without incomplete tree ARIA.
    var open = !!ui.openChapters[ch.id];
    node.setAttribute('data-open', open ? '1' : '0');

    var btn = el('button', 'tree-chap-btn tree-btn');
    btn.type = 'button';
    var caret = el('span', 'tree-caret', '▶');
    var row = el('div', 'tree-chapter-row');
    var expand = el('button', 'tree-expand');
    expand.type = 'button';
    expand.appendChild(caret);
    expand.setAttribute('aria-label', (open ? '收起' : '展开') + ch.num + ' ' + ch.title + '的知识点');
    expand.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.title = ch.num + ' ' + ch.title;
    btn.appendChild(el('span', 'tree-name', ch.num + ' ' + ch.title));
    var matchCount = DATA.questions.filter(function (q) {
      return q.chapterId === ch.id && matchesFilter(q.id, ui.statusFilter);
    }).length;
    btn.appendChild(countBadge(ch.count, matchCount));
    if (ui.scope.type === 'chapter' && ui.scope.chapterId === ch.id) btn.classList.add('is-current');
    row.classList.toggle('is-current', btn.classList.contains('is-current'));

    var kids = el('div', 'tree-children');
    kids.id = 'chapter-topics-' + ch.id;
    expand.setAttribute('aria-controls', kids.id);
    kids.setAttribute('aria-label', ch.title + '的知识点');
    ch.knowledge.forEach(function (k) {
      var kb = el('button', 'tree-kn-btn tree-btn');
      kb.type = 'button';
      kb.title = k.name;
      kb.appendChild(el('span', 'tree-name', k.name));
      var kmatch = k.questionIds.filter(function (id) { return matchesFilter(id, ui.statusFilter); }).length;
      kb.appendChild(countBadge(k.count, kmatch));
      if (ui.scope.type === 'kn' && ui.scope.knId === k.id) kb.classList.add('is-current');
      kb.addEventListener('click', function () {
        setScope({ type: 'kn', chapterId: ch.id, knId: k.id });
      });
      kids.appendChild(kb);
    });

    expand.addEventListener('click', function () {
      var isOpen = node.getAttribute('data-open') === '1';
      node.setAttribute('data-open', isOpen ? '0' : '1');
      expand.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      expand.setAttribute('aria-label', (isOpen ? '展开' : '收起') + ch.num + ' ' + ch.title + '的知识点');
      ui.openChapters[ch.id] = !isOpen;
      savePrefs();
    });
    btn.addEventListener('click', function () {
      setScope({ type: 'chapter', chapterId: ch.id }, { keepExpansion: true });
    });

    row.appendChild(expand);
    row.appendChild(btn);
    node.appendChild(row);
    node.appendChild(kids);
    group.appendChild(node);
  });
}

function countBadge(total, match) {
  var b = el('span', 'tree-count');
  if (ui.statusFilter === 'all') {
    b.textContent = total;
  } else {
    b.textContent = match + '/' + total;
    b.classList.add('filtered');
    b.title = '符合当前状态筛选 ' + match + ' 题，该分类共 ' + total + ' 题';
  }
  return b;
}

function renderFilterBar() {
  var wrap = $('status-filter');
  clear(wrap);
  STATUS_FILTERS.forEach(function (f) {
    var b = el('button', 'filter-btn');
    b.type = 'button';
    b.setAttribute('aria-pressed', ui.statusFilter === f.id ? 'true' : 'false');
    b.appendChild(document.createTextNode(f.name));
    if (f.id !== 'all') {
      var n = ui.scopeIds.filter(function (id) { return matchesFilter(id, f.id); }).length;
      b.appendChild(el('span', 'cnt', String(n)));
    }
    b.addEventListener('click', function () { setStatusFilter(f.id); });
    wrap.appendChild(b);
  });
}

function renderStatusButtons() {
  var wrap = $('status-buttons');
  clear(wrap);
  var q = currentQuestion();
  STATUSES.forEach(function (s) {
    var b = el('button', 'btn ' + (s.id === 'known' ? 'btn-ok' : s.id === 'unknown' ? 'btn-bad' : 'btn-mid'));
    b.type = 'button';
    var cur = q ? getStatus(statusKeyOf(q)) : '';
    b.setAttribute('aria-pressed', cur === s.id ? 'true' : 'false');
    b.textContent = s.name;
    b.disabled = !q;
    b.addEventListener('click', function () { changeStatus(s.id); });
    wrap.appendChild(b);
  });
  var clr = el('button', 'btn btn-ghost btn-clear');
  clr.type = 'button';
  clr.textContent = '清除标记';
  clr.disabled = !q || !getStatus(statusKeyOf(q));
  clr.addEventListener('click', function () { changeStatus(''); });
  wrap.appendChild(clr);
}

function renderStoreNote() {
  var n = $('store-note');
  if (!store.message) { n.hidden = true; return; }
  n.hidden = false;
  n.className = 'store-note' + (store.isError ? ' is-error' : '');
  n.textContent = store.message;
}

/* ============================================================ 渲染：题目 */

function currentQuestion() {
  if (!ui.matchIds.length) return null;
  var id = ui.matchIds[ui.index];
  return DATA.byId[id] || null;
}

function resetChoiceForQuestion(q) {
  var nextId = q ? q.id : null;
  if (ui.choiceQuestionId === nextId) return;
  ui.choicePick = {};
  ui.choiceQuestionId = nextId;
}

// Source/editorial notes belong in the disclosure; physical conditions remain in the exercise.
function isQuestionAnnotation(block) {
  return block && block.k === 'note' && /按(?:答案|纸质)|答案依据|依据：|参考来源|纸质|纸解|原(?:卷|照片|图|稿|材料|始材料|始资料|题)|回忆稿|核对|核定|来源|用户.*(?:确认|建议|要求)|主审|照录|按原图保留|印作/.test(block.x || '');
}

function questionContentBlocks(blocks) {
  return (blocks || []).filter(function (block) { return !isQuestionAnnotation(block); });
}

// Keep conclusions, assumptions and explanations in the answer, even when also annotated.
// Only a standalone bibliography/provenance line belongs solely in the source disclosure.
function answerContentBlocks(blocks) {
  return (blocks || []).filter(function (block) {
    return !(block && block.k === 'note' && /^(?:答案依据|参考来源)[：:]/.test(block.x || ''));
  });
}

function questionAnnotations(q) {
  var notes = [], seen = Object.create(null);
  function add(text) {
    if (!text || typeof text !== 'string') return;
    var key = text.replace(/\s+/g, '').trim();
    if (!key || seen[key]) return;
    seen[key] = true;
    notes.push({ k: 'p', x: text });
  }
  ['stem', 'answer', 'analysis'].forEach(function (field) {
    (q[field] || []).forEach(function (block) { if (isQuestionAnnotation(block)) add(block.x); });
  });
  var review = q.review && q.review.notes;
  (Array.isArray(review) ? review : [review]).forEach(add);
  return notes;
}

function renderQuestionSource(q) {
  var notes = questionAnnotations(q);
  var source = el('details', 'source-detail');
  source.dataset.questionId = q.id;
  source.appendChild(el('summary', null, notes.length ? '题目来源及注解' : '题目来源'));
  var panel = el('div', 'source-panel');
  panel.appendChild(el('p', 'source-origin', q.sourceLabel + '／' + (q.origin && q.origin.file ? q.origin.file : '—') +
    (q.origin && q.origin.line ? ' 第 ' + q.origin.line + ' 行' : '')));
  if (q.origin && q.origin.reference) {
    var ref = el('p'); renderInline(q.origin.reference, ref); panel.appendChild(ref);
  }
  if (notes.length) {
    panel.appendChild(el('h4', 'source-heading', '注解'));
    var body = el('div', 'source-annotations');
    renderBlocks(notes, body);
    panel.appendChild(body);
  }
  if (q.reconstruction && q.originalText) {
    panel.appendChild(el('h4', 'source-heading', '原始题目记录'));
    var original = el('p', 'source-original'); renderInline(q.originalText, original); panel.appendChild(original);
  }
  source.appendChild(panel);
  return source;
}

function render() {
  renderFilterBar();
  renderTree();
  renderStatusButtons();
  renderStoreNote();
  renderNotice();
  renderStudyScopeNavigation();

  var q = currentQuestion();
  resetChoiceForQuestion(q);
  var card = $('card');
  var empty = $('empty');

  if (!q) {
    card.hidden = true;
    renderEmpty();
    return;
  }
  empty.hidden = true;
  card.hidden = false;
  ['btn-answer','btn-analysis','btn-jump','jump-input'].forEach(function (id) { $(id).disabled = false; });

  // 顶部信息
  var ch = findChapter(q.chapterId);
  var displayType = isMultipleChoice(q) ? '多选题' : q.typeName;
  $('crumb').textContent = scopeTitle();
  var knNames = currentKnNames(q);
  $('crumb-sub').textContent = (ch ? ch.num + ' ' + ch.title : '') +
    (knNames.length ? ' · ' + knNames.join('、') : '') +
    ' · 题型：' + displayType;

  var scopeCount = ui.scopeIds.length;
  var matchCount = ui.matchIds.length;
  var progress = '第 ' + (ui.index + 1) + ' 题 / 共 ' + matchCount + ' 题';
  if (ui.statusFilter !== 'all') {
    progress += '（' + statusFilterName(ui.statusFilter) + '筛选，本分类共 ' + scopeCount + ' 题）';
  }
  if (ui.keepCurrent) progress += ' · 当前题已不符合筛选';
  $('progress').textContent = progress;
  $('jump-total').textContent = '/ ' + matchCount;
  var jp = $('jump-input');
  jp.value = '';
  jp.placeholder = String(ui.index + 1);
  jp.maxLength = 12;

  store.prefs.lastQuestionId = q.id; savePrefs();
  // 元信息与徽标
  var meta = $('qmeta');
  var previousSource = meta.querySelector('.source-detail');
  var keepSource = previousSource && previousSource.dataset.questionId === q.id;
  var sourceOpen = keepSource && previousSource.open;
  var sourceFocused = keepSource && previousSource.querySelector('summary') === document.activeElement;
  clear(meta);
  meta.appendChild(el('span', null, '原题编号：' + q.number));
  meta.appendChild(el('span', 'sep', '·'));
  meta.appendChild(el('span', null, displayType));
  if (q.name) { meta.appendChild(el('span', 'sep', '·')); meta.appendChild(el('span', null, q.name)); }
  if (q.year) { meta.appendChild(el('span', 'sep', '·')); meta.appendChild(el('span', null, q.year + ' 年题')); }
  meta.appendChild(el('span', 'sep', '·'));
  var source = renderQuestionSource(q);
  source.open = !!sourceOpen;
  meta.appendChild(source);
  if (sourceFocused) source.querySelector('summary').focus({ preventScroll: true });

  var badges = $('qbadges');
  clear(badges);
  badges.appendChild(el('span', 'badge b-type b-blue', displayType));
  var st = getStatus(statusKeyOf(q));
  badges.appendChild(el('span', 'badge' + (st ? ' b-amber' : ''), '学习状态：' + (st ? STATUS_NAME[st] : '未标记')));
  if (isMultipleChoice(q)) badges.appendChild(el('span', 'badge', '可选多个 · 再次点击取消'));
  if (q.statusSharedWith && q.statusSharedWith.length) {
    var sh = el('span', 'badge', '与另一来源的同源题共用状态');
    sh.title = q.statusSharedNote || '';
    badges.appendChild(sh);
  }
  if (q.review && q.review.needsCheck) badges.appendChild(el('span', 'badge b-amber', '待核对'));

  // 题干
  var stem = $('stem');
  clear(stem);
  renderBlocks(questionContentBlocks(q.stem), stem);
  // 原始资料不完整的题（如缺选项、缺题图）：给出明确说明。
  // 这类题在真题模块里也有同样提示；章节练习里补上，避免点了选项没反应却不知原因。
  if (q.playable === false) {
    stem.insertBefore(
      el('div', 'exam-warning',
        '原始资料' + (q.completeness === 'needs_image' && !(q.stemImages || []).length ? '缺少题图' : '仍待核对') +
        '，本题暂不支持在线作答。保留原题号与原文，等待补全。'),
      stem.firstChild
    );
  }

  // 选项
  var opts = $('options');
  clear(opts);
  if (q.options && q.options.length) {
    var longOpt = q.options.some(function (o) { return o.x.length > 26; });
    opts.className = 'options' + (longOpt || q.options.length > 4 ? '' : ' cols-2');
    var picked = selectedChoiceKeys(q);
    q.options.forEach(function (o) {
      var b = el('button', 'option');
      b.type = 'button';
      b.setAttribute('data-option-key', o.key);
      b.setAttribute('aria-pressed', picked.indexOf(o.key) >= 0 ? 'true' : 'false');
      b.appendChild(el('span', 'option-key', o.key));
      var t = el('span', 'option-text');
      renderInline(o.x, t);
      b.appendChild(t);
      b.addEventListener('click', function () {
        if(q.playable === false) return;
        if (isMultipleChoice(q)) {
          var next = selectedChoiceKeys(q);
          var index = next.indexOf(o.key);
          if (index >= 0) next.splice(index, 1); else next.push(o.key);
          // Keep the existing string storage format, including compatibility with cloud records.
          ui.choicePick[q.id] = next.sort().join('');
        } else {
          ui.choicePick[q.id] = (ui.choicePick[q.id] === o.key) ? '' : o.key;
        }
        if(q.occurrenceId) saveExamChoice(q);
        applyChoiceFeedback(q, opts);
      });
      opts.appendChild(b);
    });
    var result = el('span', 'choice-feedback-live' + (isMultipleChoice(q) ? ' is-multiple' : ''));
    result.setAttribute('role', 'status');
    result.setAttribute('aria-live', 'polite');
    opts.appendChild(result);
    applyChoiceFeedback(q, opts);
  } else {
    opts.className = 'options';
  }

  // 题干配图
  var figs = $('stem-figs');
  clear(figs);
  (q.stemImages || []).forEach(function (im) {
    figs.appendChild(figureNode(im.src, im.alt || im.caption || ''));
  });

  // 答案区 / 解析区（默认完全隐藏，且不创建内容）
  applyRegions(q);

  // 翻页按钮边界
  $('btn-prev').disabled = !hasNeighbor(-1);
  $('btn-next').disabled = !hasNeighbor(1);
  $('jump-input').style.borderColor = '';
  $('jump-input').classList.remove('is-error');
  $('jump-input').title = '输入当前列表中的题号';
  $('scroller').scrollTop = 0;
}

/* Only grade an explicit answer key; pending/absent answers stay ungraded. */
function choiceAnswerKeys(q) {
  if (!q || q.playable === false || (q.review && q.review.needsCheck)) return [];
  var paragraph = (q.answer || []).find(function (block) { return block.k === 'p'; });
  if (!paragraph) return [];
  var raw = String(paragraph.x || '').trim();
  var marked = raw.match(/^\*\*([A-H](?:[A-H]|\s*[、,，和及与]\s*[A-H])*)\*\*/i);
  var text = marked ? marked[1] : raw.replace(/[*`]/g, '').trim();
  // Commas can introduce explanatory text (e.g. "D，F 数为 5.6").
  // Treat them as a key separator only inside a bold key or a terminated key list.
  var match = text.match(/^(?:(?:正确答案|正确选项|答案)\s*[:：]?\s*|选(?:择)?\s*)?([A-H](?:[A-H]|\s*[、,，和及与]\s*[A-H])*)(?=$|[。；;:：.()（）])/i) ||
    text.match(/^(?:(?:正确答案|正确选项|答案)\s*[:：]?\s*|选(?:择)?\s*)?([A-H](?:[A-H]|\s*[、和及与]\s*[A-H])*)(?=$|[\s。；;:：,，.()（）]|为|项)/i);
  if (!match) return [];
  var keys = match[1].toUpperCase().match(/[A-H]/g);
  var available = (q.options || []).map(function (option) { return String(option.key).toUpperCase(); });
  if (!keys.every(function (key) { return available.indexOf(key) >= 0; })) return [];
  return keys.filter(function (key, index) { return keys.indexOf(key) === index; });
}

function isMultipleChoice(q) {
  return !!q && (/多选/.test(q.typeName || '') || q.selectionMode === 'multiple' || choiceAnswerKeys(q).length > 1);
}

function validChoiceSelection(q, value) {
  if (!q || typeof value !== 'string' || !/^[A-H]+$/.test(value)) return false;
  var keys = value.split('');
  var available = (q.options || []).map(function (option) { return option.key; });
  return (keys.length === 1 || isMultipleChoice(q)) && keys.every(function (key, index) {
    return available.indexOf(key) >= 0 && keys.indexOf(key) === index;
  });
}

function selectedChoiceKeys(q) {
  var value = ui.choicePick[q.id];
  return validChoiceSelection(q, value) ? value.split('') : [];
}

function applyChoiceFeedback(q, opts) {
  var picked = selectedChoiceKeys(q);
  var keys = choiceAnswerKeys(q);
  var wrong = keys.length && picked.some(function (key) { return keys.indexOf(key) < 0; });
  opts.querySelectorAll('.option').forEach(function (button) {
    var key = button.getAttribute('data-option-key');
    var selected = picked.indexOf(key) >= 0;
    var correct = keys.indexOf(String(key).toUpperCase()) >= 0;
    var verdict = picked.length && keys.length && correct && (selected || wrong) ? 'correct' : wrong && selected ? 'wrong' : '';
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.setAttribute('data-verdict', verdict);
    button.title = verdict === 'correct' ? '正确答案' : verdict === 'wrong' ? '选择错误' : '';
  });
  var live = opts.querySelector('.choice-feedback-live');
  if (live) live.textContent = !picked.length ? '' : !keys.length ? '本题答案尚待核对，暂不判定正误。' : wrong ? '所选包含错误选项。正确选项为 ' + keys.join('、') + '。' : keys.length > 1 ? picked.length === keys.length ? '已选全，回答正确。' : '已选选项正确，尚未选全。' : '选择正确。';
}

function currentKnNames(q) {
  var ch = findChapter(q.chapterId);
  if (!ch) return [];
  return ch.knowledge.filter(function (k) { return k.questionIds.indexOf(q.id) >= 0; })
    .map(function (k) { return k.name; });
}

function applyRegions(q) {
  if (!q) { ui.answerOpen = false; ui.analysisOpen = false; }
  var rn = $('review-note');
  rn.hidden = true;
  rn.textContent = '';
  var aBtn = $('btn-answer'), sBtn = $('btn-analysis');
  var aReg = $('answer-region'), sReg = $('analysis-region');

  if (ui.answerOpen) {
    aReg.hidden = false;
    var ab = $('answer-body');
    clear(ab);
    var answerBlocks = answerContentBlocks(q.answer);
    if (answerBlocks.length) renderBlocks(answerBlocks, ab);
    else ab.appendChild(el('p', null, '原始资料未提供单独答案，当前尚未补充核验答案。'));
    aBtn.textContent = '隐藏答案';
    aBtn.setAttribute('aria-expanded', 'true');
  } else {
    aReg.hidden = true;
    clear($('answer-body'));
    aBtn.textContent = '查看答案';
    aBtn.setAttribute('aria-expanded', 'false');
  }

  if (ui.analysisOpen) {
    sReg.hidden = false;
    var sb = $('analysis-body');
    clear(sb);
    var analysisBlocks = answerContentBlocks(q.analysis);
    if (analysisBlocks.length) renderBlocks(analysisBlocks, sb);
    else sb.appendChild(el('p', null, '本条目的原资料中没有提供解析。'));
    var fw = $('analysis-figs');
    clear(fw);
    (q.analysisImages || []).forEach(function (im) { fw.appendChild(figureNode(im.src, im.alt || '')); });
    renderKnowledge(q);
    sBtn.textContent = '隐藏解析';
    sBtn.setAttribute('aria-expanded', 'true');
  } else {
    sReg.hidden = true;
    clear($('analysis-body'));
    clear($('analysis-figs'));
    clear($('kp-body'));
    sBtn.textContent = '查看解析';
    sBtn.setAttribute('aria-expanded', 'false');
  }
}

function renderKnowledge(q) {
  var into = $('kp-body');
  clear(into);
  var k = q.knowledge || {};

  if (k.points && k.points.length) {
    addKpItem(into, '考点', null, k.points);
  }
  if (k.formulas && k.formulas.length) {
    addKpItem(into, '关键公式与适用条件', k.formulas, null);
  }
  if (k.pitfalls && k.pitfalls.length) {
    addKpItem(into, '易错点', k.pitfalls, null);
  }
  if (!into.childNodes.length) {
    into.appendChild(el('p', null, '原资料未单独列出本题的知识点条目。'));
  }
  if (k.compiled) {
    var n = el('p', 'kp-src', '说明：本题原资料只有「原题 / 分步解析 / 易错点」，' +
      '上面的考点与关键公式由原题解中出现的内容整理而成，不是原稿单列的知识点条目。');
    into.appendChild(n);
  }
}

function addKpItem(into, label, blocks, lines) {
  var d = el('div', 'kp-item');
  d.appendChild(el('div', 'kp-label', label));
  if (lines) {
    var ul = el('ul');
    lines.forEach(function (t) {
      var li = el('li');
      renderInline(t, li);
      ul.appendChild(li);
    });
    d.appendChild(ul);
  } else {
    renderBlocks(blocks, d);
  }
  into.appendChild(d);
}

/* ============================================================ 空状态与提示 */

function renderEmpty() {
  var e = $('empty');
  clear(e);
  var scopeN = ui.scopeIds.length;
  var t = el('div', 'empty-title');
  var txt = el('div', 'empty-text');
  var acts = el('div', 'empty-actions');

  if (scopeN === 0) {
    t.textContent = '这个分类下没有题目';
    txt.textContent = '请从左侧目录选择其他章节或知识点。';
  } else {
    t.textContent = '当前筛选下没有题目';
    txt.textContent = '分类“' + scopeTitle() + '”共 ' + scopeN + ' 题，但都没有标记为“' +
      statusFilterName(ui.statusFilter) + '”。可以切换筛选条件，或回到全部题目。';
    STATUS_FILTERS.forEach(function (f) {
      if (f.id === ui.statusFilter) return;
      var b = el('button', 'btn btn-outline');
      b.type = 'button';
      b.textContent = '改为「' + f.name + '」';
      b.addEventListener('click', function () { setStatusFilter(f.id); });
      acts.appendChild(b);
    });
    var b2 = el('button', 'btn btn-ghost');
    b2.type = 'button';
    b2.textContent = '回到全部题目';
    b2.addEventListener('click', function () { setScope({ type: 'all' }); });
    acts.appendChild(b2);
  }
  e.appendChild(t);
  e.appendChild(txt);
  e.appendChild(acts);
  e.hidden = false;
  $('crumb').textContent = scopeTitle();
  $('crumb-sub').textContent = '';
  $('progress').textContent = ui.statusFilter === 'all' ? '共 0 题' :
    ('共 0 题（' + statusFilterName(ui.statusFilter) + '筛选 / 本分类 ' + scopeN + ' 题）');
  $('jump-total').textContent = '/ 0';
  $('jump-input').value = '';
  $('jump-input').placeholder = '—';
  applyRegions(null);
  ['btn-answer','btn-analysis','btn-jump','jump-input'].forEach(function (id) { $(id).disabled = true; });
  $('btn-prev').disabled = true;
  $('btn-next').disabled = true;
  renderStatusButtons();
}

function renderNotice() {
  var n = $('notice');
  clear(n);
  if (!ui.keepCurrent) { n.hidden = true; return; }
  var q = currentQuestion();
  n.hidden = false;
  n.className = 'notice';
  var msg = el('div', null, '这道题（' + (q ? q.number : '') + '）已经不符合当前的“' +
    statusFilterName(ui.statusFilter) + '”筛选。为了不打断阅读，暂时保留在页面上；' +
    '点击“上一题 / 下一题”后会按新的筛选结果继续，不会跳过相邻题目。');
  n.appendChild(msg);
  var acts = el('div', 'notice-actions');
  var b1 = el('button', 'btn btn-ghost');
  b1.type = 'button';
  b1.textContent = '移出当前题，刷新列表';
  b1.addEventListener('click', function () { reselect({}); });
  acts.appendChild(b1);
  STATUS_FILTERS.forEach(function (f) {
    if (f.id === 'all' || f.id === ui.statusFilter) return;
    var b = el('button', 'btn btn-ghost');
    b.type = 'button';
    b.textContent = '改为「' + f.name + '」筛选';
    b.addEventListener('click', function () { setStatusFilter(f.id); });
    acts.appendChild(b);
  });
  n.appendChild(acts);
}

/* ============================================================ 交互动作 */

function setScope(scope, opts) {
  ui.scope = scope;
  if (scope.type !== 'all' && !(opts && opts.keepExpansion)) ui.openChapters[scope.chapterId] = true;
  savePrefs();
  reselect({ preferReview: scope.type === 'chapter' || scope.type === 'kn' });
  closeNav();
}

function setStatusFilter(f) {
  ui.statusFilter = f;
  savePrefs();
  reselect({});
}

/* 位置比较：按 scopeIds 中的出现次序判断前后关系 */
function scopePos(id) { return ui.scopeIds.indexOf(id); }

// Resolve a nonempty section using the same chapter/topic order as the sidebar.
function adjacentStudyScope(dir) {
  if (ui.scope.type !== 'chapter' && ui.scope.type !== 'kn') return null;
  var scopes = [];
  orderedStudyChapters().forEach(function(ch) {
    if (ui.scope.type === 'chapter') scopes.push({type:'chapter',chapterId:ch.id});
    else ch.knowledge.forEach(function(kn) { scopes.push({type:'kn',chapterId:ch.id,knId:kn.id}); });
  });
  var at = scopes.findIndex(function(s) { return s.chapterId === ui.scope.chapterId && (s.type === 'chapter' || s.knId === ui.scope.knId); });
  for (var i=at+dir; at>=0 && i>=0 && i<scopes.length; i+=dir) {
    var s=scopes[i], kn=s.type==='kn'?findKn(s.chapterId,s.knId):null;
    var found=DATA.questions.some(function(q) { return q.chapterId===s.chapterId && (!kn || kn.questionIds.indexOf(q.id)>=0) && matchesFilter(q.id,ui.statusFilter); });
    if(found) return s;
  }
  return null;
}
function goStudyScope(dir) {
  var s=adjacentStudyScope(dir); if(!s) return false;
  clearTimeout(jumpErrTimer); $('jump-input').style.borderColor=''; $('jump-input').title=''; $('jump-input').classList.remove('is-error');
  setScope(s); return true;
}
function renderStudyScopeNavigation() {
  [-1, 1].forEach(function (dir) {
    var button = $(dir < 0 ? 'btn-prev-section' : 'btn-next-section');
    button.hidden = ui.scope.type !== 'chapter' && ui.scope.type !== 'kn';
    button.disabled = !adjacentStudyScope(dir);
    button.onclick = function () { goStudyScope(dir); };
    button.title = '进入' + (dir < 0 ? '上' : '下') + '一个有符合当前筛选条件题目的小节';
  });
}

function hasNeighbor(dir) {
  var q = currentQuestion();
  if (!q) return false;
  if (ui.keepCurrent && dir > 0) return true;
  var pos = scopePos(q.id);
  return findNeighbor(pos, dir) !== null;
}

function findNeighbor(pos, dir) {
  // 在 matchIds 中寻找 scope 次序在 pos 之后（dir=1）或之前（dir=-1）的最近一题
  var best = null, bestPos = null;
  for (var i = 0; i < ui.matchIds.length; i++) {
    if (!matchesFilter(ui.matchIds[i], ui.statusFilter)) continue;
    var p = scopePos(ui.matchIds[i]);
    if (p < 0) continue;
    if (dir > 0 && p > pos && (bestPos === null || p < bestPos)) { best = i; bestPos = p; }
    if (dir < 0 && p < pos && (bestPos === null || p > bestPos)) { best = i; bestPos = p; }
  }
  return best;
}

function go(dir) {
  var q = currentQuestion();
  if (!q) return;
  var pos = scopePos(q.id);
  if (ui.keepCurrent) {
    // 当前题已不符合筛选：先按新筛选重建列表，再用原位置找到相邻题，避免跳题。
    buildMatchIds();
    ui.keepCurrent = false;
  }
  var target = findNeighbor(pos, dir);
  if (target === null) {
    ui.index = Math.min(ui.index, Math.max(0, ui.matchIds.length - 1));
    ui.answerOpen = false; ui.analysisOpen = false;
    render(); return;
  }
  ui.index = target;
  ui.answerOpen = false;
  ui.analysisOpen = false;
  render();
}

function jumpTo(text) {
  var s = String(text || '').trim();
  if (!s) return false;
  var q = currentQuestion();
  var pos = q ? scopePos(q.id) : 0;
  var before = ui.matchIds.slice();
  var beforeIndex = ui.index;
  if (ui.keepCurrent) buildMatchIds();
  function invalidJump() { ui.matchIds = before; ui.index = beforeIndex; return false; }

  if (/^\d+$/.test(s)) {
    var n = parseInt(s, 10);
    if (n >= 1 && n <= ui.matchIds.length) {
      ui.index = n - 1;
      ui.keepCurrent = false;
      ui.answerOpen = false; ui.analysisOpen = false;
      render();
      return true;
    }
    return invalidJump();
  }
  // 按原题编号匹配（例如 “9-3”“题 9-3”“选择题4”“填空2”）
  var norm = s.replace(/\s+/g, '').replace(/^题/, '');
  for (var i = 0; i < ui.matchIds.length; i++) {
    var qq = DATA.byId[ui.matchIds[i]];
    if (!qq) continue;
    var num = String(qq.number).replace(/\s+/g, '').replace(/^(题|大题)/, '');
    if (num === norm || String(qq.number).replace(/\s+/g, '') === s.replace(/\s+/g, '')) {
      ui.index = i; ui.keepCurrent = false;
      ui.answerOpen = false; ui.analysisOpen = false;
      render();
      return true;
    }
  }
  return invalidJump();
}

function changeStatus(val) {
  var q = currentQuestion();
  if (!q || q.playable === false) return;
  if(q.occurrenceId) markExamOccurrence(q,val);
  var qid = statusKeyOf(q);
  if (val) setStatus(qid, val); else setStatus(qid, '');
  // 状态改变会影响筛选结果；若当前题不再符合筛选，保留当前题并给出提示。
  if (!matchesFilter(q.id, ui.statusFilter)) {
    if (!ui.keepCurrent) {
      ui.keepCurrent = true;
    }
  } else {
    if (ui.keepCurrent) {
      ui.keepCurrent = false;
      // 重新符合筛选：把它重新纳入列表并定位
      var at = ui.scopeIds.indexOf(q.id);
      buildMatchIds();
      var idx = ui.matchIds.indexOf(q.id);
      ui.index = idx >= 0 ? idx : 0;
      void at;
    }
  }
  var scroll = $('scroller').scrollTop;
  render();
  $('scroller').scrollTop = scroll;
}

function openLightbox(src, alt) {
  $('lightbox-img').classList.toggle('is-audit-diagram', isAuditDiagram(src));
  $('lightbox-img').src = figureAssetUrl(src);
  $('lightbox-img').alt = alt || '';
  $('lightbox-cap').textContent = alt || '';
  $('lightbox').hidden = false;
  $('lightbox-close').focus();
}
function closeLightbox() { $('lightbox').hidden = true; $('lightbox-img').src = ''; }

function closeNav() { document.getElementById('app').classList.remove('nav-open'); $('nav-toggle').setAttribute('aria-expanded', 'false'); }
function toggleNav() {
  var open = document.getElementById('app').classList.toggle('nav-open');
  $('nav-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
}

/* ============================================================ 事件绑定 */

function bind() {
  $('btn-answer').addEventListener('click', function () {
    ui.answerOpen = !ui.answerOpen;
    applyRegions(currentQuestion());
  });
  $('btn-analysis').addEventListener('click', function () {
    ui.analysisOpen = !ui.analysisOpen;
    applyRegions(currentQuestion());
  });
  $('btn-prev').addEventListener('click', function () { go(-1); });
  $('btn-next').addEventListener('click', function () { go(1); });
  $('btn-jump').addEventListener('click', function () {
    if (!jumpTo($('jump-input').value)) {
      showJumpError();
    } else { $('jump-input').value = ''; }
  });
  $('jump-input').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); $('btn-jump').click(); }
  });
  $('nav-toggle').addEventListener('click', toggleNav);
  $('sidebar-backdrop').addEventListener('click', closeNav);
  $('lightbox-close').addEventListener('click', closeLightbox);
  $('lightbox').addEventListener('click', function (ev) { if (ev.target === $('lightbox')) closeLightbox(); });

  document.addEventListener('keydown', function (ev) {
    if (ui.scope.type === 'english') return;
    if (ev.key === 'Escape') { closeLightbox(); closeNav(); return; }
    var tag = (ev.target && ev.target.tagName) || '';
    if (!$('lightbox').hidden || $('app').classList.contains('nav-open')) return;
    if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) return;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target.isContentEditable) return;
    if (ev.key === 'ArrowLeft') { go(-1); }
    if (ev.key === 'ArrowRight') { go(1); }
  });
}

var jumpErrTimer = null;
function showJumpError() {
  var inp = $('jump-input');
  inp.classList.add('is-error');
  inp.style.borderColor = '#d9483b';
  inp.title = '请输入 1 到 ' + ui.matchIds.length + ' 之间的题号，或输入原题编号（如 9-3）';
  clearTimeout(jumpErrTimer);
  jumpErrTimer = setTimeout(function () {
    inp.style.borderColor = '';
    inp.title = '';
  }, 1800);
}

/* ============================================================ 启动 */

function fatal(title, detail) {
  $('boot').hidden = false;
  $('boot-msg').textContent = title;
  var d = $('boot-detail');
  d.hidden = false;
  d.textContent = detail;
}

function normalizeState() {
  // 清理指向不存在题目的旧记录（只移除非法的键，不动其它数据）
  var validKeys = {};
  DATA.questions.forEach(function (q) { validKeys[q.statusKey || q.id] = 1; });
  var valid = {};
  Object.keys(store.state.status).forEach(function (k) {
    var v = store.state.status[k];
    if (validKeys[k] && (v === 'known' || v === 'unknown' || v === 'shaky')) valid[k] = v;
  });
  store.state.status = valid;

  var s = store.prefs.scope;
  if (!s || ['all', 'chapter', 'kn', 'exams', 'exam'].indexOf(s.type) < 0 || (s.type === 'chapter' && !findChapter(s.chapterId)) ||
      (s.type === 'kn' && !findKn(s.chapterId, s.knId))) {
    store.prefs.scope = { type: 'all' };
  }
  if (!STATUS_FILTERS.some(function (f) { return f.id === store.prefs.statusFilter; })) {
    store.prefs.statusFilter = 'all';
  }
}

function start() {
  if(window.OpticsCloud){ STORE_KEY=OpticsCloud.localKey('gopt.state.v1'); PREFS_KEY=OpticsCloud.localKey('gopt.prefs.v1'); STORE_CORRUPT_KEY=STORE_KEY+'.corrupt'; }
  loadStore();
  normalizeState();
  ui.scope = store.prefs.scope;
  ui.statusFilter = store.prefs.statusFilter;
  ui.openChapters = store.prefs.openChapters || {};
  if (ui.scope.type !== 'all') ui.openChapters[ui.scope.chapterId] = true;

  buildScopeIds();
  buildMatchIds();
  ui.index = Math.max(0, ui.matchIds.indexOf(store.prefs.lastQuestionId));
  ui.answerOpen = false;
  ui.analysisOpen = false;

  $('boot').hidden = true;
  $('app').hidden = false;
  bind();
  render();
}

function boot() {
  var need = ['data/chapters.json', 'data/questions.json', 'data/past-exams.json'];
  var got = {};
  var done = 0;

  need.forEach(function (url) {
    fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' 返回 HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      got[url] = j;
      if (++done === need.length) finish();
    }).catch(function (e) {
      fatal('无法载入题库数据。', '读取 ' + url + ' 失败：' + (e.message || e) +
        '\n\n本机使用请通过启动入口打开；在线使用请检查网络，以及部署目录内 data 和 vendor 是否完整。');
    });
  });

  function finish() {
    try {
      DATA.chapters = got['data/chapters.json'].chapters || [];
      DATA.sources = got['data/chapters.json'].sources || [];
      DATA.typeNames = got['data/chapters.json'].typeNames || {};
      DATA.questions = got['data/questions.json'].questions || [];
      DATA.byId = {};
      DATA.questions.forEach(function (q) { DATA.byId[q.id] = q; });
      if (!DATA.questions.length) throw new Error('题库为空');
      initExams(got['data/past-exams.json']);
      start();
      if(window.OpticsCloud) OpticsCloud.attach();
      if(window.OpticsHome) OpticsHome.attach();
      if(window.OpticsStudyTools) OpticsStudyTools.attach();
      if(window.OpticsDashboard) OpticsDashboard.attach();
      document.title = '工程光学刷题（' + DATA.questions.length + ' 题）';
    } catch (e) {
      fatal('题库数据解析失败。', String(e && e.stack ? e.stack : e));
    }
  }
}

function bootWithCloud(){
  if(window.OpticsAuth){
    OpticsAuth.ready.then(()=>{
      OpticsHome.initialize();
      var bootStarted = false;
      function bootForSignedInUser() {
        if (!OpticsAuth.user || bootStarted) return;
        bootStarted = true;
        OpticsCloud.ready.then(boot);
      }
      OpticsAuth.subscribe(bootForSignedInUser);
      bootForSignedInUser();
    });
  }else fatal('认证服务未加载。','请刷新页面后重试。');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootWithCloud);
else bootWithCloud();
