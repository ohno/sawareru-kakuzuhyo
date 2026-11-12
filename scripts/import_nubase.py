"""Import NUBASE2020 into data/nuclides/*.yaml, one file per element. This rewrites the files and drops hand edits:
run it only to start over or to move to a new NUBASE edition.

Usage:  curl -o raw/nubase_4.mas20.txt https://www-nds.iaea.org/amdc/ame2020/nubase_4.mas20.txt
        python scripts/import_nubase.py      (then python scripts/build.py)
"""
import re
from pathlib import Path

import yaml

from build import MODE_RE, UNIT_S, parse_num

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "raw" / "nubase_4.mas20.txt"
DST = ROOT / "data" / "nuclides"

# Discovery years that are evidently wrong in NUBASE2020, replaced by the FRIB Discovery of Nuclides Project
# value: (Z, A) -> (year, note written next to it in the YAML file)
YEAR_ERRATA = {
    (89, 227): (1911, "NUBASE2020 gives 1851, before radioactivity was known; FRIB Discovery of Nuclides: Paris, 1911"),
}


class Dumper(yaml.SafeDumper):
    """mappings one key per line, lists of plain values on one line ([B-=89.28 13, B+=10.72 13]),
    and list items indented under their key"""

    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)


Dumper.add_representer(list, lambda d, data: d.represent_sequence(
    "tag:yaml.org,2002:seq", data, flow_style=all(not isinstance(x, (dict, list)) for x in data)))


def col(line, a, b):
    """1-indexed inclusive column slice, as in the NUBASE format description"""
    return line[a - 1:b].strip()


def half_life(tval, unit, dt):
    """T, dT, T_est of an entry ({} when NUBASE gives none)"""
    if not tval:
        return {}
    if tval.startswith("stbl"):
        return {"T": "stable"}
    if tval.startswith("p-unst"):
        return {"T": "particle-unbound"}
    value, est = parse_num(tval)
    if value is None or unit not in UNIT_S:
        return {}
    op = tval[0] if tval[0] in "<>~" else ""
    out = {"T": f"{op}{tval.replace('#', '').lstrip('<>~')} {unit.replace('us', 'μs')}"}
    if dt and dt != "?":
        out["dT"] = dt
    if est:
        out["T_est"] = True
    return out


def decay(text):
    """'IS=99.27 10;A=100;SF=5.44e-5 7' -> natural abundance (IS), the decay modes as written"""
    abundance, modes = None, []
    for part in text.split(";"):
        part = part.strip()
        m = MODE_RE.match(part)
        if m and m.group(1) == "IS":
            rest = m.group(3).strip()
            abundance = parse_num(rest.split(" ")[0])[0] if rest and not rest.startswith("?") else None
        elif part:
            modes.append(part)
    return abundance, modes


def main():
    if not SRC.exists():
        raise SystemExit(f"{SRC} is missing: download https://www-nds.iaea.org/amdc/ame2020/nubase_4.mas20.txt into raw/")
    ground, isomers, symbols = {}, {}, {}
    for line in SRC.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        line = line.ljust(209)
        a = int(col(line, 1, 3))
        z, i = int(col(line, 5, 8)[:3]), int(col(line, 5, 8)[3])
        symbols[z] = re.sub(r"^\d+", "", col(line, 12, 16))
        hl = half_life(col(line, 70, 78), col(line, 79, 80), col(line, 82, 88))
        jpi, disc = col(line, 89, 102), col(line, 115, 118)
        abundance, modes = decay(col(line, 120, 209))
        if i == 0:
            e = {}
            me, me_est = parse_num(col(line, 19, 31))
            if me is not None:
                e["ME"] = me
                dme = parse_num(col(line, 32, 42))[0]
                if dme is not None:
                    e["dME"] = dme
                if me_est:
                    e["ME_est"] = True
            e.update(hl)
            if jpi:
                e["Jpi"] = jpi
            if disc.isdigit():
                e["Year"] = YEAR_ERRATA[(z, a)][0] if (z, a) in YEAR_ERRATA else int(disc)
            if abundance is not None:
                e["IS"] = abundance
            if modes:
                e["BR"] = modes
            ground[(z, a)] = e
        elif i <= 6 and hl:
            iso = {"Lbl": col(line, 17, 17) or str(i)}
            exc, exc_est = parse_num(col(line, 43, 54))
            if exc is not None:
                iso["Ex"] = exc
                if exc_est:
                    iso["Ex_est"] = True
            iso["T"] = hl["T"]
            if jpi:
                iso["Jpi"] = jpi
            if modes:
                iso["BR"] = modes
            isomers.setdefault((z, a), []).append(iso)

    files = {}
    for (z, a), e in sorted(ground.items()):
        if (z, a) in isomers:
            e["Iso"] = isomers[(z, a)]
        text = yaml.dump({f"{a}{symbols[z]}": e}, Dumper=Dumper, allow_unicode=True, sort_keys=False,
                         default_flow_style=False, width=1000)
        if (z, a) in YEAR_ERRATA:
            year, note = YEAR_ERRATA[(z, a)]
            text = text.replace(f"  Year: {year}\n", f"  Year: {year}  # {note}\n")
        files.setdefault(z, []).append(text)
    DST.mkdir(parents=True, exist_ok=True)
    for old in DST.glob("*.yaml"):
        old.unlink()
    for z, parts in files.items():
        (DST / f"{z:03d}-{symbols[z]}.yaml").write_text("\n".join(parts), encoding="utf-8", newline="\n")
    print(f"{len(ground)} ground states, {sum(map(len, isomers.values()))} isomers -> {DST} ({len(files)} files)")


if __name__ == "__main__":
    main()
