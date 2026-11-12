// The data the app loads: data/*.json, built by scripts/build.py from the YAML files in data/ (sources and notes
// are written there). The small files are awaited here (top-level await), so the modules that import this
// one can use them as soon as they run; the big nuclide table is only requested here, and main.js reads it.

/** shows a loading failure in place of the loading message */
export function showLoadError(err) {
  console.error(err);
  document.querySelector('#loading').innerHTML = `<div class="load-error"><h2>読み込みに失敗しました</h2>
    <p>${String(err.message || err)}</p>
    <p>ファイルを直接開くとブラウザがデータを読み込めません。リポジトリのフォルダでデータを作り、ローカルサーバーを起動してください:</p>
    <pre>python scripts/build.py\npython scripts/serve.py</pre><p>→ <code>http://localhost:8000/</code> を開く</p></div>`;
}

/** requested first, so the nuclide table downloads while the files below are read */
export const nuclidesRequest = fetch('data/nuclides.json');

async function load(name) {
  const res = await fetch(`data/${name}.json`);
  if (!res.ok) throw new Error(`data/${name}.json: HTTP ${res.status}`);
  return res.json();
}

const FILES = ['elements', 'abundances', 'riken-discoveries', 'fission-yields', 'fuel-cycle', 'driplines', 'hypernuclei',
  'hyper-driplines'];
const [elements, abundances, riken, fission, fuel, drip, hyper, hyperDrip] = await Promise.all(FILES.map(load)).catch((err) => {
  showLoadError(err);
  return new Promise(() => {}); // the modules that need the data never run, and the message stays
});

/** [symbol, English name, Japanese name], index = Z (0 = the neutron, up to 126) */
export const ELEMENTS = elements.elements.map((e) => [e.symbol, e.en, e.ja]);
/** per Z: introduction, characteristic isotopes [[A, note], ...], discovery year (or 'ancient') */
export const ELEMENT_DESCRIPTION = elements.elements.map((e) => e.description);
export const ELEMENT_ISOTOPES = elements.elements.map((e) => e.isotopes);
export const ELEMENT_DISCOVERY = elements.elements.map((e) => e.discovered);
/** protosolar abundances: label, cite, and per Z { num, mass, rank } (shares of all atoms and of all mass) or null */
export const ABUNDANCE = abundances;

/** nuclides first identified at RIKEN [Z, A, year, reference, doi], and those credited to RIKEN only by its LEGO chart (+ note) */
export const RIKEN_NUCLIDES = riken.nuclides;
export const RIKEN_LOCAL = riken.local;
/** thermal fission of ²³⁵U: [Z, A, cumulative yield, independent yield] */
export const FISSION_YIELDS = fission.yields;
export const FY_SOURCE = fission.source;
/** fuel-cycle groups: members { group: [[Z, A, note or null], ...] } and the note of each group */
export const FUEL_MEMBERS = fuel.members;
export const FUEL_NOTES = fuel.notes;
/** drip lines of ordinary nuclei: [Z, proton, neutron, protonMin, protonMax, neutronMin, neutronMax] (N) */
export const DRIP_LINES = drip.lines;
/** observed hypernuclei: [kind, A, nameZ, coreZ, coreN, B, year, experiment, reference, doi] */
export const HYPERNUCLEI = hyper.hypernuclei;
export const HYPER_SOURCE = hyper.source;
/** theoretical hypernuclear drip lines, one entry per paper (their line styles are in hyper.js) */
export const HYPER_DRIP_SOURCES = hyperDrip.sources;
