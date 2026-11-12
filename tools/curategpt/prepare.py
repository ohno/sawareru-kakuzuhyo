"""Turn the repository's YAML into CurateGPT objects and pick the pilot sample.

usage: python tools/curategpt/prepare.py [WORK]      (WORK defaults to tools/curategpt/work)

Writes into WORK:
  nuclide_examples.json  few-shot examples, with all their values (indexed into CurateGPT; never tested)
  nuclide_tests.json     the pilot sample, only what CurateGPT is given (id, name, Z, N, A)
  element_fold{0,1}.json elements split by the parity of Z; each fold is the example collection for the other
The sample is drawn with a fixed seed, so rerunning gives the same files.
"""
import json
import random
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
WORK = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "work"
SEED = 20261112
N_EXAMPLES = 40
SEED_FIELDS = ["id", "label", "element", "Z", "N", "A"]

elements = yaml.safe_load((REPO / "data/elements.yaml").read_text(encoding="utf-8"))["elements"]
NAME = {e["Z"]: e["en"] for e in elements}
Z_OF = {e["symbol"]: e["Z"] for e in elements}


def split_key(key):
    i = 0
    while key[i].isdigit():
        i += 1
    return int(key[:i]), key[i:]


def modes(br):
    return [str(x) for x in br] if br else None


def nuclide_object(key, v):
    A, sym = split_key(key)
    Z = Z_OF[sym]
    obj = {
        "id": key,
        "label": f"{NAME[Z].lower()}-{A}" if Z else f"{A}n (neutron)" if A > 1 else "free neutron",
        "element": NAME[Z],
        "Z": Z,
        "N": A - Z,
        "A": A,
        "mass_excess_keV": v.get("ME"),
        "mass_excess_uncertainty_keV": v.get("dME"),
        "half_life": v.get("T"),
        "half_life_uncertainty": v.get("dT"),
        "spin_parity": v.get("Jpi"),
        "discovery_year": v.get("Year"),
        "natural_abundance_percent": v.get("IS"),
        "decay_modes": modes(v.get("BR")),
        "isomers": [
            {k2: v2 for k2, v2 in {
                "label": i.get("Lbl"),
                "excitation_energy_keV": i.get("Ex"),
                "half_life": i.get("T"),
                "spin_parity": i.get("Jpi"),
                "decay_modes": modes(i.get("BR")),
            }.items() if v2 is not None}
            for i in v.get("Iso", [])
        ] or None,
    }
    return {k: val for k, val in obj.items() if val is not None}


nuclides = []
for f in sorted((REPO / "data/nuclides").glob("*.yaml")):
    for key, v in (yaml.safe_load(f.read_text(encoding="utf-8")) or {}).items():
        nuclides.append((key, v))


def seconds(t):
    units = {"ys": 1e-24, "zs": 1e-21, "as": 1e-18, "fs": 1e-15, "ps": 1e-12, "ns": 1e-9, "μs": 1e-6,
             "ms": 1e-3, "s": 1, "m": 60, "h": 3600, "d": 86400, "y": 3.15576e7}
    for p, mult in (("k", 1e3), ("M", 1e6), ("G", 1e9), ("T", 1e12), ("P", 1e15), ("E", 1e18), ("Z", 1e21), ("Y", 1e24)):
        units[p + "y"] = mult * 3.15576e7
    if not t or t == "particle-unbound":
        return -1.0
    if t == "stable":
        return 1e99
    val, unit = t.lstrip("<>~").split(" ")
    return float(val) * units[unit]


rng = random.Random(SEED)
by_z = {}
for key, v in nuclides:
    by_z.setdefault(Z_OF[split_key(key)[1]], []).append((key, v))

# per element: the "representative" nuclide (most abundant, else longest-lived) plus random others
test_keys = []
for Z, items in sorted(by_z.items()):
    rep = max(items, key=lambda kv: (kv[1].get("IS", -1), seconds(kv[1].get("T"))))[0]
    rest = [k for k, _ in items if k != rep]
    extra = 2 if len(rest) >= 30 else 1 if rest else 0
    test_keys += [rep] + rng.sample(rest, extra)
test_set = set(test_keys)

pool = [k for k, _ in nuclides if k not in test_set]
example_keys = rng.sample(pool, N_EXAMPLES)

objs = {key: nuclide_object(key, v) for key, v in nuclides}
WORK.mkdir(parents=True, exist_ok=True)
(WORK / "nuclide_examples.json").write_text(json.dumps([objs[k] for k in example_keys], ensure_ascii=False, indent=1))
(WORK / "nuclide_tests.json").write_text(
    json.dumps([{f: objs[k][f] for f in SEED_FIELDS} for k in test_keys], ensure_ascii=False, indent=1))

el_objs = []
for e in elements:
    o = {"id": f"element-{e['Z']}", "Z": e["Z"], "symbol": e["symbol"], "name_en": e["en"], "name_ja": e["ja"],
         "discovery_year": e.get("discovered")}
    el_objs.append({k: v for k, v in o.items() if v is not None})
for fold in (0, 1):
    (WORK / f"element_fold{fold}.json").write_text(
        json.dumps([o for o in el_objs if o["Z"] % 2 == fold], ensure_ascii=False, indent=1))

ex = [objs[k] for k in example_keys]
print(f"tests {len(test_keys)} (elements {len(by_z)}), examples {len(ex)}: "
      f"stable {sum(o.get('half_life') == 'stable' for o in ex)}, with isomers {sum('isomers' in o for o in ex)}, "
      f"no year {sum('discovery_year' not in o for o in ex)}; element objects {len(el_objs)}")
