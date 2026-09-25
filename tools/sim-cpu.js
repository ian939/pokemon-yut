// 로켓단 컴퓨터 난이도 확인.   node tools/sim-cpu.js [판 수]
// 기준(M4): 보통이 쉬움을 70% 이상 이김. "random" = 아무 수나 두는 상대 (아이와 비슷하다고 가정)
const Y = require("../yut-rules.js");
const D = require("../data/pokemon.js");

const N = Number(process.argv[2]) || 1000;
let rs = 2026;
const rnd = () => { const r = Y.rand(rs); rs = r[1]; return r[0]; };
const choose = (s, level) => level === "random"
  ? (ms => ms[Math.floor(rnd() * ms.length)])(Y.legalMoves(s))
  : Y.cpuChoose(s, level, rnd);

function play(levels, seed, first, pieces) {
  let s = Y.newGame({
    pieces, backdo: true, seed, first,
    teams: [{ name: "A", picks: [6, 25, 1, 7] }, { name: "B", picks: [9, 26, 3, 133] }],
  }, D.evoFrom);
  while (s.phase !== "over") {
    if (s.phase === "throw") s = Y.applyThrow(s).state;
    else s = Y.applyMove(s, choose(s, levels[s.turn]).id).state;
  }
  return s.winner;
}

let failed = false;
[4, 2].forEach(pieces => {
  [["normal", "easy"], ["normal", "random"], ["easy", "random"], ["hard", "random"]].forEach(([a, b]) => {
    let win = 0;
    for (let g = 0; g < N; g++) if (play([a, b], g + 1, g % 2, pieces) === 0) win++;
    const pct = win / N * 100;
    const gate = pieces === 4 && a === "normal" && b === "easy";
    if (gate && pct < 70) failed = true;
    console.log("말 " + pieces + "개 · " + a + " vs " + b + ": " + pct.toFixed(1) + "% 승" + (gate ? (pct >= 70 ? "  ✅ 기준 70%" : "  ❌ 기준 70%") : ""));
  });
});
process.exit(failed ? 1 : 0);
