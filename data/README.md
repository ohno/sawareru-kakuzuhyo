# データ

アプリが読むデータの原本です。直したら `python scripts/build.py` で `dist/data/*.json` を作り直します。

| ファイル | 内容 | 出典 |
|---|---|---|
| [`nuclides/`](nuclides/) | 核種の質量・半減期・崩壊・発見年など（元素ごとに 1 ファイル） | F.G. Kondev et al., *Chin. Phys. C* **45**, 030001 (2021)（NUBASE2020、[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)）。データは [IAEA AMDC](https://www-nds.iaea.org/amdc/) |
| `elements.yaml` | 元素名、紹介文、特徴的な同位体、発見年 | 発見年は Wikipedia "[Timeline of chemical element discoveries](https://en.wikipedia.org/wiki/Timeline_of_chemical_element_discoveries)"、ほかはこのアプリのために作成 |
| `abundances.yaml` | 宇宙での元素の存在量 | K. Lodders, M. Bergemann, H. Palme, *Space Sci. Rev.* **221**, 23 (2025)、表は [doi:10.5281/zenodo.14988840](https://doi.org/10.5281/zenodo.14988840)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)） |
| `riken-discoveries.yaml` | 理研で発見された原子核 | FRIB Nuclear Data Group, Discovery of Nuclides Project, Isotope Database, [doi:10.11578/frib/2279152](https://doi.org/10.11578/frib/2279152)（2026-09-25 版） |
| `fission-yields.yaml` | ²³⁵U の核分裂収率 | JEFF-3.1.1（OECD/NEA）、[IAEA LiveChart of Nuclides](https://www-nds.iaea.org/relnsd/vcharthtml/VChartHTML.html) から取得 |
| `fuel-cycle.yaml` | 核燃料サイクルの分類と説明 | このアプリのために作成 |
| `driplines.yaml` | 通常核のドリップライン | J. Erler et al., *Nature* **486**, 509 (2012) の質量表（[MassExplorer](https://massexplorer.frib.msu.edu/)）から計算 |
| `hypernuclei.yaml` | ハイパー核 | [Mainz Chart of Hypernuclides](https://hypernuclei.kph.uni-mainz.de/)（2026-08-04 のデータ）。Ξ は E. Friedman & A. Gal, *EPJ Web Conf.* **271**, 03002 (2022)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)） |
| `hyper-driplines.yaml` | ハイパー核のドリップライン | C. Samanta et al., *J. Phys. G* **35**, 065101 (2008)；P. Roy Chowdhury et al., *Rom. Rep. Phys.* **62**, 65 (2010)；E.F. Meoto, *J. Phys. Commun.* **6**, 125004 (2022)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)） |
| （`scripts/ktuy.py` がビルド時に取得） | 未発見の原子核の質量、安定の島（殻エネルギー） | H. Koura et al., *Prog. Theor. Phys.* **113**, 305 (2005)（KTUY05、JAEA 核データセンターの質量表） |

出典の値は、必要なものを抜き出して YAML に書き換えています。
