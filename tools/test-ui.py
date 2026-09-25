"""화면 검사 (Playwright + Chromium). 로컬 HTTP 서버를 스스로 띄워 실제로 판을 끝까지 둔다.

    PYTHONIOENCODING=utf-8 PYTHONUTF8=1 python tools/test-ui.py [스크린샷 폴더]

확인하는 것
  1. 가족 대결: 처음 → 준비 → 팀 2개 고르기 → 판을 끝까지 → 우승 화면 (가로 1180×820)
  2. 로켓단 대결: 등장 연출 → 컴퓨터가 스스로 둔다 → 끝까지 (세로 820×1180)
  3. 이어하기: 판 중간에 새로고침 → 같은 차례·같은 위치
  4. 고르기 명단: 스타팅 포켓몬 27마리 + ❓ 풀숲에서 잡은 포켓몬(잡은 순서대로) / 같은 진화 가족 막기
  5. 새 버전 감지: 서버 파일의 APP_VERSION 이 다르면 알림
  6. 누르는 것 44×44px 이상, 가로 스크롤 없음 (폰 390×844 포함)
  7. 콘솔 오류 0개
"""
import functools
import http.server
import json
import pathlib
import re
import sys
import threading
import time

from playwright.sync_api import sync_playwright

for s in (sys.stdout, sys.stderr):
    try:
        s.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = pathlib.Path(__file__).resolve().parent.parent
_args = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = pathlib.Path(_args[0]) if _args else ROOT / "art-src" / "shots"
OUT.mkdir(parents=True, exist_ok=True)

fails = []
SKIPS = [0]  # play_to_end 에서 누른 배틀 건너뛰기 수


def check(cond, msg):
    print(("✅ " if cond else "❌ ") + msg)
    if not cond:
        fails.append(msg)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve():
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


# 윷놀이 저장 흉내: ❓ 풀숲에서 잡은 포켓몬 (잡은 순서: 리자드 → 가디 → 이브이)
YUT_SAVE = json.dumps({"collection": [{"id": 5, "t": 1, "from": "wild"}, {"id": 58, "t": 2, "from": "wild"}, {"id": 133, "t": 3, "from": "wild"}]})

MEASURE = """() => {
  const bad = [];
  const sel = 'button:not([disabled]), .unit, .dest, [data-act]:not([disabled])';
  document.querySelectorAll(sel).forEach(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) return;
    if (r.width < 43.5 || r.height < 43.5) bad.push((el.className || el.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + (el.textContent || '').trim().slice(0, 12) + '"');
  });
  return { bad, hscroll: document.documentElement.scrollWidth > innerWidth + 1 };
}"""


def measure(page, name):
    m = page.evaluate(MEASURE)
    check(not m["bad"], f"{name}: 누르는 것 44px 이상" + ("" if not m["bad"] else " → " + "; ".join(m["bad"][:6])))
    check(not m["hscroll"], f"{name}: 가로 스크롤 없음")


def wait_idle(page, timeout=20000):
    page.wait_for_function("() => window.__yut && !window.__yut.G.busy", timeout=timeout)


def wait_idle_or_popup(page, timeout=20000):
    """계산이 끝나거나, 배틀·야생 조우 창(건너뛰기 버튼)이 뜰 때까지."""
    page.wait_for_function("() => window.__yut && (!window.__yut.G.busy || document.querySelector('.bt-skip'))", timeout=timeout)


def play_to_end(page, shots_prefix, max_steps=900):
    """사람 차례면 던지고 반짝이는 칸을 누른다. 컴퓨터 차례는 기다린다."""
    shot_at = {3, 12, 30}
    n = 0
    for step in range(max_steps):
        sk = page.query_selector(".bt-skip")
        if sk:
            # 잡기 배틀이 뜨면 건너뛰기를 눌러 본다 (건너뛰어도 판이 이어져야 함)
            sk.click(force=True)
            SKIPS[0] += 1
            page.wait_for_timeout(80)
            continue
        st = page.evaluate("() => { const G = window.__yut.G; return G.s ? { phase: G.s.phase, cpu: G.s.teams[G.s.turn].cpu, busy: G.busy, dests: document.querySelectorAll('.dest:not(.cpu)').length, over: !!document.querySelector('.win-screen') } : null }")
        if not st:
            return False
        if st["over"]:
            return True
        if st["busy"] or st["cpu"]:
            page.wait_for_timeout(60)
            continue
        if st["phase"] == "throw":
            page.click("#btn-throw", force=True)
            n += 1
            if n in shot_at:
                page.wait_for_timeout(120)
                page.screenshot(path=str(OUT / f"{shots_prefix}-throw{n}.png"))
            wait_idle_or_popup(page)
        elif st["phase"] == "choose":
            if st["dests"] == 0:
                # 여러 말 중 고르는 상황: 반짝이는 말을 누른다
                target = page.query_selector(".unit.can") or page.query_selector(".pchip.can")
                if not target:
                    page.wait_for_timeout(60)
                    continue
                target.click()
                page.wait_for_timeout(40)
                if n in shot_at:
                    page.screenshot(path=str(OUT / f"{shots_prefix}-choose{n}.png"))
            dests = page.query_selector_all(".dest:not(.cpu)")
            if dests:
                # 잡기 > 골인 > 나머지 순으로 눌러 여러 연출이 나오게
                pick = None
                for cls in ("hit", "goal"):
                    pick = next((d for d in dests if cls in (d.get_attribute("class") or "")), None)
                    if pick:
                        break
                (pick or dests[-1]).click(force=True)
                wait_idle_or_popup(page)
        elif st["phase"] == "over":
            page.wait_for_timeout(300)
    return False


def scenario(browser, base, errors):
    """윷 결과를 정해 두고(?force=) 잡기·쉬어 가기·업기·여러 결과·진화를 실제 속도로 일으켜 찍는다.
    팀 0: 파이리(→리자드→리자몽)·이상해씨 / 팀 1: 꼬부기·치코리타 (스타팅), 말 2개, 팀 0 먼저(seed 2)."""
    ctx = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.goto(base + "?seed=2&spots=none&force=1,1,2,-1,3,4,4,2")  # 풀숲 없이 (v1 연출만)
    page.wait_for_timeout(400)
    page.click("text=가족 대결")
    page.click("[data-act=set][data-field=pieces][data-value='2']")
    page.click("[data-act=to-pick]")
    page.evaluate("() => { window.__yut.Setup.picks[0] = []; }")
    page.click(".pcard[data-id='4']")
    page.click(".pcard[data-id='1']")
    page.click("#pick-next")
    page.click(".pcard[data-id='7']")
    page.click(".pcard[data-id='152']")
    page.click("#pick-next")
    wait_idle(page)

    def throw():
        page.wait_for_function("() => { const b = document.querySelector('#btn-throw'); return b && !b.disabled; }", timeout=20000)
        page.click("#btn-throw", force=True)

    def dest(move_id, wait=True):
        sel = f".dest[data-move='{move_id}']"
        page.wait_for_selector(sel, timeout=20000)
        page.click(sel, force=True)
        if wait:
            wait_idle(page)

    throw(); wait_idle(page)
    dest("new/1")                                  # 팀 0: 도 → 1번 칸
    throw(); wait_idle(page)
    dest("new/1", wait=False)                      # 팀 1: 도 → 1번 칸의 팀 0 말과 배틀 → 물리침
    page.wait_for_selector(".battle", timeout=5000)
    t0 = time.time()
    stamp = None
    for name, at in (("50-battle-meet", 1.5), ("50-battle-move", 2.6), ("50-battle-hit", 3.1), ("50-battle-defeat", 5.3), ("50-battle-home", 6.3)):
        page.wait_for_timeout(max(0, int((t0 + at - time.time()) * 1000)))
        page.screenshot(path=str(OUT / f"{name}.png"))
        el = page.query_selector(".bt-stamp")
        stamp = stamp or (el.inner_text() if el else None)
    check(stamp == "물리쳤다!", f"배틀: 기술로 물리침 (도장: {stamp})")
    check(page.query_selector(".bt-ball") is None, "배틀에 몬스터볼이 안 나옴")
    page.wait_for_selector(".battle", state="detached", timeout=15000)
    check(True, f"배틀 길이 약 {time.time() - t0:.1f}초")
    wait_idle(page)
    page.screenshot(path=str(OUT / "51-after-capture.png"))
    check(page.evaluate("() => window.__yut.G.s.turn") == 1, "잡은 팀(1)이 한 번 더 던짐")
    throw(); wait_idle(page)
    page.click(".unit.can")                        # 팀 1: 개 → 판 위 말을 고르고
    dest("n1/2")
    throw()                                        # 팀 0: 빽도 → 판에 말이 없어 쉬어 감
    page.wait_for_timeout(2300)
    page.screenshot(path=str(OUT / "52-skip.png"))
    wait_idle(page)
    check(page.evaluate("() => window.__yut.G.s.turn") == 1, "빽도로 쉬어 가면 차례가 넘어감")
    throw(); wait_idle(page)
    page.click(".pchip.can")                       # 팀 1: 걸 → 새 말을 내서 3번 칸 말 위에 업기
    page.wait_for_timeout(200)
    page.screenshot(path=str(OUT / "53-stack-choice.png"))
    dest("new/3", wait=False)
    page.wait_for_timeout(1300)
    page.screenshot(path=str(OUT / "54-stack.png"))
    wait_idle(page)
    check(page.evaluate("() => window.__yut.Yut.unitsOf(window.__yut.G.s, 1).length") == 1, "업기: 팀 1 말 2개가 한 덩어리")
    throw(); wait_idle(page)                       # 팀 0: 윷 → 한 번 더
    throw(); wait_idle(page)                       # 팀 0: 윷 → 한 번 더
    throw(); wait_idle(page)                       # 팀 0: 개
    page.wait_for_timeout(200)
    page.screenshot(path=str(OUT / "55-many-results.png"))
    dest("new/4")                                  # 새 말 4칸 → 4번 칸
    page.click(".unit.can")
    dest("n4/4", wait=False)                       # 8번 칸 (길의 40%) → 파이리가 리자드로 진화
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUT / "56-evolving.png"))
    page.wait_for_timeout(1300)
    page.screenshot(path=str(OUT / "57-evolved.png"))
    wait_idle(page)
    form = page.evaluate("() => window.__yut.Yut.formOf(window.__yut.G.s, 0)")
    check(form == 5, f"진화: 파이리 → 리자드 (지금 모습 #{form})")
    page.click(".unit.can[data-node='8']")
    dest("n8/2")                                   # 뒷모(10)에 멈춤
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "58-backmo.png"))
    check(page.evaluate("() => window.__yut.G.s.pieces[0].route") == "B", "뒷모에 멈추면 대각선 길")
    ctx.close()


def scenario_v2(browser, base, errors):
    """v2: ❓ 풀숲 야생 조우 (잡기·놓치기·볼 없음) · 로켓단 쫓아내기 · 보물상자 · 보관함 → 고르기."""
    def ctx_page(vw=1180, vh=820, bag=None):
        ctx = browser.new_context(viewport={"width": vw, "height": vh}, has_touch=True)
        if bag is not None:
            ctx.add_init_script("if (!localStorage.getItem('engmon_yut_v1')) localStorage.setItem('engmon_yut_v1', " + json.dumps(json.dumps({"bag": bag})) + ");")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        return ctx, page

    def start_family(page, query):
        page.goto(base + query)
        page.wait_for_timeout(300)
        page.click("text=가족 대결")
        page.click("[data-act=set][data-field=pieces][data-value='2']")
        page.click("[data-act=to-pick]")
        page.click("[data-act=pick-auto]"); page.click("#pick-next")
        page.click("[data-act=pick-auto]"); page.click("#pick-next")
        wait_idle(page)

    store = lambda page, js: page.evaluate("() => { const d = window.__yut.Store.data; return " + js + "; }")

    # ① 잡기 성공 (catch=1) — 가방 몬스터볼 3 → 2, 보관함에 이브이
    ctx, page = ctx_page()
    start_family(page, "?seed=2&force=3&spots=3:58,12:133&catch=1")  # 가디(58)는 가짜 도감에 없음 → NEW!
    check(page.eval_on_selector_all("#spots .spot", "e => e.map(x => +x.dataset.node)") == [3, 12], "윷판에 ❓ 풀숲 2칸 (3번·12번)")
    page.screenshot(path=str(OUT / "70-spots.png"))
    page.click("#btn-throw", force=True); wait_idle(page)
    page.wait_for_selector(".dest[data-move='new/3']")
    check("🌿" in page.inner_text(".dest[data-move='new/3'] b"), "풀숲 칸으로 가는 말풍선에 🌿")
    page.click(".dest[data-move='new/3']", force=True)
    page.wait_for_selector(".bt-menu .bt-ballbtn", timeout=15000)
    page.screenshot(path=str(OUT / "71-wild-menu.png"))
    check("NEW!" in page.inner_text(".bt-plate.foe"), "처음 보는 포켓몬이면 NEW!")
    page.click(".bt-menu .bt-ballbtn")
    page.wait_for_selector(".bt-stamp", timeout=15000)
    page.screenshot(path=str(OUT / "72-wild-caught.png"))
    page.wait_for_selector(".battle", state="detached", timeout=15000)
    wait_idle(page)
    check(store(page, "d.collection.map(x => x.id)") == [58], "잡은 가디가 윷놀이 보관함에")
    check(store(page, "d.bag.poke") == 2, "던진 몬스터볼 1개가 가방에서 빠짐 (3 → 2)")
    check(page.eval_on_selector_all("#spots .spot", "e => e.length") == 1, "쓴 풀숲은 윷판에서 사라짐")
    # 보관함 → 다음 판 고르기
    page.click("[data-act=pause]"); page.click("[data-act=pause-home]")
    page.click("text=가족 대결"); page.click("[data-act=to-pick]")
    page.wait_for_timeout(200)
    check("잡은 포켓몬" in page.inner_text("#pick-scroll") and page.query_selector(".pcard[data-id='58']") is not None, "고르기 화면 🎯 잡은 포켓몬에 가디가 생김")
    page.screenshot(path=str(OUT / "73-pick-collection.png"))
    page.goto(base + "?fast=1"); page.wait_for_timeout(300)
    page.click("[data-act=bag]"); page.wait_for_timeout(200)
    page.screenshot(path=str(OUT / "74-bag.png"))
    check("보관함" in page.inner_text(".modal") and "×2" in page.inner_text(".bag-list"), "가방 창: 볼 개수와 보관함")
    ctx.close()

    # ② 3번 다 놓침 (catch=0) → 도망, 볼 3개 다 씀
    ctx, page = ctx_page()
    start_family(page, "?seed=2&force=3&spots=3:25&catch=0&fast=1")
    page.click("#btn-throw", force=True); wait_idle(page)
    page.click(".dest[data-move='new/3']", force=True)
    for k in range(3):
        page.wait_for_selector(".bt-menu .bt-ballbtn", timeout=15000)
        page.click(".bt-menu .bt-ballbtn")
    page.wait_for_selector(".battle", state="detached", timeout=20000)
    wait_idle(page)
    check(store(page, "d.bag.poke") == 0 and store(page, "d.collection.length") == 0, "3번 다 놓치면 도망 — 볼 3개 씀, 보관함 그대로")
    ctx.close()

    # ③ 볼이 하나도 없을 때
    ctx, page = ctx_page(bag={"poke": 0, "great": 0, "ultra": 0, "luxury": 0, "master": 0})
    start_family(page, "?seed=2&force=3&spots=3:25&fast=1")
    page.click("#btn-throw", force=True); wait_idle(page)
    page.click(".dest[data-move='new/3']", force=True)
    page.wait_for_function("() => document.querySelector('.bt-text') && document.querySelector('.bt-text').textContent.includes('볼이 없어요')", timeout=15000)
    check(page.query_selector(".bt-menu .bt-ballbtn") is None, "볼이 없으면 안내만 하고 볼 메뉴 없음")
    page.wait_for_selector(".battle", state="detached", timeout=15000)
    ctx.close()

    # ④ 로켓단이 풀숲을 밟으면 쫓아냄
    ctx, page = ctx_page()
    page.goto(base + "?seed=2&force=1,3&spots=3:133&fast=1"); page.wait_for_timeout(300)
    page.click("text=로켓단 대결"); page.click("[data-act=set][data-field=pieces][data-value='2']")
    page.click("[data-act=to-pick]"); page.click("[data-act=pick-auto]"); page.click("#pick-next")
    page.wait_for_selector("#ri-go"); page.click("#ri-go"); wait_idle(page)
    page.click("#btn-throw", force=True); wait_idle(page)
    page.click(".dest[data-move='new/1']", force=True)
    page.wait_for_function("() => { const s = window.__yut.G.s; return s.spots[0].used; }", timeout=20000)
    page.wait_for_timeout(600)
    check(page.query_selector(".battle") is None and store(page, "d.collection.length") == 0, "로켓단이 풀숲에 멈추면 쫓아냄 (조우 화면 없음, 보관함 그대로)")
    ctx.close()

    # ⑤ 로켓단을 이기면 보물상자 — 가방에 볼이 들어가고, 새로고침해도 두 번 안 들어감
    ctx, page = ctx_page()
    page.goto(base + "?seed=2&fast=1&box=master,luxury,poke"); page.wait_for_timeout(300)
    page.click("text=로켓단 대결"); page.click("[data-act=set][data-field=pieces][data-value='2']")
    page.click("[data-act=to-pick]"); page.click("[data-act=pick-auto]"); page.click("#pick-next")
    page.wait_for_selector("#ri-go"); page.click("#ri-go"); wait_idle(page)
    page.evaluate("""() => { const Y = window.__yut, s = Y.G.s;
      Object.assign(s.pieces[0], { state: "done" });
      Object.assign(s.pieces[1], { state: "board", route: "OUT", step: 19, atGoal: false });
      s.phase = "choose"; s.pending = [3]; s.throwsLeft = 0; s.turn = 0;
      Y.Store.data.game = s; Y.Store.save(); }""")
    page.goto(base + "?fast=1&box=master,luxury,poke"); page.wait_for_timeout(300)
    page.click("[data-act=resume]"); wait_idle(page)
    page.click(".dest.goal", force=True)  # 둘 수 있는 말이 하나라 이미 골라져 있다
    page.wait_for_selector(".win-screen .chest", timeout=20000)
    check(store(page, "[d.bag.master, d.bag.luxury, d.bag.poke]") == [1, 1, 4], "이긴 순간 상자 볼이 가방에 (마스터 1 · 럭셔리 1 · 몬스터 3+1)")
    check(page.query_selector(".win-btns.hidden") is not None, "상자를 열기 전에는 '한 판 더' 버튼이 숨어 있음")
    page.screenshot(path=str(OUT / "75-box-closed.png"))
    page.click(".win-screen .chest", force=True)  # 통통 튀는 중이라 강제로
    page.wait_for_function("() => document.querySelectorAll('#box-balls .ballchip').length === 3", timeout=15000)
    page.wait_for_selector(".win-btns:not(.hidden)", timeout=5000)
    page.screenshot(path=str(OUT / "76-box-open.png"))
    page.reload(); page.wait_for_timeout(400)
    check(store(page, "[d.bag.master, d.bag.luxury, d.bag.poke]") == [1, 1, 4], "새로고침해도 상자 볼이 두 번 안 들어감")
    ctx.close()

    # ⑥ 설정에서 "배틀 장면 건너뛰기" — 배틀 화면 없이 물리치고, 진 말은 집으로, 이긴 팀은 한 번 더
    ctx, page = ctx_page()
    page.goto(base + "?seed=2&spots=none&force=1,1"); page.wait_for_timeout(300)
    page.click("text=가족 대결")
    page.click("[data-act=set][data-field=pieces][data-value='2']")
    page.click("[data-act=set][data-field=battle][data-value='false']")
    page.screenshot(path=str(OUT / "77-setup-battle-skip.png"))
    page.click("[data-act=to-pick]")
    page.click("[data-act=pick-auto]"); page.click("#pick-next")
    page.click("[data-act=pick-auto]"); page.click("#pick-next")
    wait_idle(page)
    check(page.evaluate("() => window.__yut.G.s.settings.battle") is False and store(page, "d.settings.battle") is False, "건너뛰기 설정이 판과 저장에 들어감")
    page.click("#btn-throw", force=True); wait_idle(page)
    page.click(".dest[data-move='new/1']", force=True); wait_idle(page)
    page.click("#btn-throw", force=True); wait_idle(page)
    page.click(".dest[data-move='new/1']", force=True)    # 팀 1 이 팀 0 말을 잡음
    saw_battle = False
    t0 = time.time()
    while time.time() - t0 < 2.5:
        saw_battle = saw_battle or page.query_selector(".battle") is not None
        page.wait_for_timeout(100)
    wait_idle(page)
    hint_txt = page.inner_text("#hint")
    page.screenshot(path=str(OUT / "78-battle-skipped.png"))
    st = page.evaluate("() => { const s = window.__yut.G.s; return [s.turn, s.phase, s.pieces[0].state]; }")
    check(not saw_battle, "배틀 화면이 안 뜸")
    check(st == [1, "throw", "wait"], f"진 말은 대기로, 이긴 팀이 한 번 더 던짐 ({st})")
    ctx.close()


def main():
    httpd = serve()
    base = f"http://127.0.0.1:{httpd.server_port}/index.html"
    print("서버:", base)
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        if "--v2-only" not in sys.argv:
            scenario(browser, base, errors)
        scenario_v2(browser, base, errors)
        if "--scenario-only" in sys.argv or "--v2-only" in sys.argv:
            browser.close()
            check(not errors, "콘솔 오류 없음" + ("" if not errors else " → " + " | ".join(errors[:5])))
            httpd.shutdown()
            sys.exit(1 if fails else 0)

        # ---------- 1. 가족 대결 (가로 패드) ----------
        ctx = browser.new_context(viewport={"width": 1180, "height": 820}, device_scale_factor=1, has_touch=True)
        ctx.add_init_script("if (!localStorage.getItem('engmon_yut_v1')) localStorage.setItem('engmon_yut_v1', " + json.dumps(YUT_SAVE) + ");")
        page = ctx.new_page()
        page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.add_init_script("""
          window.__ev = [];
          window.addEventListener('load', () => {
            const o = Yut.applyMove, t = Yut.applyThrow;
            Yut.applyMove = function () { const r = o.apply(this, arguments); r.events.forEach(e => window.__ev.push(e.type)); return r; };
            Yut.applyThrow = function () { const r = t.apply(this, arguments); r.events.forEach(e => window.__ev.push(e.type)); return r; };
          });
        """)
        page.goto(base + "?fast=1&seed=12")
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "01-home.png"))
        measure(page, "처음 화면")
        page.click("text=가족 대결")
        page.screenshot(path=str(OUT / "02-setup.png"))
        measure(page, "준비 화면")
        page.click("[data-act=to-pick]")
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "03-pick-empty.png"))
        grids = page.eval_on_selector_all("#pick-scroll .grid", "gs => gs.map(g => [...g.querySelectorAll('.pcard')].map(c => +c.dataset.id))")
        check(len(grids) == 2 and len(grids[0]) == 27 and grids[0][:3] == [1, 4, 7], f"명단: 스타팅 포켓몬 27마리 ({len(grids[0]) if grids else 0}마리)")
        check(len(grids) == 2 and grids[1] == [5, 58, 133], f"명단: 잡은 포켓몬이 잡은 순서대로 뒤에 (리자드 → 가디 → 이브이: {grids[1] if len(grids) > 1 else None})")
        page.click("[data-act=pick-auto]")
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "04-pick-team1.png"))
        measure(page, "고르기 화면")
        page.click("#pick-next")
        page.wait_for_timeout(200)
        t1 = page.evaluate("() => window.__yut.Setup.picks[0]")
        ok_taken = page.evaluate("(ids) => ids.every(id => document.querySelector('.pcard[data-id=\"' + id + '\"]').classList.contains('taken'))", t1)
        check(ok_taken, "두 번째 팀 화면에서 첫 팀 포켓몬(과 같은 진화 가족)은 못 고름")
        # 같은 가족 두 마리 막기: 스타팅 파이리(4)와 잡은 리자드(5)
        page.goto(base + "?fast=1&seed=12"); page.wait_for_timeout(300)
        page.click("text=가족 대결"); page.click("[data-act=to-pick]")
        page.evaluate("() => { window.__yut.Setup.picks[0] = []; }")
        page.click(".pcard[data-id='4']")
        page.click(".pcard[data-id='5']", force=True)
        n2 = page.evaluate("() => window.__yut.Setup.picks[0]")
        check(n2 == [4], f"같은 진화 가족은 한 팀에 한 마리만 (파이리·리자드 → {n2})")
        page.click("[data-act=pick-auto]"); page.click("#pick-next")
        page.click("[data-act=pick-auto]")
        page.screenshot(path=str(OUT / "05-pick-team2.png"))
        page.click("#pick-next")
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / "06-game-start.png"))
        # 고르기 화면의 "파이리 가족은 벌써 골랐어요!" 알림이 윷판 안내 칸을 덮으면 안 된다
        check(not page.evaluate("() => document.querySelector('#toast').classList.contains('show')"),
              "앞 화면 알림은 윷판으로 넘어오면 사라짐 (안내 칸을 덮지 않음)")
        wait_idle(page)
        page.screenshot(path=str(OUT / "07-game-ready.png"))
        measure(page, "윷판 화면(가로)")
        done = play_to_end(page, "10-family")
        check(done, "가족 대결 한 판을 끝까지 둠")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "19-family-win.png"))
        ev = page.evaluate("() => window.__ev")
        for t in ("throw", "move", "turn", "evolve", "finish", "win"):
            check(t in ev, f"이벤트 '{t}' 나옴 ({ev.count(t)}번)")
        print("   (그 밖에: 잡기 %d · 업기 %d · 쉬어 가기 %d · 배틀 건너뛰기 %d)" % (ev.count("capture"), ev.count("stack"), ev.count("skip"), SKIPS[0]))
        stats = page.evaluate("() => window.__yut.Store.data.stats")
        check(stats["games"] == 1, "전적 1판 기록")
        check(page.evaluate("() => window.__yut.Store.data.game") is None, "끝난 판은 이어하기에서 빠짐")

        # ---------- 3. 이어하기 ----------
        page.click("[data-act=rematch]")
        wait_idle(page)
        for _ in range(4):
            if page.evaluate("() => window.__yut.G.s.phase") == "throw" and not page.evaluate("() => window.__yut.G.s.teams[window.__yut.G.s.turn].cpu"):
                page.click("#btn-throw", force=True)
                wait_idle(page)
            d = page.query_selector(".dest:not(.cpu)")
            if d:
                d.click(force=True)
                wait_idle(page)
        before = page.evaluate("() => JSON.stringify(window.__yut.G.s.pieces) + window.__yut.G.s.turn + window.__yut.G.s.phase")
        page.reload()
        page.wait_for_timeout(500)
        check(page.query_selector("[data-act=resume]") is not None, "새로고침 뒤 처음 화면에 '이어하기'")
        page.click("[data-act=resume]")
        wait_idle(page)
        after = page.evaluate("() => JSON.stringify(window.__yut.G.s.pieces) + window.__yut.G.s.turn + window.__yut.G.s.phase")
        check(before == after, "이어하기: 말 위치·차례·단계가 그대로")

        # ---------- 5. 새 버전 감지 ----------
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        newer = re.sub(r'APP_VERSION = "[^"]+"', 'APP_VERSION = "2099-01-01z"', html)
        page.route(re.compile(r".*/index\.html\?v=\d+$"), lambda route: route.fulfill(status=200, body=newer, content_type="text/html; charset=utf-8"))
        page.goto(base + "?fast=1")
        page.wait_for_timeout(1200)
        check(page.query_selector("text=새 버전이 나왔어요") is not None, "서버 파일이 새 버전이면 알림이 뜸")
        page.screenshot(path=str(OUT / "20-update.png"))
        page.unroute(re.compile(r".*/index\.html\?v=\d+$"))
        ctx.close()

        # ---------- 2. 로켓단 대결 (세로 패드) ----------
        ctx = browser.new_context(viewport={"width": 820, "height": 1180}, has_touch=True)
        page = ctx.new_page()
        page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.goto(base + "?fast=1&seed=7")
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "30-home-portrait.png"))
        page.click("text=로켓단 대결")
        page.click("[data-act=set][data-field=cpu][data-value='\"normal\"']")
        page.click("[data-act=to-pick]")
        page.click("[data-act=pick-auto]")
        page.click("#pick-next")
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "31-rocket-intro.png"))
        check(page.query_selector(".rocket-intro") is not None, "로켓단 등장 연출")
        page.click("#ri-go")
        wait_idle(page)
        page.screenshot(path=str(OUT / "32-rocket-game.png"))
        measure(page, "윷판 화면(세로)")
        done = play_to_end(page, "33-rocket")
        check(done, "로켓단 대결 한 판을 끝까지 둠 (컴퓨터가 스스로 둠)")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "39-rocket-win.png"))
        ctx.close()

        # ---------- 4. 도감 없음 + 폰 ----------
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.goto(base + "?fast=1")
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "40-phone-home.png"))
        measure(page, "폰 처음 화면")
        page.click("text=가족 대결")
        page.click("[data-act=to-pick]")
        check(page.query_selector(".empty-grid") is not None, "잡은 포켓몬이 없으면 ❓ 풀숲 안내")
        page.screenshot(path=str(OUT / "41-phone-nodex.png"))
        page.click("[data-act=pick-auto]")
        page.click("#pick-next")
        page.click("[data-act=pick-auto]")
        page.click("#pick-next")
        wait_idle(page)
        page.screenshot(path=str(OUT / "42-phone-game.png"))
        measure(page, "폰 윷판 화면")
        ctx.close()
        browser.close()

    check(not errors, "콘솔 오류 없음" + ("" if not errors else " → " + " | ".join(errors[:5])))
    httpd.shutdown()
    print("\n스크린샷:", OUT)
    print("실패 %d개" % len(fails) if fails else "전부 통과")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
