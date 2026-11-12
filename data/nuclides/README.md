# 核種

NUBASE2020 の基底状態と核異性体です。ファイル名は Z（3 桁）と元素記号、各項目の見出しは質量数と元素記号です（アプリのリンク `#238U` と同じ書き方）。Z と N は見出しから決まるので書きません。

```yaml
238U:
  ME: 47307.7
  dME: 1.5
  T: 4.463 Gy
  dT: '0.003'
  Jpi: 0+
  Year: 1896
  IS: 99.2742
  BR: [A=100, SF=5.44e-5 7, 2B-=2.2e-10 3]
  Iso:
    - Lbl: m
      Ex: 2557.9
      T: 280 ns
      Jpi: 0+
      BR: [IT=97.4 4, SF=2.6 4]
```

| 項目 | 内容 |
|---|---|
| `ME` | 原子の質量超過 Δ（keV） |
| `dME` | `ME` の不確かさ（keV） |
| `ME_est` | `true`: NUBASE で # が付いた値（系統性からの推定値） |
| `T` | 半減期。NUBASE の値と単位（`1.248 Gy`、`<10 ns`）か、`stable`、`particle-unbound`。単位は ys zs as fs ps ns μs ms s m h d y ky My Gy Ty Py Ey Zy Yy |
| `dT` | `T` の不確かさ（NUBASE の書き方のまま） |
| `T_est` | `true`: `T` が推定値 |
| `Jpi` | スピンとパリティ（NUBASE の書き方: ( ) は暫定、# は推定、* は強い根拠あり） |
| `Year` | その核種（元素ではなく）が初めて確認された年 |
| `IS` | 天然の同位体存在比（%） |
| `BR` | 崩壊モードと分岐比、1 モード 1 項目（NUBASE の書き方: `B-=89.28 13` は β⁻ 89.28(13) %。B- B+ EC A SF p 2p n 2n IT（核異性体転移）14C など、= ~ < > ? も NUBASE と同じ） |
| `Iso` | 核異性体（NUBASE に載っている励起状態）。それぞれ `Lbl`（NUBASE のラベル m、n、p など）、`Ex`（励起エネルギー、keV）、`Ex_est`、`T`、`Jpi`、`BR`（上と同じ） |

B/A、分離エネルギー、Q 値は、アプリが質量超過から計算します。`scripts/import_nubase.py` は NUBASE の元データからこのフォルダを作り直します（手で直した内容は消えます）。
