// 규칙 엔진 테스트 — 의존성 없음.   node tools/test-rules.js
const Y = require("../yut-rules.js");
const D = require("../data/pokemon.js");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("✅ " + name); }
  catch (e) { fail++; console.log("❌ " + name + "\n     " + e.message); }
}
function eq(actual, expected, msg) {
  const A = JSON.stringify(actual), B = JSON.stringify(expected);
  if (A !== B) throw new Error((msg ? msg + ": " : "") + "기대 " + B + " / 실제 " + A);
}
function ok(cond, msg) { if (!cond) throw new Error(msg || "조건 불만족"); }

// 팀 0: 리자몽(4→5→6)·피카츄(172→25)·이상해씨(1)·꼬부기(7)   팀 1: 리자몽·라이츄·이상해꽃·거북왕
function game(n, backdo) {
  return Y.newGame({
    pieces: n || 2, backdo: backdo !== false, seed: 7,
    teams: [{ name: "A", picks: [6, 25, 1, 7] }, { name: "B", picks: [6, 26, 3, 9] }],
  }, D.evoFrom);
}
// 말 i를 node 에 세운다 (via = 그 칸에 온 길)
function put(s, i, node, via) {
  const st = Y.settle(via || "OUT", node);
  Object.assign(s.pieces[i], { state: "board", route: st.route, step: st.step, atGoal: false });
  return s;
}
function choose(s, results, team) {
  s.phase = "choose"; s.pending = results.slice(); s.throwsLeft = 0; s.turn = team || 0;
  return s;
}
const move = (s, id) => Y.applyMove(s, id).state;
const node = (s, i) => Y.posOf(s.pieces[i]);
const ids = s => Y.legalMoves(s).map(m => m.id).sort();

// ---------- 13-1 표 ----------
t("1. 새 말 + 모 → 모(5)에 멈춰 대각선 길, 다음 도 → 20", () => {
  let s = move(choose(game(), [5]), "new/5");
  eq(node(s, 0), 5); eq(s.pieces[0].route, "A");
  s = move(choose(s, [1]), "n5/1");
  eq(node(s, 0), 20);
});
t("2. 새 말 + 윷 → 4, 다음 개 → 모를 지나 6 (바깥길 그대로)", () => {
  let s = move(choose(game(), [4]), "new/4");
  eq(node(s, 0), 4);
  s = move(choose(s, [2]), "n4/2");
  eq(node(s, 0), 6); eq(s.pieces[0].route, "OUT");
});
t("3. 뒷모(10)에 멈춤 → 걸 → 25·26 지나 방(22), 다음 도 → 27", () => {
  let s = put(game(), 0, 10);
  s = move(choose(s, [3]), "n10/3");
  eq(node(s, 0), 22);
  s = move(choose(s, [1]), "n22/1");
  eq(node(s, 0), 27);
});
t("4. 모 대각선에서 방(22)에 딱 멈춤 → 참먹이 쪽, 다음 도 → 27", () => {
  let s = put(game(), 0, 21);
  s = move(choose(s, [1]), "n21/1");
  eq(node(s, 0), 22); eq(s.pieces[0].route, "C");
  s = move(choose(s, [1]), "n22/1");
  eq(node(s, 0), 27);
});
t("5. 모 대각선에서 방을 지나감 → 23으로 직진", () => {
  let s = put(game(), 0, 21);
  s = move(choose(s, [2]), "n21/2");
  eq(node(s, 0), 23);
});
t("6. 1번 칸에서 빽도 → 참먹이 위, 다음 도 → 완주", () => {
  let s = put(game(), 0, 1);
  s = move(choose(s, [-1]), "n1/-1");
  eq(s.pieces[0].atGoal, true); eq(node(s, 0), 0); eq(s.pieces[0].state, "board");
  s = move(choose(s, [1]), "n0/1");
  eq(s.pieces[0].state, "done");
});
t("7. 판에 말 없음 + 빽도 → 쓸 수 없어 버리고 차례 넘김", () => {
  const r = Y.applyThrow(game(), -1);
  ok(r.events.some(e => e.type === "skip"), "skip 이벤트 없음");
  eq(r.state.turn, 1); eq(r.state.phase, "throw"); eq(r.state.pending, []);
});
t("8. 상대 업힌 말(2개) 잡기 → 둘 다 대기로, 한 번 더 던지기", () => {
  let s = game();
  put(s, 2, 3); put(s, 3, 3); // 팀 B 두 말 (piece 2·3)
  s = move(choose(s, [3]), "new/3");
  eq(s.pieces[2].state, "wait"); eq(s.pieces[3].state, "wait");
  eq(s.turn, 0, "잡은 팀이 계속"); eq(s.phase, "throw"); eq(s.throwsLeft, 1);
});
t("9. 내 말 위에 멈춤 → 업기 (같은 칸·같은 길). 방에서 B길 말 + C길 말 업기", () => {
  let s = put(game(), 0, 3);
  s = move(choose(s, [3]), "new/3");
  eq(node(s, 1), 3); eq(s.pieces[1].route, s.pieces[0].route); eq(s.pieces[1].step, s.pieces[0].step);
  eq(Y.unitsOf(s, 0).length, 1, "한 덩어리");
  // 방: piece 0 은 B로 와서 22(B,13), piece 1 은 21에서 도로 22 도착(C,8)
  s = game();
  Object.assign(s.pieces[0], { state: "board", route: "B", step: 13, atGoal: false });
  put(s, 1, 21);
  s = move(choose(s, [1]), "n21/1");
  eq([node(s, 0), node(s, 1)], [22, 22]);
  eq(s.pieces[0].route, s.pieces[1].route); eq(s.pieces[0].step, s.pieces[1].step);
  s = move(choose(s, [1]), "n22/1");
  eq([node(s, 0), node(s, 1)], [27, 27], "업힌 채로 같이 이동");
});
t("10. 윷·모·걸이 쌓이면 아무 순서로 쓸 수 있음", () => {
  let s = choose(game(4), [4, 5, 3]);
  eq(ids(s), ["new/3", "new/4", "new/5"]);
  s = move(s, "new/3");           // 걸 먼저 → 3
  eq(s.phase, "choose"); eq(s.pending, [4, 5]);
  s = move(s, "n3/5");            // 3 + 모 → 8
  eq(node(s, 0), 8);
  s = move(s, "n8/4");            // 8 + 윷 → 12
  eq(node(s, 0), 12); eq(s.turn, 1);
});
t("11. 도착 칸을 넘어서는 이동 → 완주", () => {
  let s = put(game(), 0, 19);
  s = move(choose(s, [3]), "n19/3");
  eq(s.pieces[0].state, "done");
});
t("12. 찌모(15)에서 빽도 — 바깥으로 온 말 14, 대각선으로 온 말 24", () => {
  let s = put(game(), 0, 15, "OUT");
  s = move(choose(s, [-1]), "n15/-1");
  eq(node(s, 0), 14);
  s = put(game(), 0, 15, "A");
  s = move(choose(s, [-1]), "n15/-1");
  eq(node(s, 0), 24);
});
t("13. 던지기 10만 번 — 결과 확률이 표와 ±0.5%p 안", () => {
  const P = Y.resultProbs(true);
  const table = { "-1": 0.0384, 1: 0.1152, 2: 0.3456, 3: 0.3456, 4: 0.1296, 5: 0.0256 };
  Object.keys(table).forEach(k => ok(Math.abs(P[k] - table[k]) < 1e-4, "확률 계산 " + k + ": " + P[k]));
  const N = 100000, cnt = {};
  let st = 12345;
  for (let i = 0; i < N; i++) { const r = Y.throwSticks(st, true); st = r.rng; cnt[r.result] = (cnt[r.result] || 0) + 1; }
  Object.keys(table).forEach(k => {
    const f = (cnt[k] || 0) / N;
    ok(Math.abs(f - table[k]) < 0.005, Y.RESULTS[k].name + " " + (f * 100).toFixed(2) + "% (기대 " + (table[k] * 100).toFixed(2) + "%)");
  });
  // 빽도를 끄면 빽도가 안 나옴
  st = 1;
  for (let i = 0; i < 20000; i++) { const r = Y.throwSticks(st, false); st = r.rng; ok(r.result !== -1, "빽도 꺼짐인데 빽도"); }
});
t("14. 진화 [4,5,6]: 1/3 지나면 5, 2/3 지나면 6, 빽도로 퇴화 안 함, 잡히면 4", () => {
  let s = game();
  eq(s.teams[0].paths[0], [4, 5, 6]); eq(s.teams[0].paths[1], [172, 25]); eq(Y.evoPath(1, D.evoFrom), [1]);
  s = move(choose(s, [4]), "new/4");       // 4/20
  eq(Y.formOf(s, 0), 4);
  s = move(choose(s, [4]), "n4/4");        // 8/20 = 0.4 → 2단계
  eq(Y.formOf(s, 0), 5);
  s = move(choose(s, [5]), "n8/5");        // 13/20 = 0.65
  eq(Y.formOf(s, 0), 5);
  s = move(choose(s, [1]), "n13/1");       // 14/20 = 0.7 → 3단계
  eq(Y.formOf(s, 0), 6);
  s = move(choose(s, [-1]), "n14/-1");     // 빽도 → 13, 그대로 리자몽
  eq(Y.formOf(s, 0), 6);
  put(s, 2, 12);                           // 상대 말 12 → 도로 13 잡기
  s = move(choose(s, [1], 1), "n12/1");
  eq(s.pieces[0].state, "wait"); eq(Y.formOf(s, 0), 4, "잡히면 1단계로");
});
t("15. 한 팀이 전부 완주 → 판 끝, 이긴 팀 기록", () => {
  let s = put(put(game(), 0, 19), 1, 18);
  s = move(choose(s, [1, 2]), "n19/1");
  eq(s.phase, "choose");
  const r = Y.applyMove(s, "n18/2");
  eq(r.state.phase, "over"); eq(r.state.winner, 0);
  ok(r.events.some(e => e.type === "win"), "win 이벤트");
});

// ---------- 빽도로 물러난 뒤의 길 (스펙 초안의 SWITCH 표에 있던 버그) ----------
t("16. 모에서 빽도 → 4 → 개 → 6 (모를 지나가니 바깥길)", () => {
  let s = put(game(), 0, 5);
  s = move(choose(s, [-1]), "n5/-1");
  eq(node(s, 0), 4);
  s = move(choose(s, [2]), "n4/2");
  eq(node(s, 0), 6);
});
t("17. 뒷모에서 빽도 → 9 → 개 → 11 (바깥길)", () => {
  let s = put(game(), 0, 10);
  s = move(choose(s, [-1]), "n10/-1");
  eq(node(s, 0), 9);
  s = move(choose(s, [2]), "n9/2");
  eq(node(s, 0), 11);
});
t("18. 방(참먹이 쪽)에서 빽도 → 21 → 개 → 23 (방을 지나가니 직진)", () => {
  let s = put(game(), 0, 22, "A");
  eq(s.pieces[0].route, "C");
  s = move(choose(s, [-1]), "n22/-1");
  eq(node(s, 0), 21);
  s = move(choose(s, [2]), "n21/2");
  eq(node(s, 0), 23);
});
t("19. 23에서 빽도 → 방에 멈춤 → 다음 도는 참먹이 쪽(27)", () => {
  let s = put(game(), 0, 23);
  s = move(choose(s, [-1]), "n23/-1");
  eq(node(s, 0), 22);
  s = move(choose(s, [1]), "n22/1");
  eq(node(s, 0), 27);
});
t("20. 빽도로는 새 말을 못 내고, 참먹이 위의 말도 안 움직임", () => {
  let s = choose(game(), [-1]);
  eq(ids(s), []);
  s = game();
  Object.assign(s.pieces[0], { state: "board", route: "OUT", step: 0, atGoal: true });
  eq(ids(choose(s, [-1])), []);
});
t("21. 빽도로 참먹이에 가면 거기 서 있던 상대 말을 잡음", () => {
  let s = game();
  Object.assign(s.pieces[2], { state: "board", route: "OUT", step: 0, atGoal: true });
  put(s, 0, 1);
  s = move(choose(s, [-1]), "n1/-1");
  eq(s.pieces[2].state, "wait"); eq(s.phase, "throw");
});

// ---------- v2: ❓ 풀숲 칸 ----------
const withSpots = (spots, n) => Y.newGame({
  pieces: n || 2, backdo: true, seed: 7, spots,
  teams: [{ name: "A", picks: [6, 25, 1, 7] }, { name: "B", picks: [9, 26, 3, 133] }],
}, D.evoFrom);
const evTypes = r => r.events.map(e => e.type);
t("23. ❓ 칸에 딱 멈추면 야생 포켓몬(wild), 그 칸은 쓴 것으로", () => {
  let s = choose(withSpots([{ node: 3, id: 133 }, { node: 12, id: 58 }]), [3]);
  const r = Y.applyMove(s, "new/3");
  const w = r.events.find(e => e.type === "wild");
  ok(w, "wild 이벤트 없음");
  eq([w.node, w.id, w.team], [3, 133, 0]);
  eq(r.state.spots[0].used, true); eq(r.state.spots[1].used, false);
});
t("24. ❓ 칸을 지나가기만 하면 안 나옴", () => {
  const r = Y.applyMove(choose(withSpots([{ node: 3, id: 133 }]), [4]), "new/4");
  ok(!evTypes(r).includes("wild"), "지나갔는데 wild");
  eq(r.state.spots[0].used, false);
});
t("25. 한 칸에 한 번 — 다시 멈춰도 안 나옴", () => {
  let s = Y.applyMove(choose(withSpots([{ node: 3, id: 133 }]), [3]), "new/3").state;
  s.pieces[0].state = "wait"; // 말을 치우고 다른 말로 다시 3번 칸에
  const r = Y.applyMove(choose(s, [3]), "new/3");
  ok(!evTypes(r).includes("wild"), "두 번 나옴");
});
t("26. 골인하는 이동은 ❓ 칸을 지나도 안 나옴", () => {
  let s = put(withSpots([{ node: 19, id: 133 }]), 0, 17);
  const r = Y.applyMove(choose(s, [3]), "n17/3"); // 18 → 19 → 참먹이(골인)
  ok(r.events.some(e => e.type === "finish"), "골인 안 함");
  ok(!evTypes(r).includes("wild"), "골인인데 wild");
});
t("27. 배틀·진화와 겹치면 move → capture → evolve → wild 순서", () => {
  let s = withSpots([{ node: 8, id: 133 }]);
  put(s, 0, 4);                  // 리자몽 라인 말(파이리)이 4번 칸
  put(s, 2, 8);                  // 상대 말이 8번 칸 (❓ 칸)
  const r = Y.applyMove(choose(s, [4]), "n4/4"); // 8번 칸: 상대 잡기 + 8/20=0.4 → 리자드로 진화 + 풀숲
  const order = evTypes(r).filter(x => ["move", "capture", "evolve", "wild"].includes(x));
  eq(order, ["move", "capture", "evolve", "wild"]);
});
t("28. 옛 저장(❓ 칸 없음)도 이어하기 되고, 발동 안 함", () => {
  let s = game();
  delete s.spots;
  ok(Y.validate(s), "옛 저장 validate 실패");
  const r = Y.applyMove(choose(s, [3]), "new/3");
  ok(!evTypes(r).includes("wild"));
  s = withSpots([{ node: 3, id: 9999 }]);
  ok(!Y.validate(s), "이상한 포켓몬 번호를 통과시킴");
});
t("29. 보물상자 10만 번 — 50·30·10·5·5 (±0.5%p), 잡을 확률 60·65·70·75·100%", () => {
  const R = Y.Rewards;
  eq(R.BALLS.map(b => Math.round(R.catchRate(b) * 100)), [60, 65, 70, 75, 100]);
  const rnd = Y.rng(4242), cnt = {}, N = 100000;
  R.rollBox(N, rnd).forEach(b => { cnt[b] = (cnt[b] || 0) + 1; });
  const want = { poke: 0.5, great: 0.3, ultra: 0.1, luxury: 0.05, master: 0.05 };
  Object.keys(want).forEach(b => ok(Math.abs(cnt[b] / N - want[b]) < 0.005, R.BALL_INFO[b].name + " " + (cnt[b] / N * 100).toFixed(2) + "%"));
  eq(R.rollBox(3, rnd).length, 3);
});
t("30. 던지기 — 성공률이 잡을 확률과 같고, 흔들기는 성공 3번 · 실패 1~3번", () => {
  const R = Y.Rewards, rnd = Y.rng(77), N = 60000;
  ["poke", "ultra", "master"].forEach(b => {
    let okN = 0;
    for (let i = 0; i < N; i++) {
      const r = R.throwBall(b, rnd);
      if (r.ok) { okN++; ok(r.shakes === 3, "성공인데 흔들기 " + r.shakes); }
      else ok(r.shakes >= 1 && r.shakes <= 3, "실패 흔들기 " + r.shakes);
    }
    ok(Math.abs(okN / N - R.catchRate(b)) < 0.01, R.BALL_INFO[b].name + " 성공 " + (okN / N * 100).toFixed(1) + "%");
  });
});
t("31. 야생 포켓몬 — 희귀도 60·25·12·3 (±1%p), 아직 없는 포켓몬 먼저", () => {
  const pools = { c: [], r: [], u: [], l: [] };
  for (let id = 1; id <= 1025; id++) pools[D.rarity[id] || "c"].push(id);
  const R = Y.Rewards, rnd = Y.rng(9), N = 50000, cnt = { c: 0, r: 0, u: 0, l: 0 };
  for (let i = 0; i < N; i++) cnt[D.rarity[R.rollWild(pools, [], rnd)] || "c"]++;
  Object.keys(R.WILD_ODDS).forEach(k => ok(Math.abs(cnt[k] / N - R.WILD_ODDS[k] / 100) < 0.01, k + " " + (cnt[k] / N * 100).toFixed(1) + "%"));
  // 절반을 가지고 있으면: 절반 확률로 없는 것만 + 나머지 절반은 섞여서 → 없는 것 약 75%
  const owned = new Set();
  for (let id = 1; id <= 1025; id += 2) owned.add(id);
  let fresh = 0;
  for (let i = 0; i < N; i++) if (!owned.has(R.rollWild(pools, owned, rnd))) fresh++;
  ok(Math.abs(fresh / N - 0.75) < 0.02, "없는 포켓몬 " + (fresh / N * 100).toFixed(1) + "%");
});
t("32. ❓ 칸 고르기 — 2칸, 후보 칸 안에서, 서로 붙지 않게", () => {
  const rnd = Y.rng(3);
  for (let i = 0; i < 2000; i++) {
    const ns = Y.pickSpotNodes(rnd, 2);
    eq(ns.length, 2);
    ok(ns.every(n => Y.SPOT_NODES.includes(n)), "후보 밖 " + ns);
    ok(Math.abs(ns[0] - ns[1]) !== 1, "붙은 칸 " + ns); // 후보 칸은 모두 바깥 길이라 번호 차이 1 = 바로 옆 칸
  }
});

// ---------- 무작위 대국 (불변 조건 확인) ----------
t("22. 무작위 3,000판 끝까지 — 멈춤·규칙 위반 없음", () => {
  let rs = 99;
  const rnd = () => { const r = Y.rand(rs); rs = r[1]; return r[0]; };
  let longest = 0;
  for (let g = 0; g < 3000; g++) {
    const spotRnd = Y.rng(g + 100);
    let s = Y.newGame({
      pieces: 2 + (g % 3), backdo: g % 4 !== 0, seed: g + 1, first: g % 2,
      spots: g % 2 ? Y.pickSpotNodes(spotRnd, 2).map(node => ({ node, id: 1 + Math.floor(spotRnd() * 1025) })) : undefined,
      teams: [{ name: "A", picks: [6, 25, 1, 7] }, { name: "B", picks: [9, 26, 3, 133] }],
    }, D.evoFrom);
    let steps = 0;
    while (s.phase !== "over") {
      if (++steps > 2000) throw new Error("끝나지 않는 판 (seed " + (g + 1) + ")");
      if (s.phase === "throw") s = Y.applyThrow(s).state;
      else {
        const ms = Y.legalMoves(s);
        ok(ms.length > 0, "choose 인데 둘 수가 없음");
        const m = g % 2 ? Y.cpuChoose(s, "normal", rnd) : ms[Math.floor(rnd() * ms.length)];
        s = Y.applyMove(s, m.id).state;
      }
      ok(Y.validate(s), "validate 실패");
      // 한 칸에 두 팀이 함께 있으면 안 됨, 같은 팀은 같은 길·같은 걸음
      const at = {};
      s.pieces.forEach(p => {
        if (p.state !== "board") return;
        const n = Y.posOf(p);
        if (at[n]) {
          ok(at[n].team === p.team, "칸 " + n + "에 두 팀");
          ok(at[n].route === p.route && at[n].step === p.step && at[n].atGoal === p.atGoal, "업힌 말의 길이 다름");
        } else at[n] = p;
        ok(p.stage < s.teams[p.team].paths[p.slot].length, "진화 단계 범위");
      });
    }
    ok(Y.teamDone(s, s.winner), "이긴 팀 말이 다 안 들어옴");
    longest = Math.max(longest, steps);
  }
  console.log("     (가장 긴 판: 동작 " + longest + "번)");
});

console.log("\n" + pass + "개 통과, " + fail + "개 실패");
process.exit(fail ? 1 : 0);
