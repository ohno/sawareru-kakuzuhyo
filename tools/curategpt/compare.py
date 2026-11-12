"""Compare CurateGPT's predictions with the repository data.

usage: python tools/curategpt/compare.py [WORK [OUT]]      (defaults: tools/curategpt/work, tools/curategpt/results)
Reads the repository YAML (the reference) and WORK/pred_*.jsonl, writes OUT/diff_nuclides.tsv,
OUT/diff_elements.tsv (one row per compared value, with an empty column for the verdict) and OUT/summary.json.
"""
import csv
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
WORK = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "work"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "results"
OUT.mkdir(parents=True, exist_ok=True)

YEAR_S = 365.2422 * 86400
UNITS = {"ys": 1e-24, "zs": 1e-21, "as": 1e-18, "fs": 1e-15, "ps": 1e-12, "ns": 1e-9, "μs": 1e-6, "us": 1e-6,
         "ms": 1e-3, "s": 1.0, "m": 60.0, "min": 60.0, "h": 3600.0, "d": 86400.0, "y": YEAR_S}
for p, mult in (("k", 1e3), ("M", 1e6), ("G", 1e9), ("T", 1e12), ("P", 1e15), ("E", 1e18), ("Z", 1e21), ("Y", 1e24)):
    UNITS[p + "y"] = mult * YEAR_S
NUM = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")

# categories (the words the report uses)
SAME = "一致"
NOTATION = "表記のみ違う"
DIFF = "値が違う"
ONLY_REPO = "CurateGPT に値なし"
ONLY_CGPT = "リポジトリに値なし"
UNPARSED = "CurateGPT の値を解釈できない"


def num(x):
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    m = NUM.search(str(x).replace("#", ""))
    return float(m.group()) if m else None


def fmt(x):
    if x is None:
        return ""
    if isinstance(x, (list, dict)):
        return json.dumps(x, ensure_ascii=False)
    return str(x)


def half_life(t):
    """('stable'|'unbound'|'value', relation, seconds) or None"""
    if t is None:
        return None
    t = str(t).strip()
    low = t.lower()
    if low.startswith("stab"):
        return ("stable", "", None)
    if "unbound" in low or low.startswith("p-unst"):
        return ("unbound", "", None)
    rel = t[0] if t[0] in "<>~" else ""
    parts = t.lstrip("<>~≈ ").replace("#", "").split()
    if len(parts) != 2 or parts[1] not in UNITS or num(parts[0]) is None:
        return ("?", "", None)
    return ("value", rel, num(parts[0]) * UNITS[parts[1]])


def t_uncertainty_s(t, dt):
    """NUBASE writes dT in the unit of T; '+0.5-0.3' -> the larger side"""
    if not t or dt is None:
        return 0.0
    parts = str(t).lstrip("<>~").split()
    if len(parts) != 2 or parts[1] not in UNITS:
        return 0.0
    vals = [abs(float(v)) for v in NUM.findall(str(dt))]
    return max(vals) * UNITS[parts[1]] if vals else 0.0


def norm_jpi(j):
    if j is None:
        return None
    return re.sub(r"[\s*#()]", "", str(j))


def parse_modes(lst):
    """['B-=89.28 13', 'A ?'] -> {mode: (relation, value)}"""
    out = {}
    for item in lst or []:
        m = re.match(r"^\s*([0-9]*[A-Za-z][A-Za-z0-9+\-]*?)\s*(<=|>=|[=~<>?])\s*(.*)$", str(item))
        if not m:
            out[str(item).strip()] = ("", None)
            continue
        rel, rest = m.group(2), m.group(3).strip()
        out[m.group(1)] = (rel, num(rest.split(" ")[0]) if rest and rel != "?" else None)
    return out


def element_tables():
    els = yaml.safe_load((REPO / "data/elements.yaml").read_text(encoding="utf-8"))["elements"]
    return {e["Z"]: e for e in els}, {e["symbol"]: e["Z"] for e in els}


ELEMENTS, Z_OF = element_tables()


def repo_nuclides():
    out = {}
    for f in sorted((REPO / "data/nuclides").glob("*.yaml")):
        for key, v in (yaml.safe_load(f.read_text(encoding="utf-8")) or {}).items():
            out[key] = v
    return out


def read_preds(name):
    p = WORK / f"pred_{name}.jsonl"
    rows = {}
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                rows[r["id"]] = r
    return rows


rows_n = []


def add(nid, state, field, repo, cgpt, cat, diff="", note=""):
    A = int(re.match(r"\d+", nid).group())
    Z = Z_OF[re.sub(r"^\d+", "", nid)]
    rows_n.append({"nuclide": nid, "Z": Z, "N": A - Z, "A": A, "state": state, "field": field,
                   "repository": fmt(repo), "curategpt": fmt(cgpt), "category": cat, "difference": diff,
                   "note": note})


def presence(nid, state, field, repo, cgpt, note=""):
    """True when both have a value (so the caller compares them); otherwise records the missing side"""
    if repo is None and cgpt is None:
        return False
    if cgpt is None:
        add(nid, state, field, repo, cgpt, ONLY_REPO, note=note)
        return False
    if repo is None:
        add(nid, state, field, repo, cgpt, ONLY_CGPT, note=note)
        return False
    return True


def cmp_mass(nid, state, field, repo, drepo, cgpt, est):
    note = "リポジトリ側は系統性からの推定値（NUBASE の #）" if est else ""
    if not presence(nid, state, field, repo, cgpt, note):
        return
    c = num(cgpt)
    if c is None:
        add(nid, state, field, repo, cgpt, UNPARSED, note=note)
        return
    d = c - float(repo)
    sig = float(drepo or 0)
    tol = max(3 * sig, 0.5)
    sig_txt = f"（{abs(d) / sig:.1f}σ）" if sig else ""
    add(nid, state, field, repo, cgpt, SAME if abs(d) <= tol else DIFF, f"{d:+.6g} keV{sig_txt}", note)


def cmp_half_life(nid, state, repo, drepo, cgpt, est):
    note = "リポジトリ側は推定値（#）" if est else ""
    if not presence(nid, state, "half_life", repo, cgpt, note):
        return
    r, c = half_life(repo), half_life(cgpt)
    if c[0] == "?":
        add(nid, state, "half_life", repo, cgpt, UNPARSED, note=note)
        return
    if r[0] != c[0]:
        add(nid, state, "half_life", repo, cgpt, DIFF, "安定・非束縛・有限の半減期の区別が違う", note)
        return
    if r[0] != "value":
        add(nid, state, "half_life", repo, cgpt, SAME, note=note)
        return
    ratio = c[2] / r[2]
    tol = max(3 * t_uncertainty_s(repo, drepo) / r[2], 0.02)
    same = abs(ratio - 1) <= tol and r[1] == c[1]
    cat = SAME if same else DIFF
    if same and str(repo).replace(" ", "") != str(cgpt).replace(" ", ""):
        cat = NOTATION if abs(ratio - 1) < 1e-9 else SAME
    rel_note = f"（不等号・近似の記号が違う: {r[1] or '='} と {c[1] or '='}）" if r[1] != c[1] else ""
    add(nid, state, "half_life", repo, cgpt, cat, f"×{ratio:.4g}{rel_note}", note)


def cmp_jpi(nid, state, repo, cgpt):
    if not presence(nid, state, "spin_parity", repo, cgpt):
        return
    if str(repo).replace(" ", "") == str(cgpt).replace(" ", ""):
        add(nid, state, "spin_parity", repo, cgpt, SAME)
    elif norm_jpi(repo) == norm_jpi(cgpt):
        add(nid, state, "spin_parity", repo, cgpt, NOTATION, "暫定・推定の印 ( ) # * だけが違う")
    else:
        add(nid, state, "spin_parity", repo, cgpt, DIFF)


def cmp_year(nid, repo, cgpt):
    if not presence(nid, "", "discovery_year", repo, cgpt):
        return
    c = num(cgpt)
    if c is None:
        add(nid, "", "discovery_year", repo, cgpt, UNPARSED)
        return
    d = int(c) - int(repo)
    add(nid, "", "discovery_year", repo, cgpt, SAME if d == 0 else DIFF, f"{d:+d} 年" if d else "")


def cmp_abundance(nid, repo, cgpt):
    if not presence(nid, "", "natural_abundance_percent", repo, cgpt):
        return
    c = num(cgpt)
    if c is None:
        add(nid, "", "natural_abundance_percent", repo, cgpt, UNPARSED)
        return
    d = c - float(repo)
    tol = max(0.01 * float(repo), 1e-4)
    add(nid, "", "natural_abundance_percent", repo, cgpt, SAME if abs(d) <= tol else DIFF, f"{d:+.4g} %")


def cmp_modes(nid, state, repo, cgpt):
    if not presence(nid, state, "decay_modes", repo or None, cgpt or None):
        return
    r, c = parse_modes(repo), parse_modes(cgpt)
    notes = []
    only_r = sorted(set(r) - set(c))
    only_c = sorted(set(c) - set(r))
    if only_r:
        notes.append("リポジトリのみ: " + ", ".join(only_r))
    if only_c:
        notes.append("CurateGPT のみ: " + ", ".join(only_c))
    for m in sorted(set(r) & set(c)):
        (rr, rv), (cr, cv) = r[m], c[m]
        if rv is not None and cv is not None:
            if abs(cv - rv) > max(1.0, 0.05 * rv):
                notes.append(f"{m}: {rv:g}% と {cv:g}%")
        elif (rv is None) != (cv is None):
            notes.append(f"{m}: 分岐比 {rr}{'' if rv is None else f'{rv:g}'} と {cr}{'' if cv is None else f'{cv:g}'}")
    if notes:
        add(nid, state, "decay_modes", repo, cgpt, DIFF, "; ".join(notes))
    else:
        add(nid, state, "decay_modes", repo, cgpt, SAME)


def nuclides():
    repo = repo_nuclides()
    preds = read_preds("nuclides")
    tests = json.loads((WORK / "nuclide_tests.json").read_text())
    for t in tests:
        nid = t["id"]
        v = repo[nid]
        if nid not in preds:
            add(nid, "", "(全体)", "", "", "未生成", note="CurateGPT の結果がない")
            continue
        p = preds[nid]["predicted"]
        cmp_mass(nid, "", "mass_excess_keV", v.get("ME"), v.get("dME"), p.get("mass_excess_keV"), v.get("ME_est"))
        if v.get("dME") is not None and p.get("mass_excess_uncertainty_keV") is not None:
            r, c = float(v["dME"]), num(p["mass_excess_uncertainty_keV"])
            same = c is not None and (abs(c - r) <= 0.25 * r if r else c == 0)
            add(nid, "", "mass_excess_uncertainty_keV", r, p["mass_excess_uncertainty_keV"],
                SAME if same else DIFF, "" if c is None else f"{c - r:+.4g} keV")
        else:
            presence(nid, "", "mass_excess_uncertainty_keV", v.get("dME"), p.get("mass_excess_uncertainty_keV"))
        cmp_half_life(nid, "", v.get("T"), v.get("dT"), p.get("half_life"), v.get("T_est"))
        cmp_jpi(nid, "", v.get("Jpi"), p.get("spin_parity"))
        cmp_year(nid, v.get("Year"), p.get("discovery_year"))
        cmp_abundance(nid, v.get("IS"), p.get("natural_abundance_percent"))
        cmp_modes(nid, "", v.get("BR"), p.get("decay_modes"))
        # isomers, matched by label (m, n, p, ...)
        r_iso = {i.get("Lbl"): i for i in v.get("Iso", [])}
        c_iso = {}
        for i in p.get("isomers") or []:
            if isinstance(i, dict):
                c_iso[str(i.get("label", "?"))] = i
        if not r_iso and not c_iso:
            continue
        if len(r_iso) != len(c_iso):
            add(nid, "", "isomers(数)", len(r_iso), len(c_iso), DIFF,
                f"リポジトリ {sorted(r_iso)} / CurateGPT {sorted(c_iso)}")
        for lbl in sorted(set(r_iso) | set(c_iso)):
            ri, ci = r_iso.get(lbl), c_iso.get(lbl)
            state = f"isomer {lbl}"
            if ri is None:
                add(nid, state, "isomer", None, ci, ONLY_CGPT)
                continue
            if ci is None:
                add(nid, state, "isomer", {k: ri[k] for k in ri if k != "Lbl"}, None, ONLY_REPO)
                continue
            cmp_mass(nid, state, "excitation_energy_keV", ri.get("Ex"), None, ci.get("excitation_energy_keV"),
                     ri.get("Ex_est"))
            cmp_half_life(nid, state, ri.get("T"), None, ci.get("half_life"), ri.get("T_est"))
            cmp_jpi(nid, state, ri.get("Jpi"), ci.get("spin_parity"))
            cmp_modes(nid, state, ri.get("BR"), ci.get("decay_modes"))
    return tests, preds


def elements():
    preds = read_preds("elements")
    rows = []
    for Z, e in sorted(ELEMENTS.items()):
        pid = f"element-{Z}"
        if pid not in preds:
            rows.append({"Z": Z, "field": "(全体)", "repository": "", "curategpt": "", "category": "未生成",
                         "difference": "", "note": ""})
            continue
        p = preds[pid]["predicted"]
        for field, r, c, same in [
            ("symbol", e["symbol"], p.get("symbol"), lambda a, b: a == b),
            ("name_en", e["en"], p.get("name_en"), lambda a, b: a.strip().lower() == b.strip().lower()),
            ("name_ja", e["ja"], p.get("name_ja"),
             lambda a, b: unicodedata.normalize("NFKC", a) == unicodedata.normalize("NFKC", str(b)).strip()),
            ("discovery_year", e.get("discovered"), p.get("discovery_year"), lambda a, b: str(a) == str(b).strip()),
        ]:
            row = {"Z": Z, "symbol": e["symbol"], "field": field, "repository": fmt(r), "curategpt": fmt(c),
                   "difference": "", "note": ""}
            if r is None and c is None:
                continue
            if c is None:
                row["category"] = ONLY_REPO
            elif r is None:
                row["category"] = ONLY_CGPT
            elif same(r, c):
                row["category"] = SAME
            else:
                row["category"] = DIFF
                if field == "discovery_year" and isinstance(r, int) and num(c) is not None:
                    row["difference"] = f"{int(num(c)) - r:+d} 年"
            rows.append(row)
    return rows, preds


tests, npreds = nuclides()
erows, epreds = elements()


def write(path, rows, fields):
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields + ["判定"], delimiter="\t", extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


write(OUT / "diff_nuclides.tsv", rows_n,
      ["nuclide", "Z", "N", "A", "state", "field", "repository", "curategpt", "category", "difference", "note"])
write(OUT / "diff_elements.tsv", erows,
      ["Z", "symbol", "field", "repository", "curategpt", "category", "difference", "note"])

summary = {"nuclides": {"tested": len(tests), "generated": len(npreds)},
           "elements": {"tested": len(ELEMENTS), "generated": len(epreds)}}
by = defaultdict(Counter)
for r in rows_n:
    by[r["field"] if not r["state"] else f"{r['field']} (isomer)"][r["category"]] += 1
summary["nuclides"]["by_field"] = {k: dict(v) for k, v in by.items()}
by = defaultdict(Counter)
for r in erows:
    by[r["field"]][r["category"]] += 1
summary["elements"]["by_field"] = {k: dict(v) for k, v in by.items()}
(OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))
print(json.dumps(summary, ensure_ascii=False, indent=1))
