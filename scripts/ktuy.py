"""The KTUY05 mass table (H. Koura, T. Tachibana, M. Uno, M. Yamada, Prog. Theor. Phys. 113, 305 (2005); JAEA
Nuclear Data Center), downloaded at build time (it is not kept in the repository), and the two files build.py makes
from it:

  predicted.json  {nuclides: [[Z, N, mass excess in keV], ...]}: the nuclides with 1 <= Z <= 126 that NUBASE2020
                  does not list and that the model binds (Sn, S2n, Sp, S2p > 0 from the table's own masses; one
                  whose neighbour is missing from the table is left out). The table stops at N = 200.
  island.json     {rows: [[Z, first N, Esh(N), Esh(N + 1), ...], ...]}: the shell energy (MeV) over the superheavy
                  region, from which the app draws the island of stability (null where the table has no entry).

Built without the table (--no-ktuy, or no connection), both files hold null: the app then shows neither.
"""
import http.client
import urllib.request

FILE = "KTUY05_m246.dat"
URL = f"https://wwwndc.jaea.go.jp/nucldata/mass/{FILE}"
OUTPUTS = ("predicted", "island")  # the files build() writes
COLUMNS = ["ZZ", "NN", "Mcal", "Esh"]  # the first columns of the table: Z, N, mass excess and shell energy (MeV)
MN, MH = 8.071, 7.289  # MeV, neutron and hydrogen mass excess as used by the KTUY explanation
Z_RANGE = range(100, 127)  # the island: up to the back edge of the board
N_RANGE = range(140, 201)


def fetch(path):
    """downloads the table to `path` unless it is there already; False when that fails (nothing is kept then)"""
    if path.exists():
        return True
    try:
        req = urllib.request.Request(URL, headers={"User-Agent": "sawareru-kakuzuhyo build"})
        with urllib.request.urlopen(req, timeout=60) as r:
            table = r.read()
    except (OSError, http.client.HTTPException) as e:
        print(f"could not download {URL} ({e})")
        return False
    if table.split(None, len(COLUMNS))[:len(COLUMNS)] != [c.encode("ascii") for c in COLUMNS]:
        print(f"{URL} did not send the mass table")  # an error page, for example
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(table)
    print(f"downloaded {URL} -> {path}")
    return True


def build(known, write, raw):
    """Writes predicted.json and island.json with write(name, value). known: (Z, N) of the NUBASE nuclides;
    raw: the folder the mass table is kept in. -> False when the table could not be had (nothing is written)"""
    path = raw / FILE
    if not fetch(path):
        return False
    mass, esh = {}, {}
    with open(path, encoding="ascii") as f:
        if f.readline().split()[:len(COLUMNS)] != COLUMNS:
            raise SystemExit(f"{path}: the table should start with the columns {' '.join(COLUMNS)}")
        for line in f:
            p = line.split()
            if p:
                mass[(int(p[0]), int(p[1]))] = float(p[2])
                esh[(int(p[0]), int(p[1]))] = float(p[3])

    def bound(z, n):
        m = mass[(z, n)]
        terms = [((z, n - 1), MN), ((z, n - 2), 2 * MN), ((z - 1, n), MH), ((z - 2, n), 2 * MH)]
        return all(k in mass and mass[k] - m + q > 0 for k, q in terms)

    write("predicted", {"nuclides": sorted([z, n, round(m * 1000)] for (z, n), m in mass.items()
                                           if 1 <= z <= 126 and (z, n) not in known and bound(z, n))})
    write("island", {"rows": [[z, N_RANGE[0]] + [esh.get((z, n)) for n in N_RANGE] for z in Z_RANGE]})
    return True
