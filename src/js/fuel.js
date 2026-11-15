// The display modes that show a part of the chart: RIKEN's discoveries, and the groups of the nuclear fuel cycle —
// fission products of ²³⁵U (FP), the seven long-lived ones (LLFP), minor actinides (MA) and the main nuclides of
// spent fuel. The members of the groups and their notes are in data/fuel-cycle.yaml.
import { FISSION_YIELDS, FUEL_MEMBERS as MEMBERS, FUEL_NOTES as GROUP_NOTE } from './data.js';
import { nuclideKey } from './nuclear.js';

/** the groups a nuclide of the fuel cycle can belong to (nuc.fuel), with their colors */
export const FUEL_GROUPS = {
  major: { name: 'U・Pu（主要アクチノイド）', color: '#2f6fd6' },
  ma: { name: 'マイナーアクチノイド（MA）', color: '#8b4fd8' },
  llfp: { name: '長寿命FP（LLFP）', color: '#d01012' },
  notable: { name: '主なFP（発熱・被ばく・中性子吸収）', color: '#f08a00' },
  fp: { name: 'そのほかのFP', color: '#f5c400' },
};

/** per mode: its short name (on the timeline) and the description shown under the check boxes */
export const DISPLAY_MODES = {
  riken: {
    short: '理研で発見',
    desc: '理研で初めて確認された核種（FRIB Discovery of Nuclides Project による）。理研が発見した元素はニホニウム（Z = 113）です。',
  },
  fp: {
    short: 'FP',
    desc: '²³⁵U が熱中性子で核分裂したときにできる核種。色は累積収率（崩壊で流れ込む分を含む、核分裂1回あたりの生成量）。質量数95付近と140付近の2か所に集まる「非対称核分裂」が見えます。',
  },
  llfp: {
    short: 'LLFP',
    desc: '半減期が約20万〜1600万年と非常に長い核分裂生成物の7核種。高レベル放射性廃棄物の長期的な影響の要因で、核変換で短寿命の核種に変える研究が進められています。',
  },
  ma: {
    short: 'MA',
    desc: '原子炉の中でウランが中性子を吸収してできる、プルトニウム以外の超ウラン元素（ネプツニウム、アメリシウム、キュリウム）。量は少ないものの長寿命のα放射体が多く、プルトニウムとともに長期的な放射能毒性の主な要因です。',
  },
  fuel: {
    short: '使用済み燃料',
    desc: '使用済み核燃料に含まれる主な核種の全体像。FPは ²³⁵U 熱中性子核分裂の累積収率 0.001 % 以上のもの（実際の組成は燃焼度や冷却期間で変わります）。',
  },
};

// the smallest yield (per fission) of a fission product in the FP mode, and of an "other FP" of spent fuel
const FP_MIN = 1e-8;
const FUEL_FP_MIN = 1e-5;
const fpYield = (n) => Math.max(n.fyc || 0, n.fyi || 0);
/** whether the nuclide counts as a fission product (the FP mode, and the color by fuel-cycle group) */
export const isFissionProduct = (n) => fpYield(n) >= FP_MIN;

/** attaches the fission yields (fyc, fyi), the fuel group and its note to the nuclides */
export function annotateFuel(nuclides) {
  const at = new Map(nuclides.map((n) => [nuclideKey(n.z, n.n), n]));
  for (const [z, a, cum, ind] of FISSION_YIELDS) {
    const nuc = at.get(nuclideKey(z, a - z));
    if (!nuc || nuc.x) continue;
    if (cum) nuc.fyc = cum;
    if (ind) nuc.fyi = ind;
  }
  for (const [group, list] of Object.entries(MEMBERS)) {
    for (const [z, a, note] of list) {
      const nuc = at.get(nuclideKey(z, a - z));
      if (!nuc) continue;
      nuc.fuel = group;
      nuc.fuelNote = note || GROUP_NOTE[group];
    }
  }
  for (const nuc of nuclides) if (!nuc.fuel && (nuc.fyc || 0) >= FUEL_FP_MIN) nuc.fuel = 'fp';
}

/** which nuclides each fuel-cycle mode shows */
export const MODE_FILTERS = {
  fp: isFissionProduct,
  llfp: (n) => n.fuel === 'llfp',
  ma: (n) => n.fuel === 'ma',
  fuel: (n) => !!n.fuel,
};

/** the nuclides that get a floating name tag in each mode: [Z, A] or [Z, A, text] */
export const MODE_CALLOUTS = {
  riken: [[113, 278, 'ニホニウム Nh：理研が発見した元素']],
  fp: MEMBERS.notable.map(([z, a]) => [z, a]),
  llfp: MEMBERS.llfp.map(([z, a]) => [z, a]),
  ma: MEMBERS.ma.map(([z, a]) => [z, a]),
  fuel: [...MEMBERS.llfp, ...MEMBERS.notable, [93, 237], [95, 241], [92, 235], [92, 238], [94, 239]].map(([z, a]) => [z, a]),
};
