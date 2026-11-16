// The data the app loads: data/*.json, built by scripts/build.py from the YAML files in data/ (sources and notes
// are written there). The small files are awaited here (top-level await), so the modules that import this one can
// use them as soon as they run; the large nuclide table is requested at once and read later, by nuclides.js.

/**
 * Shows a failure to start in place of the loading message. An error may bring its own advice (`err.advice`);
 * otherwise the advice is about the data files, which on a developer's machine may simply not be built yet.
 */
export function showLoadError(err) {
  console.error(err);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const advice = err.advice ?? (local
    ? 'データがまだ作られていないときは、リポジトリのフォルダで <code>python scripts/build.py</code> を実行してから、読み込み直してください。'
    : '通信の状態を確かめて、ページを読み込み直してください。');
  const box = document.querySelector('#loading');
  if (!box) return;
  box.innerHTML = `<div class="load-error" role="alert"><h2>読み込みに失敗しました</h2><p></p><p>${advice}</p></div>`;
  box.querySelector('p').textContent = err.message || String(err);
}

const url = (name) => `data/${name}.json`;
async function read(res, name) {
  if (!res.ok) throw new Error(`${url(name)}: HTTP ${res.status}`);
  return res.json();
}
const load = async (name) => read(await fetch(url(name)), name);
/** a file the page can do without: null when it cannot be had */
const optional = (name) => load(name).catch(() => null);

// requested at once, so that these download while the files below are read
const nubase = fetch(url('nuclides'));
const predicted = optional('predicted');
const island = optional('island');
/**
 * The tables behind the nuclide list: NUBASE2020 { nuclides }, and the two made from the KTUY05 mass table, the
 * predicted nuclides { nuclides } and the shell energies { rows }. Those two are null when the site was built
 * without the table (scripts/build.py --no-ktuy writes null into both files).
 */
export const loadNuclideTables = async () => Promise.all([read(await nubase, 'nuclides'), predicted, island]);

const FILES = ['elements', 'abundances', 'riken-discoveries', 'fission-yields', 'fuel-cycle', 'driplines', 'hypernuclei',
  'hyper-driplines', 'sources'];
const [elements, abundances, riken, fission, fuel, drip, hyper, hyperDrip, sources] = await Promise.all(FILES.map(load)).catch((err) => {
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

/** nuclides first identified at RIKEN [Z, A, year, reference, doi] */
export const RIKEN_NUCLIDES = riken.nuclides;
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
/** where the data comes from, the table of data/README.md: [what, source (HTML)] */
export const SOURCES = sources.sources;
