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

  /* ---------- 칸·말 찾기 ---------- */
  const piecesAt = (s, node) => s.pieces.map((p, i) => i).filter(i => s.pieces[i].state === "board" && posOf(s.pieces[i]) === node);
  const others = (s, team) => s.teams.map((_, t) => t).filter(t => t !== team);
  function unitOfPiece(s, i) {
    const p = s.pieces[i];
    if (!p || p.state !== "board") return null;
    return unitsOf(s, p.team).find(u => u.pieces.indexOf(i) >= 0) || null;
  }
  const enemyUnits = (s, team) => [].concat(...others(s, team).map(t => unitsOf(s, t)));

  /* ---------- v3: 상태 효과 ----------
   * 효과는 "몇 번째 차례(turnNo)까지"로 적는다 — 그 차례가 끝나면 풀린다.
   *   말 fx: para(마비) · sleep(잠) · veil(얼음 장막)   팀 fx: poison(다음 윷 빽도) · seal(기술 봉인) · rain(비) */
  const fxP = p => p.fx || {};
  const isBlocked = (s, p) => (fxP(p).para || 0) >= s.turnNo || (fxP(p).sleep || 0) >= s.turnNo;
  const isVeiled = (s, p) => (fxP(p).veil || 0) >= s.turnNo;
  const teamFx = (s, t) => s.teams[t].fx || (s.teams[t].fx = {});
  const isSealed = (s, t) => ((s.teams[t].fx || {}).seal || 0) >= s.turnNo;
  const isRaining = (s, t) => ((s.teams[t].fx || {}).rain || 0) >= s.turnNo;
  const pfx = p => p.fx || (p.fx = {});
  // 팀 t 의 k번째 다음 차례 (지금이 t 차례면 이번 차례는 빼고 센다)
  function untilFor(s, t, k) {
    const n = s.teams.length;
    let off = (t - s.turn + n) % n;
    if (off === 0) off = n;
    return s.turnNo + off + n * (k - 1);
  }
  const unitBlocked = (s, u) => u.pieces.some(i => isBlocked(s, s.pieces[i]));
  const unitVeiled = (s, u) => u.pieces.some(i => isVeiled(s, s.pieces[i]));
  const veiledEnemyAt = (s, team, node) => piecesAt(s, node).some(i => s.pieces[i].team !== team && isVeiled(s, s.pieces[i]));

  /* ---------- v3: 함정 (바위·거미줄) — 그 칸이 비어 있을 때만 걸린다 ---------- */
  const trapAt = (s, node, kind) => (s.traps || []).find(t => t.node === node && (!kind || t.kind === kind)) || null;
  function activeTrap(s, team, node, kind) {
    const t = trapAt(s, node, kind);
    return t && t.team !== team && !piecesAt(s, node).length ? t : null;
  }
  function removeTrap(s, node) { s.traps = (s.traps || []).filter(t => t.node !== node); }
  // 같은 칸의 우리 말은 한 덩어리(업힘) — 길·걸음을 맞춘다 (밀려나거나 달빛·순풍으로 와서 겹칠 때)
  function unify(s, node, team, pos) {
    piecesAt(s, node).forEach(i => { if (s.pieces[i].team === team) Object.assign(s.pieces[i], { route: pos.route, step: pos.step, atGoal: !!pos.atGoal }); });
  }
  // 상대 거미줄을 지나가면 그 칸에서 멈춘다 (골인하는 마지막 칸 = 참먹이에는 거미줄이 없다)
  function cutAtWeb(s, team, from, d) {
    if (!d || !s.traps || !s.traps.length) return d;
    for (let k = 0; k < d.path.length; k++) {
      if (d.finish && k === d.path.length - 1) break;
      const n = d.path[k];
      if (!activeTrap(s, team, n, "web")) continue;
      const st = (!d.finish && k === d.path.length - 1) ? { route: d.route, step: d.step } : settle(from.route, n);
      return { finish: false, node: n, route: st.route, step: st.step, atGoal: false, path: d.path.slice(0, k + 1), web: n };
    }
    return d;
  }
  // 뒤로 n칸 (빽도를 n번). 1칸째보다 뒤로는 안 간다 — 참먹이로 물러나 바로 골인하는 꼼수 막기
  function backSteps(from, n) {
    const list = [];
    let cur = { route: from.route, step: from.step, atGoal: !!from.atGoal };
    for (let k = 0; k < n; k++) {
      if (cur.atGoal || cur.step <= 1) break;
      const d = stepMove(cur, BACKDO);
      if (!d || d.atGoal) break;
      cur = { node: d.node, route: d.route, step: d.step, atGoal: false };
      list.push(cur);
    }
    return list;
  }

  /* ---------- 둘 수 있는 수 ---------- */
  function makeMove(state, team, r, ri, unit, pieces, from, d) {
    const m = {
      id: unit + "/" + r, unit, result: r, ri, pieces: pieces.slice(),
      from: { node: from.node, route: from.route, step: from.step, atGoal: !!from.atGoal },
      to: d.finish ? null : { node: d.node, route: d.route, step: d.step, atGoal: d.atGoal },
      path: d.path, finish: d.finish, capture: [], stack: [], web: d.web || null, rock: false,
    };
    if (!d.finish) {
      state.pieces.forEach((p, i) => {
        if (p.state !== "board" || posOf(p) !== d.node || m.pieces.indexOf(i) >= 0) return;
        (p.team === team ? m.stack : m.capture).push(i);
      });
      m.rock = !!activeTrap(state, team, d.node, "rock");
    }
    return m;
  }
  // 앞으로 r칸 (거미줄에서 멈춤, 얼음 장막 친 상대 칸에는 못 멈춤)
  function planForward(s, team, from, r) {
    const d = cutAtWeb(s, team, from, stepMove(from, r));
    if (!d || (!d.finish && veiledEnemyAt(s, team, d.node))) return null;
    return d;
  }

  function legalMoves(state) {
    if (state.phase !== "choose") return [];
    const t = state.turn;
    const out = [];
    const seen = {};
    const units = unitsOf(state, t).filter(u => !unitBlocked(state, u)); // 마비·잠든 말은 못 움직인다
    const waiting = waitingOf(state, t);
    state.pending.forEach((r, ri) => {
      if (seen[r]) return; // 같은 결과가 두 번이면 한 번만 (어느 쪽을 써도 같다)
      seen[r] = true;
      units.forEach(u => {
        const d = planForward(state, t, u, r);
        if (d) out.push(makeMove(state, t, r, ri, "n" + u.node, u.pieces, u, d));
      });
      if (r > 0 && waiting.length) {
        const from = { node: -1, route: "OUT", step: 0, atGoal: false };
        const d = planForward(state, t, from, r);
        if (d) out.push(makeMove(state, t, r, ri, "new", [waiting[0]], from, d));
      }
    });
    return out;
  }

  /* ---------- 진화 — 앞으로 간 칸 수로 5칸마다 한 단계 (v3) ---------- */
  const EVO_STEP = 5;
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
  // (v2까지의 진화 규칙 — 길의 비율. 지금은 쓰지 않지만 옛 도구와 테스트를 위해 남겨 둔다)
  function progressOf(p) {
    if (p.state === "done") return 1;
    if (p.state !== "board" || p.atGoal) return 0;
    return p.step / (ROUTES[p.route].length - 1);
  }
  const stageFor = (progress, len) => Math.max(0, Math.min(len - 1, Math.floor(progress * len + 1e-9)));
  const formOf = (state, i) => {
    const p = state.pieces[i];
    const path = state.teams[p.team].paths[p.slot];
    return path[Math.min(p.stage, path.length - 1)];
  };
  const lastStage = (s, i) => s.teams[s.pieces[i].team].paths[s.pieces[i].slot].length - 1;
  // 기술을 쓸 수 있는가 (v4, 사용자 확정 2026-09-26)
  //  - 3단계 진화 포켓몬: 마지막 모습이 되면 (10칸)
  //  - 진화 없음 · 2단계 · 전설(early): 15칸을 가야 (처음부터·5칸에 쓰면 불공평해서)
  //  - now[slot]: 시험용 — 처음부터 쓸 수 있음
  const SKILL_WALK = 15;
  const needsWalk = (s, i) => {
    const p = s.pieces[i], t = s.teams[p.team];
    return lastStage(s, i) < 2 || !!(t.early && t.early[p.slot]);
  };
  function isFinal(s, i) {
    const p = s.pieces[i], t = s.teams[p.team];
    if (t.now && t.now[p.slot]) return true;
    if (p.stage < lastStage(s, i)) return false;
    return !needsWalk(s, i) || (p.walk || 0) >= SKILL_WALK;
  }
  function srand(s) { const r = rand(s.srng || 1); s.srng = r[1]; return r[0]; }
  // 기술 배우기 — 마지막 모습이 되는 순간 후보(그 모습의 타입 기술) 중에서 무작위로 하나. 한 번 배우면 그대로
  function learn(s, ev, i) {
    const p = s.pieces[i], t = s.teams[p.team];
    if (s.settings.skills === false || p.skill || p.state === "done" || !isFinal(s, i)) return;
    const pool = ((t.pools && t.pools[p.slot]) || []).filter(k => SKILLS[k]);
    if (!pool.length) return;
    p.skill = pool[Math.floor(srand(s) * pool.length)];
    p.used = false;
    if (ev) ev.push({ type: "learn", piece: i, key: p.skill, team: p.team });
  }
  function evolveCheck(s, ev, pieces) {
    pieces.forEach(i => {
      const p = s.pieces[i];
      const last = lastStage(s, i);
      const target = p.state === "done" ? last : Math.min(last, (p.base || 0) + Math.floor((p.walk || 0) / EVO_STEP));
      if (target > p.stage) {
        ev.push({ type: "evolve", piece: i, from: p.stage, to: target });
        p.stage = target;
      }
      learn(s, ev, i);
    });
  }
  // 집으로 — 처음 모습(바꿔 들어온 말은 잡은 모습)으로, 센 칸은 0부터, 효과는 풀린다. 안 쓴 기술은 남는다
  function sendHome(s, i) {
    const p = s.pieces[i];
    Object.assign(p, { state: "wait", route: "OUT", step: 0, atGoal: false, stage: p.base || 0, walk: 0, fx: {} });
  }

  /* ---------- v3: 기술 27개 ----------
   * kind: active(내가 골라 씀) · react(때가 되면 저절로)
   * when: any(내 차례 아무 때) · throw(던지기 전) · pending(남은 결과가 있을 때)
   * target: none · enemy(상대 말 칸) · enemyPiece(상대 말) · ally(우리 말 칸) · node(빈 칸) · pending(남은 결과) · result(결과 고르기) · move(뒤로 갈 결과)
   * cat: 로켓단 쉬움은 attack·trap·random 을 안 쓴다 */
  const SKILLS = {
    metronome: { name: "손가락흔들기", type: "노말", kind: "active", when: "any", target: "none", cat: "random" },
    wish: { name: "희망사항", type: "노말", kind: "active", when: "throw", target: "result", cat: "throw" },
    nitro: { name: "니트로차지", type: "불꽃", kind: "active", when: "any", target: "none", cat: "move" },
    flame: { name: "화염방사", type: "불꽃", kind: "active", when: "any", target: "enemy", cat: "attack" },
    surf: { name: "파도타기", type: "물", kind: "active", when: "any", target: "enemy", cat: "attack" },
    rain: { name: "비바라기", type: "물", kind: "active", when: "any", target: "none", cat: "throw" },
    growth: { name: "성장", type: "풀", kind: "active", when: "pending", target: "pending", cat: "throw" },
    sleep: { name: "수면가루", type: "풀", kind: "active", when: "any", target: "enemy", cat: "attack" },
    twave: { name: "전기자석파", type: "전기", kind: "active", when: "any", target: "enemy", cat: "attack" },
    veil: { name: "오로라베일", type: "얼음", kind: "active", when: "any", target: "none", cat: "guard" },
    haze: { name: "흑안개", type: "얼음", kind: "active", when: "any", target: "none", cat: "guard" },
    counter: { name: "카운터", type: "격투", kind: "react", cat: "guard" },
    toxic: { name: "맹독", type: "독", kind: "active", when: "any", target: "none", cat: "attack" },
    quake: { name: "지진", type: "땅", kind: "active", when: "any", target: "none", cat: "attack" },
    fly: { name: "공중날기", type: "비행", kind: "active", when: "any", target: "none", cat: "move" },
    tailwind: { name: "순풍", type: "비행", kind: "active", when: "any", target: "none", cat: "move" },
    future: { name: "미래예지", type: "에스퍼", kind: "active", when: "throw", target: "result", cat: "throw" },
    allyswitch: { name: "사이드체인지", type: "에스퍼", kind: "active", when: "any", target: "ally", cat: "move" },
    uturn: { name: "유턴", type: "벌레", kind: "active", when: "pending", target: "move", cat: "move" },
    web: { name: "끈적끈적네트", type: "벌레", kind: "active", when: "any", target: "node", cat: "trap" },
    rock: { name: "스텔스록", type: "바위", kind: "active", when: "any", target: "node", cat: "trap" },
    spite: { name: "원한", type: "고스트", kind: "active", when: "any", target: "none", cat: "attack" },
    bond: { name: "길동무", type: "고스트", kind: "react", cat: "guard" },
    ddance: { name: "용의춤", type: "드래곤", kind: "active", when: "any", target: "none", cat: "move" },
    snatch: { name: "가로챈다", type: "악", kind: "active", when: "any", target: "enemyPiece", cat: "attack" },
    iron: { name: "철벽", type: "강철", kind: "react", cat: "guard" },
    moon: { name: "달빛", type: "페어리", kind: "react", cat: "guard" },
  };
  const TYPE_SKILLS = {
    "노말": ["metronome", "wish"], "불꽃": ["nitro", "flame"], "물": ["surf", "rain"], "풀": ["growth", "sleep"],
    "전기": ["twave"], "얼음": ["veil", "haze"], "격투": ["counter"], "독": ["toxic"], "땅": ["quake"],
    "비행": ["fly", "tailwind"], "에스퍼": ["future", "allyswitch"], "벌레": ["uturn", "web"], "바위": ["rock"],
    "고스트": ["spite", "bond"], "드래곤": ["ddance"], "악": ["snatch"], "강철": ["iron"], "페어리": ["moon"],
  };
  // 카운터가 되돌리는 방해 기술
  const REFLECTABLE = ["surf", "twave", "sleep", "flame", "quake", "toxic", "spite", "snatch"];
  const FLY_STOPS = [5, 10, 15, 22]; // 공중날기: 모·뒷모·찌모·방 (참먹이면 골인)

  // 저절로 기술이 나갈 수 있는가 (마비·잠이어도 나간다, 봉인이면 쉰다)
  function canReact(s, i, key) {
    const p = s.pieces[i];
    return s.settings.skills !== false && p.state === "board" && p.skill === key && !p.used && isFinal(s, i) && !isSealed(s, p.team);
  }
  function findReact(s, team, key) {
    for (let i = 0; i < s.pieces.length; i++) if (s.pieces[i].team === team && canReact(s, i, key)) return i;
    return null;
  }
  // 누르는 기술을 쓸 수 있는 말인가 (대상은 targetsFor 로 따로 본다)
  function canUse(s, i) {
    const p = s.pieces[i];
    if (s.settings.skills === false || (s.phase !== "throw" && s.phase !== "choose")) return false;
    if (p.team !== s.turn || p.state !== "board" || !p.skill || p.used || !isFinal(s, i)) return false;
    if (!SKILLS[p.skill] || SKILLS[p.skill].kind !== "active") return false;
    return s.skillTurn !== s.turnNo && !isSealed(s, p.team) && !isBlocked(s, p);
  }

  function flyPlan(s, team, u) {
    if (u.atGoal) return { finish: true, node: null, path: [] };
    const R = ROUTES[u.route], last = R.length - 1;
    for (let k = u.step + 1; k <= last; k++) {
      if (k === last) return { finish: true, node: null, path: R.slice(u.step + 1, last + 1) };
      const n = R[k];
      if (FLY_STOPS.indexOf(n) < 0) continue;
      if (veiledEnemyAt(s, team, n)) return null;
      const st = settle(u.route, n);
      return { finish: false, node: n, route: st.route, step: st.step, atGoal: false, path: R.slice(u.step + 1, k + 1) };
    }
    return null;
  }
  // 유턴: 뒤로 r칸 (거미줄에 걸리면 거기서 멈춤)
  function backPlan(s, team, u, r) {
    const list = backSteps(u, r);
    if (!list.length) return null;
    const k = list.findIndex(pos => activeTrap(s, team, pos.node, "web"));
    const end = k >= 0 ? k : list.length - 1;
    const stop = list[end];
    if (veiledEnemyAt(s, team, stop.node)) return null;
    return { finish: false, node: stop.node, route: stop.route, step: stop.step, atGoal: false, path: list.slice(0, end + 1).map(p => p.node), web: k >= 0 ? stop.node : null };
  }
  function canPushBack(s, u) {
    const nx = backSteps(u, 1)[0];
    const team = s.pieces[u.pieces[0]].team;
    return !!nx && !piecesAt(s, nx.node).some(i => s.pieces[i].team !== team);
  }
  function trapNodes(s) {
    const out = [];
    for (let n = 1; n < NODES.length; n++) {
      if (piecesAt(s, n).length || trapAt(s, n) || (s.spots || []).some(sp => !sp.used && sp.node === n)) continue;
      out.push(n);
    }
    return out;
  }
  const hasEffects = s => (s.traps || []).length > 0 ||
    s.pieces.some(p => Object.keys(fxP(p)).some(k => fxP(p)[k] >= s.turnNo)) ||
    s.teams.some(t => { const f = t.fx || {}; return f.poison || (f.seal || 0) >= s.turnNo || (f.rain || 0) >= s.turnNo; });

  // 말 i 가 기술 key 를 쓸 때 고를 수 있는 대상 (없으면 [] → 못 씀). 대상은 숫자 하나 또는 null
  function targetsFor(s, i, key) {
    const K = SKILLS[key];
    if (!K || K.kind !== "active") return [];
    if (K.when === "throw" && s.phase !== "throw") return [];
    if (K.when === "pending" && !s.pending.length) return [];
    const p = s.pieces[i], team = p.team, u = unitOfPiece(s, i);
    if (!u) return [];
    const opp = others(s, team);
    const foes = enemyUnits(s, team).filter(x => !unitVeiled(s, x));
    switch (key) {
      case "metronome": return metroPool(s, i).length ? [null] : [];
      case "nitro": return planForward(s, team, u, 2) ? [null] : [];
      case "ddance": return planForward(s, team, u, 1) ? [null] : [];
      case "fly": return flyPlan(s, team, u) ? [null] : [];
      case "flame": {
        const out = [];
        [1, 2, 3].forEach(r => {
          const d = stepMove(u, r);
          if (!d || d.finish) return;
          if (foes.some(x => x.node === d.node) && out.indexOf(d.node) < 0) out.push(d.node);
        });
        return out;
      }
      case "surf": return foes.filter(x => canPushBack(s, x)).map(x => x.node);
      case "quake": return foes.some(x => canPushBack(s, x)) ? [null] : [];
      case "twave": case "sleep": return foes.filter(x => !unitBlocked(s, x)).map(x => x.node);
      case "toxic": return opp.some(t => !teamFx(s, t).poison) ? [null] : [];
      case "spite": return opp.some(t => !isSealed(s, t)) ? [null] : [];
      case "snatch": return s.pieces.map((q, j) => j).filter(j => {
        const q = s.pieces[j];
        return q.team !== team && q.state !== "done" && q.skill && !q.used && !(q.state === "board" && isVeiled(s, q));
      });
      case "veil": return unitVeiled(s, u) ? [] : [null];
      case "haze": return hasEffects(s) ? [null] : [];
      case "rain": return isRaining(s, team) ? [] : [null];
      case "tailwind": return unitsOf(s, team).some(x => { const d = stepMove(x, 1); return d && (d.finish || !piecesAt(s, d.node).some(j => s.pieces[j].team !== team)); }) ? [null] : [];
      case "allyswitch": return unitsOf(s, team).filter(x => x.node !== u.node).map(x => x.node);
      case "rock": case "web": return trapNodes(s);
      case "growth": {
        const seen = {};
        return s.pending.map((r, ri) => ri).filter(ri => { const r = s.pending[ri]; if (r === 5 || seen[r]) return false; seen[r] = 1; return true; });
      }
      case "wish": return [1, 2, 3, 4, 5];
      case "future": return s.guess ? [] : (s.settings.backdo ? [-1, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5]);
      case "uturn": {
        const out = [];
        s.pending.forEach(r => { if (r > 0 && out.indexOf(r) < 0 && backPlan(s, team, u, r)) out.push(r); });
        return out;
      }
    }
    return [];
  }
  // 손가락흔들기로 나올 수 있는 기술: 지금 쓸 수 있는 누르는 기술 (자기 자신·유턴 빼고)
  function metroPool(s, i) {
    return Object.keys(SKILLS).filter(k => k !== "metronome" && k !== "uturn" && SKILLS[k].kind === "active" && targetsFor(s, i, k).length);
  }
  function legalSkills(state) {
    const out = [];
    state.pieces.forEach((p, i) => {
      if (!canUse(state, i)) return;
      const tg = targetsFor(state, i, p.skill);
      if (tg.length) out.push({ piece: i, key: p.skill, target: SKILLS[p.skill].target, targets: tg });
    });
    return out;
  }

  /* ---------- 움직이기 (윷 이동과 기술 이동이 같이 쓴다) ---------- */
  // 잡을 때: 🛡️ 철벽은 부르는 쪽에서 먼저 본다. 🌙 달빛 = 그 말만 한 칸 뒤로, 👻 길동무 = 잡은 말도 집으로
  function moonSpot(s, q) {
    let cur = { route: q.route, step: q.step, atGoal: q.atGoal };
    for (let k = 0; k < 25; k++) {
      const nx = backSteps(cur, 1)[0];
      if (!nx) return null;
      if (!piecesAt(s, nx.node).some(j => s.pieces[j].team !== q.team)) return nx;
      cur = nx;
    }
    return null;
  }
  function captureAt(s, ev, team, attackers, victims, node, info) {
    info = info || {};
    const saved = [];
    let bondBy = null;
    victims.forEach(j => {
      if (canReact(s, j, "moon")) {
        s.pieces[j].used = true;
        const pos = moonSpot(s, s.pieces[j]);
        if (pos) saved.push({ piece: j, pos });
      } else if (bondBy == null && canReact(s, j, "bond")) {
        bondBy = j;
        s.pieces[j].used = true;
      }
    });
    victims.forEach(j => {
      const sv = saved.find(x => x.piece === j);
      if (sv) { Object.assign(s.pieces[j], { route: sv.pos.route, step: sv.pos.step, atGoal: false }); unify(s, sv.pos.node, s.pieces[j].team, sv.pos); }
      else sendHome(s, j);
    });
    s.throwsLeft += 1; // 잡으면 한 번 더
    ev.push({ type: "capture", node, by: attackers.slice(), victims: victims.slice(), saved: saved.map(x => x.piece), remote: !!info.remote, skill: info.skill || null });
    saved.forEach(x => ev.push({ type: "moon", piece: x.piece, from: node, to: x.pos.node, team: s.pieces[x.piece].team }));
    if (bondBy != null) {
      const at = posOf(s.pieces[attackers[0]]);
      attackers.forEach(j => sendHome(s, j));
      ev.push({ type: "bond", piece: bondBy, pieces: attackers.slice(), node: at, team });
    }
  }
  // opt: { skill, fly(거미줄 무시), back(뒤로 가는 이동 — 진화 칸 수에 안 셈) }
  function doMove(s, ev, team, m, opt) {
    opt = opt || {};
    const back = !!opt.back || m.result < 0;
    ev.push({ type: "move", team, result: m.result, unit: m.unit, pieces: m.pieces.slice(), path: m.path.slice(), from: m.from, to: m.to, finish: m.finish,
      web: m.web || null, fly: !!opt.fly, back, skill: opt.skill || null });
    let captured = false;
    if (m.finish) {
      m.pieces.forEach(i => Object.assign(s.pieces[i], { state: "done", atGoal: false, fx: {} }));
    } else {
      // 🛡️ 철벽 — 잡으러 온 말이 온 자리로 튕겨 나간다 (한 번 더도 없음)
      if (m.capture.length) {
        const ir = m.capture.find(j => canReact(s, j, "iron"));
        if (ir != null) {
          s.pieces[ir].used = true;
          ev.push({ type: "block", piece: ir, node: m.to.node, pieces: m.pieces.slice(), team, back: m.unit === "new" ? null : m.from.node });
          return { blocked: true };
        }
      }
      m.pieces.forEach(i => Object.assign(s.pieces[i], { state: "board", route: m.to.route, step: m.to.step, atGoal: m.to.atGoal }));
      if (m.web) { removeTrap(s, m.web); ev.push({ type: "webstop", node: m.web, pieces: m.pieces.slice(), team }); }
      // 🪨 바위 — 빈 칸에 멈추면 집으로
      if (!m.capture.length && !m.stack.length) {
        const rk = trapAt(s, m.to.node, "rock");
        if (rk && rk.team !== team) {
          removeTrap(s, m.to.node);
          m.pieces.forEach(i => sendHome(s, i));
          ev.push({ type: "rock", node: m.to.node, pieces: m.pieces.slice(), team });
          return { rocked: true };
        }
      }
      if (m.capture.length) { captureAt(s, ev, team, m.pieces, m.capture, m.to.node, {}); captured = true; }
      if (m.stack.length && m.pieces.every(i => s.pieces[i].state === "board")) {
        m.stack.forEach(i => Object.assign(s.pieces[i], { route: m.to.route, step: m.to.step, atGoal: m.to.atGoal }));
        ev.push({ type: "stack", node: m.to.node, pieces: m.pieces.concat(m.stack) });
      }
    }
    // 진화 — 앞으로 간 칸 수. 5칸마다 한 단계 (뒤로 간 칸은 빼지 않는다, 잡히면 0부터)
    const alive = m.pieces.filter(i => s.pieces[i].state !== "wait");
    if (!back) alive.forEach(i => { s.pieces[i].walk = (s.pieces[i].walk || 0) + m.path.length; });
    evolveCheck(s, ev, alive);
    // ❓ 풀숲 — 딱 멈춘 칸이 아직 안 쓴 풀숲이면 야생 포켓몬 (지나가기·골인 이동은 해당 없음, 한 칸에 한 번)
    // 진화한 뒤에 나오도록 evolve 다음에 둔다
    if (!m.finish && s.spots && m.pieces.every(i => s.pieces[i].state === "board")) {
      const sp = s.spots.find(x => !x.used && x.node === m.to.node);
      if (sp) {
        sp.used = true;
        sp.by = team;
        ev.push({ type: "wild", team, node: sp.node, id: sp.id, pieces: m.pieces.slice() });
      }
    }
    if (m.finish) ev.push({ type: "finish", team, pieces: m.pieces.slice() });
    if (captured) ev.push({ type: "bonus", team });
    return { captured };
  }
  // 뒤로 밀기 (파도타기·지진): 한 칸씩, 다른 팀 말이 있는 칸 앞에서 멈춤, 1칸째보다 뒤로는 안 감. 풀숲·함정은 안 걸림
  function pushUnit(s, ev, u, n, byTeam, key) {
    const team = s.pieces[u.pieces[0]].team;
    const path = [];
    let cur = { route: u.route, step: u.step, atGoal: u.atGoal };
    for (let k = 0; k < n; k++) {
      const nx = backSteps(cur, 1)[0];
      if (!nx || piecesAt(s, nx.node).some(i => s.pieces[i].team !== team)) break;
      cur = nx;
      path.push(nx.node);
    }
    if (path.length) { u.pieces.forEach(i => Object.assign(s.pieces[i], { route: cur.route, step: cur.step, atGoal: false })); unify(s, cur.node, team, cur); }
    ev.push({ type: "push", team, pieces: u.pieces.slice(), from: u.node, to: path.length ? path[path.length - 1] : u.node, path, by: byTeam, skill: key });
  }
  function setStatus(s, ev, pieces, kind, until, key) {
    pieces.forEach(i => { pfx(s.pieces[i])[kind] = until; });
    ev.push({ type: "status", kind, pieces: pieces.slice(), node: posOf(s.pieces[pieces[0]]), team: s.pieces[pieces[0]].team, skill: key });
  }
  // 순풍: 판 위의 우리 말이 모두 한 칸씩 (잡지 않음 — 상대가 바로 앞이면 그 말은 그대로. 풀숲·함정 안 걸림)
  function tailwind(s, ev, team) {
    const rem = x => x.atGoal ? 0 : remainingOf(x.route, x.step);
    unitsOf(s, team).sort((a, b) => rem(a) - rem(b)).forEach(x => {
      const d = stepMove(x, 1);
      if (!d || (!d.finish && piecesAt(s, d.node).some(j => s.pieces[j].team !== team))) return;
      const stack = d.finish ? [] : piecesAt(s, d.node).filter(j => x.pieces.indexOf(j) < 0);
      ev.push({ type: "move", team, result: 1, unit: "n" + x.node, pieces: x.pieces.slice(), path: d.path.slice(),
        from: { node: x.node, route: x.route, step: x.step, atGoal: !!x.atGoal }, to: d.finish ? null : { node: d.node, route: d.route, step: d.step, atGoal: d.atGoal },
        finish: d.finish, web: null, fly: false, back: false, skill: "tailwind" });
      if (d.finish) x.pieces.forEach(i => Object.assign(s.pieces[i], { state: "done", atGoal: false, fx: {} }));
      else {
        x.pieces.forEach(i => Object.assign(s.pieces[i], { route: d.route, step: d.step, atGoal: d.atGoal }));
        unify(s, d.node, team, d);
        if (stack.length) ev.push({ type: "stack", node: d.node, pieces: x.pieces.concat(stack) });
      }
      x.pieces.forEach(i => { s.pieces[i].walk = (s.pieces[i].walk || 0) + 1; });
      evolveCheck(s, ev, x.pieces);
      if (d.finish) ev.push({ type: "finish", team, pieces: x.pieces.slice() });
    });
  }
  // 카운터가 되돌린 기술 — 기술을 쓴 말(과 그 팀)이 당한다. 되돌린 효과에는 또 반응하지 않는다
  function reflect(s, ev, i, key, byTeam) {
    const team = s.pieces[i].team, u = unitOfPiece(s, i);
    const open = u && !unitVeiled(s, u);
    if (key === "surf" && open) pushUnit(s, ev, u, 2, byTeam, key);
    else if (key === "quake") {
      const plans = unitsOf(s, team).filter(x => !unitVeiled(s, x));
      plans.forEach(x => pushUnit(s, ev, x, 1, byTeam, key));
    } else if (key === "twave" && open) setStatus(s, ev, u.pieces, "para", untilFor(s, team, 1), key);
    else if (key === "sleep" && open) setStatus(s, ev, u.pieces, "sleep", untilFor(s, team, 2), key);
    else if (key === "flame" && open) {
      const node = u.node;
      u.pieces.forEach(j => sendHome(s, j));
      ev.push({ type: "home", pieces: u.pieces.slice(), node, team, skill: key });
    } else if (key === "toxic") { teamFx(s, team).poison = true; ev.push({ type: "status", kind: "poison", team, pieces: [], skill: key }); }
    else if (key === "spite") { teamFx(s, team).seal = untilFor(s, team, 3); ev.push({ type: "status", kind: "seal", team, pieces: [], skill: key }); }
    // 가로챈다는 막기만 한다
  }
  function effect(s, ev, i, key, tg) {
    const p = s.pieces[i], team = p.team;
    const u = unitOfPiece(s, i);
    const foeAt = n => enemyUnits(s, team).find(x => x.node === n);
    // 🛡️ 철벽은 화염방사도 막는다
    if (key === "flame") {
      const x = foeAt(tg);
      const ir = x.pieces.find(j => canReact(s, j, "iron"));
      if (ir != null) {
        s.pieces[ir].used = true;
        ev.push({ type: "block", piece: ir, node: tg, pieces: u.pieces.slice(), team, remote: true, back: u.node });
        return;
      }
    }
    // 🥊 카운터 — 상대 팀에 준비된 카운터가 있으면 방해 기술을 되돌린다
    if (REFLECTABLE.indexOf(key) >= 0) {
      const vt = key === "snatch" ? s.pieces[tg].team : tg != null && foeAt(tg) ? s.pieces[foeAt(tg).pieces[0]].team : others(s, team)[0];
      const c = findReact(s, vt, "counter");
      if (c != null) {
        s.pieces[c].used = true;
        ev.push({ type: "reflect", piece: c, key, team: vt, by: i });
        reflect(s, ev, i, key, vt);
        return;
      }
    }
    const opp = others(s, team);
    switch (key) {
      case "nitro": case "ddance": {
        const n = key === "nitro" ? 2 : 1;
        const d = planForward(s, team, u, n);
        doMove(s, ev, team, makeMove(s, team, n, -1, "n" + u.node, u.pieces, u, d), { skill: key });
        if (key === "ddance") { s.throwsLeft += 1; ev.push({ type: "again", team, skill: key }); }
        break;
      }
      case "fly": {
        const d = flyPlan(s, team, u);
        doMove(s, ev, team, makeMove(s, team, d.path.length, -1, "n" + u.node, u.pieces, u, d), { skill: key, fly: true });
        break;
      }
      case "uturn": {
        const d = backPlan(s, team, u, tg);
        s.pending.splice(s.pending.indexOf(tg), 1);
        doMove(s, ev, team, makeMove(s, team, tg, -1, "n" + u.node, u.pieces, u, d), { skill: key, back: true });
        break;
      }
      case "flame": {
        const x = foeAt(tg);
        captureAt(s, ev, team, u.pieces, x.pieces, tg, { remote: true, skill: key });
        ev.push({ type: "bonus", team });
        break;
      }
      case "surf": pushUnit(s, ev, foeAt(tg), 2, team, key); break;
      case "quake": {
        // 모두 한꺼번에 (원래 자리 기준) — 붙어 있던 말끼리 밀려서 엉키지 않게
        const plans = enemyUnits(s, team).filter(x => !unitVeiled(s, x));
        const evs = [];
        const moves = plans.map(x => { const tmp = []; pushUnit(clone(s), tmp, x, 1, team, key); return tmp[0]; });
        plans.forEach((x, k) => {
          const e = moves[k];
          if (e.path.length) {
            const nx = backSteps(x, 1)[0];
            x.pieces.forEach(j => Object.assign(s.pieces[j], { route: nx.route, step: nx.step, atGoal: false }));
            unify(s, nx.node, s.pieces[x.pieces[0]].team, nx);
          }
          evs.push(e);
        });
        evs.forEach(e => ev.push(e));
        break;
      }
      case "twave": { const x = foeAt(tg); setStatus(s, ev, x.pieces, "para", untilFor(s, s.pieces[x.pieces[0]].team, 1), key); break; }
      case "sleep": { const x = foeAt(tg); setStatus(s, ev, x.pieces, "sleep", untilFor(s, s.pieces[x.pieces[0]].team, 2), key); break; }
      case "toxic": opp.forEach(t => { teamFx(s, t).poison = true; ev.push({ type: "status", kind: "poison", team: t, pieces: [], skill: key }); }); break;
      case "spite": opp.forEach(t => { teamFx(s, t).seal = untilFor(s, t, 3); ev.push({ type: "status", kind: "seal", team: t, pieces: [], skill: key }); }); break;
      case "snatch": {
        const q = s.pieces[tg], k2 = q.skill;
        q.used = true;
        p.skill = k2;
        p.used = false;
        ev.push({ type: "steal", piece: i, from: tg, key: k2, team });
        break;
      }
      case "veil": setStatus(s, ev, u.pieces, "veil", untilFor(s, opp[0], 2), key); break;
      case "haze":
        s.pieces.forEach(q => { q.fx = {}; });
        s.teams.forEach(t => { t.fx = {}; });
        s.traps = [];
        ev.push({ type: "haze", team });
        break;
      case "rain":
        teamFx(s, team).rain = s.turnNo + s.teams.length * 2; // 이번 차례 포함 우리 차례 세 번
        ev.push({ type: "status", kind: "rain", team, pieces: [], skill: key });
        break;
      case "tailwind": tailwind(s, ev, team); break;
      case "allyswitch": {
        const v = unitsOf(s, team).find(x => x.node === tg);
        const a = { route: u.route, step: u.step, atGoal: u.atGoal }, b = { route: v.route, step: v.step, atGoal: v.atGoal };
        u.pieces.forEach(j => Object.assign(s.pieces[j], b));
        v.pieces.forEach(j => Object.assign(s.pieces[j], a));
        ev.push({ type: "switch", team, a: u.pieces.slice(), b: v.pieces.slice(), na: u.node, nb: v.node });
        break;
      }
      case "rock": case "web":
        (s.traps = s.traps || []).push({ node: tg, kind: key, team });
        ev.push({ type: "trap", kind: key, node: tg, team });
        break;
      case "growth": {
        const r = s.pending[tg], nr = r === BACKDO ? 1 : Math.min(5, r + 1);
        s.pending[tg] = nr; // 기술로 만든 윷·모는 한 번 더 없음
        ev.push({ type: "grow", team, ri: tg, from: r, to: nr });
        break;
      }
      case "wish":
        s.pending.push(tg); // 던지기 한 번을 대신한다 — 윷·모를 골라도 한 번 더 없음
        s.throwsLeft -= 1;
        s.lastThrow = { result: tg, sticks: sticksFor(tg) };
        ev.push({ type: "wish", team, result: tg });
        break;
      case "future":
        s.guess = { team, r: tg };
        ev.push({ type: "guess", team, r: tg });
        break;
    }
  }
  function closeAction(s, ev) {
    if (s.phase !== "over" && teamDone(s, s.turn)) {
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
  // 기술 쓰기 — 대상은 targetsFor 가 준 값 중 하나 (없는 기술은 null)
  function applySkill(state, i, target) {
    const entry = legalSkills(state).find(x => x.piece === i);
    if (!entry) throw new Error("쓸 수 없는 기술: " + i);
    const tg = target === undefined ? null : target;
    if (!entry.targets.some(x => x === tg)) throw new Error("대상이 맞지 않음: " + JSON.stringify(tg));
    const s = clone(state);
    const ev = [];
    const p = s.pieces[i];
    p.used = true;
    s.skillTurn = s.turnNo; // 한 차례에 기술 하나
    ev.push({ type: "skill", piece: i, key: p.skill, team: p.team, target: tg });
    if (p.skill === "metronome") {
      const pool = metroPool(s, i);
      const key = pool[Math.floor(srand(s) * pool.length)];
      const t2 = bestTarget(s, i, key);
      ev.push({ type: "metronome", piece: i, key, target: t2, team: p.team });
      effect(s, ev, i, key, t2);
    } else effect(s, ev, i, p.skill, tg);
    return closeAction(s, ev);
  }

  /* ---------- v3: 말 바꾸기 — ❓ 풀숲에서 잡은 포켓몬을 그 자리에 ----------
   * o: { id, path(1단계부터 끝까지), base(path 안에서 잡은 모습의 단계), pool, early }
   * 바뀐 말이 간 칸 수를 이어받아 곧바로 진화한다. 기술은 새로 배운다 */
  function swapOk(s, i, root) {
    const p = s.pieces[i];
    if (!p || p.state === "done") return false;
    return !s.teams.some((t, ti) => t.paths.some((pp, k) => !(ti === p.team && k === p.slot) && pp[0] === root));
  }
  function applySwap(state, i, o) {
    if (!o || !Array.isArray(o.path) || !o.path.length || o.path.indexOf(o.id) < 0) throw new Error("바꿀 포켓몬이 이상함");
    if (!swapOk(state, i, o.path[0])) throw new Error("바꿀 수 없는 말 (골인했거나 같은 가족이 있음): " + i);
    const s = clone(state);
    const ev = [];
    const p = s.pieces[i], t = s.teams[p.team];
    const from = formOf(s, i);
    t.picks[p.slot] = o.id;
    t.paths[p.slot] = o.path.slice();
    (t.pools = t.pools || [])[p.slot] = (o.pool || []).slice();
    (t.early = t.early || [])[p.slot] = !!o.early;
    if (t.now) t.now[p.slot] = false;
    const base = o.base != null ? o.base : o.path.indexOf(o.id);
    Object.assign(p, { base, stage: base, skill: null, used: false, fx: {} });
    if (p.state !== "board") p.walk = 0;
    ev.push({ type: "swap", piece: i, from, to: o.id, team: p.team });
    evolveCheck(s, ev, [i]);
    return { state: s, events: ev };
  }
  // 로켓단이 잡은 포켓몬을 넣을 말: 기술을 다 쓴 말 → 집에 있는 말 → (prefer) 멈춘 말
  function cpuSwapTarget(s, team, root, prefer) {
    const cand = s.pieces.map((p, i) => i).filter(i => s.pieces[i].team === team && swapOk(s, i, root));
    if (!cand.length) return null;
    const used = cand.find(i => s.pieces[i].state === "board" && s.pieces[i].skill && s.pieces[i].used);
    if (used != null) return used;
    const wait = cand.find(i => s.pieces[i].state === "wait");
    if (wait != null) return wait;
    return cand.indexOf(prefer) >= 0 ? prefer : cand[0];
  }

  /* ---------- 판 만들기·던지기·두기 ---------- */
  function newGame(o, evoFrom) {
    const n = o.pieces || 4;
    const seed = (o.seed >>> 0) || 1;
    const s = {
      v: 2,
      seed,
      rng: seed,
      srng: ((seed ^ 0x5ca1ab1e) >>> 0) || 1, // 기술 뽑기 난수 — 윷 던지기 흐름과 따로
      settings: { pieces: n, backdo: o.backdo !== false, mode: o.mode || "family", cpuLevel: o.cpuLevel || "normal", battle: o.battle !== false, skills: o.skills !== false }, // battle: 배틀 장면 보기 (화면 쪽 설정)
      teams: o.teams.map(t => ({
        name: t.name, color: t.color, cpu: !!t.cpu, key: t.key || null,
        picks: t.picks.slice(0, n),
        // 진화 경로: 화면 쪽이 정해 넘기면 그대로 (사람 팀은 마지막 모습까지), 없으면 고른 모습까지
        paths: Array.isArray(t.paths) && t.paths.length >= n ? t.paths.slice(0, n) : t.picks.slice(0, n).map(id => evoPath(id, evoFrom)),
        // 기술 후보(말마다) — 화면 쪽이 타입을 보고 정해 넘긴다 (엔진은 포켓몬 데이터를 모른다)
        pools: Array.from({ length: n }, (_, k) => (Array.isArray(t.pools) && Array.isArray(t.pools[k]) ? t.pools[k].filter(x => SKILLS[x]) : [])),
        early: Array.from({ length: n }, (_, k) => !!(Array.isArray(t.early) && t.early[k])), // 전설: 15칸 가야 기술 (v4)
        now: Array.from({ length: n }, (_, k) => !!(Array.isArray(t.now) && t.now[k])),       // 시험용: 처음부터 기술
        fx: {},
      })),
      pieces: [],
      turn: o.first || 0,
      phase: "throw",
      pending: [],
      throwsLeft: 1,
      turnNo: 1,
      winner: null,
      lastThrow: null,
      // ❓ 풀숲 칸 — 어느 칸·어떤 포켓몬인지는 화면 쪽이 정해서 넘긴다 (엔진은 포켓몬 데이터를 모른다)
      spots: (o.spots || []).map(sp => ({ node: sp.node, id: sp.id, used: false })),
      traps: [],
      skillTurn: 0,
      guess: null,
    };
    s.teams.forEach((t, ti) => {
      for (let k = 0; k < n; k++) s.pieces.push({ team: ti, slot: k, state: "wait", route: "OUT", step: 0, atGoal: false, stage: 0, walk: 0, base: 0, skill: null, used: false, fx: {} });
    });
    s.pieces.forEach((_, i) => learn(s, null, i)); // 시험용(now)만 처음부터
    return s;
  }

  function teamDone(s, t) { return s.pieces.every(p => p.team !== t || p.state === "done"); }

  function endTurn(s, ev) {
    s.turn = (s.turn + 1) % s.teams.length;
    s.phase = "throw";
    s.throwsLeft = 1;
    s.pending = [];
    s.turnNo++;
    s.guess = null;
    // 끝난 효과는 치운다 (화면 표시가 깔끔하게)
    s.pieces.forEach(p => { const f = p.fx; if (f) ["para", "sleep", "veil"].forEach(k => { if (f[k] && f[k] < s.turnNo) delete f[k]; }); });
    s.teams.forEach(t => { const f = t.fx; if (f) ["seal", "rain"].forEach(k => { if (f[k] && f[k] < s.turnNo) delete f[k]; }); });
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
    let res = t.result, poisoned = false, rained = null;
    const tf = teamFx(s, s.turn);
    if (tf.poison) { tf.poison = false; poisoned = true; res = s.settings.backdo ? BACKDO : 1; } // ☠️ 맹독: 다음 윷이 빽도 (빽도를 끈 판이면 도)
    if (isRaining(s, s.turn) && (res === 1 || res === BACKDO)) { rained = res; res = 2; }       // 🌧️ 비: 도·빽도 → 개
    const sticks = res === t.result ? t.sticks : sticksFor(res);
    s.pending.push(res);
    s.throwsLeft -= 1;
    if (RESULTS[res].again) s.throwsLeft += 1;
    s.lastThrow = { result: res, sticks };
    ev.push({ type: "throw", team: s.turn, result: res, sticks, again: RESULTS[res].again, poisoned, rained });
    // 🔮 미래예지: 맞히면 한 번 더
    if (s.guess && s.guess.team === s.turn) {
      const ok = s.guess.r === res;
      if (ok) s.throwsLeft += 1;
      ev.push({ type: "foresee", team: s.turn, guess: s.guess.r, result: res, ok });
      s.guess = null;
    }
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
    doMove(s, ev, s.turn, m, {});
    return closeAction(s, ev);
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
      if (state.spots && state.spots.some(sp => !sp.used && sp.node === m.to.node)) v += 15; // ❓ 풀숲을 먼저 밟기
      if (m.rock) v -= 90 * n;                                                               // 🪨 상대 바위는 피하기
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
  // 기술의 쓸모 (로켓단이 고를 때, 손가락흔들기가 대상을 고를 때)
  function scoreSkill(s, i, key, tg) {
    const p = s.pieces[i], team = p.team, u = unitOfPiece(s, i);
    if (!u) return -999;
    const rem = x => x.atGoal ? 1 : remainingOf(x.route, x.step);
    const foeAt = n => enemyUnits(s, team).find(x => x.node === n);
    const moveValue = d => {
      if (!d) return -999;
      if (d.finish) return 70 * u.pieces.length;
      let v = (rem(u) - (d.atGoal ? 1 : remainingOf(d.route, d.step))) * 3;
      v += 100 * piecesAt(s, d.node).filter(j => s.pieces[j].team !== team).length;
      if (d.node === 5 || d.node === 10 || d.node === 22) v += 20;
      if (activeTrap(s, team, d.node, "rock")) v -= 150;
      return v;
    };
    const trapValue = node => {
      const P = resultProbs(s.settings.backdo);
      let v = 0;
      enemyUnits(s, team).forEach(x => [1, 2, 3, 4, 5].forEach(r => { const d = stepMove(x, r); if (d && !d.finish && d.node === node) v += P[r]; }));
      others(s, team).forEach(t => { if (waitingOf(s, t).length && node >= 1 && node <= 5) v += P[node] * 0.5; });
      return 5 + v * (key === "rock" ? 70 : 45);
    };
    switch (key) {
      case "nitro": return 8 + moveValue(planForward(s, team, u, 2));
      case "ddance": return 25 + moveValue(planForward(s, team, u, 1));
      case "fly": return moveValue(flyPlan(s, team, u));
      case "uturn": { const d = backPlan(s, team, u, tg); return d && piecesAt(s, d.node).some(j => s.pieces[j].team !== team) ? 110 : -5; }
      case "flame": { const x = foeAt(tg); return 110 + (20 - rem(x)); }
      case "surf": { const x = foeAt(tg); return 10 + (20 - rem(x)) + 6 * x.pieces.length; }
      case "quake": return 9 * enemyUnits(s, team).filter(x => !unitVeiled(s, x) && canPushBack(s, x)).reduce((t, x) => t + x.pieces.length, 0);
      case "twave": { const x = foeAt(tg); return 8 + (20 - rem(x)) + 4 * x.pieces.length; }
      case "sleep": { const x = foeAt(tg); return 12 + (20 - rem(x)) + 5 * x.pieces.length; }
      case "toxic": return 22;
      case "spite": return s.pieces.some(q => q.team !== team && q.skill && !q.used) ? 30 : 6;
      case "snatch": return 40;
      case "rock": case "web": return trapValue(tg);
      case "veil": return threat(s, u.node, team) > 0.25 ? 35 : 4;
      case "haze": {
        let v = 0;
        s.pieces.forEach(q => { const f = fxP(q); if (q.team === team && ((f.para || 0) >= s.turnNo || (f.sleep || 0) >= s.turnNo)) v += 14; if (q.team !== team && (f.veil || 0) >= s.turnNo) v += 8; });
        (s.traps || []).forEach(t => { if (t.team !== team) v += 12; });
        const f = s.teams[team].fx || {};
        if (f.poison) v += 16;
        if ((f.seal || 0) >= s.turnNo) v += 12;
        return v;
      }
      case "rain": return 16;
      case "tailwind": return 6 * unitsOf(s, team).length;
      case "allyswitch": return 0;
      case "growth": return 12;
      case "wish": return 10 + 3 * tg;
      case "future": return tg === 2 || tg === 3 ? 14 : 2;
      case "metronome": return 18;
    }
    return 0;
  }
  function bestTarget(s, i, key) {
    const tg = targetsFor(s, i, key);
    let best = tg[0], bv = -Infinity;
    tg.forEach(t => { const v = scoreSkill(s, i, key, t); if (v > bv) { bv = v; best = t; } });
    return best;
  }
  // 로켓단 기술: 쉬움은 방해 기술을 안 쓰고 가끔만 (30%), 보통은 쓸모 있을 때 (가끔은 아낀다)
  function cpuSkill(state, level, rnd) {
    rnd = rnd || Math.random;
    const list = legalSkills(state);
    if (!list.length) return null;
    const cand = [];
    list.forEach(x => {
      const cat = SKILLS[x.key].cat;
      if (level === "easy" && (cat === "attack" || cat === "trap" || cat === "random")) return;
      x.targets.forEach(tg => cand.push({ piece: x.piece, key: x.key, target: tg, v: scoreSkill(state, x.piece, x.key, tg) }));
    });
    if (!cand.length) return null;
    cand.sort((a, b) => b.v - a.v);
    const best = cand[0];
    if (level === "easy") return rnd() < 0.3 && best.v > 0 ? best : null;
    if (best.v < 15) return null;
    if (level === "normal" && rnd() < 0.25) return null;
    return best;
  }

  /* ---------- 저장본 검사 (망가진 판은 버린다) ---------- */
  function validate(s) {
    try {
      if (!s || s.v !== 2 || !Array.isArray(s.teams) || s.teams.length < 2 || !Array.isArray(s.pieces)) return false;
      if (["throw", "choose", "over"].indexOf(s.phase) < 0 || !Array.isArray(s.pending)) return false;
      if (s.pieces.length !== s.teams.length * s.settings.pieces) return false;
      if (s.teams.some(t => !Array.isArray(t.paths) || t.paths.length !== s.settings.pieces || t.paths.some(p => !p.length))) return false;
      if (s.teams.some(t => !Array.isArray(t.pools) || !Array.isArray(t.early) || t.pools.some(p => !Array.isArray(p) || p.some(k => !SKILLS[k])))) return false;
      if (s.spots != null && (!Array.isArray(s.spots) || s.spots.some(sp =>
        !sp || !NODES[sp.node] || !(sp.id == null || (sp.id >= 1 && sp.id <= 1025)) || typeof sp.used !== "boolean"))) return false;
      if (!Array.isArray(s.traps) || s.traps.some(t => !t || !(t.node >= 1 && t.node < NODES.length) || (t.kind !== "rock" && t.kind !== "web") || !s.teams[t.team])) return false;
      return s.pieces.every(p =>
        ["wait", "board", "done"].indexOf(p.state) >= 0 && ROUTES[p.route] &&
        p.step >= 0 && p.step < ROUTES[p.route].length && p.team >= 0 && p.team < s.teams.length &&
        p.walk >= 0 && p.base >= 0 && p.base < s.teams[p.team].paths[p.slot].length && p.stage >= 0 &&
        (p.skill == null || !!SKILLS[p.skill]) && typeof p.used === "boolean" && p.fx && typeof p.fx === "object") &&
        s.pending.every(r => RESULTS[r]);
    } catch (e) { return false; }
  }
  // 옛 저장(v1, 기술 전)을 v2 로 — 옛 판은 기술 없이 그대로 이어 한다
  function upgrade(s) {
    if (!s || typeof s !== "object" || s.v !== 1 || !Array.isArray(s.teams) || !Array.isArray(s.pieces)) return s;
    const u = clone(s);
    u.v = 2;
    u.settings = Object.assign({}, u.settings, { skills: false });
    u.srng = ((u.seed ^ 0x5ca1ab1e) >>> 0) || 1;
    u.teams.forEach(t => {
      const n = (t.paths || []).length;
      t.pools = Array.from({ length: n }, () => []);
      t.early = Array.from({ length: n }, () => false);
      t.fx = {};
    });
    u.pieces.forEach(p => Object.assign(p, { walk: p.state === "board" && !p.atGoal ? p.step : 0, base: 0, skill: null, used: false, fx: {} }));
    u.traps = [];
    u.skillTurn = 0;
    u.guess = null;
    return u;
  }

  /* ---------- ❓ 풀숲 칸 고르기 ----------
   * 바깥 길의 보통 칸 중에서 (출발 바로 옆 1·2번, 모서리·방·참먹이, 들어가기 어려운 대각선은 뺀다)
   * 두 칸이 서로 붙지 않게 */
  const SPOT_NODES = [3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19];
  const neighbors = {};
  LINES.forEach(l => l.forEach((n, i) => {
    if (i > 0) { (neighbors[n] = neighbors[n] || []).push(l[i - 1]); (neighbors[l[i - 1]] = neighbors[l[i - 1]] || []).push(n); }
  }));
  function pickSpotNodes(rnd, count) {
    const out = [];
    for (let tries = 0; out.length < (count || 2) && tries < 200; tries++) {
      const n = SPOT_NODES[Math.floor(rnd() * SPOT_NODES.length)];
      if (out.indexOf(n) >= 0 || out.some(o => (neighbors[o] || []).indexOf(n) >= 0)) continue;
      out.push(n);
    }
    return out;
  }
  // 화면 쪽에서 쓰는 시드 난수 함수 (판 흐름과 따로)
  function rng(seed) {
    let st = (seed >>> 0) || 1;
    return () => { const r = rand(st); st = r[1]; return r[0]; };
  }

  /* ---------- 보물상자·볼·야생 포켓몬 확률 (v2) ----------
   * 볼 5단계: 상자에서 50·30·10·5·5, 잡을 확률 60% + 단계마다 5% (마스터볼만 원작처럼 100%) */
  const BALLS = ["poke", "great", "ultra", "luxury", "master"];
  const BALL_INFO = {
    poke: { name: "몬스터볼", img: "poke-ball", odds: 50 },
    great: { name: "슈퍼볼", img: "great-ball", odds: 30 },
    ultra: { name: "하이퍼볼", img: "ultra-ball", odds: 10 },
    luxury: { name: "럭셔리볼", img: "luxury-ball", odds: 5 },
    master: { name: "마스터볼", img: "master-ball", odds: 5 },
  };
  const WILD_ODDS = { c: 50, r: 30, u: 10, l: 10 }; // ❓ 풀숲에서 나오는 희귀도 (사용자 확정 2026-09-25)
  const WILD_ODDS_BOOST = { c: 30, r: 30, u: 20, l: 20 }; // 🕐 시계 문제를 맞히면 그 조우만 (사용자 확정 2026-09-26: 유니크·전설 +10, 일반 −20)
  const Rewards = {
    BALLS, BALL_INFO, WILD_ODDS, WILD_ODDS_BOOST, BOX_SIZE: 3, THROWS: 3, UNOWNED_FIRST: 0.5,
    catchRate(ball) { return ball === "master" ? 1 : 0.6 + 0.05 * Math.max(0, BALLS.indexOf(ball)); },
    // 상자 하나 = 볼 n개, 한 개씩 따로 뽑는다
    rollBox(n, rnd) {
      const total = BALLS.reduce((t, b) => t + BALL_INFO[b].odds, 0);
      const out = [];
      for (let i = 0; i < n; i++) {
        let x = rnd() * total;
        const b = BALLS.find(k => (x -= BALL_INFO[k].odds) < 0) || "poke";
        out.push(b);
      }
      return out;
    },
    // 던지기: 결과를 먼저 뽑고 흔드는 횟수를 맞춘다 (성공 3번, 실패 1~3번)
    throwBall(ball, rnd) {
      const ok = rnd() < Rewards.catchRate(ball);
      return { ok, shakes: ok ? 3 : 1 + Math.floor(rnd() * 3) };
    },
    // 야생 포켓몬: 희귀도 50·30·10·10 → 절반은 아직 없는 포켓몬 먼저. pools = { c:[ids], r:[...], u:[...], l:[...] }
    rollWild(pools, owned, rnd, odds) {
      const W = odds || WILD_ODDS;
      const has = owned instanceof Set ? owned : new Set(owned || []);
      const keys = Object.keys(W).filter(k => pools[k] && pools[k].length);
      const total = keys.reduce((t, k) => t + W[k], 0);
      let x = rnd() * total;
      const k = keys.find(q => (x -= W[q]) < 0) || keys[0];
      let pool = pools[k];
      const fresh = pool.filter(id => !has.has(id));
      if (fresh.length && rnd() < Rewards.UNOWNED_FIRST) pool = fresh;
      return pool[Math.floor(rnd() * pool.length)];
    },
  };

  /* ---------- v4: 🎓 공부 문제 — 🕐 시계 보기 · 💰 돈 세기 (순수 함수) ----------
   * 보기 4개 중 오답은 아이가 실제로 하는 실수로 만든다 */
  const Study = {
    LEVELS: 3,
    // 어려움 자동 오르내림: 3번 연속 맞히면 위, 2번 연속 틀리면 아래
    record(st, ok) {
      const o = Object.assign({ level: 1, up: 0, down: 0, right: 0, total: 0 }, st || {});
      o.total++;
      if (ok) { o.right++; o.up++; o.down = 0; if (o.up >= 3 && o.level < Study.LEVELS) { o.level++; o.up = 0; } }
      else { o.down++; o.up = 0; if (o.down >= 2 && o.level > 1) { o.level--; o.down = 0; } }
      return o;
    },
    /* 시계: level 1 = 정각·30분 · 2 = 5분 단위 · 3 = 1분 단위 → { h, m, choices: [{h, m}], answer } */
    clock(level, rnd, forced) {
      const pick = a => a[Math.floor(rnd() * a.length)];
      let h = 1 + Math.floor(rnd() * 12), m;
      if (level <= 1) m = pick([0, 30]);
      else if (level === 2) m = 5 * Math.floor(rnd() * 12);
      else { do { m = Math.floor(rnd() * 60); } while (m % 5 === 0); }
      if (forced) { h = forced.h; m = forced.m; }
      const H = x => ((x - 1 + 1200) % 12) + 1;
      const key = c => c.h + ":" + c.m;
      const out = [{ h, m }], seen = {};
      seen[key({ h, m })] = 1;
      const add = c => { if (c && c.m >= 0 && c.m < 60 && !seen[key(c)] && out.length < 4) { seen[key(c)] = 1; out.push(c); } };
      const k = Math.round(m / 5) % 12;                    // 분침이 가리키는(가까운) 숫자
      add(m > 0 ? { h: H(h + 1), m } : { h: H(h - 1), m }); // 시침이 숫자 사이에 있으면 다음 숫자로 읽는 실수
      add({ h: k === 0 ? 12 : k, m: (h % 12) * 5 });        // 두 바늘을 바꿔 읽는 실수
      if (m % 5 === 0 && m > 0) add({ h, m: m / 5 });       // 분침 숫자를 그대로 "분"으로 읽는 실수
      [{ h, m: (m + 5) % 60 }, { h, m: (m + 55) % 60 }, { h: H(h + 1), m: (m + 30) % 60 }, { h: H(h - 1), m }, { h: H(h + 2), m }].forEach(add);
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = out[i]; out[i] = out[j]; out[j] = x; }
      return { h, m, choices: out, answer: out.findIndex(c => c.h === h && c.m === m) };
    },
    /* 돈: level 1 = 천·백 · 2 = 만·천·백 · 3 = 십만·만·천·백. 한 단위는 0~9장(자릿값 그대로), 가장 큰 단위는 1장 이상
     * → { counts: { 100000: n, … }, total, choices: [원], answer } */
    UNITS: [100000, 10000, 1000, 100],
    money(level, rnd, forced) {
      const lv = Math.max(1, Math.min(3, level || 1));
      const units = Study.UNITS.slice(3 - lv);
      let counts;
      if (forced) counts = Object.assign({}, forced);
      else {
        do {
          counts = {};
          units.forEach((u, i) => { counts[u] = i === 0 ? 1 + Math.floor(rnd() * 9) : Math.floor(rnd() * 10); });
        } while (units.filter(u => counts[u] > 0).length < 2);
      }
      Study.UNITS.forEach(u => { counts[u] = counts[u] || 0; });
      const total = Study.UNITS.reduce((t, u) => t + u * counts[u], 0);
      const out = [total], seen = {};
      seen[total] = 1;
      const add = v => { if (v > 0 && v < 10000000 && v % 10 === 0 && !seen[v] && out.length < 4) { seen[v] = 1; out.push(v); } }; // 3,250원처럼 자리를 덜 센 값도 보기로
      const present = Study.UNITS.filter(u => counts[u] > 0);
      if (present.length >= 2) { // 두 단위의 장 수를 바꿔 읽는 실수 (32,500 ↔ 23,500)
        const a = present[0], b = present[1];
        add(total - a * counts[a] - b * counts[b] + a * counts[b] + b * counts[a]);
      }
      add(total / 10);   // 자리를 하나 덜 셈 (3,250)
      add(total * 10);   // 자리를 하나 더 셈 (325,000)
      present.forEach(u => { add(total + u); add(total - u); }); // 한 장 더·덜
      [1000, 10000, 100].forEach(u => { add(total + u); add(total + 2 * u); });
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = out[i]; out[i] = out[j]; out[j] = x; }
      return { counts, total, choices: out, answer: out.indexOf(total) };
    },
    // 32500 → "삼만 이천오백" (앞자리 일은 빼고 읽는다: 10000 → "만", 1000 → "천")
    koNum(n) {
      const D = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
      const four = x => [[1000, "천"], [100, "백"], [10, "십"], [1, ""]].map(([u, w]) => {
        const d = Math.floor(x / u) % 10;
        return d ? (d === 1 && w ? "" : D[d]) + w : "";
      }).join("");
      if (!n) return "영";
      const man = Math.floor(n / 10000), rest = n % 10000;
      return [man ? (man === 1 ? "" : four(man)) + "만" : "", rest ? four(rest) : ""].filter(Boolean).join(" ");
    },
    won: n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원",
    clockText: c => c.h + "시" + (c.m ? " " + c.m + "분" : ""),
  };

  const Yut = {
    NODES, NODE_KIND, NODE_NAME, LINES, ROUTES, RESULTS, BACKDO, FLAT_P,
    rand, rng, throwSticks, sticksFor, resultProbs, settle, stepMove, posOf, unitsOf, waitingOf,
    legalMoves, applyThrow, applyMove, newGame, teamDone,
    evoPath, progressOf, stageFor, formOf, EVO_STEP, isFinal, SKILL_WALK, needsWalk, Study,
    remainingOf, threat, cpuScore, cpuChoose, validate, upgrade, clone,
    SPOT_NODES, pickSpotNodes, Rewards,
    // v3: 기술 · 말 바꾸기
    SKILLS, TYPE_SKILLS, REFLECTABLE, legalSkills, targetsFor, applySkill, scoreSkill, cpuSkill,
    applySwap, swapOk, cpuSwapTarget,
    isBlocked, isVeiled, isSealed, isRaining, unitOfPiece, piecesAt, trapAt, flyPlan, planForward, backPlan, backSteps,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Yut;
  else root.Yut = Yut;
})(typeof window !== "undefined" ? window : this);
