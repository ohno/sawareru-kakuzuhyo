// What a search means: a nuclide ("238U", "U-238", "ウラン238"), an element ("U", "uranium", "ウラン": its most
// stable isotope), or conditions on Z, N and A ("Z=50 N=82", "A=208": the most stable nuclide that meets them).
// The same reading serves the links of the page (#238U).
import { ELEMENTS } from './data.js';
import { SYMBOL_TO_Z, nucText } from './nuclear.js';
import { tr } from './i18n.js';

/** Z of an element given by its symbol or its English or Japanese name, or -1 */
function elementZ(s) {
  const t = s.trim().toLowerCase();
  if (SYMBOL_TO_Z.has(t)) return SYMBOL_TO_Z.get(t);
  return ELEMENTS.findIndex((e) => e[1].toLowerCase() === t || e[2] === s.trim());
}

// The most stable of several nuclides: a stable one, else a discovered one with the longest half-life (an
// unobserved one only by its estimate). Among stable isotopes the most abundant (the element's own isotope); among
// stable isotones or isobars, and where no half-life tells, the lowest mass per nucleon (the bottom of the valley
// the height shows; for isobars, where their beta decays end).
const byAbundance = (a, b) => (b.ab || 0) - (a.ab || 0);
const byMassPerNucleon = (a, b) => (a.me ?? Infinity) / a.a - (b.me ?? Infinity) / b.a;
function moreStable(a, b, tie) {
  if (!a.st !== !b.st) return !!a.st;
  if (!a.y !== !b.y) return !!a.y;
  if ((a.t || 0) !== (b.t || 0)) return (a.t || 0) > (b.t || 0);
  return (a.st ? tie : byMassPerNucleon)(a, b) < 0;
}

/**
 * Conditions on Z, N and A, all of which must hold: "Z=50 N=82", "A=208", "z50, a132", or an element for Z
 * ("U A=238"). -> { z, n, a } (those given; `clash` when one is given twice with different values), or null for
 * any other query. N alone needs "=" ("N15" is nitrogen-15).
 */
function conditions(q) {
  const tokens = q.replace(/\s*[=:]\s*/g, '=').replace(/(^|[\s,、])([zna]) (?=\d)/gi, '$1$2')
    .split(/[\s,、;&]+/).filter((t) => t && !/^(and|かつ)$/i.test(t));
  const cond = {};
  let given = 0;
  const set = (k, v) => {
    if (k in cond && cond[k] !== v) cond.clash = true;
    cond[k] = v;
  };
  for (const t of tokens) {
    const m = t.match(/^([zna])(=?)(\d+)$/i);
    if (m && (m[1].toLowerCase() !== 'n' || m[2] || tokens.length > 1)) {
      set(m[1].toLowerCase(), +m[3]);
      given++;
      continue;
    }
    const z = elementZ(t);
    if (z < 0) return null;
    set('z', z);
  }
  return given ? cond : null;
}

/**
 * The search over a list of nuclides; `find(z, n)` gives the index of a nuclide or -1.
 * -> parse(text) = { i: nuclide index or -1, note: what was chosen, for a search by one of Z, N, A }
 */
export function createSearch(nuclides, find) {
  function mostStable(list, tie) {
    let best = -1;
    for (const i of list) if (best < 0 || moreStable(nuclides[i], nuclides[best], tie)) best = i;
    return best;
  }
  const matching = (test) => nuclides.flatMap((nuc, i) => (test(nuc) ? [i] : []));

  return function parse(text) {
    const q = text.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!q) return { i: -1 };
    const c = conditions(q);
    if (c) {
      const list = c.clash ? [] : matching((nuc) => (c.z ?? nuc.z) === nuc.z && (c.n ?? nuc.n) === nuc.n && (c.a ?? nuc.a) === nuc.a);
      const keys = ['z', 'n', 'a'].filter((k) => k in c);
      if (keys.length > 1 || list.length < 2) return { i: list.length ? list[0] : -1 };
      const k = keys[0], i = mostStable(list, k === 'z' ? byAbundance : byMassPerNucleon);
      return {
        i,
        note: tr(`${k.toUpperCase()} = ${c[k]} の核のうち、最も安定な ${nucText(nuclides[i])} を表示しています`,
          `Showing ${nucText(nuclides[i])}, the most stable nucleus with ${k.toUpperCase()} = ${c[k]}`),
      };
    }
    // a mass number before or after an element: 238U, U-238, ウラン238
    const before = q.match(/^(\d+)\s*-?\s*(\D+)$/), after = q.match(/^(\D+?)\s*-?\s*(\d+)$/);
    const [a, name] = before ? [before[1], before[2]] : after ? [after[2], after[1]] : [];
    if (name) {
      const z = elementZ(name);
      if (z >= 0) return { i: find(z, +a - z) };
    }
    const z = elementZ(q);
    return { i: z >= 0 ? mostStable(matching((nuc) => nuc.z === z), byAbundance) : -1 };
  };
}
