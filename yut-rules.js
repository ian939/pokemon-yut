/* 포켓몬 윷놀이 — 규칙 엔진
 * DOM을 모르는 순수 함수만 둔다. 화면(index.html)은 여기서 받은 결과를 그리기만 한다.
 * 브라우저에서는 window.Yut, Node에서는 require("./yut-rules.js") 로 쓴다.
 * 상태(state)는 JSON 그대로 저장·복원할 수 있는 평범한 객체다.
 */
(function (root) {
  "use strict";

  /* ---------- 윷판: 칸 29개 (좌표 0~100) ----------
   *  10(뒷모)─ 9 ─ 8 ─ 7 ─ 6 ─ 5(모)
   *    │ 25                  20 │
   *   11     26          21     4
   *   12         22(방)          3
   *   13     23          27     2
   *    │ 24                  28 │
   *  15(찌모)─16 ─17 ─18 ─19 ─ 0(참먹이)   ← 참먹이에서 출발, 시계 반대 방향
   */
  const S = 100 / 6;
  const NODES = [
    [100, 100], [100, 80], [100, 60], [100, 40], [100, 20], [100, 0],
    [80, 0], [60, 0], [40, 0], [20, 0], [0, 0],
    [0, 20], [0, 40], [0, 60], [0, 80], [0, 100],
    [20, 100], [40, 100], [60, 100], [80, 100],
    [100 - S, S], [100 - 2 * S, 2 * S], [50, 50], [2 * S, 100 - 2 * S], [S, 100 - S],
    [S, S], [2 * S, 2 * S], [100 - 2 * S, 100 - 2 * S], [100 - S, 100 - S],
  ];
  const NODE_KIND = NODES.map((_, n) =>
    n === 0 ? "start" : (n === 5 || n === 10 || n === 15) ? "corner" : n === 22 ? "center" : "normal");
  const NODE_NAME = { 0: "참먹이", 5: "모", 10: "뒷모", 15: "찌모", 22: "방" };
  // 그릴 선 (바깥 한 바퀴 + 대각선 두 개)
  const LINES = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 0],
    [5, 20, 21, 22, 23, 24, 15],
    [10, 25, 26, 22, 27, 28, 0],
  ];

  /* ---------- 길 4개 — 앞부분이 겹치게 설계 ---------- */
  const ROUTES = {
    OUT: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 0], // 바깥 한 바퀴 (20걸음)
    A: [0, 1, 2, 3, 4, 5, 20, 21, 22, 23, 24, 15, 16, 17, 18, 19, 0],                // 모 → 방 지나 찌모 (16걸음)
    B: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 25, 26, 22, 27, 28, 0],                    // 뒷모 → 방 → 참먹이 (16걸음)
    C: [0, 1, 2, 3, 4, 5, 20, 21, 22, 27, 28, 0],                                    // 모 → 방에 멈춤 → 참먹이 (11걸음)
  };

  /* 멈춘 칸을 보고 앞으로 갈 길을 정한다 (앞으로 가서 멈추든, 빽도로 물러나 멈추든 똑같이).
   * - 모(5)·뒷모(10)에 멈추면 대각선, 방(22)에 멈추면 참먹이 쪽 (B로 왔으면 이미 참먹이 쪽)
   * - 그 밖의 칸은 "그 칸을 멈추지 않고 지나가던 말"이 가는 길
   *   → 모에서 빽도로 4에 물러난 말이 다시 개를 던지면 모를 지나 6으로 간다 (대각선 아님)
   * - 찌모~아랫변(15~19)과 방→참먹이 대각선(27·28)은 앞으로 가는 길이 어느 길이든 같아서,
   *   빽도로 되짚을 길이 다르게 남도록 온 길을 그대로 둔다 (15에서 빽도: 바깥으로 왔으면 14, 대각선으로 왔으면 24) */
  function settle(route, node) {
    if (node === 5) return { route: "A", step: 5 };
    if (node === 10) return { route: "B", step: 10 };
    if (node >= 1 && node <= 14) return { route: "OUT", step: node };
    if (node === 20 || node === 21 || node === 23 || node === 24) return { route: "A", step: node - 14 };
    if (node === 25 || node === 26) return { route: "B", step: node - 14 };
    if (node === 22) return route === "B" ? { route: "B", step: 13 } : { route: "C", step: 8 };
    let step = ROUTES[route] ? ROUTES[route].indexOf(node) : -1;
    if (step > 0) return { route, step };
    const alt = (node === 27 || node === 28) ? "C" : "OUT"; // 안전장치 (정상 흐름에서는 오지 않음)
    return { route: alt, step: ROUTES[alt].indexOf(node) };
  }

  /* ---------- 윷 결과 ---------- */
  const BACKDO = -1;
  const RESULTS = {
    "-1": { name: "빽도", steps: -1, again: false },
    1: { name: "도", steps: 1, again: false },
    2: { name: "개", steps: 2, again: false },
    3: { name: "걸", steps: 3, again: false },
    4: { name: "윷", steps: 4, again: true },
    5: { name: "모", steps: 5, again: true },
  };
  const FLAT_P = 0.6; // 윷가락 하나가 평평한 면으로 떨어질 확률

  // 시드 난수 (mulberry32) — 상태를 숫자 하나로 저장해 판을 이어해도 같은 흐름이 된다
  function rand(st) {
    const a = (st + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a >>> 0];
  }

  // 윷가락 4개 던지기. sticks[i] = 평평한 면이 위인가. 0번 가락이 빽도 표시 가락.
  function throwSticks(st, backdo, flatP) {
    const p = flatP == null ? FLAT_P : flatP;
    const sticks = [];
    for (let i = 0; i < 4; i++) {
      const r = rand(st);
      st = r[1];
      sticks.push(r[0] < p);
    }
    const n = sticks.filter(Boolean).length;
    let result = n === 0 ? 5 : n;
    if (n === 1 && sticks[0] && backdo) result = BACKDO;
    return { result, sticks, rng: st };
  }
  // 강제로 정한 결과(테스트·시연)에 맞는 가락 모양
  function sticksFor(r) {
    return {
      "-1": [true, false, false, false], 1: [false, true, false, false], 2: [false, true, true, false],
      3: [false, true, true, true], 4: [true, true, true, true], 5: [false, false, false, false],
    }[r].slice();
  }
  // 결과별 확률 (CPU가 위험을 계산할 때 사용)
  function resultProbs(backdo, flatP) {
    const p = flatP == null ? FLAT_P : flatP, q = 1 - p;
    const C = [1, 4, 6, 4, 1];
    const k = n => C[n] * Math.pow(p, n) * Math.pow(q, 4 - n);
    const P = { 1: k(1), 2: k(2), 3: k(3), 4: k(4), 5: k(0) };
    if (backdo) { P[BACKDO] = P[1] / 4; P[1] -= P[BACKDO]; }
    return P;
  }

  /* ---------- 말 위치 ---------- */
  const clone = o => JSON.parse(JSON.stringify(o));
  const posOf = p => (p.state !== "board" ? null : p.atGoal ? 0 : ROUTES[p.route][p.step]);

  // 한 칸 이동 계산. from: { route, step, atGoal } (새 말은 route OUT·step 0)
  // 돌려주는 값: { finish, node, route, step, atGoal, path(지나가는 칸 순서) } 또는 null(움직일 수 없음)
  function stepMove(from, r) {
    if (r === BACKDO) {
      if (from.entering || from.atGoal) return null; // 대기 중인 말·참먹이 위의 말은 빽도로 움직이지 않음
      const s = from.step - 1;
      if (s <= 0) return { finish: false, node: 0, route: "OUT", step: 0, atGoal: true, path: [0] };
      const node = ROUTES[from.route][s];
      const st = settle(from.route, node);
      return { finish: false, node, route: st.route, step: st.step, atGoal: false, path: [node] };
    }
    if (from.atGoal) return { finish: true, node: null, path: [] }; // 참먹이 위 → 앞으로 한 칸이라도 가면 완주
    const R = ROUTES[from.route], last = R.length - 1;
    const s = from.step + r;
    if (s >= last) return { finish: true, node: null, path: R.slice(from.step + 1, last + 1) };
    const node = R[s];
    const st = settle(from.route, node);
    return { finish: false, node, route: st.route, step: st.step, atGoal: false, path: R.slice(from.step + 1, s + 1) };
  }

  // 팀의 판 위 말을 칸별로 묶기 (같은 칸 = 업힌 말)
  function unitsOf(state, team) {
    const byNode = {};
    state.pieces.forEach((p, i) => {
      if (p.team !== team || p.state !== "board") return;
      const n = posOf(p);
      if (!byNode[n]) byNode[n] = { node: n, pieces: [], route: p.route, step: p.step, atGoal: p.atGoal };
      byNode[n].pieces.push(i);
    });
    return Object.keys(byNode).map(k => byNode[k]);
  }
  const waitingOf = (state, team) =>
    state.pieces.map((p, i) => i).filter(i => state.pieces[i].team === team && state.pieces[i].state === "wait");

  /* ---------- 둘 수 있는 수 ---------- */
  function makeMove(state, team, r, ri, unit, pieces, from, d) {
    const m = {
      id: unit + "/" + r, unit, result: r, ri, pieces: pieces.slice(),
      from: { node: from.node, route: from.route, step: from.step, atGoal: !!from.atGoal },
      to: d.finish ? null : { node: d.node, route: d.route, step: d.step, atGoal: d.atGoal },
      path: d.path, finish: d.finish, capture: [], stack: [],
    };
    if (!d.finish) {
      state.pieces.forEach((p, i) => {
        if (p.state !== "board" || posOf(p) !== d.node || m.pieces.indexOf(i) >= 0) return;
        (p.team === team ? m.stack : m.capture).push(i);
      });
    }
    return m;
  }

  function legalMoves(state) {
    if (state.phase !== "choose") return [];
    const t = state.turn;
    const out = [];
    const seen = {};
    const units = unitsOf(state, t);
    const waiting = waitingOf(state, t);
    state.pending.forEach((r, ri) => {
      if (seen[r]) return; // 같은 결과가 두 번이면 한 번만 (어느 쪽을 써도 같다)
      seen[r] = true;
      units.forEach(u => {
        const d = stepMove(u, r);
        if (d) out.push(makeMove(state, t, r, ri, "n" + u.node, u.pieces, u, d));
      });
      if (r > 0 && waiting.length) {
        const from = { node: -1, route: "OUT", step: 0, atGoal: false };
        out.push(makeMove(state, t, r, ri, "new", [waiting[0]], from, stepMove(from, r)));
      }
    });
    return out;
  }

  /* ---------- 진화 ---------- */
  // 진화 경로: 1단계 → … → 고른 포켓몬.  evoPath(6) = [4, 5, 6]
  function evoPath(id, evoFrom) {
    const path = [id];
    const seen = {};
    while (evoFrom && evoFrom[path[0]] && !seen[path[0]] && path.length < 4) {
      seen[path[0]] = true;
      path.unshift(evoFrom[path[0]]);
    }
    return path;
  }
  function progressOf(p) {
    if (p.state === "done") return 1;
    if (p.state !== "board" || p.atGoal) return 0;
    return p.step / (ROUTES[p.route].length - 1);
  }
  // 단계가 3개면 1/3·2/3 지점에서, 2개면 1/2 지점에서 진화
  const stageFor = (progress, len) => Math.max(0, Math.min(len - 1, Math.floor(progress * len + 1e-9)));
  const formOf = (state, i) => {
    const p = state.pieces[i];
    const path = state.teams[p.team].paths[p.slot];
    return path[Math.min(p.stage, path.length - 1)];
  };

  /* ---------- 판 만들기·던지기·두기 ---------- */
  function newGame(o, evoFrom) {
    const n = o.pieces || 4;
    const seed = (o.seed >>> 0) || 1;
    const s = {
      v: 1,
      seed,
      rng: seed,
      settings: { pieces: n, backdo: o.backdo !== false, mode: o.mode || "family", cpuLevel: o.cpuLevel || "normal" },
      teams: o.teams.map(t => ({
        name: t.name, color: t.color, cpu: !!t.cpu, key: t.key || null,
        picks: t.picks.slice(0, n),
        paths: t.picks.slice(0, n).map(id => evoPath(id, evoFrom)),
      })),
      pieces: [],
      turn: o.first || 0,
      phase: "throw",
      pending: [],
      throwsLeft: 1,
      turnNo: 1,
      winner: null,
      lastThrow: null,
    };
    s.teams.forEach((t, ti) => {
      for (let k = 0; k < n; k++) s.pieces.push({ team: ti, slot: k, state: "wait", route: "OUT", step: 0, atGoal: false, stage: 0 });
    });
    return s;
  }

  function teamDone(s, t) { return s.pieces.every(p => p.team !== t || p.state === "done"); }

  function endTurn(s, ev) {
    s.turn = (s.turn + 1) % s.teams.length;
    s.phase = "throw";
    s.throwsLeft = 1;
    s.pending = [];
    s.turnNo++;
    ev.push({ type: "turn", team: s.turn });
  }
  // 던지기·두기가 끝난 뒤 다음 단계 정하기
  function advance(s, ev) {
    if (s.throwsLeft > 0) { s.phase = "throw"; return; }
    if (s.pending.length) {
      s.phase = "choose";
      if (legalMoves(s).length) return;
      ev.push({ type: "skip", team: s.turn, results: s.pending.slice() }); // 쓸 수 있는 결과가 없음 → 쉬어 가요
      s.pending = [];
    }
    endTurn(s, ev);
  }

  function applyThrow(state, forced) {
    if (state.phase !== "throw") throw new Error("지금은 던질 차례가 아님: " + state.phase);
    const s = clone(state);
    const ev = [];
    let t;
    if (forced != null && RESULTS[forced] && (forced !== BACKDO || s.settings.backdo)) {
      t = { result: forced, sticks: sticksFor(forced) };
    } else {
      t = throwSticks(s.rng, s.settings.backdo);
      s.rng = t.rng;
    }
    s.pending.push(t.result);
    s.throwsLeft -= 1;
    if (RESULTS[t.result].again) s.throwsLeft += 1;
    s.lastThrow = { result: t.result, sticks: t.sticks };
    ev.push({ type: "throw", team: s.turn, result: t.result, sticks: t.sticks, again: RESULTS[t.result].again });
    advance(s, ev);
    return { state: s, events: ev };
  }

  // pick: 새 말을 낼 때 대기 중인 말 중 어느 포켓몬을 낼지 (없으면 첫 번째)
  function applyMove(state, moveId, pick) {
    const m = legalMoves(state).find(x => x.id === moveId);
    if (!m) throw new Error("둘 수 없는 수: " + moveId);
    if (m.unit === "new" && pick != null && waitingOf(state, state.turn).indexOf(pick) >= 0) m.pieces = [pick];
    const s = clone(state);
    const ev = [];
    s.pending.splice(m.ri, 1);
    ev.push({ type: "move", team: s.turn, result: m.result, unit: m.unit, pieces: m.pieces.slice(), path: m.path.slice(), from: m.from, to: m.to, finish: m.finish });

    if (m.finish) {
      m.pieces.forEach(i => { const p = s.pieces[i]; p.state = "done"; p.atGoal = false; });
    } else {
      m.pieces.forEach(i => Object.assign(s.pieces[i], { state: "board", route: m.to.route, step: m.to.step, atGoal: m.to.atGoal }));
      if (m.capture.length) {
        m.capture.forEach(i => Object.assign(s.pieces[i], { state: "wait", route: "OUT", step: 0, atGoal: false, stage: 0 }));
        s.throwsLeft += 1; // 잡으면 한 번 더
        ev.push({ type: "capture", node: m.to.node, by: m.pieces.slice(), victims: m.capture.slice() });
      }
      if (m.stack.length) {
        m.stack.forEach(i => Object.assign(s.pieces[i], { route: m.to.route, step: m.to.step, atGoal: m.to.atGoal }));
        ev.push({ type: "stack", node: m.to.node, pieces: m.pieces.concat(m.stack) });
      }
    }
    // 진화 — 단계는 올라가기만 한다 (빽도로 물러나도 그대로, 잡히면 1단계로)
    m.pieces.forEach(i => {
      const p = s.pieces[i];
      const len = s.teams[p.team].paths[p.slot].length;
      const target = p.state === "done" ? len - 1 : stageFor(progressOf(p), len);
      if (target > p.stage) {
        ev.push({ type: "evolve", piece: i, from: p.stage, to: target });
        p.stage = target;
      }
    });
    if (m.finish) ev.push({ type: "finish", team: s.turn, pieces: m.pieces.slice() });
    if (m.capture.length) ev.push({ type: "bonus", team: s.turn });

    if (teamDone(s, s.turn)) {
      s.phase = "over";
      s.winner = s.turn;
      s.pending = [];
      s.throwsLeft = 0;
      ev.push({ type: "win", team: s.turn });
      return { state: s, events: ev };
    }
    advance(s, ev);
    return { state: s, events: ev };
  }

  /* ---------- 로켓단(컴퓨터) ---------- */
  const remainingOf = (route, step) => ROUTES[route].length - 1 - step;
  function gainOf(m) {
    const before = m.unit === "new" ? 20 : m.from.atGoal ? 1 : remainingOf(m.from.route, m.from.step);
    const after = m.finish ? 0 : m.to.atGoal ? 1 : remainingOf(m.to.route, m.to.step);
    return before - after;
  }
  // 다음 차례에 상대가 이 칸에 올 수 있는 확률 (대충)
  function threat(state, node, team) {
    if (node == null || node < 0) return 0;
    const P = resultProbs(state.settings.backdo);
    let total = 0;
    Object.keys(P).forEach(k => {
      const r = Number(k);
      let hit = false;
      state.teams.forEach((_, o) => {
        if (hit || o === team) return;
        unitsOf(state, o).forEach(u => {
          const d = stepMove(u, r);
          if (d && !d.finish && d.node === node) hit = true;
        });
        if (!hit && r > 0 && waitingOf(state, o).length && r === node) hit = true; // 새 말이 들어오는 칸
      });
      if (hit) total += P[r];
    });
    return Math.min(1, total);
  }
  function cpuScore(state, m, level) {
    const team = state.turn;
    const n = m.pieces.length;
    let v = 100 * m.capture.length + gainOf(m);
    if (m.finish) v += 60 * n;
    else {
      if (!m.to.atGoal && (m.to.node === 5 || m.to.node === 10 || m.to.node === 22)) v += 40;
      v += 25 * m.stack.length;
      if (level !== "easy") v -= 120 * threat(state, m.to.node, team) * (n + m.stack.length);
    }
    if (level !== "easy" && m.unit !== "new") v += 80 * threat(state, m.from.node, team) * n; // 위험한 칸에서 피하기
    return v;
  }
  // 난이도 = 아무 수나 두는 비율. 아이가 상대라서 약하게 맞췄다 (tools/sim-cpu.js 로 확인)
  //   쉬움 1.0 → 아무렇게나 두는 상대와 반반 · 보통 0.5 → 약 73% 승 · 어려움 0 → 약 84% 승 (화면엔 없음, 시험용)
  const CPU_RANDOM = { easy: 1, normal: 0.5, hard: 0 };
  function cpuChoose(state, level, rnd) {
    rnd = rnd || Math.random;
    const ms = legalMoves(state);
    if (!ms.length) return null;
    const pr = CPU_RANDOM[level] == null ? 0.5 : CPU_RANDOM[level];
    if (pr >= 1 || rnd() < pr) return ms[Math.floor(rnd() * ms.length)];
    let best = -Infinity, pick = [];
    ms.forEach(m => {
      const v = cpuScore(state, m, "hard");
      if (v > best + 1e-9) { best = v; pick = [m]; }
      else if (Math.abs(v - best) <= 1e-9) pick.push(m);
    });
    return pick[Math.floor(rnd() * pick.length)];
  }

  /* ---------- 저장본 검사 (망가진 판은 버린다) ---------- */
  function validate(s) {
    try {
      if (!s || s.v !== 1 || !Array.isArray(s.teams) || s.teams.length < 2 || !Array.isArray(s.pieces)) return false;
      if (["throw", "choose", "over"].indexOf(s.phase) < 0 || !Array.isArray(s.pending)) return false;
      if (s.pieces.length !== s.teams.length * s.settings.pieces) return false;
      if (s.teams.some(t => !Array.isArray(t.paths) || t.paths.length !== s.settings.pieces || t.paths.some(p => !p.length))) return false;
      return s.pieces.every(p =>
        ["wait", "board", "done"].indexOf(p.state) >= 0 && ROUTES[p.route] &&
        p.step >= 0 && p.step < ROUTES[p.route].length && p.team >= 0 && p.team < s.teams.length) &&
        s.pending.every(r => RESULTS[r]);
    } catch (e) { return false; }
  }

  const Yut = {
    NODES, NODE_KIND, NODE_NAME, LINES, ROUTES, RESULTS, BACKDO, FLAT_P,
    rand, throwSticks, sticksFor, resultProbs, settle, stepMove, posOf, unitsOf, waitingOf,
    legalMoves, applyThrow, applyMove, newGame, teamDone,
    evoPath, progressOf, stageFor, formOf,
    remainingOf, threat, cpuScore, cpuChoose, validate, clone,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Yut;
  else root.Yut = Yut;
})(typeof window !== "undefined" ? window : this);
