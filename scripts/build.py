"""Build dist/, the site as it is published: a copy of src/ and the data it loads, dist/data/*.json, made from the
YAML files in data/. Every file is checked on the way (keys given twice, the columns of each table, the names and
keys of the nuclide files).

Usage:  python scripts/build.py              (needs PyYAML: pip install pyyaml)
        python scripts/build.py --no-ktuy    without the predicted nuclei and the island of stability (ktuy.py)

data/nuclides/092-U.yaml ... -> data/nuclides.json, with the short keys of the app:
  file 092-U.yaml, key 238U -> z, n     ME, dME, ME_est -> me, dme, mee     Jpi -> j     Year -> y     IS -> ab
  T -> ts and t (seconds), or st (stable) / pu (particle-unbound)     dT -> dt     T_est -> te
  BR -> d, as [mode, relation, value %, NUBASE text]
  Iso -> iso: Lbl -> f, Ex -> e, Ex_est -> ee, T -> ts or st / pu, Jpi -> j, BR -> d (the texts joined by ;)
data/abundances.yaml -> data/abundances.json, per Z, with the share of all atoms and the rank worked out.
Any other data/<name>.yaml -> data/<name>.json as it is, each table {columns: [...], rows: [...]} becoming its rows.
"""
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

import yaml

import ktuy

ROOT = Path(__file__).resolve().parent.parent
SRC, DATA, DIST = ROOT / "src", ROOT / "data", ROOT / "dist"

YEAR_S = 31556926.0
UNIT_S = {
    "ys": 1e-24, "zs": 1e-21, "as": 1e-18, "fs": 1e-15, "ps": 1e-12, "ns": 1e-9,
    "us": 1e-6, "ms": 1e-3, "s": 1.0, "m": 60.0, "h": 3600.0, "d": 86400.0,
    "y": YEAR_S, "ky": 1e3 * YEAR_S, "My": 1e6 * YEAR_S, "Gy": 1e9 * YEAR_S,
    "Ty": 1e12 * YEAR_S, "Py": 1e15 * YEAR_S, "Ey": 1e18 * YEAR_S,
    "Zy": 1e21 * YEAR_S, "Yy": 1e24 * YEAR_S,
}
NUM_RE = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")
MODE_RE = re.compile(r"^\s*([0-9]*[A-Za-z][A-Za-z0-9+\-]*?)\s*(<=|>=|[=~<>?])\s*(.*)$")


class Loader(getattr(yaml, "CSafeLoader", yaml.SafeLoader)):
    """the safe loader, but a key given twice in one mapping is an error instead of the last one silently winning"""

    def construct_mapping(self, node, deep=False):
        keys = Counter(self.construct_object(k, deep=True) for k, _ in node.value)
        twice = [k for k, c in keys.items() if c > 1]
        if twice:
            raise yaml.constructor.ConstructorError(None, None, f"{twice[0]} is given twice", node.start_mark)
        return super().construct_mapping(node, deep)


def load(path):
    return yaml.load(path.read_text(encoding="utf-8"), Loader=Loader)


def write(name, value):
    path = DIST / "data" / f"{name}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{path.relative_to(ROOT)}: {path.stat().st_size / 1024:.0f} KiB")


def parse_num(text):
    """(value, estimated) for strings like '1234.5', '2000#', ''"""
    if not text:
        return None, False
    m = NUM_RE.search(text.replace("#", ""))
    return (float(m.group()) if m else None), "#" in text


def seconds(ts):
    """'1.248 Gy', '<10 ns', '~3 μs' -> seconds"""
    value, unit = ts.lstrip("<>~").split(" ")
    return float(NUM_RE.search(value).group()) * UNIT_S[unit.replace("μs", "us")]


def modes(texts):
    """['B-=89.28 13', 'A ?'] -> [[mode, relation, value % or None, text], ...]"""
    out = []
    for text in texts:
        m = MODE_RE.match(text)
        if not m:
            out.append([text, "?", None, text])
            continue
        rest = m.group(3).strip()
        value = parse_num(rest.split(" ")[0])[0] if rest and not rest.startswith("?") else None
        out.append([m.group(1), m.group(2), value, text])
    return out


def half_life(rec, t):
    if t == "stable":
        rec["st"] = 1
    elif t == "particle-unbound":
        rec["pu"] = 1
    elif t:
        rec["ts"] = t


def nuclide(e, z, n):
    """the YAML entry of the nuclide (z, n) -> its app record"""
    rec = {"z": z, "n": n}
    if "ME" in e:
        rec["me"] = e["ME"]
        if "dME" in e:
            rec["dme"] = e["dME"]
        if e.get("ME_est"):
            rec["mee"] = 1
    t = e.get("T")
    if t and t not in ("stable", "particle-unbound"):
        rec["t"] = seconds(t)
    half_life(rec, t)
    if "ts" in rec:
        if "dT" in e:
            rec["dt"] = e["dT"]
        if e.get("T_est"):
            rec["te"] = 1
    for key, short in (("Jpi", "j"), ("Year", "y"), ("IS", "ab")):
        if key in e:
            rec[short] = e[key]
    if "BR" in e:
        rec["d"] = modes(e["BR"])
    if "Iso" in e:
        rec["iso"] = []
        for y in e["Iso"]:
            iso = {"f": y["Lbl"]}
            if "Ex" in y:
                iso["e"] = y["Ex"]
                if y.get("Ex_est"):
                    iso["ee"] = 1
            half_life(iso, y.get("T"))
            if "Jpi" in y:
                iso["j"] = y["Jpi"]
            if "BR" in y:
                iso["d"] = ";".join(y["BR"])
            rec["iso"].append(iso)
    return rec


def nuclides(symbols):
    out = []
    for path in sorted((DATA / "nuclides").glob("*.yaml")):
        m = re.fullmatch(r"(\d{3})-([A-Za-z]+)\.yaml", path.name)
        if not m or int(m[1]) >= len(symbols) or symbols[int(m[1])] != m[2]:
            raise SystemExit(f"{path}: the name should be Z (3 digits) and the element symbol, like 092-U.yaml")
        z, symbol = int(m[1]), m[2]
        for key, entry in (load(path) or {}).items():
            k = re.fullmatch(r"(\d+)([A-Za-z]+)", str(key))
            if not k or k[2] != symbol or int(k[1]) < z:
                raise SystemExit(f"{path}: {key}: the key should be the mass number and {symbol}, like {2 * z or 1}{symbol}")
            out.append(nuclide(entry, z, int(k[1]) - z))
    return sorted(out, key=lambda r: (r["z"], r["n"]))


def tables(value, where):
    """{columns, rows} -> rows, once every row has one value per column"""
    if isinstance(value, dict) and set(value) == {"columns", "rows"}:
        for row in value["rows"]:
            if len(row) != len(value["columns"]):
                raise SystemExit(f"{where}: {row} does not match the columns {value['columns']}")
        return value["rows"]
    if isinstance(value, dict):
        return {k: tables(v, where) for k, v in value.items()}
    if isinstance(value, list):
        return [tables(v, where) for v in value]
    return value


def abundances(data):
    """rows [Z, logEps, mass share] -> per Z (null where none): share of all atoms (4 digits), mass share, rank"""
    rows = sorted(data["elements"], key=lambda r: -r[1])
    total = sum(10 ** (eps - 12) for _, eps, _ in rows)
    per_z = [None] * (max(r[0] for r in rows) + 1)
    for rank, (z, eps, mass) in enumerate(rows, 1):
        per_z[z] = {"num": float(f"{10 ** (eps - 12) / total:.4g}"), "mass": mass, "rank": rank}
    return {"label": data["label"], "cite": data["cite"], "elements": per_z}


def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(SRC, DIST)
    elements = load(DATA / "elements.yaml")["elements"]
    for z, e in enumerate(elements):
        if e.get("Z") != z:
            raise SystemExit(f"elements.yaml: entry {z} ({e.get('symbol')}) has Z = {e.get('Z')}; entries go in order of Z")
    nucs = nuclides([e["symbol"] for e in elements])
    write("nuclides", {"nuclides": nucs})
    for path in sorted(DATA.glob("*.yaml")):
        data = tables(load(path), path.name)
        write(path.stem, abundances(data) if path.stem == "abundances" else data)
    if "--no-ktuy" in sys.argv[1:]:
        print("--no-ktuy: no predicted nuclei, no island of stability")
    else:
        ktuy.build({(r["z"], r["n"]) for r in nucs}, write)


if __name__ == "__main__":
    main()
