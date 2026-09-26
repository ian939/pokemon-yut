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
t("14. 진화 [4,5,6]: 5칸마다 (5칸 리자드 · 10칸 리자몽, 지름길이어도 칸 수대로), 빽도로 퇴화 안 함, 잡히면 처음 모습·0칸", () => {
  let s = game();
  eq(s.teams[0].paths[0], [4, 5, 6]); eq(s.teams[0].paths[1], [172, 25]); eq(Y.evoPath(1, D.evoFrom), [1]);
  s = move(choose(s, [4]), "new/4");       // 4칸
  eq(Y.formOf(s, 0), 4); eq(s.pieces[0].walk, 4);
  s = move(choose(s, [1]), "n4/1");        // 5칸 (모) → 2단계
  eq(Y.formOf(s, 0), 5);
  s = move(choose(s, [4]), "n5/4");        // 모 대각선 → 23, 9칸
  eq(node(s, 0), 23); eq(Y.formOf(s, 0), 5);
  s = move(choose(s, [1]), "n23/1");       // 10칸 → 3단계
  eq(Y.formOf(s, 0), 6);
  s = move(choose(s, [-1]), "n24/-1");     // 빽도 → 23, 그대로 리자몽
  eq(Y.formOf(s, 0), 6); eq(s.pieces[0].walk, 10, "뒤로 간 칸은 빼지 않음");
  put(s, 2, 21);                           // 상대 말 21 → 개로 23 잡기
  s = move(choose(s, [2], 1), "n21/2");
  eq(s.pieces[0].state, "wait"); eq(Y.formOf(s, 0), 4, "잡히면 처음 모습"); eq(s.pieces[0].walk, 0);
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
  put(s, 0, 4); s.pieces[0].walk = 1; // 리자몽 라인 말(파이리)이 4번 칸, 1칸 와 있음
  put(s, 2, 8);                  // 상대 말이 8번 칸 (❓ 칸)
  const r = Y.applyMove(choose(s, [4]), "n4/4"); // 8번 칸: 상대 잡기 + 5칸 → 리자드로 진화 + 풀숲
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
t("31. 야생 포켓몬 — 희귀도 50·30·10·10 (±1%p), 아직 없는 포켓몬 먼저", () => {
  eq(Y.Rewards.WILD_ODDS, { c: 50, r: 30, u: 10, l: 10 });
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

t("33. 진화 경로를 넘기면 그대로 — 스타팅 파이리가 리자몽까지 (사람 팀은 마지막 모습까지)", () => {
  const s = Y.newGame({ pieces: 2, seed: 1, teams: [
    { name: "A", picks: [4, 1], paths: [[4, 5, 6], [1, 2, 3]] },
    { name: "B", picks: [24, 109] },   // 넘기지 않으면 고른 모습까지 (로켓단)
  ] }, D.evoFrom);
  eq(s.teams[0].paths, [[4, 5, 6], [1, 2, 3]]);
  eq(s.teams[1].paths, [[23, 24], [109]]);
  ok(Y.validate(s));
});

// ---------- v3: ✨ 기술 · 🔄 말 바꾸기 ----------
const clone = o => JSON.parse(JSON.stringify(o));
// 기술이 있는 판: 팀 A(0) 는 기본으로 처음부터(early) 니트로차지, 팀 B(1) 는 철벽 후보·처음부터 아님
function sk(o) {
  o = o || {};
  return Y.newGame({
    pieces: o.n || 2, backdo: o.backdo !== false, seed: 5, skills: o.skills !== false,
    teams: [
      { name: "A", picks: [6, 25, 1, 7], pools: o.p0 || [["nitro"], ["nitro"], ["nitro"], ["nitro"]], now: o.e0 || [true, true, true, true] },
      { name: "B", picks: [9, 26, 3, 133], pools: o.p1 || [["iron"], ["iron"], ["iron"], ["iron"]], now: o.e1 || [false, false, false, false] },
    ],
  }, D.evoFrom);
}
// turnNo 를 정해 놓고 team 의 말 고르기 / 던지기 전 (효과가 몇 번째 차례까지 가는지 볼 때)
const at = (st, no, team, rs) => { const c = clone(st); c.turnNo = no; return choose(c, rs || [2], team); };
const atThrow = (st, no, team) => { const c = clone(st); c.turn = team; c.turnNo = no; c.phase = "throw"; c.throwsLeft = 1; c.pending = []; return c; };

t("34. 마지막 모습이 되면 기술을 배운다 · 시험용(now)은 처음부터 · 기술을 끄면 안 배움", () => {
  let s = sk();
  eq([s.pieces[0].skill, s.pieces[1].skill, s.pieces[2].skill], ["nitro", "nitro", null]);
  s = sk({ p1: [["surf", "rain"], ["surf"]] });
  put(s, 2, 8); s.pieces[2].walk = 8;
  const r = Y.applyMove(choose(s, [2], 1), "n8/2");   // 10칸 → 거북왕
  eq(evTypes(r).filter(x => x === "evolve" || x === "learn"), ["evolve", "learn"]);
  eq(Y.formOf(r.state, 2), 9); ok(["surf", "rain"].includes(r.state.pieces[2].skill));
  const s1 = Y.newGame({ pieces: 1, seed: 3, teams: [{ name: "A", picks: [128], pools: [["wish"]] }, { name: "B", picks: [4], paths: [[4, 5, 6]], pools: [["nitro"]] }] }, D.evoFrom);
  eq([s1.pieces[0].skill, s1.pieces[1].skill], [null, null], "진화하지 않는 켄타로스도 처음부터는 아님 (v4: 15칸)");
  eq(sk({ skills: false }).pieces[0].skill, null, "기술 끄기");
});
t("35. 기술은 판 위의 말만 · 말마다 한 판에 한 번 · 한 차례에 하나", () => {
  const s = sk();
  eq(Y.legalSkills(s), [], "집에 있으면 못 씀");
  put(s, 0, 3); put(s, 1, 7);
  eq(Y.legalSkills(s).map(x => x.piece), [0, 1]);
  const r = Y.applySkill(s, 0, null);
  eq(node(r.state, 0), 5, "니트로차지 = 바로 2칸");
  eq(Y.legalSkills(r.state), [], "한 차례에 하나");
  eq(r.state.pieces[0].used, true);
  eq(Y.legalSkills(atThrow(r.state, 3, 0)).map(x => x.piece), [1], "다음 차례: 쓴 말은 못 쓰고 다른 말은 씀");
});
t("36. 잡히면 처음 모습 · 안 쓴 기술은 남고, 다시 마지막 모습이 돼야 쓴다", () => {
  let s = sk({ e0: [false, false], p0: [["nitro"], ["nitro"]] });
  put(s, 0, 9); s.pieces[0].walk = 9;
  s = move(choose(s, [1]), "n9/1");        // 10칸 → 리자몽 + 배움
  eq(Y.formOf(s, 0), 6); eq(s.pieces[0].skill, "nitro");
  put(s, 2, 8);
  s = move(choose(s, [2], 1), "n8/2");     // 상대가 잡음
  eq([s.pieces[0].state, Y.formOf(s, 0), s.pieces[0].skill, s.pieces[0].used, s.pieces[0].walk], ["wait", 4, "nitro", false, 0]);
  put(s, 0, 3);
  eq(Y.legalSkills(atThrow(s, 9, 0)), [], "처음 모습이면 못 씀");
});
t("37. 말 바꾸기 — 그 자리·업힌 채로, 간 칸 수를 이어받아 곧바로 진화, 기술은 새로 · 같은 가족은 막기", () => {
  const s = sk({ e0: [false, false] });
  put(s, 0, 12); put(s, 1, 12);
  Object.assign(s.pieces[0], { walk: 12, stage: 2, skill: "nitro", used: true });
  const r = Y.applySwap(s, 0, { id: 133, path: [133, 134], base: 0, pool: ["surf"], early: false });
  const s2 = r.state;
  eq(node(s2, 0), 12); eq(Y.unitsOf(s2, 0).length, 1, "업힌 채로");
  eq([Y.formOf(s2, 0), s2.pieces[0].skill, s2.pieces[0].used, s2.teams[0].picks[0]], [134, null, false, 133], "2단계 이브이: 12칸이면 아직 기술 없음 (15칸)");
  eq(evTypes(r), ["swap", "evolve"]);
  const s4 = clone(s); s4.pieces[0].walk = 15;
  const r4 = Y.applySwap(s4, 0, { id: 133, path: [133, 134], base: 0, pool: ["surf"], early: false });
  eq([Y.formOf(r4.state, 0), r4.state.pieces[0].skill], [134, "surf"], "15칸 간 자리에 들어오면 곧바로 진화 + 기술");
  eq(evTypes(r4), ["swap", "evolve", "learn"]);
  ok(!Y.swapOk(s, 1, 7), "상대 팀 꼬부기 가족인데 바꿈");
  ok(Y.swapOk(s, 0, 4), "자기 가족(파이리 말 → 리자몽)은 됨");
  const s3 = sk({ e0: [false, false] });
  const r3 = Y.applySwap(s3, 0, { id: 5, path: [4, 5, 6], base: 1, pool: ["nitro"], early: false });
  eq([Y.formOf(r3.state, 0), r3.state.pieces[0].skill], [5, null], "집에 있는 말: 잡은 모습 그대로");
  eq(Y.applySwap(s3, 1, { id: 150, path: [150], base: 0, pool: ["future"], early: true }).state.pieces[1].skill, null, "전설도 바로는 아님 (15칸)");
  let threw = false;
  try { Y.applySwap(s, 1, { id: 8, path: [7, 8, 9], base: 1, pool: [] }); } catch (e) { threw = true; }
  ok(threw, "같은 가족 바꾸기를 막지 않음");
});
t("38. 니트로차지로 잡기 → 배틀·한 번 더 · 용의춤 = 1칸 + 한 번 더", () => {
  let s = sk(); put(s, 0, 3); put(s, 2, 5);
  let r = Y.applySkill(s, 0, null);
  eq(r.state.pieces[2].state, "wait"); ok(evTypes(r).includes("capture")); eq(r.state.throwsLeft, 2, "던지기 1 + 잡기 1");
  s = sk({ p0: [["ddance"], ["ddance"]] }); put(s, 0, 3);
  r = Y.applySkill(s, 0, null);
  eq([node(r.state, 0), r.state.throwsLeft, r.state.pieces[0].walk], [4, 2, 1]);
});
t("39. 공중날기 — 앞쪽 가장 가까운 모서리·방, 참먹이면 골인, 날아가니까 거미줄 무시", () => {
  const fly = () => sk({ p0: [["fly"], ["fly"]] });
  let s = fly(); put(s, 0, 2);
  const r = Y.applySkill(s, 0, null); eq([node(r.state, 0), r.state.pieces[0].route], [5, "A"]);
  s = fly(); put(s, 0, 21);
  eq(node(Y.applySkill(s, 0, null).state, 0), 22);
  s = fly(); put(s, 0, 17);
  eq(Y.applySkill(s, 0, null).state.pieces[0].state, "done");
  s = fly(); put(s, 0, 6); s.traps = [{ node: 8, kind: "web", team: 1 }];
  eq(node(Y.applySkill(s, 0, null).state, 0), 10);
});
t("40. 유턴 — 결과를 뒤로 써서 잡기 (칸 수엔 안 셈), 1칸째보다 뒤로는 안 감", () => {
  let s = sk({ p0: [["uturn"], ["uturn"]] });
  put(s, 0, 7); put(s, 2, 4);
  s = choose(s, [3]);
  eq(Y.legalSkills(s)[0].targets, [3]);
  let r = Y.applySkill(s, 0, 3);
  eq([node(r.state, 0), r.state.pieces[2].state, r.state.pending, r.state.pieces[0].walk], [4, "wait", [], 0]);
  s = sk({ p0: [["uturn"], ["uturn"]] }); put(s, 0, 2);
  r = Y.applySkill(choose(s, [5]), 0, 5);
  eq([node(r.state, 0), r.state.pieces[0].atGoal], [1, false]);
});
t("41. 파도타기 2칸 · 지진 모두 1칸 (한꺼번에) — 민 팀 말 앞에서 멈춤, 1칸째보다 뒤로 안 감, 풀숲 안 걸림", () => {
  const w = () => sk({ p0: [["surf"], ["quake"]] });
  let s = w(); s.spots = [{ node: 6, id: 133, used: false }];
  put(s, 0, 12); put(s, 2, 8); put(s, 3, 2);
  let r = Y.applySkill(s, 0, 8);
  eq(node(r.state, 2), 6); eq(r.state.spots[0].used, false, "밀려서는 풀숲 안 걸림");
  s = w(); put(s, 0, 7); put(s, 2, 8);
  ok(!Y.legalSkills(s).some(x => x.piece === 0), "바로 뒤가 민 팀 말이면 못 밈");
  s = w(); put(s, 1, 14); put(s, 2, 8); put(s, 3, 9);
  r = Y.applySkill(s, 1, null);
  eq([node(r.state, 2), node(r.state, 3)], [7, 8], "붙어 있던 말도 한꺼번에");
  s = w(); put(s, 1, 14); put(s, 3, 1); put(s, 2, 9);
  eq(node(Y.applySkill(s, 1, null).state, 3), 1);
});
t("42. 전기자석파 — 상대의 다음 차례 한 번 못 움직임 · 수면가루 — 두 번", () => {
  const s = sk({ p0: [["twave"], ["sleep"]] });
  put(s, 0, 3); put(s, 1, 4); put(s, 2, 10); put(s, 3, 12);
  const s1 = Y.applySkill(s, 0, 10).state;
  ok(!Y.legalMoves(at(s1, 2, 1)).some(m => m.unit === "n10"), "B 의 다음 차례에 움직임");
  ok(Y.legalMoves(at(s1, 4, 1)).some(m => m.unit === "n10"), "그다음엔 움직여야 함");
  const s3 = Y.applySkill(atThrow(s1, 3, 0), 1, 12).state;
  ok(!Y.legalMoves(at(s3, 4, 1)).some(m => m.unit === "n12") && !Y.legalMoves(at(s3, 6, 1)).some(m => m.unit === "n12"), "두 번 자야 함");
  ok(Y.legalMoves(at(s3, 8, 1)).some(m => m.unit === "n12"), "세 번째엔 깸");
});
t("43. 오로라베일 — 상대 차례 두 번 동안 그 칸에 못 멈추고 기술도 안 맞음", () => {
  const s = sk({ p0: [["veil"], ["veil"]], p1: [["surf"], ["surf"]], e1: [true, true] });
  put(s, 0, 8); put(s, 2, 6); put(s, 3, 3);
  const s1 = Y.applySkill(s, 0, null).state;
  [2, 4].forEach(no => {
    ok(!Y.legalMoves(at(s1, no, 1)).some(m => m.to && m.to.node === 8), "차례 " + no + ": 장막 칸에 멈춤");
    ok(!Y.legalSkills(atThrow(s1, no, 1)).some(x => x.targets.indexOf(8) >= 0), "차례 " + no + ": 장막 말을 밈");
  });
  ok(Y.legalMoves(at(s1, 6, 1)).some(m => m.to && m.to.node === 8), "세 번째엔 풀림");
});
t("44. 맹독(다음 윷 빽도, 빽도 끈 판은 도) · 비바라기(우리 차례 세 번 도·빽도 → 개) · 비가 맹독을 이김", () => {
  let s = sk({ p0: [["toxic"], ["rain"]] }); put(s, 0, 3); put(s, 1, 4);
  let s1 = Y.applySkill(s, 0, null).state;
  eq(s1.teams[1].fx.poison, true);
  let r = Y.applyThrow(atThrow(s1, 2, 1), 3);
  eq([r.events[0].result, r.events[0].poisoned, r.state.teams[1].fx.poison], [-1, true, false]);
  s = sk({ p0: [["toxic"], ["rain"]], backdo: false }); put(s, 0, 3);
  eq(Y.applyThrow(atThrow(Y.applySkill(s, 0, null).state, 2, 1), 3).events[0].result, 1);
  s = sk({ p0: [["toxic"], ["rain"]] }); put(s, 1, 4);
  s1 = Y.applySkill(s, 1, null).state;
  r = Y.applyThrow(s1, 1); eq([r.events[0].result, r.events[0].rained], [2, 1]);
  [3, 5].forEach(no => eq(Y.applyThrow(atThrow(s1, no, 0), -1).events[0].result, 2, "차례 " + no));
  eq(Y.applyThrow(atThrow(s1, 7, 0), 1).events[0].result, 1, "네 번째 차례엔 그침");
  const cp = clone(s1); cp.teams[0].fx.poison = true;
  eq(Y.applyThrow(cp, 3).events[0].result, 2, "비 + 맹독 → 개");
});
t("45. 미래예지(맞히면 한 번 더) · 희망사항(원하는 결과, 한 번 더 없음) · 성장(한 단계, 모는 못 올림)", () => {
  let s = sk({ p0: [["future"], ["wish"]] }); put(s, 0, 3); put(s, 1, 4);
  const s1 = Y.applySkill(s, 0, 2).state;
  let r = Y.applyThrow(s1, 2);
  ok(r.events.some(e => e.type === "foresee" && e.ok)); eq([r.state.throwsLeft, r.state.phase], [1, "throw"]);
  r = Y.applyThrow(s1, 3);
  ok(r.events.some(e => e.type === "foresee" && !e.ok)); eq(r.state.phase, "choose");
  const s2 = Y.applySkill(s, 1, 5).state;
  eq([s2.pending, s2.throwsLeft, s2.phase], [[5], 0, "choose"], "모를 골라도 한 번 더 없음");
  s = sk({ p0: [["growth"], ["growth"]] }); put(s, 0, 3);
  s = choose(s, [3, 2]);
  eq(Y.legalSkills(s)[0].targets, [0, 1]);
  r = Y.applySkill(s, 0, 0);
  eq([r.state.pending, r.state.throwsLeft], [[4, 2], 0], "기술로 만든 윷은 한 번 더 없음");
  s = sk({ p0: [["growth"], ["growth"]] }); put(s, 0, 3); s = choose(s, [5, -1]);
  eq(Y.legalSkills(s)[0].targets, [1]);
  eq(Y.applySkill(s, 0, 1).state.pending, [5, 1]);
});
t("46. 스텔스록 — 상대가 멈추면 집으로 (지나가면·우리 말은 괜찮음) · 끈적끈적네트 — 지나가다 걸려 멈춤", () => {
  let s = sk({ p0: [["rock"], ["web"]] }); put(s, 0, 3); put(s, 1, 4);
  let s1 = Y.applySkill(s, 0, 9).state;
  eq(s1.traps, [{ node: 9, kind: "rock", team: 0 }]);
  put(s1, 2, 7);
  const b = at(s1, 2, 1, [2, 3]);
  ok(Y.legalMoves(b).find(m => m.id === "n7/2").rock, "미리보기에 바위 표시");
  let r = Y.applyMove(b, "n7/2");
  eq([r.state.pieces[2].state, r.state.traps], ["wait", []]); ok(evTypes(r).includes("rock"));
  r = Y.applyMove(b, "n7/3");
  eq([node(r.state, 2), r.state.traps.length], [10, 1], "지나가면 안 걸림");
  r = Y.applyMove(at(s1, 3, 0, [5]), "n4/5");
  eq(node(r.state, 1), 9, "우리 바위는 괜찮음");
  s = sk({ p0: [["rock"], ["web"]] }); put(s, 1, 4);
  s1 = Y.applySkill(s, 1, 9).state;
  put(s1, 2, 7);
  r = Y.applyMove(at(s1, 2, 1, [4]), "n7/4");
  eq([node(r.state, 2), r.state.traps], [9, []]); ok(evTypes(r).includes("webstop"));
});
t("47. 원한(상대 기술 봉인 세 번, 저절로 기술도) · 가로챈다(빼앗은 기술은 내 것) · 흑안개(모두 지움)", () => {
  let s = sk({ p0: [["spite"], ["snatch"]], p1: [["nitro"], ["iron"]], e1: [true, true] });
  put(s, 0, 3); put(s, 1, 9); put(s, 2, 10); put(s, 3, 12);
  const s1 = Y.applySkill(s, 0, null).state;
  eq(Y.legalSkills(atThrow(s1, 2, 1)), []); eq(Y.legalSkills(atThrow(s1, 6, 1)), []);
  eq(Y.legalSkills(atThrow(s1, 8, 1)).map(x => x.piece), [2]);
  eq(Y.applyMove(at(s1, 3, 0, [3]), "n9/3").state.pieces[3].state, "wait", "봉인 중엔 철벽이 안 나감");
  eq(Y.applyMove(at(s1, 9, 0, [3]), "n9/3").state.pieces[3].state, "board", "봉인이 풀리면 철벽");
  s = sk({ p0: [["spite"], ["snatch"]], p1: [["nitro"], ["iron"]], e1: [true, true] });
  put(s, 1, 4); put(s, 2, 10);
  eq(Y.legalSkills(s).find(x => x.piece === 1).targets, [2, 3]);
  const s2 = Y.applySkill(s, 1, 2).state;
  eq([s2.pieces[1].skill, s2.pieces[1].used, s2.pieces[2].used], ["nitro", false, true]);
  s = sk({ p0: [["haze"], ["haze"]] }); put(s, 0, 3); put(s, 2, 7);
  s.traps = [{ node: 9, kind: "rock", team: 1 }]; s.teams[0].fx = { poison: true }; s.pieces[2].fx = { veil: 9 };
  const s3 = Y.applySkill(s, 0, null).state;
  eq([s3.traps, s3.teams[0].fx, s3.pieces[2].fx], [[], {}, {}]);
});
t("48. 화염방사 — 앞쪽 3칸 안의 상대를 집으로 + 한 번 더 (쏜 말은 제자리) · 철벽이면 막힘", () => {
  let s = sk({ p0: [["flame"], ["flame"]] }); put(s, 0, 3); put(s, 2, 6); put(s, 3, 8);
  eq(Y.legalSkills(s)[0].targets, [6]);
  let r = Y.applySkill(s, 0, 6);
  eq([r.state.pieces[2].state, node(r.state, 0), r.state.throwsLeft], ["wait", 3, 2]);
  const cap = r.events.find(e => e.type === "capture"); ok(cap.remote && cap.skill === "flame");
  s = sk({ p0: [["flame"], ["flame"]], p1: [["iron"], ["iron"]], e1: [true, true] }); put(s, 0, 3); put(s, 2, 5);
  r = Y.applySkill(s, 0, 5);
  eq([r.state.pieces[2].state, r.state.pieces[2].used], ["board", true]); ok(evTypes(r).includes("block"));
});
t("49. 순풍 — 우리 말 모두 한 칸 (잡지 않음, 업힘) · 사이드체인지 — 두 말 자리 바꾸기", () => {
  let s = sk({ n: 3, p0: [["tailwind"], ["nitro"], ["nitro"]] });
  put(s, 0, 3); put(s, 1, 6); put(s, 2, 12); put(s, 3, 4); put(s, 4, 13);
  let r = Y.applySkill(s, 0, null);
  eq([node(r.state, 0), node(r.state, 1), node(r.state, 2)], [3, 7, 12]);
  eq(r.state.pieces[3].state, "board", "순풍으로는 안 잡음");
  s = sk({ n: 3, p0: [["tailwind"], ["nitro"], ["nitro"]] }); put(s, 0, 6); put(s, 1, 7); put(s, 3, 8);
  r = Y.applySkill(s, 0, null);
  eq(Y.unitsOf(r.state, 0).length, 1, "업힘"); ok(evTypes(r).includes("stack"));
  s = sk({ n: 3, p0: [["nitro"], ["allyswitch"], ["nitro"]] }); put(s, 1, 3); put(s, 2, 14);
  eq(Y.legalSkills(s).find(x => x.piece === 1).targets, [14]);
  r = Y.applySkill(s, 1, 14);
  eq([node(r.state, 1), node(r.state, 2)], [14, 3]);
});
t("50. 손가락흔들기 — 지금 쓸 수 있는 누르는 기술 중 무작위 (자기 자신·유턴·저절로 기술은 안 나옴)", () => {
  const seen = {};
  for (let seed = 1; seed <= 300; seed++) {
    const s = sk({ p0: [["metronome"], ["nitro"]] });
    s.srng = seed;
    put(s, 0, 3); put(s, 2, 5);
    const r = Y.applySkill(s, 0, null);
    const m = r.events.find(e => e.type === "metronome");
    ok(m && Y.SKILLS[m.key].kind === "active" && m.key !== "metronome" && m.key !== "uturn", "이상한 기술 " + (m && m.key));
    seen[m.key] = 1;
    ok(Y.validate(r.state), "validate " + m.key);
  }
  ok(Object.keys(seen).length >= 10, "여러 기술이 나와야 함: " + Object.keys(seen).join(","));
});
t("51. 카운터 — 방해 기술을 되돌림 (파도타기 → 쓴 말이 밀림 · 맹독 → 쓴 팀이 빽도 · 가로챈다 → 막기)", () => {
  const c = () => sk({ p0: [["surf"], ["toxic"]], p1: [["counter"], ["counter"]], e1: [true, true] });
  let s = c(); put(s, 0, 9); put(s, 1, 4); put(s, 2, 6); put(s, 3, 14);
  let r = Y.applySkill(s, 0, 6);
  eq([node(r.state, 2), node(r.state, 0)], [6, 7], "상대는 그대로, 쓴 말이 2칸 밀림");
  ok(evTypes(r).includes("reflect"));
  eq([2, 3].filter(j => r.state.pieces[j].used).length, 1, "카운터는 하나만 씀");
  s = c(); put(s, 1, 4); put(s, 2, 6);
  r = Y.applySkill(s, 1, null);
  eq([r.state.teams[0].fx.poison, !!r.state.teams[1].fx.poison], [true, false]);
  s = sk({ p0: [["snatch"], ["snatch"]], p1: [["counter"], ["nitro"]], e1: [true, true] }); put(s, 0, 4); put(s, 2, 6); put(s, 3, 8);
  r = Y.applySkill(s, 0, 3);
  eq([r.state.pieces[3].skill, r.state.pieces[3].used, r.state.pieces[0].skill], ["nitro", false, "snatch"]);
});
t("52. 철벽(튕겨 냄, 한 번 더 없음) · 달빛(집 대신 한 칸 뒤로) · 길동무(잡은 말도 집으로)", () => {
  const g2 = p1 => sk({ p1, e1: [true, true] });
  let s = g2([["iron"], ["moon"]]); put(s, 0, 4); put(s, 2, 7);
  let r = Y.applyMove(choose(s, [3]), "n4/3");
  eq([node(r.state, 0), r.state.pieces[2].state, r.state.pieces[0].walk], [4, "board", 0], "온 자리로, 칸도 안 셈");
  ok(evTypes(r).includes("block") && !evTypes(r).includes("bonus"), "한 번 더 없음");
  s = g2([["iron"], ["moon"]]); put(s, 2, 3);
  eq(Y.applyMove(choose(s, [3]), "new/3").state.pieces[0].state, "wait", "새 말은 집으로 되돌아감");
  s = g2([["iron"], ["moon"]]); put(s, 0, 4); put(s, 3, 7);
  r = Y.applyMove(choose(s, [3]), "n4/3");
  eq([node(r.state, 3), node(r.state, 0)], [6, 7]); ok(evTypes(r).includes("moon"));
  s = g2([["iron"], ["moon"]]); put(s, 0, 4); put(s, 1, 6); put(s, 3, 7);
  eq(node(Y.applyMove(choose(s, [3]), "n4/3").state, 3), 5, "뒤 칸에 상대 말이 있으면 더 뒤로");
  s = g2([["bond"], ["bond"]]); put(s, 0, 4); put(s, 2, 7);
  r = Y.applyMove(choose(s, [3]), "n4/3");
  eq([r.state.pieces[2].state, r.state.pieces[0].state], ["wait", "wait"]); ok(evTypes(r).includes("bond"));
});
t("53. 옛 저장(v1, 기술 전) → 기술 없이 이어 하기", () => {
  const old = clone(game());
  old.v = 1;
  ["traps", "skillTurn", "srng", "guess"].forEach(k => delete old[k]); delete old.settings.skills;
  old.teams.forEach(tm => { delete tm.pools; delete tm.early; delete tm.fx; });
  old.pieces.forEach(p => { delete p.walk; delete p.base; delete p.skill; delete p.used; delete p.fx; });
  Object.assign(old.pieces[0], { state: "board", step: 7 });
  ok(!Y.validate(old), "v1 그대로 통과");
  const u = Y.upgrade(old);
  ok(Y.validate(u), "올린 뒤 validate 실패");
  eq([u.settings.skills, u.pieces[0].walk, Y.legalSkills(u)], [false, 7, []]);
  ok(Y.validate(Y.applyMove(choose(u, [2]), "n7/2").state));
});
t("54. 로켓단이 잡은 포켓몬을 넣는 말 — 기술 다 쓴 말 → 집에 있는 말 → 멈춘 말, 같은 가족이면 없음", () => {
  const s = sk({ n: 3 });
  put(s, 3, 5); put(s, 4, 8);
  Object.assign(s.pieces[4], { skill: "nitro", used: true });
  eq(Y.cpuSwapTarget(s, 1, 133, 3), 4);
  s.pieces[4].used = false;
  eq(Y.cpuSwapTarget(s, 1, 133, 3), 5, "집에 있는 말");
  put(s, 5, 10);
  eq(Y.cpuSwapTarget(s, 1, 133, 3), 3, "멈춘 말");
  eq(Y.cpuSwapTarget(s, 1, 4, 3), null, "파이리 가족이 판에 있으면 못 넣음");
});
t("55. 로켓단 기술 — 쉬움은 방해 기술을 안 쓰고 가끔만, 보통은 잡을 수 있으면 화염방사", () => {
  const s = sk({ p0: [["flame"], ["surf"]] }); put(s, 0, 3); put(s, 1, 12); put(s, 2, 5); put(s, 3, 13);
  let rs = 1; const rnd = () => { const r = Y.rand(rs); rs = r[1]; return r[0]; };
  for (let k = 0; k < 200; k++) { const a = Y.cpuSkill(s, "easy", rnd); ok(!a, "쉬움이 방해 기술을 씀: " + (a && a.key)); }
  let hits = 0;
  for (let k = 0; k < 200; k++) { const a = Y.cpuSkill(s, "normal", rnd); if (a) { ok(a.key === "flame" && a.target === 5, "보통의 선택 " + JSON.stringify(a)); hits++; } }
  ok(hits > 100, "보통이 거의 안 씀 " + hits);
  const e = sk({ p0: [["nitro"], ["ddance"]] }); put(e, 0, 3); put(e, 1, 12);
  let used = 0;
  for (let k = 0; k < 300; k++) if (Y.cpuSkill(e, "easy", rnd)) used++;
  ok(used > 40 && used < 150, "쉬움은 가끔(30%) " + used);
});
t("56. 기술을 아무렇게나 쓰는 무작위 3,000판 — 한 칸에 두 팀 없음, 1칸째보다 뒤로 밀린 말 없음, 효과는 끝남, 판도 끝남", () => {
  const typeOf = id => String(D.types[id - 1] || "노말").split("·");
  const poolOf = id => [...new Set([].concat(...typeOf(id).map(tp => Y.TYPE_SKILLS[tp] || [])))];
  const allKeys = Object.keys(Y.SKILLS);
  let rs = 4321;
  const rnd = () => { const r = Y.rand(rs); rs = r[1]; return r[0]; };
  const usedKeys = {}, reacted = {};
  let longest = 0;
  for (let g = 0; g < 3000; g++) {
    const n = 2 + (g % 3);
    const mk = (name, picks) => ({ name, picks, pools: picks.map((id, k) => g % 3 === 0 ? [allKeys[(Math.floor(g / 3) + k * 9 + (name === "B" ? 4 : 0)) % allKeys.length]] : poolOf(id)), now: picks.map((_, k) => g % 3 === 0 || (g + k) % 3 === 0) }); // 기술을 정해 준 판(g%3==0)은 모두 처음부터
    const spotRnd = Y.rng(g + 100);
    let s = Y.newGame({
      pieces: n, backdo: g % 4 !== 0, seed: g + 1, first: g % 2, skills: true,
      spots: g % 2 ? Y.pickSpotNodes(spotRnd, 2).map(nd => ({ node: nd, id: 1 + Math.floor(spotRnd() * 1025) })) : undefined,
      teams: [mk("A", [6, 25, 1, 7]), mk("B", [9, 26, 3, 133])],
    }, D.evoFrom);
    let steps = 0;
    while (s.phase !== "over") {
      if (++steps > 3000) throw new Error("끝나지 않는 판 (seed " + (g + 1) + ")");
      const sks = Y.legalSkills(s);
      let r;
      if (sks.length && rnd() < 0.5) {
        const x = sks[Math.floor(rnd() * sks.length)];
        r = Y.applySkill(s, x.piece, x.targets[Math.floor(rnd() * x.targets.length)]);
        usedKeys[x.key] = 1;
      } else if (s.phase === "throw") r = Y.applyThrow(s);
      else {
        const ms = Y.legalMoves(s);
        ok(ms.length > 0, "choose 인데 둘 수가 없음");
        r = Y.applyMove(s, (g % 2 ? Y.cpuChoose(s, "normal", rnd) : ms[Math.floor(rnd() * ms.length)]).id);
      }
      r.events.forEach(e => { if (["block", "moon", "bond", "reflect"].includes(e.type)) reacted[e.type] = 1; });
      s = r.state;
      if (g % 7 === 0 && rnd() < 0.03) {
        const cand = s.pieces.map((p, i) => i).filter(i => Y.swapOk(s, i, 133));
        if (cand.length) s = Y.applySwap(s, cand[Math.floor(rnd() * cand.length)], { id: 133, path: [133, 134], base: 0, pool: ["surf", "rain"], early: false }).state;
      }
      ok(Y.validate(s), "validate 실패");
      const where = {};
      s.pieces.forEach(p => {
        if (p.state !== "board") return;
        const nd = Y.posOf(p);
        if (where[nd]) {
          ok(where[nd].team === p.team, "칸 " + nd + "에 두 팀");
          ok(where[nd].route === p.route && where[nd].step === p.step && where[nd].atGoal === p.atGoal, "업힌 말의 길이 다름");
        } else where[nd] = p;
        ok(p.atGoal || p.step >= 1, "1칸째보다 뒤");
        const f = p.fx || {};
        ["para", "sleep", "veil"].forEach(k => ok(!f[k] || f[k] <= s.turnNo + 8, "끝나지 않는 효과 " + k));
        ok(p.stage < s.teams[p.team].paths[p.slot].length, "진화 단계 범위");
      });
    }
    ok(Y.teamDone(s, s.winner), "이긴 팀 말이 다 안 들어옴");
    longest = Math.max(longest, steps);
  }
  eq(allKeys.filter(k => Y.SKILLS[k].kind === "active" && !usedKeys[k]), [], "한 번도 안 쓰인 기술");
  eq(Object.keys(reacted).sort(), ["block", "bond", "moon", "reflect"], "저절로 기술이 다 나와야 함");
  console.log("     (가장 긴 판: 동작 " + longest + "번)");
});

// ---------- v4: ✨ 15칸 규칙 · 🎓 시계·돈 문제 ----------
t("57. 기술 쓰는 때 — 3단계는 마지막 모습(10칸) · 진화 없음·2단계·전설은 15칸", () => {
  const s = Y.newGame({ pieces: 4, seed: 9, skills: true, teams: [
    { name: "A", picks: [6, 25, 128, 150], paths: [[4, 5, 6], [172, 25], [128], [150]], pools: [["nitro"], ["surf"], ["wish"], ["future"]], early: [false, false, false, true] },
    { name: "B", picks: [9, 26, 3, 133], pools: [["iron"], ["iron"], ["iron"], ["iron"]] },
  ] }, D.evoFrom);
  eq(s.pieces.slice(0, 4).map(p => p.skill), [null, null, null, null], "처음엔 아무도 없음");
  const walkTo = (st, i, n) => { Object.assign(st.pieces[i], { state: "board", atGoal: false, walk: n - 1 }, Y.settle("OUT", 9)); return Y.applyMove(choose(st, [1]), "n9/1").state; };
  let a = walkTo(clone(s), 0, 10); eq([Y.formOf(a, 0), a.pieces[0].skill], [6, "nitro"], "3단계: 10칸");
  a = walkTo(clone(s), 1, 10); eq([Y.formOf(a, 1), a.pieces[1].skill], [25, null], "2단계: 10칸은 아직");
  a = walkTo(clone(s), 1, 15); eq(a.pieces[1].skill, "surf", "2단계: 15칸");
  a = walkTo(clone(s), 2, 14); eq(a.pieces[2].skill, null, "진화 없음: 14칸은 아직");
  a = walkTo(clone(s), 2, 15); eq(a.pieces[2].skill, "wish", "진화 없음: 15칸");
  a = walkTo(clone(s), 3, 15); eq(a.pieces[3].skill, "future", "전설: 15칸");
  eq([Y.needsWalk(s, 0), Y.needsWalk(s, 1), Y.needsWalk(s, 2), Y.needsWalk(s, 3)], [false, true, true, true]);
});
t("58. 시계 문제 — 보기 4개, 정답 하나, 단계별 시각 (정각·30분 / 5분 / 1분), 아이가 하는 실수가 오답에", () => {
  const S = Y.Study, rnd = Y.rng(11);
  for (let k = 0; k < 3000; k++) {
    const lv = 1 + (k % 3), q = S.clock(lv, rnd);
    eq(q.choices.length, 4, "보기 수");
    ok(new Set(q.choices.map(S.clockText)).size === 4, "보기가 겹침 " + q.choices.map(S.clockText));
    ok(q.choices[q.answer].h === q.h && q.choices[q.answer].m === q.m, "정답 위치");
    ok(q.choices.every(c => c.h >= 1 && c.h <= 12 && c.m >= 0 && c.m < 60), "이상한 시각");
    if (lv === 1) ok(q.m === 0 || q.m === 30, "1단계 " + q.m);
    if (lv === 2) ok(q.m % 5 === 0, "2단계 " + q.m);
    if (lv === 3) ok(q.m % 5 !== 0, "3단계 " + q.m);
  }
  const q = S.clock(2, rnd, { h: 3, m: 40 });
  eq(q.choices.map(S.clockText).sort(), ["3시 40분", "3시 8분", "4시 40분", "8시 15분"], "3시 40분의 오답 = 다음 시 · 바늘 바꿔 읽기 · 숫자 그대로");
  eq(S.clockText({ h: 7, m: 0 }), "7시");
});
t("59. 돈 문제 — 합이 정확, 보기 4개, 단계별 단위 (천·백 / +만 / +십만), 자릿값 실수가 오답에", () => {
  const S = Y.Study, rnd = Y.rng(12);
  for (let k = 0; k < 3000; k++) {
    const lv = 1 + (k % 3), q = S.money(lv, rnd);
    eq(q.total, 100000 * q.counts[100000] + 10000 * q.counts[10000] + 1000 * q.counts[1000] + 100 * q.counts[100], "합");
    eq(q.choices.length, 4); ok(new Set(q.choices).size === 4, "보기가 겹침"); eq(q.choices[q.answer], q.total);
    ok(S.UNITS.every(u => q.counts[u] >= 0 && q.counts[u] <= 9), "한 단위 0~9장");
    const top = { 1: 1000, 2: 10000, 3: 100000 }[lv];
    ok(q.counts[top] >= 1 && S.UNITS.filter(u => u > top).every(u => q.counts[u] === 0), lv + "단계 가장 큰 단위 " + JSON.stringify(q.counts));
  }
  const q = S.money(2, rnd, { 10000: 3, 1000: 2, 100: 5 });
  eq(q.total, 32500);
  ok(q.choices.includes(3250) && q.choices.includes(325000) && q.choices.includes(23500), "자릿값 오답 " + q.choices);
  eq([32500, 10000, 1000, 110000, 999900, 2100, 15000, 700400].map(S.koNum),
    ["삼만 이천오백", "만", "천", "십일만", "구십구만 구천구백", "이천백", "만 오천", "칠십만 사백"]);
  eq([S.won(32500), S.won(100), S.won(999900)], ["32,500원", "100원", "999,900원"]);
});
t("60. 어려움 자동 오르내림 — 3번 연속 맞히면 위, 2번 연속 틀리면 아래 (1~3단계)", () => {
  const S = Y.Study;
  let st = S.record(null, true); st = S.record(st, true); eq(st.level, 1); st = S.record(st, true); eq(st.level, 2);
  st = S.record(st, false); eq(st.level, 2); st = S.record(st, false); eq(st.level, 1);
  st = S.record(st, false); st = S.record(st, false); eq(st.level, 1, "1단계 아래로는 안 감");
  for (let k = 0; k < 12; k++) st = S.record(st, true);
  eq(st.level, 3, "3단계 위로는 안 감"); eq([st.right, st.total], [15, 19]);
});
t("61. 시계를 맞히면 풀숲 희귀도 30·30·20·20 (±1%p) · 풀숲 포켓몬을 나중에 뽑는 판(id 없음)도 저장·검사 통과", () => {
  eq(Y.Rewards.WILD_ODDS_BOOST, { c: 30, r: 30, u: 20, l: 20 });
  const pools = { c: [], r: [], u: [], l: [] };
  for (let id = 1; id <= 1025; id++) pools[D.rarity[id] || "c"].push(id);
  const rnd = Y.rng(21), N = 50000, cnt = { c: 0, r: 0, u: 0, l: 0 };
  for (let i = 0; i < N; i++) cnt[D.rarity[Y.Rewards.rollWild(pools, [], rnd, Y.Rewards.WILD_ODDS_BOOST)] || "c"]++;
  Object.keys(cnt).forEach(k => ok(Math.abs(cnt[k] / N - Y.Rewards.WILD_ODDS_BOOST[k] / 100) < 0.01, k + " " + (cnt[k] / N * 100).toFixed(1) + "%"));
  const s = withSpots([{ node: 3, id: null }, { node: 12, id: null }]);
  ok(Y.validate(s), "id 없는 풀숲");
  const r = Y.applyMove(choose(s, [3]), "new/3");
  const w = r.events.find(e => e.type === "wild");
  ok(w && w.id == null && Y.validate(r.state), "id 없이 wild 이벤트 → 화면이 문제를 낸 뒤 뽑는다");
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
