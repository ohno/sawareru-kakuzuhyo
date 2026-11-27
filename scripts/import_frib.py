"""Import the FRIB Discovery of Nuclides Project into data/discoveries.yaml: every nuclide it counts as discovered,
with the year, the laboratory and the paper it credits. This rewrites the file: run it only to move to a new version
(and change VERSION).

Usage:  curl -o raw/IsotopeDiscoveryMap.json https://people.frib.msu.edu/~chenj/isotope-discovery/IsotopeDiscoveryMap.json
        python scripts/import_frib.py [file]      (default: raw/IsotopeDiscoveryMap.json; then python scripts/build.py)
"""
import json
import sys

from build import DATA, ROOT

URL = "https://people.frib.msu.edu/~chenj/isotope-discovery/IsotopeDiscoveryMap.json"
VERSION = "2026-09-25"  # the date of the file (its Last-Modified); the file itself carries none
DST = DATA / "discoveries.yaml"
# the laboratories are written in TeX in the file
LABS = {'Jyv\\"askyl\\"a': "Jyväskylä", "Texas A\\&M": "Texas A&M"}

HEADER = f"""\
# FRIB Discovery of Nuclides Project, version of {VERSION}: every nuclide it counts as discovered (status DISCOVERED;
# the file also lists nuclides it counts as not observed or unbound, left out here), with the year, laboratory and
# paper it credits. Written by scripts/import_frib.py from {URL.rsplit('/', 1)[1]}; the abstracts are left out.
# The 285 with lab RIKEN are the same as RIKEN Nishina Center's own list, https://www.nishina.riken.jp/nuclides/new_isotope.html
# (checked 2026-11-12; it lists the isomer 195mAt for 195At). The years are FRIB's (the paper given); for 52 of them
# that list gives another year, often of an earlier report or the online date.
nuclides:
  columns: [Z, A, year, lab, reference, doi]
  rows:
"""


def quote(text):
    return "null" if text is None else "'" + text.replace("'", "''") + "'"


def reference(ref, source_of_doi):
    authors = ref.get("authors") or []
    names = [a["lastName"] for a in authors]
    who = f"{names[0]} et al." if len(names) > 2 else " and ".join(names) or None
    # a few entries lack the journal line that the other nuclides of the same paper have
    source = ref.get("source") or source_of_doi.get(ref.get("doi"))
    if not source:
        raise SystemExit(f"no journal line for {ref.get('nsrKeynumber')}")
    return f"{who}, {source}" if who else source


def main():
    src = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "raw/IsotopeDiscoveryMap.json")
    entries = json.loads(src.read_text(encoding="utf-8"))
    source_of_doi = {e["reference"]["doi"]: e["reference"]["source"] for e in entries.values()
                     if e.get("reference", {}).get("doi") and e["reference"].get("source")}
    rows = []
    for e in entries.values():
        if e["status"] != "DISCOVERED":
            continue
        ref = e.get("reference") or {}
        lab = LABS.get(e["lab"], e["lab"])
        if "\\" in lab:
            raise SystemExit(f"{e['a']}{e['elementSymbol']}: the laboratory {lab!r} is written in TeX; add it to LABS")
        rows.append((int(e["z"]), int(e["a"]), int(e["year"]), lab, reference(ref, source_of_doi) if ref else None, ref.get("doi") or None))
    rows.sort()
    lines = [f"    - [{z}, {a}, {year}, {quote(lab)}, {quote(ref)}, {quote(doi)}]" for z, a, year, lab, ref, doi in rows]
    DST.write_text(HEADER + "\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"{DST}: {len(rows)} nuclides, {sum(1 for r in rows if r[3] == 'RIKEN')} of them found at RIKEN")


if __name__ == "__main__":
    main()
