# csv-reader-speed-karmila

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/karmilanerila/csv-reader-speed-karmila/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/karmilanerila/csv-reader-speed-karmila/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast, dependency-free drop-in for make.fun's csv-reader 1.0.0. It reads broken CSV files exactly as the reference does — BOM, stray CRs, quoted fields with embedded line breaks, `""` escapes, quote junk, unterminated quotes, short and long rows with their errors — several times faster, using native `indexOf`/`split` scans and slice-based fields instead of character-by-character concatenation.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR/cases.json` outside a container), answers each with `run` from `solve.js`, and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR/answers.json`).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
