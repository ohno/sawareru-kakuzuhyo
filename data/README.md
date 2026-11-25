# データ

アプリが読むデータの原本です。直したら `python scripts/build.py` で `dist/data/*.json` を作り直します。

出典はこの表だけに書いています。アプリの「データの出典」も、ビルドのときにこの表から作ります（列の名前と数は変えないでください）。最後の行は、このプロジェクトを引用するときの書き方です。英語で表示するときの表は、下の「English」にあります（行を足したり直したりしたら、両方の表をそろえてください）。

| ファイル | 内容 | 出典 |
|---|---|---|
| [`nuclides/`](nuclides/)（元素ごとに 1 ファイル） | 核種の質量・半減期・崩壊・発見年 | F.G. Kondev et al., *Chin. Phys. C* **45**, 030001 (2021)（NUBASE2020、[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)）。データは [IAEA AMDC](https://www-nds.iaea.org/amdc/) |
| `elements.yaml` | 元素名、元素の紹介、特徴的な同位体、元素の発見年 | 発見年は Wikipedia "[Timeline of chemical element discoveries](https://en.wikipedia.org/wiki/Timeline_of_chemical_element_discoveries)"、ほかはこのアプリのために作成 |
| `abundances.yaml` | 宇宙での元素の存在量 | K. Lodders, M. Bergemann, H. Palme, *Space Sci. Rev.* **221**, 23 (2025)、表は [doi:10.5281/zenodo.14988840](https://doi.org/10.5281/zenodo.14988840)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)） |
| `riken-discoveries.yaml` | 理研で発見された原子核 | FRIB Nuclear Data Group, Discovery of Nuclides Project, Isotope Database, [doi:10.11578/frib/2279152](https://doi.org/10.11578/frib/2279152)（2026-09-25 版） |
| `fission-yields.yaml` | ²³⁵U の核分裂収率 | JEFF-3.1.1（OECD/NEA）、[IAEA LiveChart of Nuclides](https://www-nds.iaea.org/relnsd/vcharthtml/VChartHTML.html) から取得 |
| `fuel-cycle.yaml` | 核燃料サイクルの分類と説明 | このアプリのために作成 |
| `driplines.yaml` | 通常核のドリップライン | J. Erler et al., *Nature* **486**, 509 (2012) の質量表（[MassExplorer](https://massexplorer.frib.msu.edu/)）から計算 |
| `hypernuclei.yaml` | ハイパー核 | [Mainz Chart of Hypernuclides](https://hypernuclei.kph.uni-mainz.de/)（2026-08-04 のデータ）。Ξ は E. Friedman & A. Gal, *EPJ Web Conf.* **271**, 03002 (2022)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)） |
| `hyper-driplines.yaml` | ハイパー核のドリップライン | C. Samanta et al., *J. Phys. G* **35**, 065101 (2008)；P. Roy Chowdhury et al., *Rom. Rep. Phys.* **62**, 65 (2010)；E.F. Meoto, *J. Phys. Commun.* **6**, 125004 (2022)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)） |
| （`scripts/ktuy.py` がビルド時に取得） | 未発見の原子核の質量、安定の島（殻エネルギー） | H. Koura et al., *Prog. Theor. Phys.* **113**, 305 (2005)（KTUY05、JAEA 核データセンターの質量表） |
| （このプロジェクト） | このプロジェクトの引用方法 | 理化学研究所『RIKENさわれる周期表』(2026) |

出典の値は、必要なものを抜き出して YAML に書き換えています。

## English

The same table in English, shown by the app in English mode (same rows, in the same order, as the table above).

| File | Contents | Source |
|---|---|---|
| [`nuclides/`](nuclides/) (one file per element) | Masses, half-lives, decays and years of discovery of the nuclides | F.G. Kondev et al., *Chin. Phys. C* **45**, 030001 (2021) (NUBASE2020, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)); data from [IAEA AMDC](https://www-nds.iaea.org/amdc/) |
| `elements.yaml` | Element names, introductions of the elements, notable isotopes, years of discovery of the elements | Years of discovery from Wikipedia "[Timeline of chemical element discoveries](https://en.wikipedia.org/wiki/Timeline_of_chemical_element_discoveries)"; the rest written for this app |
| `abundances.yaml` | Abundances of the elements in the universe | K. Lodders, M. Bergemann, H. Palme, *Space Sci. Rev.* **221**, 23 (2025); tables at [doi:10.5281/zenodo.14988840](https://doi.org/10.5281/zenodo.14988840) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) |
| `riken-discoveries.yaml` | Nuclei discovered at RIKEN | FRIB Nuclear Data Group, Discovery of Nuclides Project, Isotope Database, [doi:10.11578/frib/2279152](https://doi.org/10.11578/frib/2279152) (version of 2026-09-25) |
| `fission-yields.yaml` | Fission yields of ²³⁵U | JEFF-3.1.1 (OECD/NEA), taken from the [IAEA LiveChart of Nuclides](https://www-nds.iaea.org/relnsd/vcharthtml/VChartHTML.html) |
| `fuel-cycle.yaml` | Groups of the nuclear fuel cycle and their descriptions | Written for this app |
| `driplines.yaml` | Drip lines of ordinary nuclei | Worked out from the mass table of J. Erler et al., *Nature* **486**, 509 (2012) ([MassExplorer](https://massexplorer.frib.msu.edu/)) |
| `hypernuclei.yaml` | Hypernuclei | [Mainz Chart of Hypernuclides](https://hypernuclei.kph.uni-mainz.de/) (data of 2026-08-04); Ξ from E. Friedman & A. Gal, *EPJ Web Conf.* **271**, 03002 (2022) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) |
| `hyper-driplines.yaml` | Drip lines of hypernuclei | C. Samanta et al., *J. Phys. G* **35**, 065101 (2008); P. Roy Chowdhury et al., *Rom. Rep. Phys.* **62**, 65 (2010); E.F. Meoto, *J. Phys. Commun.* **6**, 125004 (2022) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) |
| (fetched by `scripts/ktuy.py` at build time) | Masses of undiscovered nuclei, the island of stability (shell energies) | H. Koura et al., *Prog. Theor. Phys.* **113**, 305 (2005) (KTUY05, mass table of the JAEA Nuclear Data Center) |
| (this project) | How to cite this project | RIKEN, *RIKEN Touchable Periodic Table* (2026) |
