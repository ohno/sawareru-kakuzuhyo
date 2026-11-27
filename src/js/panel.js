// The HTML the page writes at run time: the detail panel of a nuclide or hypernucleus (with the 2D decay-chain
// diagram), the hover tooltip, and the parts of the left panel that come from the data — check boxes with their
// colors, the legends, the numbers at the top, the list of sources.
import { ELEMENTS, ELEMENT_DESCRIPTION, ELEMENT_ISOTOPES, ELEMENT_DISCOVERY, ABUNDANCE, FY_SOURCE, HYPER_SOURCE } from './data.js';
import {
  CATEGORIES, METRICS, LEGO_PALETTE, HL_CSS, HL_STABLE, HL_RANGE, VIRIDIS_CSS, isMagic, primaryCategory, modeCategory, modeLabel,
  modeDesc, categoryHex, arcColor, legoHex, hexToRgb, inkFor, nucHtml, nucText, isoHtml, fmtHalfLife, fmtSeconds, fmtJpi, fmtKeV, fmtBranch,
  fmtShare, isFission, sup, feDeficit,
} from './nuclear.js';
import { FUEL_GROUPS } from './fuel.js';
import { HYPER_KINDS, HYPER_LAYERS, HYPER_DRIP_SOURCES, EXPERIMENTS, hyperHtml } from './hyper.js';
import { recall, remember } from './storage.js';
import { tr, EN } from './i18n.js';

/** English needs a plural (Japanese does not) */
const plural = (n, one, many) => (n === 1 ? one : many);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** a paper, linked to its DOI where there is one */
const paperHtml = (ref, doi) => (doi ? `<a href="https://doi.org/${encodeURI(doi)}" target="_blank" rel="noopener">${esc(ref)}</a>` : esc(ref));
/** rows [name, value (HTML), tooltip] as a definition list */
const propsHtml = (rows) => `<dl class="props">${rows.map(([k, v, title]) =>
  `<dt${title ? ` title="${esc(title)}"` : ''}>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

// ---------- the folding blocks of the detail panel ----------
// The detail panel reads top-down from the summary (key figures) to the reference data; each block below the
// summary folds like the sections of the left panel, and the choice is remembered per viewer.
const BLOCKS_KEY = 'nuclide3d.infosec.v2'; // v2: parents open by default
const blockOpen = recall(BLOCKS_KEY, { iso: true, modes: true, chain: true, parents: true, props: true, isomers: false });
/** called when a block is opened or closed */
export function rememberBlock(key, open) {
  if (!(key in blockOpen) || blockOpen[key] === open) return;
  blockOpen[key] = open;
  remember(BLOCKS_KEY, blockOpen);
}
const block = (key, title, body, { hint = '', count = '' } = {}) => `
  <details class="isec" data-isec="${key}"${blockOpen[key] === false ? '' : ' open'}>
    <summary${hint ? ` title="${esc(hint)}"` : ''}><span>${title}${count !== '' ? `<small>${count}</small>` : ''}</span></summary>
    <div class="isec-body">${body}</div>
  </details>`;

// three key figures right under the name: what one looks for first
const factsHtml = (cells) => `<div class="facts">${cells.map(([k, v, title]) =>
  `<div${title ? ` title="${esc(title)}"` : ''}><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;

// ---------- nuclides ----------
// the name as a heading: ウラン238 / Uranium-238, 中性子 / Neutron
const nucName = (nuc) => (nuc.z === 0 ? tr('中性子', 'Neutron') : EN ? `${ELEMENTS[nuc.z][1]}-${nuc.a}` : `${ELEMENTS[nuc.z][2]}${nuc.a}`);
// an element's name in running text: ウラン / uranium
const elName = (z) => (EN ? ELEMENTS[z][1].toLowerCase() : ELEMENTS[z][2]);

export function tooltipHtml(nuc, graph, idx) {
  const dom = graph.dominant(idx);
  const decay = !nuc.st && dom ? `<span class="tt-sep">·</span>${esc(`${modeLabel(dom.mode)} ${fmtBranch(dom.raw)}`)}` : '';
  return `<b>${nucHtml(nuc)}</b> <span>${esc(nucName(nuc))}</span><span class="tt-sep">·</span>${esc(fmtHalfLife(nuc))}${decay}`;
}

// abundances: fractions shown as %, ppm, ppb or ppt
function fmtFrac(f) {
  if (f >= 1e-3) return `${(f * 100).toPrecision(3)} %`;
  if (f >= 1e-6) return `${(f * 1e6).toPrecision(3)} ppm`;
  if (f >= 1e-9) return `${(f * 1e9).toPrecision(3)} ppb`;
  return `${(f * 1e12).toPrecision(3)} ppt`;
}

// fission yields are per fission; shown in %
function fmtYield(y) {
  if (!y) return '—';
  const pct = y * 100;
  if (pct >= 0.01) return `${+pct.toPrecision(3)} %`;
  const e = Math.floor(Math.log10(pct));
  return `${(pct / 10 ** e).toFixed(1)} × 10${sup(e)} %`;
}

// rows about the element (not this isotope): when it was found, and how much of it there is in the universe
function elementProps(nuc) {
  if (nuc.z === 0) return [];
  const d = ELEMENT_DISCOVERY[nuc.z];
  const ab = ABUNDANCE.elements[nuc.z];
  const none = nuc.z > 92 ? tr('なし（人工元素）', 'none (synthetic element)') : tr('ごくわずか', 'trace amounts');
  return [
    [tr('元素の発見', 'Discovery of the element'), d === 'ancient' ? tr('古代から知られる', 'known since ancient times') : d ? tr(`${d} 年`, `${d}`) : '—',
      tr('元素として初めて確認（観測・認識）された年。Wikipedia の元素発見年表による。単離された年とは異なることがあります',
        'The year the element was first observed or recognized, from the Wikipedia timeline of chemical element discoveries. It may differ from the year it was first isolated')],
    [tr('宇宙での存在量（原子数）', 'Cosmic abundance (by number of atoms)'),
      ab ? tr(`${fmtFrac(ab.num)}（${ab.rank} 位）`, `${fmtFrac(ab.num)} (rank ${ab.rank})`) : none, ABUNDANCE.label],
    [tr('宇宙での存在量（質量）', 'Cosmic abundance (by mass)'), ab ? fmtFrac(ab.mass) : none, ABUNDANCE.label],
  ];
}

// the element's introduction and its characteristic isotopes (one per line; click to go there)
function elementHtml(nuc, graph) {
  const el = ELEMENTS[nuc.z];
  const info = ELEMENT_DESCRIPTION[nuc.z] || '';
  const isotopes = (ELEMENT_ISOTOPES[nuc.z] || []).map(([a, note]) => {
    const i = graph.find(nuc.z, a - nuc.z);
    const label = `<span class="iso-nuc">${nucHtml({ a, s: el[0] })}</span><small>${esc(note)}</small>`;
    return i < 0 ? `<li><span class="iso-chip">${label}</span></li>`
      : `<li><button class="iso-chip${a === nuc.a ? ' current' : ''}" data-idx="${i}">${label}</button></li>`;
  }).join('');
  return `${info ? `<p class="elem-desc">${esc(info)}</p>` : ''}
    ${isotopes ? block('iso', tr(`${esc(el[2])}の特徴的な同位体`, `Notable isotopes of ${esc(nuc.z === 0 ? 'the neutron' : elName(nuc.z))}`),
    `<ul class="iso-list">${isotopes}</ul>`) : ''}`;
}

// every decay mode NUBASE lists, with where it leads; branches below the threshold fold away
function modesHtml(nuc, idx, graph, minBranch) {
  const daughters = graph.daughters(idx);
  const rows = (nuc.d || []).map((m) => {
    const d = daughters.find((x) => x.raw === m || x.parts?.includes(m));
    const color = arcColor(modeCategory(m[0]));
    const w = m[2] === null ? 0 : Math.max(2, Math.min(100, m[2]));
    let target = '';
    if (d && d.fission) target = `<span class="to muted">${tr('核分裂片', 'fission fragments')}</span>`;
    else if (d && d.to >= 0) target = `<button class="to" data-idx="${d.to}">→ ${nucHtml(graph.nuclides[d.to])}</button>`;
    else if (d) target = `<span class="to muted">→ Z=${d.z}, N=${d.n}</span>`;
    return { minor: d && !graph.keepBranch(idx, d, minBranch), html: `<div class="mode-row">
      <span class="chip" style="background:${color}">${esc(modeLabel(m[0]))}</span>
      <span class="mdesc">${esc(modeDesc(m[0]))}</span>
      ${target}
      <span class="br">${esc(fmtBranch(m))}</span>
      <span class="bar"><i style="width:${w}%;background:${color}"></i></span>
    </div>` };
  });
  const minor = rows.filter((r) => r.minor);
  return rows.filter((r) => !r.minor).map((r) => r.html).join('')
    + (minor.length ? `<details class="more"><summary>${tr(`しきい値未満の分岐 ${minor.length} 件（3D表示では省略）`,
      `${minor.length} ${plural(minor.length, 'branch', 'branches')} below the threshold (left out of the 3D view)`)}</summary>${minor.map((r) => r.html).join('')}</details>` : '')
    + daughters.filter((d) => d.incl !== undefined).map((d) => delayedNote(d, graph)).join('')
    + daughters.filter((d) => d.parts).map((d) => partsNote(d, graph)).join('');
}

// branches that NUBASE gives both as a whole and in parts, all to one daughter (²²Na: β⁺ 100 % = e⁺ 90.57 % + EC
// 9.43 %): one arrow, drawn with the largest value (see computeDaughters in decay.js)
function partsNote(d, graph) {
  const to = d.to >= 0 ? nucHtml(graph.nuclides[d.to]) : `Z=${d.z}, N=${d.n}`;
  // positron emission as e⁺, apart from the β⁺ that also counts electron capture
  const list = esc([d.raw, ...d.parts].map((m) => `${m[0] === 'e+' ? 'e⁺' : modeLabel(m[0])} ${fmtBranch(m)}`).join(tr('、', ', ')));
  const main = esc(`${modeLabel(d.mode)} ${fmtBranch(d.raw)}`);
  return `<p class="muted small">${tr(
    `${to} へ向かう分岐（${list}）は、1 本の矢印にまとめ、いちばん大きい値（${main}）で描いています。`,
    `The branches to ${to} (${list}) are drawn as one arrow, with the largest value (${main}).`)}</p>`;
}

// a β ratio that counts the β-delayed branches too (NUBASE's convention): what is left to the β daughter itself, which
// the arrows and the main route go by (see netBeta in decay.js)
function delayedNote(d, graph) {
  const beta = esc(modeLabel(d.mode)), ratio = esc(fmtBranch(d.raw)), share = esc(fmtShare(d.lo, d.hi));
  const list = esc(d.delayed.map((x) => modeLabel(x[0])).join(tr('・', ', ')));
  const to = d.to >= 0 ? nucHtml(graph.nuclides[d.to]) : `Z=${d.z}, N=${d.n}`;
  const fission = d.delayed.some((x) => isFission(x[0]));
  return `<p class="muted small">${tr(
    `${beta} の ${ratio} は、β崩壊のあとに粒子を出す${fission ? '・核分裂する' : ''}分岐（${list}）も含めた値です。β崩壊だけで ${to} になるのは ${share} で、3D の矢印の太さと主な経路はこの値で決めています。`,
    `The ${beta} ratio of ${ratio} also counts the branches that emit particles${fission ? ' or fission' : ''} after the β decay (${list}). The share that ends as ${to} after the β decay alone is ${share}; the thickness of the arrows in 3D and the main route go by this share.`)}</p>`;
}

function ancestorsHtml(idx, graph, generations, minBranch) {
  const G = Math.max(1, generations);
  const { edges, truncated } = graph.ancestors(idx, { generations: G, minBranch });
  if (!edges.length) {
    return `<p class="muted small">${tr('この核へ崩壊してくる核（しきい値以上の分岐）は登録されていません。',
      'No nucleus in the data decays into this one (counting branches above the threshold).')}</p>`;
  }
  const rows = [];
  for (let gen = 1; gen <= G; gen++) {
    const seen = new Set();
    const items = edges.filter((e) => e.gen === gen && !seen.has(e.from) && seen.add(e.from))
      .map((e) => `<button class="to" data-idx="${e.from}">${nucHtml(graph.nuclides[e.from])} <small>${esc(modeLabel(e.mode))}</small></button>`);
    const back = tr(`${gen} 世代前`, `${gen} ${plural(gen, 'generation', 'generations')} back`);
    if (items.length) rows.push(`<div class="gen"><span class="gen-l">${back}</span><div class="parents">${items.join('')}</div></div>`);
  }
  return rows.join('') + (truncated ? `<p class="muted small">${tr('数が多いため一部のみ表示しています。', 'There are too many to show them all; only some are listed.')}</p>` : '');
}

const branchText = (minBranch) => (minBranch > 0 ? tr(`分岐比 ${minBranch} % 以上`, `branching ratio ≥ ${minBranch} %`) : tr('すべての分岐', 'all branches'));

/**
 * The detail panel of nuclide `idx`. minBranch, generations, route: the settings of the decay arrows, which the
 * lists follow; tile: { bg, fg }, the color of the nuclide's box on the chart.
 */
export function detailHtml(nuc, idx, graph, { theme, minBranch = 1, generations = 2, tile, route = 'avoid' }) {
  const el = ELEMENTS[nuc.z];
  const cat = primaryCategory(nuc);
  const catColor = categoryHex(cat, theme);
  // the gray class covers two cases: an undiscovered nucleus, and a discovered one without decay data (¹⁸³Tm)
  const catName = cat !== 'un' ? CATEGORIES[cat].name : nuc.y ? tr('崩壊のデータなし', 'No decay data') : tr('未発見（推定値）', 'Undiscovered (estimate)');
  const badges = [`<span class="badge" style="--c:${catColor};--fg:${inkFor(hexToRgb(catColor))}">${catName}</span>`];
  const mz = isMagic(nuc.z), mn = isMagic(nuc.n);
  if (mz && mn) badges.push(`<span class="badge magic">${tr('二重魔法数', 'Doubly magic')}</span>`);
  else if (mz) badges.push(`<span class="badge magic">${tr('魔法数', 'Magic number')} Z=${nuc.z}</span>`);
  else if (mn) badges.push(`<span class="badge magic">${tr('魔法数', 'Magic number')} N=${nuc.n}</span>`);
  if (nuc.rk) badges.push(`<span class="badge riken">${tr(`理研で発見（${nuc.rk}年）`, `Discovered at RIKEN (${nuc.rk})`)}</span>`);
  if (nuc.fuel) badges.push(`<span class="badge on-color" style="--c:${FUEL_GROUPS[nuc.fuel].color}">${FUEL_GROUPS[nuc.fuel].name}</span>`);
  if (nuc.ab !== undefined && !nuc.st) badges.push(`<span class="badge plain">${tr('天然存在比', 'Natural abundance')} ${nuc.ab} %</span>`);
  if (nuc.p) badges.push(`<span class="badge plain">${tr('未発見（理論予測）', 'Undiscovered (theoretical prediction)')}</span>`);
  else if (nuc.x) badges.push(`<span class="badge plain">${tr('NUBASE2020 未収録', 'Not in NUBASE2020')}</span>`);
  else if (nuc.fd) badges.push(`<span class="badge plain">${tr('NUBASE2020 では未発見', 'Undiscovered in NUBASE2020')}</span>`);
  else if (nuc.ub) badges.push(`<span class="badge plain">${tr('未発見・非束縛（推定値）', 'Undiscovered, unbound (estimate)')}</span>`);
  else if (!nuc.y) badges.push(`<span class="badge plain">${tr('未発見', 'Undiscovered')}</span>`);

  const found = nuc.y ? tr(`${nuc.y} 年`, `${nuc.y}`) : tr('未発見', 'undiscovered');
  const foundTitle = tr('この同位体が初めて確認された年（元素の発見年とは異なります）',
    'The year this isotope was first identified (not the year its element was discovered)');
  // key figures: half-life, the main decay (or the abundance of a stable nuclide), the year of discovery
  const dom = graph.dominant(idx);
  const facts = factsHtml([
    [tr('半減期', 'Half-life'), esc(fmtHalfLife(nuc)) || '—'],
    nuc.st
      ? [tr('天然存在比', 'Natural abundance'), nuc.ab !== undefined ? `${nuc.ab} %` : '—']
      : [tr('主な崩壊', 'Main decay'), dom ? `${esc(modeLabel(dom.mode))} <small>${esc(fmtBranch(dom.raw))}${
        graph.largestSure(idx) ? '' : tr('（最多かは不明）', ' (may not be the largest)')}</small>` : '—'],
    [tr('発見', 'Discovered'), found, foundTitle],
  ]);

  // the reference data, in one plain list: the nuclide, its mass, its fission yields, its element
  const hlSub = nuc.st ? '' : [nuc.dt ? `± ${esc(nuc.dt)}` : '', nuc.t ? fmtSeconds(nuc.t) : ''].filter(Boolean).join('　');
  const dfe = feDeficit(nuc);
  const props = propsHtml([
    [tr('半減期', 'Half-life'), `<b>${esc(fmtHalfLife(nuc))}</b>${hlSub ? `<br><small>${hlSub}</small>` : ''}`],
    [tr('スピン・パリティ Jπ', 'Spin and parity Jπ'), esc(fmtJpi(nuc.j))],
    [tr('核種の発見年', 'Year of discovery of the nuclide'), found, foundTitle],
    [tr('質量超過 Δ', 'Mass excess Δ'), fmtKeV(nuc.me, nuc.dme, nuc.mee)],
    [tr('結合エネルギー B/A', 'Binding energy B/A'), nuc.ba !== undefined ? fmtKeV(nuc.ba, undefined, nuc.mee) : '—'],
    ['B/A − B/A(⁵⁶Fe)', dfe !== null ? `${dfe > 0 ? '−' : '+'}${Math.abs(dfe).toFixed(3)} MeV${nuc.mee ? ' #' : ''}` : '—'],
    ...(nuc.fyc || nuc.fyi ? [
      [tr('核分裂収率（累積）', 'Fission yield (cumulative)'), fmtYield(nuc.fyc),
        tr('²³⁵U の熱中性子核分裂、基底状態', 'Thermal-neutron fission of ²³⁵U, ground state')],
      [tr('核分裂収率（独立）', 'Fission yield (independent)'), fmtYield(nuc.fyi),
        tr('²³⁵U の熱中性子核分裂、基底状態と核異性体の合計', 'Thermal-neutron fission of ²³⁵U, ground state and isomers together')],
    ] : []),
    ...elementProps(nuc),
  ]);

  const isomers = (nuc.iso || []).map((iso) => `<div class="iso-row">
      <span class="iso-f">${esc(nuc.a)}${esc(iso.f)}</span>
      <span>${iso.e !== undefined ? `${(+iso.e).toLocaleString('en-US', { maximumFractionDigits: 1 })} keV${iso.ee ? ' #' : ''}` : '—'}</span>
      <span>${esc(fmtHalfLife(iso))}</span>
      <span>${esc(fmtJpi(iso.j))}</span>
      <span class="muted">${esc(iso.d || '')}</span>
    </div>`).join('');

  const hasChain = !nuc.st && (nuc.d || []).length > 0;
  const sources = [
    tr('# は系統性からの推定値', '# marks an estimate from systematics'),
    tr('核データ: NUBASE2020 (Kondev et al., Chin. Phys. C 45, 030001)', 'Nuclear data: NUBASE2020 (Kondev et al., Chin. Phys. C 45, 030001)'),
    nuc.rk || nuc.fd ? tr('発見機関: FRIB Discovery of Nuclides Project', 'Discovering laboratory: FRIB Discovery of Nuclides Project') : '',
    nuc.fyc || nuc.fyi ? `${tr('核分裂収率', 'Fission yields')}: ${esc(FY_SOURCE)}` : '',
    nuc.mk ? tr('質量: KTUY05 質量公式による予測（Koura et al., Prog. Theor. Phys. 113, 305 (2005)）',
      'Mass: predicted by the KTUY05 mass formula (Koura et al., Prog. Theor. Phys. 113, 305 (2005))') : '',
    `${tr('元素の存在量', 'Element abundances')}: ${esc(ABUNDANCE.cite)}`,
  ].filter(Boolean).join('　·　');

  return `
  <div class="nuc-head">
    <div class="nuc-big" style="--c:${tile.bg};--fg:${tile.fg}"><sup>${nuc.a}</sup>${esc(nuc.s)}</div>
    <div class="nuc-title">
      <div class="nuc-name">${esc(nucName(nuc))}</div>${EN ? '' : `
      <div class="nuc-en">${esc(el[1])}-${nuc.a}</div>`}
      <div class="nuc-zna">Z = ${nuc.z}　N = ${nuc.n}　A = ${nuc.a}</div>
    </div>
  </div>
  ${facts}
  <div class="badges">${badges.join('')}</div>
  ${nuc.fuelNote ? `<p class="fuel-note" style="--c:${FUEL_GROUPS[nuc.fuel].color}">${esc(nuc.fuelNote)}</p>` : ''}
  ${nuc.rkRef ? `<p class="rk-ref">${tr('理研での発見', 'Discovery at RIKEN')}: ${paperHtml(nuc.rkRef, nuc.rkDoi)}</p>`
    : nuc.fd ? `<p class="rk-ref">${tr(`発見（${esc(nuc.fd.lab)}）`, `Discovery (${esc(nuc.fd.lab)})`)}: ${paperHtml(nuc.fd.ref, nuc.fd.doi)}</p>` : ''}

  ${elementHtml(nuc, graph)}

  ${block('modes', tr('崩壊モードと崩壊先', 'Decay modes and daughters'), modesHtml(nuc, idx, graph, minBranch)
    || `<p class="muted small">${nuc.st ? tr('安定核のため崩壊しません。', 'A stable nucleus does not decay.') : tr('崩壊モードは未確定です。', 'The decay mode is not yet known.')}</p>`,
  { hint: tr(`3D表示は${branchText(minBranch)}`, `Shown in 3D: ${branchText(minBranch)}`) })}

  ${hasChain ? block('chain', tr('崩壊系列', 'Decay chain'), routeSwitch(idx, graph, route) + melodyButton(idx, graph, route) + chainFlowHtml(idx, graph, route) + chainSvg(idx, graph, theme, minBranch, route),
    { hint: tr(`主な経路と分岐（${branchText(minBranch)}）`, `Main route and branches (${branchText(minBranch)})`) }) : ''}

  ${block('parents', tr('親核', 'Parent nuclei'), ancestorsHtml(idx, graph, generations, minBranch),
    { hint: tr(`この核へ崩壊してくる核（${branchText(minBranch)}）`, `Nuclei that decay into this one (${branchText(minBranch)})`) })}

  ${block('props', tr('情報', 'Details'), props)}

  ${isomers ? block('isomers', tr('核異性体', 'Isomers'), `<div class="iso">${isomers}</div>`, { count: nuc.iso.length }) : ''}
  <p class="foot">${sources}</p>`;
}

// ---------- the decay chain in the detail panel ----------
// where the two routes part (spontaneous fission competing with another decay), the viewer picks the one the flow,
// the highlighted nuclei of the diagram and the melody follow
function routeSwitch(idx, graph, route) {
  const key = (r) => graph.mainPath(idx, { route: r }).map((s) => s.idx).join(',');
  if (key('avoid') === key('main')) return '';
  const btn = (r, text, title) => `<button class="btn" data-route="${r}" aria-pressed="${r === route}" title="${title}">${text}</button>`;
  const avoid = btn('avoid', tr('核分裂を避ける', 'Avoid fission'), tr('各段で、自発核分裂以外の最も多い崩壊をたどります（下の図の崩壊系列と同じ）',
    'At each step, follows the most frequent decay other than spontaneous fission (the same as the decay chain in the diagram below)'));
  const main = btn('main', tr('各段で最も多い崩壊', 'Largest branch at each step'), tr('各段で最も分岐比の大きい崩壊をたどります（自発核分裂を含む）',
    'At each step, follows the decay with the largest branching ratio (spontaneous fission included)'));
  return `<div class="route-switch"><span>${tr('たどる経路', 'Route')}</span><div class="seg">${avoid}${main}</div></div>`;
}

export const MELODY_LABEL = { play: tr('♪ 崩壊系列をメロディで聴く', '♪ Play the decay-chain melody'), stop: tr('■ 止める', '■ Stop') };
// plays the main decay path as a melody, each nucleus with the tone of its column (see sound.js)
function melodyButton(idx, graph, route) {
  if (graph.mainPath(idx, { route }).filter((s) => s.idx >= 0).length < 2) return '';
  const title = tr('主な崩壊経路の核を順に、柱の高さに応じた音で鳴らします（ミュート中でも鳴ります）',
    'Plays the nuclei of the main decay route in turn, each with a pitch set by the height of its column (even while muted)');
  return `<button class="melody" data-melody="${idx}" aria-pressed="false" title="${title}">${MELODY_LABEL.play}</button>`;
}

/** the heading of a flow with a step whose branch is not surely the largest */
export const FLOW_EXAMPLE = tr('一例（主分岐は不明）', 'One possible path (main branch unknown)');

// the route as a row of nuclides joined by arrows
function chainFlowHtml(idx, graph, route) {
  // each step with the one before and after it, and the isomer it is known to go through (²³⁴Th → ²³⁴ᵐPa), if any
  const path = graph.mainPath(idx, { route }).map((s, k, all) => ({
    ...s, prev: all[k - 1], next: all[k + 1], iso: k > 0 && s.idx >= 0 && !s.fission ? graph.isomerFed(all[k - 1].idx, s.via) : null,
  }));
  if (path.length < 2) return '';
  const cut = path.length > 16; // a long chain: its first ten steps and its last four
  const steps = cut ? [...path.slice(0, 10), null, ...path.slice(-4)] : path;
  const items = steps.map((s) => {
    if (s === null) return '<span class="flow-gap">…</span>';
    const arrow = s.via
      ? `<span class="flow-arrow${s.fission ? ' fission' : ''}${s.unsure ? ' unsure' : ''}" style="--c:${arcColor(s.via.cat)}"><span>${esc(modeLabel(s.via.mode))}${s.unsure ? '?' : ''}</span></span>`
      : '';
    if (s.idx < 0) return `${arrow}<span class="flow-node unknown">Z=${s.z}, N=${s.n}</span>`;
    const nuc = graph.nuclides[s.idx];
    if (s.iso) {
      return `${arrow}<button class="flow-node" data-idx="${s.idx}"><em>${tr('核異性体', 'Isomer')}</em>${isoHtml(nuc, s.iso)}<small>${esc(fmtHalfLife(s.iso))}</small></button>`;
    }
    const tag = s.fission ? `<em>${tr('分裂片の例', 'Example fragment')}</em>` : '';
    return `${arrow}<button class="flow-node ${nuc.st ? 'stable' : ''}" data-idx="${s.idx}">${tag}${nucHtml(nuc)}<small>${esc(fmtHalfLife(nuc))}</small></button>`;
  });
  const isomers = steps.filter((s) => s && s.iso).map((s) => isomerNote(s, graph)).join('');
  const fission = path.some((s) => s.fission)
    ? `<p class="muted small">${tr('自発核分裂（SF）の先は、分裂片の一例（重い側のピーク A ≈ 140、A ≳ 256 では対称に半分。電荷は UCD 近似）をたどった目安です。実際の分裂片はさまざまな核に分かれ、中性子も放出されます。',
      'After spontaneous fission (SF), the chain follows one example fragment as a rough guide (the heavy peak at A ≈ 140, or an even split for A ≳ 256; charge from the UCD approximation). Real fission gives many different nuclei and also releases neutrons.')}</p>`
    : '';
  const total = tr(`全 ${path.length - 1} 段の崩壊（中間を省略）`, `${path.length - 1} decay steps in all (the middle ones left out)`);
  // a step whose branch is not surely the largest (only limits, or no value: ²³²Pu, α < 20 % beside EC ?) makes the
  // whole path one example of where the decays may go
  const unsure = path.some((s) => s.unsure)
    ? `<p class="flow-caveat"><b>${FLOW_EXAMPLE}</b>${tr(
      '「?」の段は、分岐比が上限・下限だけか値がないため、どの崩壊が最も多いかが決まりません。値の示された分岐のうち最も大きいものをたどっています。',
      'At the steps marked “?”, the branching ratios are given only as limits or not at all, so which decay is the most frequent is not settled; the path takes the largest of the values given.')}</p>`
    : '';
  return `${unsure}<div class="flow">${items.join('')}</div>${cut ? `<p class="muted small">${total}</p>` : ''}${fission}${isomers}`;
}

// a step of the flow that goes through an isomer of the nuclide (²³⁴ᵐPa): what the data say about it, and that the
// other half-lives are those of ground states
function isomerNote(s, graph) {
  const nuc = graph.nuclides[s.idx], parent = graph.nuclides[s.prev.idx];
  const P = nucHtml(parent), D = nucHtml(nuc), Dm = isoHtml(nuc, s.iso), beta = esc(modeLabel(s.via.mode));
  const G = s.next && s.next.idx >= 0 ? nucHtml(graph.nuclides[s.next.idx]) : '';
  const it = (s.iso.d || '').match(/IT\s*[=~]\s*([\d.]+)/);
  const keV = s.iso.e !== undefined ? `${s.iso.e} keV${tr('、', ', ')}` : '';
  const hl = esc(fmtHalfLife(s.iso)), hlGround = esc(fmtHalfLife(nuc));
  return `<p class="muted small">${tr(
    `${P} の ${beta} 崩壊は、ほぼすべて ${D} の核異性体 ${Dm}（${keV}半減期 ${hl}）へ行きます。`
      + (G && it ? `${Dm} の大部分はそのまま ${G} へ崩壊し、基底状態の ${D}（半減期 ${hlGround}）へ移る核異性体転移（IT）は ${it[1]} % です。` : '')
      + '流れ図のほかの核の半減期は、基底状態の値です。',
    `The ${beta} decay of ${P} goes almost entirely to ${Dm}, an isomer of ${D} (${keV}half-life ${hl}). `
      + (G && it ? `Most of ${Dm} decays straight on to ${G}; only ${it[1]} % goes to the ground state of ${D} (half-life ${hlGround}) by an isomeric transition (IT). ` : '')
      + 'The other half-lives in the flow are those of ground states.')}</p>`;
}

// the chain and its branches as a small chart of nuclides (N to the right, Z upward)
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
    return `<g class="svg-node${onRoute.has(i) && !selected ? ' on-route' : ''}" data-idx="${i}"><rect x="${X(p.n) - cell * 0.44}" y="${Y(p.z) - cell * 0.44}" width="${cell * 0.88}" height="${cell * 0.88}" rx="2" fill="${categoryHex(cat, theme)}" ${selected ? 'stroke="#e8364a" stroke-width="2.5"' : ''}><title>${nucText(p)} ${fmtHalfLife(p)}</title></rect>${label}</g>`;
  }).join('');
  // the name of each nuclide, shown while the melody plays its note
  const notes = pts.map((p) => {
    const i = graph.find(p.z, p.n);
    const x = Math.min(W - 18, Math.max(18, X(p.n)));
    const y = Y(p.z) - cell * 0.5 - 4 < 12 ? Y(p.z) + cell * 0.5 + 13 : Y(p.z) - cell * 0.5 - 4;
    return `<text class="svg-note" data-idx="${i}" x="${x}" y="${y}"><tspan font-size="0.72em" dy="-0.35em">${p.a}</tspan><tspan dy="0.35em">${p.s}</tspan></text>`;
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
  return `<svg class="chain-svg" viewBox="0 0 ${W} ${h + 18}" width="100%" role="img" aria-label="${tr('崩壊系列の核図表', 'Chart of the decay chain')}">
    <defs>${markers}</defs>
    ${rects}${lines}${notes}
    <text x="${W - 4}" y="${h + 14}" class="svg-axis" text-anchor="end">N →</text>
    <text x="4" y="${h + 14}" class="svg-axis">Z ↑ · N ${Math.ceil(nMin)}–${Math.floor(nMax)}, Z ${Math.ceil(zMin)}–${Math.floor(zMax)}</text>
  </svg>`;
}

// ---------- hypernuclei ----------
const fmtB = (b) => (b === null || b === undefined ? '—' : `${(+b).toFixed(2)} MeV`);

export function hyperTooltipHtml(h) {
  const k = HYPER_KINDS[h.kind];
  return `<b>${hyperHtml(h)}</b> <span>${k.name}</span>${h.b !== null && h.b !== undefined ? `<span class="tt-sep">·</span>${k.bind} = ${fmtB(h.b)}` : ''}`;
}

export function hyperDetailHtml(h, graph) {
  const k = HYPER_KINDS[h.kind];
  const el = ELEMENTS[h.nameZ];
  const core = graph.find(h.coreZ, h.coreN);
  const hyperons = h.kind === 'LL' ? 'Λ × 2' : h.kind === 'X' ? 'Ξ⁻ × 1' : `${k.sym} × 1`;
  const [site, method] = EXPERIMENTS[h.exp] || [h.exp || '—', '—'];
  const year = h.year ? tr(`${h.year} 年`, `${h.year}`) : '—';
  const props = propsHtml([
    [k.bind, fmtB(h.b), k.bindTitle],
    [tr('核子のコア', 'Core nucleus'), core >= 0 ? `<button class="to" data-idx="${core}">${nucHtml(graph.nuclides[core])}</button>` : `Z = ${h.coreZ}, N = ${h.coreN}`],
    [tr('ハイペロン', 'Hyperons'), hyperons],
    [tr('s クォーク数', 'Number of s quarks'), String(k.s)],
    [tr('報告年', 'Year reported'), year, tr('この種を報告した最も古い文献の年（最初の観測の年とは限りません）',
      'The year of the earliest paper reporting this species (not necessarily the year it was first observed)')],
    [tr('実験地', 'Experiment site'), esc(site)],
    [tr('生成方法', 'Production method'), esc(method)],
  ]);
  // English: one heading, "Helium-5 Λ hypernucleus" (k.en is the kind in English)
  const name = EN ? `<div class="nuc-name">${esc(el[1])}-${h.a} ${k.en}</div>` : `<div class="nuc-name">${esc(el[2])}${h.a} の${k.name}</div>
      <div class="nuc-en">${k.en}</div>`;
  return `
  <div class="nuc-head">
    <div class="nuc-big" style="--c:${k.color};--fg:#fff"><sup>${h.a}</sup><sub class="hy">${k.sym}</sub>${esc(el[0])}</div>
    <div class="nuc-title">
      ${name}
      <div class="nuc-zna">Z = ${h.coreZ}　N = ${h.coreN}　A = ${h.a}</div>
    </div>
  </div>
  ${factsHtml([[k.bind, fmtB(h.b), k.bindTitle], [tr('s クォーク', 's quarks'), tr(`${k.s} 個`, `${k.s}`)], [tr('報告年', 'Year reported'), year]])}
  <div class="badges"><span class="badge on-color" style="--c:${k.color}">${k.name}</span></div>
  <p class="elem-desc">${esc(k.desc)}</p>
  ${block('props', tr('情報', 'Details'), `${props}${h.ref ? `<p class="muted small rk-ref">${tr('文献', 'Reference')}: ${paperHtml(h.ref, h.doi)}</p>` : ''}`)}
  <p class="foot">${tr('ハイパー核のデータ', 'Hypernucleus data')}: ${esc(HYPER_SOURCE)}</p>`;
}

// ---------- the left panel ----------
/** top of the panel: the numbers of the chart */
export function statsHtml({ total, stable, riken }) {
  return `
    <div class="stats">
      <div><span>${total.toLocaleString()}</span>${tr('核種', plural(total, 'nuclide', 'nuclides'))}</div>
      <div><span>${stable}</span>${tr('安定核', plural(stable, 'stable nucleus', 'stable nuclei'))}</div>
      <div><span>${riken}</span>${tr('理研で発見', 'discovered at RIKEN')}</div>
    </div>`;
}

/** the 使い方 section */
export function howtoHtml() {
  return `
    <p class="howto-lead">${tr('箱ひとつが原子核ひとつです。マウスを重ねると、その核の性質と<strong>崩壊先</strong>（矢印）が表示されます。クリックで固定できます。',
    'Each box is one nucleus. Hover over a box to see its properties and its <strong>daughters</strong> (arrows). Click to keep it selected.')}</p>
    <dl class="howto">
      <dt><kbd>${tr('ドラッグ', 'Drag')}</kbd></dt><dd>${tr('回転（「移動」モードでは平行移動）', 'Rotate (or pan, in “Pan” mode)')}</dd>
      <dt><kbd>${tr('右ドラッグ', 'Right-drag')}</kbd></dt><dd>${tr('平行移動', 'Pan')}</dd>
      <dt><kbd>${tr('ホイール', 'Wheel')}</kbd></dt><dd>${tr('ズーム（カーソルの位置へ）', 'Zoom (toward the cursor)')}</dd>
      <dd class="wide"><kbd>${tr('中ボタンドラッグ', 'Middle-drag')}</kbd> <kbd>${tr('Ctrl+ドラッグ', 'Ctrl+drag')}</kbd> ${tr('平行移動', 'Pan')}</dd>
      <dt><kbd>${tr('1本指', 'One finger')}</kbd></dt><dd>${tr('回転', 'Rotate')}</dd>
      <dt><kbd>${tr('2本指', 'Two fingers')}</kbd></dt><dd>${tr('平行移動・ピンチでズーム', 'Pan; pinch to zoom')}</dd>
      <dt><kbd>${tr('カーソル', 'Hover')}</kbd></dt><dd>${tr('性質と崩壊先を表示', 'Show properties and daughters')}</dd>
      <dt><kbd>${tr('クリック', 'Click')}</kbd></dt><dd>${tr('選択を固定 / 解除（タップも同じ）', 'Select / deselect (or tap)')}</dd>
      <dt><kbd>Esc</kbd></dt><dd>${tr('選択を解除', 'Deselect')}</dd>
      <dt><kbd>←</kbd><kbd>→</kbd></dt><dd>${tr('中性子数 ±1（固定中）', 'Neutron number ±1 (while selected)')}</dd>
      <dt><kbd>↑</kbd><kbd>↓</kbd></dt><dd>${tr('陽子数 ±1（固定中）', 'Proton number ±1 (while selected)')}</dd>
      <dt><kbd>f</kbd></dt><dd>${tr('選択した核へカメラを移動', 'Move the camera to the selected nucleus')}</dd>
      <dt><kbd>r</kbd></dt><dd>${tr('表示をリセット', 'Reset the view')}</dd>
      <dt><kbd>m</kbd></dt><dd>${tr('選んだ核の音のオン / オフ', 'Sound of the selected nucleus on / off')}</dd>
      <dt><kbd>d</kbd></dt><dd>${tr('ディスプレイモード（自動で回転・再生。操作すると終了）', 'Display mode (turns and plays by itself; any input ends it)')}</dd>
      <dt><kbd>w</kbd></dt><dd>${tr('歩いて遊ぶ（ボールで箱の上を転がり、ジャンプを連打すると飛べる。二重魔法数の核の星を集める。Esc で終了）',
    'Walk (roll over the boxes as a ball, press jump again and again to fly, and collect the stars of the doubly magic nuclei; Esc ends it)')}</dd>
    </dl>`;
}

/** the データの出典 section: what, then where from */
export const sourcesHtml = (rows) => rows.map(([what, source]) => `<div><dt>${what}</dt><dd>${source}</dd></div>`).join('');

// a check box of the 表示 section; `swatch`: the color it stands for, as CSS custom properties (--sw, --sw-dark)
const checkHtml = (attr, label, { swatch = '', cls = '', checked = true, title = '' } = {}) =>
  `<label class="check"${title ? ` title="${esc(title)}"` : ''}><input type="checkbox" ${attr}${checked ? ' checked' : ''}> ${
    swatch ? `<i class="kind-sw${cls}" style="${swatch}"></i>` : ''}${label}</label>`;

/** the classes of the LEGO chart, each of which can be switched off (data-lego) */
export const legoChecksHtml = () => LEGO_PALETTE.map((c) => checkHtml(`data-lego="${c.key}"`, c.name, {
  swatch: `--sw:${c.color}${c.dark ? `;--sw-dark:${c.dark}` : ''}`, cls: ' lego-sw', title: c.title,
})).join('');

/** ordinary nuclei and the four kinds of hypernuclei (data-kind) */
export const kindChecksHtml = () => checkHtml('data-kind="N"', tr('通常核', 'Ordinary nuclei'))
  + Object.entries(HYPER_KINDS).map(([key, k]) => checkHtml(`data-kind="${key}"`, tr(`${k.sym}ハイパー核`, `${k.sym} hypernuclei`), { swatch: `--sw:${k.color}` })).join('');

/** the planes of the hypernucleus mode (data-layer) */
export const layerChecksHtml = () => HYPER_LAYERS.map((l) => checkHtml(`data-layer="${l.s}"`, tr(`s = ${l.s}（${l.name}）`, `s = ${l.s} (${l.name})`), { swatch: `--sw:${l.color}` })).join('');

/** the hypernuclear drip lines, one check box per paper with a sample of its dash (data-hdrip) */
export function hyperDripChecksHtml() {
  const dashes = { solid: '', dash: '5 3.5', dot: '0.01 4' };
  return HYPER_DRIP_SOURCES.map((src) => checkHtml(`data-hdrip="${src.key}"`,
    `<svg class="dash-sw" viewBox="0 0 22 6" aria-hidden="true"><line x1="2" y1="3" x2="20" y2="3" stroke-dasharray="${dashes[src.dash]}"/></svg>${esc(src.label)}`,
    { checked: src.on, title: src.citation })).join('');
}

/** the caption under the height list: what the chosen quantity is */
export function heightNote(chart) {
  if (chart.hyper) {
    return tr('ハイパー核モードでは高さが s クォーク数（0 = 通常核、1 = Λ・Σ、2 = ΛΛ・Ξ）になり、核はすべて立方体です。',
      'In hypernucleus mode the height is the number of s quarks (0 = ordinary nuclei, 1 = Λ and Σ, 2 = ΛΛ and Ξ), and every nucleus is a cube.');
  }
  const metric = METRICS[chart.metric3d];
  const flat = chart.heightMode === 'flat'
    ? tr('2Dモードでは箱は平らで、3Dモードに戻すとこの高さになります。', 'In 2D mode the boxes are flat; back in 3D mode they take this height. ') : '';
  return `${flat}${metric.note || metric.label}${metric.unit ? tr(`（${metric.unit}）`, ` (${metric.unit})`) : ''}`;
}

/** the legend under the color list: the classes of a categorical coloring, or the scale of a continuous one */
export function legendHtml(chart) {
  const { colorMode, theme } = chart;
  const swatches = (items, one = false) => `<div class="legend-cats${one ? ' one' : ''}">${items.map(([color, name]) =>
    `<span class="lg"><i style="background:${color}"></i>${name}</span>`).join('')}</div>`;
  if (colorMode === 'lego') return swatches(LEGO_PALETTE.map((c) => [legoHex(c, theme), c.name]), true);
  if (colorMode === 'group') return swatches(Object.values(FUEL_GROUPS).map((g) => [g.color, g.name]), true);
  if (colorMode === 'decay') return swatches(Object.entries(CATEGORIES).map(([cat, c]) => [categoryHex(cat, theme), c.name]));
  if (colorMode === 'hl') {
    // half-lives: a gradient for the unstable nuclei, and a swatch of its own for the stable ones
    const pos = (v) => ((v - HL_RANGE[0]) / (HL_RANGE[1] - HL_RANGE[0])) * 100;
    // (English: 10⁸ years, as "100 million years" would run into the 100 years beside it)
    const ticks = [[-9, '1 ns'], [-3, '1 ms'], [0, '1 s'], [4.94, tr('1 日', '1 day')], [9.5, tr('100 年', '100 years')], [15.5, tr('1 億年', '10⁸ years')]]
      .map(([v, t]) => `<span style="left:${pos(v).toFixed(1)}%">${t}</span>`).join('');
    return `<div class="hl-scale"><div class="gradient" style="background:${HL_CSS}"></div><span class="stable-sw" style="background:${HL_STABLE}">${tr('安定', 'Stable')}</span></div>
      <div class="ticks hl-ticks">${ticks}</div>
      <div class="lg muted"><i style="background:${categoryHex('un', theme)}"></i>${CATEGORIES.un.name}</div>`;
  }
  const metric = chart.colorMetric();
  const [lo, hi] = metric.range;
  const ticks = metric.ticks
    ? metric.ticks.map((t, k) => `<span style="left:${((metric.tickVals[k] - lo) / (hi - lo)) * 100}%">${t}</span>`).join('')
    : `<span style="left:0%">${lo}</span><span style="left:100%">${hi}${metric.unit ? ' ' + metric.unit : ''}</span>`;
  return `<div class="legend-h">${metric.label}</div>
    <div class="gradient" style="background:${VIRIDIS_CSS}"></div><div class="ticks">${ticks}</div>`;
}
