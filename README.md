# さわれる核図表

https://ohno.github.io/sawareru-kakuzuhyo/

約 3,400 種の原子核を、理研の「レゴブロックで見る核図表」の配色で立体に並べた核図表です。ブラウザで回して、近づいて、箱にふれると、半減期や崩壊のゆくえがわかります。

## できること

- **調べる**　箱を選ぶと、半減期・崩壊モード・崩壊系列と、崩壊していく先の矢印。`238U`、`ウラン`、`Z=50 N=82` で検索
- **見比べる**　高さ（核子 1 個あたりの質量など）と色（レゴの配色、半減期など）、2D / 3D の切り替え
- **たどる**　発見の歴史、理研が発見した原子核、ハイパー核、安定の島、核燃料サイクル
- **聴く・見せる**　崩壊系列のメロディ、読み上げつきのチュートリアル、展示用のディスプレイモード（`d` キー）

## 手元で動かす

下記コマンドを実行後にブラウザで http://localhost:8000/ を開きます。

```bash
git clone https://github.com/ohno/sawareru-kakuzuhyo.git
cd sawareru-kakuzuhyo
pip install pyyaml
python scripts/build.py
python scripts/serve.py
```

Python 3 を使用します。`build.py` は、未発見の原子核と安定の島に使う KTUY05 の質量表を JAEA から取得します（不要なら `--no-ktuy`）。`src/` を直したら再読み込み、`data/` を直したら `build.py` をやり直します。main に push すると GitHub Actions が GitHub Pages に公開します（KTUY05 由来のデータは、リポジトリの変数 `USE_KTUY` が `true` のとき）。

## データとライセンス

データの出典は [data/README.md](data/README.md) にあります。プログラムと、このアプリのために書いた文章（元素の紹介、特徴的な同位体、核燃料サイクルの説明）は [MIT ライセンス](LICENSE)、そのほかのデータはそれぞれの出典の条件に従います。アイコンは Feather（MIT）と Lucide（ISC）にもとづきます（[THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES)）。LEGO®（レゴ®）はレゴグループの商標です。このアプリはレゴグループが後援・承認したものではありません。

## 開発概要

- **工数:** 9 Physicist-Day
- **開発期間:** 2026-11-10 10:30 〜 2026-11-12 14:30（日本時間）
- **技術スタック:** HTML, CSS, JavaScript, Three.js 0.170, Web Audio API, Web Speech API, Python（PyYAML）, GitHub Actions, GitHub Pages
- **開発ツール:** Claude Code（Claude デスクトップアプリ Windows 版）
- **サブスクリプションプラン:** Claude Max
- **使用モデル:** Claude Opus 5.5（effort: Extra High）
- **修正コメント数:** 約 230 件（約 60 回の依頼に含まれる箇条書きの項目数）
- **トークン使用量:** 約 7.6 億トークン（うちキャッシュの読み込み 約 7.5 億、出力 約 280 万、Maxプランの週次制限の約23%）

## 謝辞

本プロジェクトは、2026 年度 理研 TRIP ハッカソンにおける元素変換チームの成果の一部です。開発にあたって下記ページを参考にしました。
- 番匠カンナ「[立体核図表VRはどうやって作られたか](https://note.com/banjo_kanna/n/na083115a2c0d)」
- 核物理懇談会「[大きく広がるフレーバーの世界](http://kakudan.rcnp.osaka-u.ac.jp/jp/overview/world/Flavor.html)」
