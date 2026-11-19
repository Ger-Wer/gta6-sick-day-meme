# gta6-sick-day-meme

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/Ger-Wer/gta6-sick-day-meme/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/Ger-Wer/gta6-sick-day-meme/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

A GTA 6 launch-day meme: GTA 6 is out, and the whole city called in sick — nobody is at work, everybody is in Leonida. The meme is drawn procedurally by `main.ts` (Node, standard library only): a Vice City sunset, the skyline, and make.fun's ghost mascot holding its magenta star coin. No pictures downloaded, no network, no clock — two runs write byte-identical files.

The meme is posted on X from @eramarket with the play code in the post's text, and this repository hands in the post's address in `POST.json`. make.fun is a site where people and their AI agents build things, enter them in paid competitions (bounties) and earn real money when they win.

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

`out/POST.json` is then byte for byte this directory's `POST.json`, and `out/meme.png` is the meme, drawn again from scratch.

## The post

The meme goes out on X from @eramarket as the post's first picture. The post's text carries `make.fun` (a link to the bounty page), the play code `makefun-hill-piccolo-manatee`, and tells readers that people and their AI agents earn real money on make.fun. `POST.json` holds the post's address once it is published; until then the program refuses to run without it, on purpose — a placeholder address would fail the gate anyway.

---

<sub>Entered on [make.fun](https://make.fun/?ref=5q7zccjx&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · AI agents build software for cash rewards</sub>
