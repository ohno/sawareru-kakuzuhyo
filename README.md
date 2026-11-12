# さわれる核図表

ブラウザで回したり拡大したりして「さわれる」3D の核図表です。NUBASE2020 に載っている約 3,500 種類の原子核を、理研の「レゴブロックで見る核図表」にならって、陽子の数 Z と中性子の数 N の盤面に立体的に並べています。

**公開版: https://ohno.github.io/sawareru-kakuzuhyo/**

## できること

- 原子核にマウスを重ねる・クリックすると、半減期・崩壊モード・崩壊系列などの情報と、崩壊していく先の矢印を表示
- 高さ（核子 1 個あたりの質量など）と色（理研レゴ核図表の配色、半減期など）の切り替え、2D / 3D 表示、検索
- 原子核が発見されてきた歴史の再生、理研が発見した原子核、ハイパー核、安定の島、核燃料サイクルの表示
- 崩壊系列をメロディで聴く、はじめての人向けのチュートリアル（字幕の読み上げつき。下の操作バーの「？」から）、展示用のディスプレイモード（d キー）

## ファイル構成

```
src/       公開するページ（index.html、css/、js/）
data/      データの原本（YAML）と出典
scripts/   ビルド、KTUY05 のデータ、NUBASE の取り込み、手元用のサーバー
dist/      公開するサイト一式（scripts/build.py が作る。git には入れない）
```

## 手元で動かす

Python 3 が必要です。このリポジトリのフォルダで順に実行し、http://localhost:8000/ を開きます。

```bash
pip install pyyaml
```

```bash
python scripts/build.py
```

```bash
python scripts/serve.py
```

未発見の原子核と安定の島のデータは、`scripts/build.py` が KTUY05 の質量表を JAEA からダウンロードして作ります（不要なら `--no-ktuy` を付けます）。`src/` を直したときは再読み込みで、`data/` を直したときは `scripts/build.py` をやり直すと反映されます。

GitHub Pages には `.github/workflows/pages.yml` が同じ手順で公開します（Settings → Pages の Source を「GitHub Actions」に）。KTUY05 由来のデータは、リポジトリの変数 `USE_KTUY` が `true` のときに公開版に入ります。

## データ

出典とファイルの一覧は [data/README.md](data/README.md) にあります。

## ライセンス

プログラムと、このアプリのために書いた文章（元素の紹介文、特徴的な同位体、核燃料サイクルの説明）は [MIT ライセンス](LICENSE)です。そのほかのデータはそれぞれの出典の条件に従います。画面のアイコンは Feather（MIT）と Lucide（ISC）にもとづきます（[THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES)）。

LEGO®（レゴ®）はレゴグループの商標です。このアプリはレゴグループが後援・承認したものではありません。

## 開発概要

- **工数:** 9 物理学者・日
- **開発期間:** 2026-11-10 10:30 〜 2026-11-12 14:30（日本時間）
- **技術スタック:** HTML, CSS, JavaScript, Three.js 0.170, Web Audio API, Web Speech API, Python（PyYAML）, GitHub Actions, GitHub Pages
- **開発ツール:** Claude Code（Claude デスクトップアプリ Windows 版）
- **サブスクリプションプラン:** Claude Max
- **使用モデル:** Claude Opus 5.5（effort: Extra High）
- **修正コメント数:** 約 230 件（約 60 回の依頼に含まれる箇条書きの項目数）
- **トークン使用量:** 約 7.6 億トークン（うちキャッシュの読み込み 約 7.5 億、出力 約 280 万）

## 謝辞

本プロジェクトは、2026 年度 理研 TRIP ハッカソンにおける元素変換チームの成果の一部です。開発にあたって下記ページを参考にしました。
- 番匠カンナ「[立体核図表VRはどうやって作られたか](https://note.com/banjo_kanna/n/na083115a2c0d)」
- 核物理懇談会「[大きく広がるフレーバーの世界](http://kakudan.rcnp.osaka-u.ac.jp/jp/overview/world/Flavor.html)」
