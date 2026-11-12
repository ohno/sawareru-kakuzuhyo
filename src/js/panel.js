// HTML for the detail panel, the hover tooltip and the 2D decay-chain diagram.
import {
  ELEMENTS, CATEGORIES, isMagic, primaryCategory, modeCategory, modeLabel, modeDesc, nucHtml, nucText,
  fmtHalfLife, fmtSeconds, fmtJpi, fmtKeV, fmtMeV, fmtBranch, sup, feDeficit, HL_CSS, HL_STABLE, HL_RANGE,
  LEGO_PALETTE,
} from './nuclear.js';
import { ELEMENT_INFO, ELEMENT_ISOTOPES, ELEMENT_DISCOVERY, ABUNDANCE } from './data.js';
import { FUEL_GROUPS, FY_SOURCE } from './fuel.js';
import { HYPER_KINDS, hyperHtml, HYPER_SOURCE, EXPERIMENTS } from './hyper.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const catColor = (cat, theme) => CATEGORIES[cat][theme] || CATEGORIES[cat].light;

// The detail panel reads top-down from the summary (key figures) to the reference data; each block below the
// summary folds like the sections of the left panel, and the choice is remembered per viewer.
const ISEC_KEY = 'nuclide3d.infosec.v2'; // v2: parents open by default
const isecOpen = { iso: true, modes: true, chain: true, parents: true, props: true, isomers: false };
try {
  Object.assign(isecOpen, JSON.parse(localStorage.getItem(ISEC_KEY) || '{}'));
} catch {
  // storage may be unavailable (private mode, sandbox); the defaults then last for this visit only
}
export function rememberSection(key, open) {
  if (!(key in isecOpen) || isecOpen[key] === open) return;
  isecOpen[key] = open;
  try {
    localStorage.setItem(ISEC_KEY, JSON.stringify(isecOpen));
  } catch {
    // see above
  }
}
const sec = (key, title, body, { hint = '', count = '' } = {}) => `
  <details class="isec" data-isec="${key}"${isecOpen[key] === false ? '' : ' open'}>
    <summary${hint ? ` title="${esc(hint)}"` : ''}><span>${title}${count !== '' ? `<small>${count}</small>` : ''}</span></summary>
    <div class="isec-body">${body}</div>
  </details>`;

// three key figures right under the name: what one looks for first
const factsHtml = (cells) => `<div class="facts">${cells.map(([k, v, title]) =>
  `<div${title ? ` title="${esc(title)}"` : ''}><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
const arcColor = (cat) => CATEGORIES[cat].arc || '#888';

function jaName(nuc) {
  const el = ELEMENTS[nuc.z];
  return nuc.z === 0 ? '中性子' : `${el[2]}${nuc.a}`;
}

export function tooltipHtml(nuc, graph, idx) {
  const dom = graph.dominant(idx);
  const decay = nuc.st ? '安定' : dom ? `${modeLabel(dom.mode)} ${fmtBranch(dom.raw)}` : '';
  return `<b>${nucHtml(nuc)}</b> <span>${esc(jaName(nuc))}</span><span class="tt-sep">·</span>${esc(fmtHalfLife(nuc))}${decay && !nuc.st ? `<span class="tt-sep">·</span>${esc(decay)}` : ''}`;
}

// ---------- hypernuclei ----------
const fmtB = (b) => (b === null || b === undefined ? '—' : `${(+b).toFixed(2)} MeV`);

export function hyperTooltipHtml(h) {
  const k = HYPER_KINDS[h.kind];
  return `<b>${hyperHtml(h)}</b> <span>${k.name}</span>${h.b !== null && h.b !== undefined ? `<span class="tt-sep">·</span>${k.bind} = ${fmtB(h.b)}` : ''}`;
}

export function hyperDetailHtml(h, graph, { pinned }) {
  const k = HYPER_KINDS[h.kind];
  const el = ELEMENTS[h.nameZ];
  const core = graph.find(h.coreZ, h.coreN);
  const coreNuc = core >= 0 ? graph.nuclides[core] : null;
  const hyperons = h.kind === 'LL' ? 'Λ × 2' : h.kind === 'X' ? 'Ξ⁻ × 1' : `${k.sym} × 1`;
  const [site, method] = EXPERIMENTS[h.exp] || [h.exp || '—', '—'];
  const props = [
    [k.bind, fmtB(h.b), k.bindTitle],
    ['核子のコア', coreNuc ? `<button class="to" data-idx="${core}">${nucHtml(coreNuc)}</button>` : `Z = ${h.coreZ}, N = ${h.coreN}`],
    ['ハイペロン', hyperons],
    ['s クォーク数', String(k.s)],
    ['報告年', h.year ? `${h.year} 年` : '—', 'この種を報告した最も古い文献の年（最初の観測の年とは限りません）'],
    ['実験地', esc(site)],
    ['生成方法', esc(method)],
  ].map(([a, b, title]) => `<dt${title ? ` title="${esc(title)}"` : ''}>${a}</dt><dd>${b}</dd>`).join('');
  const ref = h.ref ? (h.doi
    ? `<a href="https://doi.org/${encodeURI(h.doi)}" target="_blank" rel="noopener">${esc(h.ref)}</a>`
    : esc(h.ref)) : '';
  return `
  <div class="nuc-head">
    <div class="nuc-big" style="--c:${k.color};--fg:#fff"><sup>${h.a}</sup><sub class="hy">${k.sym}</sub>${esc(el[0])}</div>
    <div class="nuc-title">
      <div class="nuc-name">${esc(el[2])}${h.a} の${k.name}</div>
      <div class="nuc-en">${k.en}</div>
      <div class="nuc-zna">Z = ${h.coreZ}　N = ${h.coreN}　A = ${h.a}</div>
    </div>
  </div>
  ${factsHtml([[k.bind, fmtB(h.b), k.bindTitle], ['s クォーク', `${k.s} 個`], ['報告年', h.year ? `${h.year} 年` : '—']])}
  <div class="badges"><span class="badge on-color" style="--c:${k.color}">${k.name}</span></div>
  <p class="elem-desc">${esc(k.desc)}</p>
  ${sec('props', '情報', `<dl class="props">${props}</dl>${ref ? `<p class="muted small rk-ref">文献: ${ref}</p>` : ''}`)}
  <p class="foot">ハイパー核のデータ: ${esc(HYPER_SOURCE)}</p>`;
}

// the 使い方 section of the left panel
/** top of the left panel: the numbers of the chart */
export function introHtml(stats) {
  return `
    <div class="stats">
      <div><span>${stats.total.toLocaleString()}</span>核種</div>
      <div><span>${stats.stable}</span>安定核</div>
      <div><span>${stats.riken}</span>理研で発見</div>
    </div>`;
}

export function howtoHtml() {
  return `
    <p class="howto-lead">箱ひとつが原子核ひとつです。マウスを重ねると、その核の性質と<strong>崩壊先</strong>（矢印）が表示されます。クリックで固定できます。</p>
    <dl class="howto">
      <dt><kbd>ドラッグ</kbd></dt><dd>回転（「移動」モードでは平行移動）</dd>
      <dt><kbd>右ドラッグ</kbd></dt><dd>平行移動</dd>
      <dt><kbd>ホイール</kbd></dt><dd>ズーム（カーソルの位置へ）</dd>
      <dd class="wide"><kbd>中ボタンドラッグ</kbd> <kbd>Ctrl+ドラッグ</kbd> 平行移動</dd>
      <dt><kbd>1本指</kbd></dt><dd>回転</dd>
      <dt><kbd>2本指</kbd></dt><dd>平行移動・ピンチでズーム</dd>
      <dt><kbd>カーソル</kbd></dt><dd>性質と崩壊先を表示</dd>
      <dt><kbd>クリック</kbd></dt><dd>選択を固定 / 解除（タップも同じ）</dd>
      <dt><kbd>Esc</kbd></dt><dd>選択を解除</dd>
      <dt><kbd>←</kbd><kbd>→</kbd></dt><dd>中性子数 ±1（固定中）</dd>
      <dt><kbd>↑</kbd><kbd>↓</kbd></dt><dd>陽子数 ±1（固定中）</dd>
      <dt><kbd>F</kbd></dt><dd>選択した核へカメラを移動</dd>
      <dt><kbd>R</kbd></dt><dd>表示をリセット</dd>
      <dt><kbd>M</kbd></dt><dd>選んだ核の音のオン / オフ</dd>
    </dl>`;
}

// abundances: fractions shown as %, ppm, ppb or ppt
function fmtFrac(f) {
  if (f >= 1e-3) return `${(f * 100).toPrecision(3)} %`;
  if (f >= 1e-6) return `${(f * 1e6).toPrecision(3)} ppm`;
  if (f >= 1e-9) return `${(f * 1e9).toPrecision(3)} ppb`;
  return `${(f * 1e12).toPrecision(3)} ppt`;
}

// element-level rows for the properties list: when the element (not this isotope) was found, cosmic abundance
function elementProps(nuc) {
  if (nuc.z === 0) return [];
  const d = ELEMENT_DISCOVERY[nuc.z];
  const ab = ABUNDANCE.elements[nuc.z];
  const none = nuc.z > 92 ? 'なし（人工元素）' : 'ごくわずか';
  return [
    ['元素の発見', d === 'ancient' ? '古代から知られる' : d ? `${d} 年` : '—',
      '元素として初めて確認（観測・認識）された年。Wikipedia の元素発見年表による。単離された年とは異なることがあります'],
    ['宇宙での存在量（原子数）', ab ? `${fmtFrac(ab.num)}（${ab.rank} 位）` : none, ABUNDANCE.label],
    ['宇宙での存在量（質量）', ab ? fmtFrac(ab.mass) : none, ABUNDANCE.label],
  ];
}

// element introduction and its characteristic isotopes (one per line; click to go there)
function elementHtml(nuc, graph) {
  const el = ELEMENTS[nuc.z];
  const info = ELEMENT_INFO[nuc.z] || '';
  const isotopes = (ELEMENT_ISOTOPES[nuc.z] || []).map(([a, note]) => {
    const i = graph.find(nuc.z, a - nuc.z);
    const label = `<span class="iso-nuc">${nucHtml({ a, s: el[0] })}</span><small>${esc(note)}</small>`;
    return i < 0 ? `<li><span class="iso-chip">${label}</span></li>`
      : `<li><button class="iso-chip${a === nuc.a ? ' current' : ''}" data-idx="${i}">${label}</button></li>`;
  }).join('');
  return `${info ? `<p class="elem-desc">${esc(info)}</p>` : ''}
    ${isotopes ? sec('iso', `${esc(el[2])}の特徴的な同位体`, `<ul class="iso-list">${isotopes}</ul>`) : ''}`;
}

function ancestorsHtml(idx, graph, generations, minBranch) {
  const G = Math.max(1, generations);
  const { edges, truncated } = graph.ancestors(idx, { generations: G, minBranch });
  if (!edges.length) return '<p class="muted small">この核へ崩壊してくる核（しきい値以上の分岐）は登録されていません。</p>';
  const rows = [];
  for (let gen = 1; gen <= G; gen++) {
    const seen = new Set();
    const items = edges.filter((e) => e.gen === gen && !seen.has(e.from) && seen.add(e.from))
      .map((e) => `<button class="to" data-idx="${e.from}">${nucHtml(graph.nuclides[e.from])} <small>${esc(modeLabel(e.mode))}</small></button>`);
    if (items.length) rows.push(`<div class="gen"><span class="gen-l">${gen} 世代前</span><div class="parents">${items.join('')}</div></div>`);
  }
  return rows.join('') + (truncated ? '<p class="muted small">数が多いため一部のみ表示しています。</p>' : '');
}

// fission yields are per fission; shown in %
function fmtYield(y) {
  if (!y) return '—';
  const pct = y * 100;
  if (pct >= 0.01) return `${+pct.toPrecision(3)} %`;
  const e = Math.floor(Math.log10(pct));
  return `${(pct / 10 ** e).toFixed(1)} × 10${sup(e)} %`;
}

const branchText = (minBranch) => (minBranch > 0 ? `分岐比 ${minBranch} % 以上` : 'すべての分岐');

export function detailHtml(nuc, idx, graph, { pinned, theme, minBranch = 1, generations = 2, tile, route = 'avoid' }) {
  const el = ELEMENTS[nuc.z];
  const cat = primaryCategory(nuc);
  const badges = [];
  badges.push(`<span class="badge" style="--c:${catColor(cat, theme)}">${CATEGORIES[cat].name}</span>`);
  const mz = isMagic(nuc.z), mn = isMagic(nuc.n);
  if (mz && mn) badges.push('<span class="badge magic">二重魔法数</span>');
  else if (mz) badges.push(`<span class="badge magic">魔法数 Z=${nuc.z}</span>`);
  else if (mn) badges.push(`<span class="badge magic">魔法数 N=${nuc.n}</span>`);
  if (nuc.rk) badges.push(`<span class="badge riken">理研で発見（${nuc.rk}年）</span>`);
  if (nuc.fuel) badges.push(`<span class="badge on-color" style="--c:${FUEL_GROUPS[nuc.fuel].color}">${FUEL_GROUPS[nuc.fuel].name}</span>`);
  if (nuc.ab !== undefined && !nuc.st) badges.push(`<span class="badge plain">天然存在比 ${nuc.ab} %</span>`);
  if (nuc.p) badges.push('<span class="badge plain">未発見（理論予測）</span>');
  else if (nuc.x) badges.push('<span class="badge plain">NUBASE2020 未収録</span>');
  else if (nuc.ub) badges.push('<span class="badge plain">未観測・非束縛（推定値）</span>');
  else if (!nuc.y) badges.push('<span class="badge plain">未観測</span>');

  const est = new Set(nuc.de || []);
  const hlSub = nuc.st ? '' : [nuc.dt ? `± ${esc(nuc.dt)}` : '', nuc.t ? fmtSeconds(nuc.t) : ''].filter(Boolean).join('　');

  const modes = graph.daughters(idx);
  const allModes = nuc.d || [];
  const rows = allModes.map((m) => {
    const d = modes.find((x) => x.raw === m);
    const mcat = modeCategory(m[0]);
    const w = m[2] === null ? 0 : Math.max(2, Math.min(100, m[2]));
    let target = '';
    if (d && d.fission) target = '<span class="to muted">核分裂片</span>';
    else if (d && d.to >= 0) target = `<button class="to" data-idx="${d.to}">→ ${nucHtml(graph.nuclides[d.to])}</button>`;
    else if (d) target = `<span class="to muted">→ Z=${d.z}, N=${d.n}</span>`;
    const below = d && !graph.keepBranch(idx, d, minBranch);
    return { below, html: `<div class="mode-row">
      <span class="chip" style="background:${arcColor(mcat)}">${esc(modeLabel(m[0]))}</span>
      <span class="mdesc">${esc(modeDesc(m[0]))}</span>
      ${target}
      <span class="br">${esc(fmtBranch(m))}</span>
      <span class="bar"><i style="width:${w}%;background:${arcColor(mcat)}"></i></span>
    </div>` };
  });
  const minor = rows.filter((r) => r.below);
  const modeRows = rows.filter((r) => !r.below).map((r) => r.html).join('')
    + (minor.length ? `<details class="more"><summary>しきい値未満の分岐 ${minor.length} 件（3D表示では省略）</summary>${minor.map((r) => r.html).join('')}</details>` : '');

  const dfe = feDeficit(nuc);
  const found = nuc.y ? `${nuc.y} 年` : nuc.rk ? `${nuc.rk} 年` : '未観測';
  const foundTitle = 'この同位体が初めて確認された年（元素の発見年とは異なります）';
  const groups = [
    ['基本', [
      ['半減期', `<b>${esc(fmtHalfLife(nuc))}</b>${hlSub ? `<br><small>${hlSub}</small>` : ''}`],
      ['スピン・パリティ Jπ', esc(fmtJpi(nuc.j))],
      ['核種の発見年', found, foundTitle],
    ]],
    ['質量と結合エネルギー', [
      ['質量超過 Δ', fmtKeV(nuc.me, nuc.dme, nuc.mee)],
      ['結合エネルギー B/A', nuc.ba !== undefined ? fmtKeV(nuc.ba, undefined, nuc.mee) : '—'],
      ['B/A − B/A(⁵⁶Fe)', dfe !== null ? `${dfe > 0 ? '−' : '+'}${Math.abs(dfe).toFixed(3)} MeV${nuc.mee ? ' #' : ''}` : '—'],
    ]],
    ['分離エネルギーと Q 値', [
      ['中性子分離 Sₙ', fmtMeV(nuc.sn, est.has('sn'))],
      ['陽子分離 Sₚ', fmtMeV(nuc.sp, est.has('sp'))],
      ['2中性子分離 S₂ₙ', fmtMeV(nuc.s2n, est.has('s2n'))],
      ['2陽子分離 S₂ₚ', fmtMeV(nuc.s2p, est.has('s2p'))],
      ['Qα', fmtMeV(nuc.qa, est.has('qa'))],
      ['Qβ⁻', fmtMeV(nuc.qb, est.has('qb'))],
      ['Q<sub>EC</sub>', fmtMeV(nuc.qec, est.has('qec'))],
    ]],
    ...(nuc.fyc || nuc.fyi ? [['核分裂収率', [
      ['核分裂収率（累積）', fmtYield(nuc.fyc), '²³⁵U の熱中性子核分裂、基底状態'],
      ['核分裂収率（独立）', fmtYield(nuc.fyi), '²³⁵U の熱中性子核分裂、基底状態と核異性体の合計'],
    ]]] : []),
    ...(nuc.z ? [[`元素 ${esc(ELEMENTS[nuc.z][2])}`, elementProps(nuc)]] : []),
  ];
  // one plain list, in the order of the groups above
  const props = groups.flatMap(([, rows]) => rows)
    .map(([k, v, title]) => `<dt${title ? ` title="${esc(title)}"` : ''}>${k}</dt><dd>${v}</dd>`).join('');

  // key figures: half-life, the main decay (or the abundance of a stable nuclide), the year of discovery
  const dom = graph.dominant(idx);
  const facts = factsHtml([
    ['半減期', esc(fmtHalfLife(nuc)) || '—'],
    nuc.st
      ? ['天然存在比', nuc.ab !== undefined ? `${nuc.ab} %` : '—']
      : ['主な崩壊', dom ? `${esc(modeLabel(dom.mode))} <small>${esc(fmtBranch(dom.raw))}</small>` : '—'],
    ['発見', found, foundTitle],
  ]);

  const isomers = (nuc.iso || []).map((iso) => `<div class="iso-row">
      <span class="iso-f">${esc(nuc.a)}${esc(iso.f)}</span>
      <span>${iso.e !== undefined ? `${(+iso.e).toLocaleString('en-US', { maximumFractionDigits: 1 })} keV${iso.ee ? ' #' : ''}` : '—'}</span>
      <span>${esc(fmtHalfLife(iso))}</span>
      <span>${esc(fmtJpi(iso.j))}</span>
      <span class="muted">${esc(iso.d || '')}</span>
    </div>`).join('');

  const tileStyle = tile ? `--c:${tile.bg};--fg:${tile.fg}` : `--c:${catColor(cat, theme)}`;
  return `
  <div class="nuc-head">
    <div class="nuc-big" style="${tileStyle}"><sup>${nuc.a}</sup>${esc(nuc.s)}</div>
    <div class="nuc-title">
      <div class="nuc-name">${esc(jaName(nuc))}</div>
      <div class="nuc-en">${esc(el[1])}-${nuc.a}</div>
      <div class="nuc-zna">Z = ${nuc.z}　N = ${nuc.n}　A = ${nuc.a}</div>
    </div>
  </div>
  ${facts}
  <div class="badges">${badges.join('')}</div>
  ${nuc.fuelNote ? `<p class="fuel-note" style="--c:${FUEL_GROUPS[nuc.fuel].color}">${esc(nuc.fuelNote)}</p>` : ''}
  ${nuc.rkRef || nuc.rkNote ? `<p class="rk-ref">${nuc.rkRef ? `理研での発見: ${nuc.rkDoi
    ? `<a href="https://doi.org/${encodeURI(nuc.rkDoi)}" target="_blank" rel="noopener">${esc(nuc.rkRef)}</a>`
    : esc(nuc.rkRef)}` : ''}${nuc.rkRef && nuc.rkNote ? '<br>' : ''}${nuc.rkNote ? esc(nuc.rkNote) : ''}</p>` : ''}

  ${elementHtml(nuc, graph)}

  ${sec('modes', '崩壊モードと崩壊先', modeRows
    || `<p class="muted small">${nuc.st ? '安定核のため崩壊しません。' : '崩壊モードは未確定です。'}</p>`, { hint: `3D表示は${branchText(minBranch)}` })}

  ${nuc.st || !allModes.length ? '' : sec('chain', '崩壊系列', routeSwitch(idx, graph, route) + melodyButton(idx, graph, route) + chainFlowHtml(idx, graph, route) + chainSvg(idx, graph, theme, minBranch, route),
    { hint: `主な経路と分岐（${branchText(minBranch)}）` })}

  ${sec('parents', '親核', ancestorsHtml(idx, graph, generations, minBranch), { hint: `この核へ崩壊してくる核（${branchText(minBranch)}）` })}

  ${sec('props', '情報', `<dl class="props">${props}</dl>`)}

  ${isomers ? sec('isomers', '核異性体', `<div class="iso">${isomers}</div>`, { count: nuc.iso.length }) : ''}
  <p class="foot"># は系統性からの推定値　·　核データ: NUBASE2020 (Kondev et al., Chin. Phys. C 45, 030001)${nuc.rk ? '　·　発見機関: FRIB Discovery of Nuclides Project' : ''}${nuc.fyc || nuc.fyi ? `　·　核分裂収率: ${esc(FY_SOURCE)}` : ''}${nuc.mk ? '　·　質量: KTUY05 質量公式による予測（Koura et al., Prog. Theor. Phys. 113, 305 (2005)）' : ''}　·　元素の存在量: ${esc(ABUNDANCE.cite)}</p>`;
}

// plays the main decay path as a melody, each nucleus with the tone of its column (see sound.js)
// where the two routes part (spontaneous fission competing with another decay), the viewer picks the one the flow,
// the highlighted nuclei of the diagram and the melody follow
function routeSwitch(idx, graph, route) {
  const key = (r) => graph.mainPath(idx, { route: r }).map((s) => s.idx).join(',');
  if (key('avoid') === key('main')) return '';
  const btn = (r, text, title) => `<button class="btn" data-route="${r}" aria-pressed="${r === route}" title="${title}">${text}</button>`;
  return `<div class="route-switch"><span>たどる経路</span><div class="seg">${btn('avoid', '核分裂を避ける', '各段で、自発核分裂以外の最も多い崩壊をたどります（下の図の崩壊系列と同じ）')}${btn('main', '各段で最も多い崩壊', '各段で最も分岐比の大きい崩壊をたどります（自発核分裂を含む）')}</div></div>`;
}

function melodyButton(idx, graph, route) {
  if (graph.mainPath(idx, { route }).filter((s) => s.idx >= 0).length < 2) return '';
  return `<button class="melody" data-melody="${idx}" aria-pressed="false" title="主な崩壊経路の核を順に、柱の高さに応じた音で鳴らします（ミュート中でも鳴ります）">♪ 崩壊系列をメロディで聴く</button>`;
}

function chainFlowHtml(idx, graph, route) {
  const path = graph.mainPath(idx, { route });
  if (path.length < 2) return '';
  let steps = path;
  let cut = false;
  if (path.length > 16) {
    steps = [...path.slice(0, 10), null, ...path.slice(-4)];
    cut = true;
  }
  const items = steps.map((s) => {
    if (s === null) return '<span class="flow-gap">…</span>';
    const arrow = s.via
      ? `<span class="flow-arrow${s.fission ? ' fission' : ''}" style="--c:${arcColor(s.via.cat)}"><span>${esc(modeLabel(s.via.mode))}</span></span>`
      : '';
    if (s.idx < 0) return `${arrow}<span class="flow-node unknown">Z=${s.z}, N=${s.n}</span>`;
    const nuc = graph.nuclides[s.idx];
    const tag = s.fission ? '<em>分裂片の例</em>' : '';
    return `${arrow}<button class="flow-node ${nuc.st ? 'stable' : ''}" data-idx="${s.idx}">${tag}${nucHtml(nuc)}<small>${esc(fmtHalfLife(nuc))}</small></button>`;
  });
  const fission = path.some((s) => s.fission)
    ? '<p class="muted small">自発核分裂（SF）の先は、分裂片の一例（重い側のピーク A ≈ 140、A ≳ 256 では対称に半分。電荷は UCD 近似）をたどった目安です。実際の分裂片はさまざまな核に分かれ、中性子も放出されます。</p>'
    : '';
  return `<div class="flow">${items.join('')}</div>${cut ? `<p class="muted small">全 ${path.length - 1} 段の崩壊（中間を省略）</p>` : ''}${fission}`;
}

function chainSvg(idx, graph, theme, minBranch, route) {
  const { edges, nodes } = graph.chain(idx, { minBranch });
  if (!edges.length) return '';
  const onRoute = new Set(graph.mainPath(idx, { route }).map((s) => s.idx)); // outlined: the route of the flow above
  const pts = [...nodes.keys()].map((i) => graph.nuclides[i]);
  const nMin = Math.min(...pts.map((p) => p.n)) - 0.5, nMax = Math.max(...pts.map((p) => p.n)) + 0.5;
  const zMin = Math.min(...pts.map((p) => p.z)) - 0.5, zMax = Math.max(...pts.map((p) => p.z)) + 0.5;
  const W = 316, Hmax = 230;
  const cell = Math.min(30, W / (nMax - nMin), Hmax / (zMax - zMin));
  const w = (nMax - nMin) * cell, h = (zMax - zMin) * cell;
  const ox = (W - w) / 2;
  const X = (n) => ox + (n - nMin) * cell;
  const Y = (z) => (zMax - z) * cell;
  const cats = [...new Set(edges.map((e) => e.cat))];
  const markers = cats.map((c) => `<marker id="ah-${c}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${cell > 14 ? 5 : 4}" markerHeight="${cell > 14 ? 5 : 4}" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${arcColor(c)}"/></marker>`).join('');
  const rects = pts.map((p) => {
    const i = graph.find(p.z, p.n);
    const cat = primaryCategory(p);
    const selected = i === idx;
    const label = cell >= 22 ? `<text x="${X(p.n)}" y="${Y(p.z) + 3.5}" class="svg-l" fill="${cat === 'st' && theme !== 'dark' ? '#fff' : '#1d1d1f'}">${p.a}${p.s}</text>` : '';
    return `<g class="svg-node${onRoute.has(i) && !selected ? ' on-route' : ''}" data-idx="${i}"><rect x="${X(p.n) - cell * 0.44}" y="${Y(p.z) - cell * 0.44}" width="${cell * 0.88}" height="${cell * 0.88}" rx="2" fill="${catColor(cat, theme)}" ${selected ? 'stroke="#e8364a" stroke-width="2.5"' : ''}><title>${nucText(p)} ${fmtHalfLife(p)}</title></rect>${label}</g>`;
  }).join('');
  const lines = edges.map((e) => {
    const a = graph.nuclides[e.from], b = graph.nuclides[e.to];
    const x1 = X(a.n), y1 = Y(a.z), x2 = X(b.n), y2 = Y(b.z);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const shrink = Math.min(cell * 0.42, len / 3);
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const op = e.val === null ? 0.6 : Math.max(0.35, Math.min(1, (Math.log10(e.val) + 3) / 5));
    return `<line x1="${x1 + ux * shrink}" y1="${y1 + uy * shrink}" x2="${x2 - ux * shrink}" y2="${y2 - uy * shrink}" stroke="${arcColor(e.cat)}" stroke-width="${cell > 14 ? 2.2 : 1.5}" stroke-opacity="${op}" marker-end="url(#ah-${e.cat})"/>`;
  }).join('');
  return `<svg class="chain-svg" viewBox="0 0 ${W} ${h + 18}" width="100%" role="img" aria-label="崩壊系列の核図表">
    <defs>${markers}</defs>
    ${rects}${lines}
    <text x="${W - 4}" y="${h + 14}" class="svg-axis" text-anchor="end">N →</text>
    <text x="4" y="${h + 14}" class="svg-axis">Z ↑ · N ${Math.ceil(nMin)}–${Math.floor(nMax)}, Z ${Math.ceil(zMin)}–${Math.floor(zMax)}</text>
  </svg>`;
}

/** half-life color scale: gradient for unstable nuclei plus a separate swatch for stable ones */
export function hlLegendHtml(theme) {
  const pos = (v) => ((v - HL_RANGE[0]) / (HL_RANGE[1] - HL_RANGE[0])) * 100;
  const ticks = [[-9, '1 ns'], [-3, '1 ms'], [0, '1 s'], [4.94, '1 日'], [9.5, '100 年'], [15.5, '1 億年']]
    .map(([v, t]) => `<span style="left:${pos(v).toFixed(1)}%">${t}</span>`).join('');
  return `<div class="hl-scale"><div class="gradient" style="background:${HL_CSS}"></div><span class="stable-sw" style="background:${HL_STABLE}">安定</span></div>
    <div class="ticks hl-ticks">${ticks}</div>
    <div class="lg muted"><i style="background:${CATEGORIES.un[theme] || CATEGORIES.un.light}"></i>未観測（推定値）</div>`;
}

export function legendHtml(chart) {
  if (chart.colorMode === 'lego') {
    return LEGO_PALETTE.map((c) => `<span class="lg"><i style="background:${chart.theme === 'dark' && c.dark ? c.dark : c.color}"></i>${c.name}</span>`).join('');
  }
  if (chart.colorMode === 'group') {
    return Object.values(FUEL_GROUPS).map((g) => `<span class="lg"><i style="background:${g.color}"></i>${g.name}</span>`).join('');
  }
  if (chart.colorMode === 'decay') {
    return Object.entries(CATEGORIES)
      .map(([, c]) => `<span class="lg"><i style="background:${chart.theme === 'dark' ? c.dark : c.light}"></i>${c.name}</span>`)
      .join('');
  }
  return null;
}

export { sup };
