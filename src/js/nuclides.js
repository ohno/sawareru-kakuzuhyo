// The list of nuclides the chart draws: the NUBASE2020 ground states, completed with what follows from their masses
// and with the other data files. One record per nuclide:
//
//   from data/nuclides.json (scripts/build.py)
//     z, n            proton and neutron number
//     me, dme, mee    mass excess and its uncertainty (keV); mee: estimated from systematics ("#")
//     t, ts, dt, te   half-life in seconds and as NUBASE writes it, its uncertainty; te: estimated
//     st, pu          stable; particle-unbound
//     j, y, ab        spin and parity, year of discovery, natural abundance (%)
//     d               decay modes [[mode, relation, branching ratio % or null, NUBASE text], ...]
//     iso             isomers [{ f, e, ee, ts / st / pu, j, d }, ...]
//   worked out here (nuclear.js, fuel.js)
//     a, s            mass number, element symbol
//     ba, sn, sp, s2n, s2p, qa, qb, qec   B/A, separation energies and Q values (keV)
//     ub              never discovered and, by NUBASE's own estimate, not even bound (e.g. ³Li, ⁵Be, ⁶B)
//     rk, rkRef, rkDoi   first identified at RIKEN: year, paper, DOI
//     fd              discovered by the FRIB list alone (NUBASE2020 gives no year): { lab, ref, doi }; y is FRIB's year
//     x               missing from NUBASE2020 (found since, by the FRIB list): a bare entry
//     p, mk           predicted by the KTUY05 mass formula and not yet discovered; the mass is KTUY05's
//     isl             of an element not yet discovered (Z > 118): shown only with the island of stability
//     fyc, fyi        cumulative and independent yield in the thermal fission of ²³⁵U
//     fuel, fuelNote  group in the nuclear fuel cycle and what to say about it
import { ELEMENTS, DISCOVERIES, loadNuclideTables } from './data.js';
import { deriveFromMasses, bindingPerNucleon, nuclideKey } from './nuclear.js';
import { annotateFuel } from './fuel.js';

/** { nuclides, islandRows }: the list, and the shell-energy grid of the island of stability (undefined without KTUY05) */
export async function loadNuclides() {
  const [nubase, predicted, island] = await loadNuclideTables();
  const nuclides = nubase.nuclides;
  deriveFromMasses(nuclides);
  addDiscoveries(nuclides);
  for (const nuc of nuclides) {
    if (!nuc.y && (nuc.pu || ['sn', 's2n', 'sp', 's2p'].some((k) => nuc[k] !== undefined && nuc[k] < 0))) nuc.ub = 1;
  }
  if (predicted) addPredicted(nuclides, predicted.nuclides);
  annotateFuel(nuclides);
  return { nuclides, islandRows: island?.rows };
}

const byZN = (nuclides) => new Map(nuclides.map((nuc) => [nuclideKey(nuc.z, nuc.n), nuc]));

/**
 * Adds the discoveries of the FRIB Discovery of Nuclides Project. A nuclide counts as discovered when NUBASE2020 or
 * this list records its discovery (NUBASE2020's year comes first); those missing from NUBASE2020 are appended as bare
 * entries (flag x). The nuclides credited to RIKEN are marked (rk).
 */
function addDiscoveries(nuclides) {
  const known = byZN(nuclides);
  for (const [z, a, year, lab, ref, doi] of DISCOVERIES) {
    let nuc = known.get(nuclideKey(z, a - z));
    if (!nuc) {
      nuc = { z, n: a - z, a, s: ELEMENTS[z][0], x: 1 };
      nuclides.push(nuc);
    }
    if (!nuc.y) {
      nuc.y = year;
      nuc.fd = { lab, ref, doi };
    }
    if (lab === 'RIKEN') {
      nuc.rk = year;
      nuc.rkRef = ref;
      nuc.rkDoi = doi;
    }
  }
}

/**
 * Adds the not-yet-discovered nuclei that the KTUY05 mass formula predicts to be bound (rows [Z, N, mass excess],
 * out to its drip lines, N ≤ 200) — the yellow blocks of RIKEN's LEGO chart, whose heights came from the same
 * formula. Nuclides missing from NUBASE2020 (flag x) take their mass from it too.
 */
function addPredicted(nuclides, rows) {
  const known = byZN(nuclides);
  for (const [z, n, me] of rows) {
    let nuc = known.get(nuclideKey(z, n));
    if (!nuc) {
      nuc = { z, n, a: z + n, s: ELEMENTS[z][0], p: 1 };
      if (z > 118) nuc.isl = 1;
      nuclides.push(nuc);
    }
    if (nuc.me !== undefined) continue;
    nuc.me = me;
    nuc.mee = true; // shown with "#" like other non-measured masses
    nuc.mk = 1;
    nuc.ba = bindingPerNucleon(z, n, me);
  }
}
