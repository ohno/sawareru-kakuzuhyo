# CurateGPT との突き合わせ（試験運転）

[CurateGPT](https://github.com/monarch-initiative/curategpt)（Monarch Initiative の LLM によるキュレーション支援ツール）に、このリポジトリと同じ種類のデータを作らせ、`data/` と比べるための道具です。試験運転として、核種 304 種（元素ごとに代表的な核種と、ランダムに 1〜2 種）と元素 127 を対象にします。

## しくみ

- 核種には名前と Z・N・A だけを渡し、質量超過とその不確かさ、半減期、スピン・パリティ、発見年、天然存在比、崩壊モード、核異性体を CurateGPT に埋めさせます。値は NUBASE2020 のものを書くよう指示します。
- CurateGPT は、見本の集まり（試験の対象を除いた 40 核種）から似たものを 5 件選んでプロンプトに入れます（DragonAgent.complete。CurateGPT の `generate-evaluate` と同じ呼び出し）。見本を少なくしているのは、答えそのものや同じ元素の近い核種を写すだけにならないようにするためです。
- 元素は Z だけを渡し、記号、英語名、日本語名、発見年を埋めさせます。見本は Z の偶奇が反対の元素です。
- LLM は Codex CLI（ChatGPT のプランでログイン）です。CurateGPT が組み立てたプロンプトを 1 件ずつ `codex exec` に渡します。見本の検索、プロンプト、答えの読み取りは CurateGPT のままです。

Codex はエージェントなので、手元のファイルやウェブを見て答えを写さないよう、次のようにしています。

- 「自分の知識だけで答える」という前置きをプロンプトの先頭に足す
- シェルやブラウザなどの道具を切り、ウェブ検索を無効にし、`~/.codex/config.toml`（MCP サーバーなど）を読ませない
- 空のフォルダで、読み取り専用で動かす
- それでもコマンドの実行や検索をした回答は捨て（`work/rejected.jsonl` に記録）、次の実行でやり直す

## 必要なもの

- Python 3.11 または 3.12（3.13 では依存パッケージが入りません）
- [Codex CLI](https://github.com/openai/codex) 0.167 以降、ChatGPT のアカウントでログイン済み（`codex login status` で確認）
- 初回に埋め込みモデル（all-MiniLM-L6-v2、約 80 MB）をダウンロードします

## 手順

このリポジトリのフォルダで実行します。

```bash
git fetch origin ccr-bce430dd-rghvzk
git switch ccr-bce430dd-rghvzk
```

```bash
python3.11 -m venv tools/curategpt/.venv
source tools/curategpt/.venv/bin/activate
pip install -r tools/curategpt/requirements.txt
```

（Windows では `py -3.11 -m venv tools\curategpt\.venv` と `tools\curategpt\.venv\Scripts\activate`）

```bash
python tools/curategpt/prepare.py
```

まず 3 件ずつ試します。`--codex-model` には、`codex` を起動して `/model` で出るモデル名を書きます（省くと Codex の既定のモデル）。

```bash
python tools/curategpt/run_curategpt.py --codex-model gpt-5.5 --limit 3
```

`tools/curategpt/work/pred_nuclides.jsonl` と `pred_elements.jsonl` にそれぞれ 3 行ずつ入っていて、`work/rejected.jsonl` がなければ（Codex が道具を使わなければ）、残りを流します。

```bash
python tools/curategpt/run_curategpt.py --codex-model gpt-5.5
```

- 1 件ごとに Codex が起動するので、全部で数時間かかることがあります。並列数は `--workers`（既定 3）で変えられます。
- 5 件続けて失敗すると止まります（プランの利用上限など）。Ctrl+C で止めてもかまいません。同じコマンドをもう一度実行すると、終わっていない分から続けます。
- モデルを途中で変えないでください（変えるときは `work/` を消して最初から）。

終わったら、結果を push します。

```bash
git add tools/curategpt/work/pred_nuclides.jsonl tools/curategpt/work/pred_elements.jsonl
git commit -m "CurateGPT（Codex）の試験運転の結果"
git push
```

手元で差分を見るには `python tools/curategpt/compare.py` を実行します。`tools/curategpt/results/` に、比べた値 1 つにつき 1 行の表（`diff_nuclides.tsv`、`diff_elements.tsv`。最後の「判定」列は空欄）と集計（`summary.json`）ができます。

## ファイル

| ファイル | 内容 |
|---|---|
| `prepare.py` | `data/` から見本と試験の対象を作る（`work/`。乱数の種は固定） |
| `run_curategpt.py` | CurateGPT に生成させる（`--llm openai` にすると OpenAI API の gpt-4o。`OPENAI_API_KEY` とクレジットが必要） |
| `compare.py` | 生成された値と `data/` を比べる |
| `schemas/` | Codex に返させる JSON の形 |
| `work/` | 入力と結果。`pred_*.jsonl` が CurateGPT の答え、`prompts/` が CurateGPT の組み立てたプロンプト、`codex_logs/` が Codex の記録 |

比べる値の範囲や許容差は `compare.py` の中に書いてあります（たとえば質量超過は、差がリポジトリの不確かさの 3 倍か 0.5 keV の大きいほう以内なら一致）。
