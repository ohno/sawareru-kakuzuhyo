"""Have CurateGPT generate the pilot nuclides and elements from their identity alone (Z, N, A / Z).

For each object this calls DragonAgent.complete, the same call CurateGPT's `generate-evaluate` command makes:
CurateGPT retrieves the most similar examples from an indexed example collection, builds its few-shot prompt,
and asks the LLM to fill in the rest. The LLM is either the OpenAI API (`--llm openai`, CurateGPT's default)
or the Codex CLI signed in with a ChatGPT plan (`--llm codex`, one `codex exec` per object).

usage: python tools/curategpt/run_curategpt.py --llm codex [--codex-model MODEL] [--workers 3] [--limit N]

Writes into WORK (tools/curategpt/work by default), resuming where an earlier run stopped:
  pred_nuclides.jsonl, pred_elements.jsonl  one line per object: what CurateGPT returned, and how
  prompts/<id>.txt                          the prompt CurateGPT built
  codex_logs/<id>.jsonl                     the event log of `codex exec --json` (codex only)
  rejected.jsonl                            answers thrown away because Codex used a tool (retried next run)
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import threading
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent

ap = argparse.ArgumentParser()
ap.add_argument("--work", default=str(HERE / "work"))
ap.add_argument("--llm", choices=["openai", "codex"], default="codex")
ap.add_argument("--model", default="gpt-4o", help="OpenAI API model (--llm openai)")
ap.add_argument("--codex", default="codex", help="the Codex CLI executable")
ap.add_argument("--codex-model", help="model for codex exec -m (default: the Codex default)")
ap.add_argument("--codex-effort", help="reasoning effort for Codex, e.g. low, medium, high")
ap.add_argument("--embedding", choices=["minilm", "openai"],
                help="minilm: all-MiniLM-L6-v2 on this computer (default with codex); openai: text-embedding-ada-002")
ap.add_argument("--only", choices=["nuclides", "elements"])
ap.add_argument("--limit", type=int, help="stop after this many objects of each kind (for a trial run)")
ap.add_argument("--workers", type=int, default=3)
ap.add_argument("--examples", type=int, default=5, help="few-shot examples CurateGPT retrieves per object")
ap.add_argument("--mock", action="store_true", help="test the plumbing: no LLM, an answer copied from an example")
args = ap.parse_args()
WORK = Path(args.work)
EMBEDDING = args.embedding or ("openai" if args.llm == "openai" else "minilm")
if args.llm == "openai" or EMBEDDING == "openai":
    # CurateGPT reads the key from OPENAI_API_KEY (in the cloud session a proxy supplies the real one)
    os.environ.setdefault("OPENAI_API_KEY", "proxy-injected")

import curategpt.extract.basic_extractor as basic_extractor_module  # noqa: E402
from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2  # noqa: E402
from curategpt.agents.dragon_agent import DragonAgent  # noqa: E402
from curategpt.extract import BasicExtractor  # noqa: E402
from curategpt.store import ChromaDBAdapter  # noqa: E402

# CurateGPT counts prompt tokens with tiktoken only to drop examples from prompts too long for the model; that
# needs a download, so estimate generously from the length instead (these prompts are far below any limit)
basic_extractor_module.estimate_num_tokens = lambda messages, model="gpt-4": sum(len(m) for m in messages) // 2

# all-MiniLM-L6-v2 (CurateGPT's default embedding) in Chroma's ONNX build, which needs no PyTorch model download
_embedding_function = ChromaDBAdapter._embedding_function
ChromaDBAdapter._embedding_function = lambda self, model=None: (
    ONNXMiniLM_L6_V2() if model == "all-MiniLM-L6-v2" else _embedding_function(self, model))
EMBED_MODEL = {"minilm": "all-MiniLM-L6-v2", "openai": "openai:"}[EMBEDDING]

NUCLIDE_FIELDS = ["mass_excess_keV", "mass_excess_uncertainty_keV", "half_life", "half_life_uncertainty",
                  "spin_parity", "discovery_year", "natural_abundance_percent", "decay_modes", "isomers"]
NUCLIDE_SEED = ["id", "label", "element", "Z", "N", "A"]
NUCLIDE_RULES = [
    "Give the values of the NUBASE2020 evaluation (F.G. Kondev et al., Chin. Phys. C 45, 030001 (2021)) for this nuclide's ground state.",
    "mass_excess_keV: atomic mass excess in keV; mass_excess_uncertainty_keV: its uncertainty in keV.",
    "half_life: number and unit (ys zs as fs ps ns μs ms s m h d y ky My Gy Ty Py Ey Zy Yy), or 'stable', or "
    "'particle-unbound'; a limit is written like '<10 ns' or '>1 Ey'. half_life_uncertainty: as NUBASE writes it.",
    "spin_parity: NUBASE notation; parentheses mark tentative values, '#' values from systematics, '*' strong arguments.",
    "discovery_year: the year the nuclide was first identified (as in the FRIB Discovery of Nuclides Project).",
    "natural_abundance_percent: isotopic abundance in percent, only for nuclides that occur in nature.",
    "decay_modes: NUBASE notation, one mode per item, e.g. 'B-=100', 'B+=100', 'EC=100', 'A=100', 'B-n=31.5 15', "
    "'SF=5.44e-5 7', 'IT=100', 'p ?' (branching ratio in percent, then its uncertainty in the last digits).",
    "isomers: the excited isomeric states NUBASE2020 lists for this nuclide (label m, n, p, ...; excitation energy "
    "in keV; half_life; spin_parity; decay_modes). Leave a field out when NUBASE2020 has no value.",
]
ELEMENT_FIELDS = ["symbol", "name_en", "name_ja", "discovery_year"]
ELEMENT_SEED = ["id", "Z"]
ELEMENT_RULES = [
    "symbol: the chemical symbol; for undiscovered elements (Z >= 119) the IUPAC systematic symbol.",
    "name_en: the English name; name_ja: the Japanese name (katakana or kanji as normally written in Japan).",
    "discovery_year: the year the element was first observed, as in the 'Observed' column of the Wikipedia "
    "article 'Timeline of chemical element discoveries'; 'ancient' for elements known since antiquity; "
    "leave it out for elements not yet discovered.",
]

# Codex is a coding agent: it is told to answer from what it knows, its tools are switched off, it runs in an
# empty read-only folder, and any answer for which it still ran a command, searched or called a tool is rejected,
# so that it cannot look up the answer in this repository or on the published site
CODEX_PREAMBLE = ("Answer from your own knowledge only. Do not run commands, read files, search the web or use "
                  "any tool. Reply with the JSON object only.\n\n")
CODEX_DISABLE = ["shell_tool", "unified_exec", "browser_use", "browser_use_external", "computer_use", "apps",
                 "plugins", "multi_agent", "image_generation", "in_app_browser", "skill_search", "tool_suggest",
                 "view_image", "hooks"]
CODEX_HARMLESS_ITEMS = {"agent_message", "reasoning", "error", "todo_list"}
ctx = threading.local()


class TextResponse:
    def __init__(self, text):
        self._text = text

    def text(self):
        return self._text


class OpenAIModel:
    """the llm package's OpenAI model, called with temperature 0 so that a rerun gives the same answer"""

    def __init__(self, model):
        self.inner = model
        self.model_id = model.model_id

    def prompt(self, text, **kw):
        return self.inner.prompt(text, temperature=0, **kw)


class CodexModel:
    """answers a CurateGPT prompt with one `codex exec` (non-interactive Codex CLI)"""

    model_id = "gpt-4o"  # read by CurateGPT only to look up the context length (128k) for its length check

    def __init__(self, schema):
        self.schema = schema

    def prompt(self, text, **kw):
        with tempfile.TemporaryDirectory() as empty, tempfile.TemporaryDirectory() as tmp:
            answer = Path(tmp) / "answer.json"
            cmd = [args.codex, "exec", "--json", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config",
                   "--sandbox", "read-only", "--cd", empty, "--output-schema", str(self.schema),
                   "--output-last-message", str(answer), "-c", 'web_search="disabled"']
            for feature in CODEX_DISABLE:
                cmd += ["--disable", feature]
            if args.codex_model:
                cmd += ["--model", args.codex_model]
            if args.codex_effort:
                cmd += ["-c", f'model_reasoning_effort="{args.codex_effort}"']
            cmd.append("-")
            p = subprocess.run(cmd, input=CODEX_PREAMBLE + text, capture_output=True, text=True, encoding="utf-8",
                               cwd=empty, timeout=900)
            (WORK / "codex_logs" / f"{ctx.id}.jsonl").write_text(p.stdout + p.stderr, encoding="utf-8")
            items, usage, failure, last_message = [], None, None, None
            for line in p.stdout.splitlines():
                try:
                    ev = json.loads(line)
                except ValueError:
                    continue
                item = ev.get("item") or {}
                if ev.get("type") == "item.completed" and item.get("type"):
                    items.append(item["type"])
                    if item["type"] == "agent_message":
                        last_message = item.get("text")
                elif ev.get("type") == "turn.completed":
                    usage = ev.get("usage")
                elif ev.get("type") == "turn.failed":
                    failure = (ev.get("error") or {}).get("message")
            if failure or p.returncode != 0:
                raise RuntimeError(failure or p.stderr.strip()[-500:] or f"codex exited with {p.returncode}")
            ctx.meta = {"codex_items": items, "usage": usage,
                        "tool_used": sorted(set(items) - CODEX_HARMLESS_ITEMS)}
            return TextResponse(answer.read_text(encoding="utf-8") if answer.exists() else last_message or "")


class MockModel:
    model_id = "gpt-4o"

    def prompt(self, text, **kw):
        ctx.meta = {"tool_used": []}
        return TextResponse(text.split("Response: ", 2)[1].split("\n")[0])


class Extractor(BasicExtractor):
    """CurateGPT's BasicExtractor (prompt and parsing unchanged) with the LLM chosen above"""

    @property
    def model(self):
        if args.mock:
            return MockModel()
        if args.llm == "codex":
            return CodexModel(ctx.schema)
        return OpenAIModel(BasicExtractor.model.fget(self))


if args.mock:
    import numpy as np
    from chromadb.api.types import EmbeddingFunction

    class HashEmbedding(EmbeddingFunction):
        def __call__(self, input):
            out = []
            for t in input:
                v = np.zeros(64)
                for w in t.split():
                    v[int(hashlib.md5(w.encode()).hexdigest(), 16) % 64] += 1
                out.append((v / (np.linalg.norm(v) or 1)).tolist())
            return out

    if EMBEDDING == "openai":
        ChromaDBAdapter._embedding_function = lambda self, model=None: HashEmbedding()

if args.llm == "codex" and not args.mock and not shutil.which(args.codex):
    raise SystemExit(f"{args.codex} not found: install the Codex CLI and sign in (codex login)")
for sub in ("prompts", "codex_logs"):
    (WORK / sub).mkdir(parents=True, exist_ok=True)
store = ChromaDBAdapter(str(WORK / f"db-{EMBEDDING}"))
lock = threading.Lock()
LLM_NAME = ("mock" if args.mock else f"codex:{args.codex_model or 'default'}" if args.llm == "codex"
            else f"openai:{args.model}")


def index(collection, objs, object_type):
    if collection not in store.list_collection_names():
        store.insert(objs, collection=collection, model=EMBED_MODEL, object_type=object_type)


def run(kind, collection_of, tests, seed_fields, fields, rules, schema):
    out = WORK / f"pred_{kind}.jsonl"
    done = set()
    if out.exists():
        done = {json.loads(line)["id"] for line in out.read_text(encoding="utf-8").splitlines() if line.strip()}
    todo = [t for t in tests if t["id"] not in done]
    if args.limit:
        todo = todo[: max(0, args.limit - len(done))]
    print(f"{kind}: {len(done)} done, {len(todo)} to go", flush=True)
    state = {"failures": 0, "stop": False, "n": 0}

    def one(test):
        if state["stop"]:
            return
        ctx.id, ctx.schema, ctx.meta = test["id"], schema, {}
        extractor = Extractor()
        extractor.model_name = args.model
        agent = DragonAgent(knowledge_source=store, extractor=extractor)
        seed = {k: test[k] for k in seed_fields if k in test}
        try:
            ao = agent.complete(seed, collection=collection_of(test), fields_to_predict=fields, rules=rules,
                                limit=args.examples)
        except Exception as e:  # recorded nowhere: the object is simply tried again on the next run
            with lock:
                state["failures"] += 1
                print(f"  {test['id']}: {type(e).__name__}: {str(e)[:300]}", flush=True)
                if state["failures"] >= 5:
                    state["stop"] = True
                    print("Stopped after 5 failures in a row (a usage limit?). Run the same command again later "
                          "to continue where it stopped.", flush=True)
            return
        meta = ctx.meta
        prompt = ao.annotations.get("prompt", "") or ""
        (WORK / "prompts" / f"{test['id']}.txt").write_text(prompt, encoding="utf-8")
        row = {"id": test["id"], "seed": seed, "predicted": {k: ao.object.get(k) for k in fields if k in ao.object},
               "llm": LLM_NAME, "embedding": EMBED_MODEL, "examples": args.examples, **meta}
        with lock:
            state["failures"] = 0
            if meta.get("tool_used"):
                print(f"  {test['id']}: rejected, Codex used {meta['tool_used']}", flush=True)
                with (WORK / "rejected.jsonl").open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps(row, ensure_ascii=False) + "\n")
                return
            with out.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            state["n"] += 1
            if state["n"] % 10 == 0:
                print(f"  {kind}: {state['n']}/{len(todo)}", flush=True)

    with ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(one, todo))
    return not state["stop"]


ok = True
if args.only in (None, "nuclides"):
    index("nuclide_examples", json.loads((WORK / "nuclide_examples.json").read_text(encoding="utf-8")), "Nuclide")
    ok = run("nuclides", lambda t: "nuclide_examples",
             json.loads((WORK / "nuclide_tests.json").read_text(encoding="utf-8")),
             NUCLIDE_SEED, NUCLIDE_FIELDS, NUCLIDE_RULES, HERE / "schemas/nuclide.schema.json")

if ok and args.only in (None, "elements"):
    folds = [json.loads((WORK / f"element_fold{f}.json").read_text(encoding="utf-8")) for f in (0, 1)]
    for f in (0, 1):
        index(f"elements_fold{f}", folds[f], "ChemicalElement")
    # an element is generated with the elements of the other parity of Z as its examples
    run("elements", lambda t: f"elements_fold{1 - t['Z'] % 2}", folds[0] + folds[1],
        ELEMENT_SEED, ELEMENT_FIELDS, ELEMENT_RULES, HERE / "schemas/element.schema.json")
