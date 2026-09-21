(() => {
  "use strict";

  // ---------------------------------------------------------------- 페이지 읽기
  // YTM은 DOM 구조를 종종 바꾸므로 셀렉터는 여기 한 곳에만 둔다.
  const SEL = {
    bar: "ytmusic-player-bar",
    art: "ytmusic-player-bar img.image",
    title: "ytmusic-player-bar .title",
    byline: "ytmusic-player-bar .byline",
    next: "ytmusic-player-bar .next-button",
    prev: "ytmusic-player-bar .previous-button",
  };

  const $ = (sel) => document.querySelector(sel);
  const video = () => document.querySelector("video");

  function readState() {
    const v = video();
    const img = $(SEL.art);
    // 썸네일 URL 끝의 =w60-h60 같은 크기 지시자를 키워서 선명하게 받는다.
    const art = img?.src ? img.src.replace(/=w\d+-h\d+/, "=w400-h400") : "";
    return {
      art,
      title: $(SEL.title)?.textContent?.trim() || "재생 중인 곡 없음",
      byline: $(SEL.byline)?.textContent?.trim() || "",
      playing: v ? !v.paused && !v.ended : false,
      current: v?.currentTime ?? 0,
      duration: Number.isFinite(v?.duration) ? v.duration : 0,
    };
  }

  const click = (sel) => $(sel)?.click();

  const actions = {
    toggle() {
      const v = video();
      if (!v) return;
      v.paused ? v.play() : v.pause();
    },
    next: () => click(SEL.next),
    prev: () => click(SEL.prev),
    seek(ratio) {
      const v = video();
      if (v && Number.isFinite(v.duration)) v.currentTime = v.duration * ratio;
    },
  };

  const mmss = (s) => {
    if (!Number.isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  // -------------------------------------------------------------------- 설정
  // 창을 닫아도 남아야 하고 다른 기기에서도 같길 바라서 storage.sync에 둔다.
  // 확장이 리로드되면 chrome.* 접근이 깨지므로 실패는 조용히 기본값으로 흘린다.
  const DEFAULTS = {
    accent: "#ffffff",
    theme: "dark",   // dark | light
    layout: "row",   // row(가로형) | col(세로형)
    glow: 40,        // 0이면 글래스 효과 끔
    showArt: true,
    showByline: true,
    showProgress: true,
  };

  let settings = { ...DEFAULTS };

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(DEFAULTS, (v) => {
          if (!chrome.runtime.lastError && v) settings = { ...DEFAULTS, ...v };
          resolve(settings);
        });
      } catch {
        resolve(settings);
      }
    });
  }

  function saveSettings() {
    try {
      chrome.storage.sync.set(settings);
    } catch {
      /* 확장 컨텍스트가 죽어도 이번 창에서는 계속 쓸 수 있게 둔다. */
    }
  }

  // ------------------------------------------------------------------ PiP 창
  // 한 벌의 마크업을 data-layout 값으로 가로형/세로형 양쪽에 쓴다.
  const CSS = `
    @font-face { font-family: "PretendardLocal"; src: local("Pretendard Variable"), local("Pretendard"); }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --accent: #fff;
      --bg: #000;
      --fg: #fff;
      --fg-dim: rgba(255,255,255,.55);
      --fg-faint: rgba(255,255,255,.4);
      --rail: rgba(255,255,255,.18);
      --panel: rgba(18,18,18,.94);
      --line: rgba(255,255,255,.14);
      --glow-opacity: .4;
      --glow-blur: 56px;
      color-scheme: dark;
    }
    body[data-theme="light"] {
      --bg: #f4f4f5;
      --fg: #111;
      --fg-dim: rgba(0,0,0,.55);
      --fg-faint: rgba(0,0,0,.42);
      --rail: rgba(0,0,0,.16);
      --panel: rgba(250,250,250,.96);
      --line: rgba(0,0,0,.12);
      color-scheme: light;
    }
    body {
      font-family: "PretendardLocal", Pretendard, -apple-system, "Segoe UI",
                   "Malgun Gothic", system-ui, sans-serif;
      background: var(--bg); color: var(--fg); height: 100vh; padding: 16px;
      position: relative; overflow: hidden;
      user-select: none; -webkit-user-select: none;
    }
    /* 앨범아트를 크게 못 쓰는 대신, 뒤로 흘려놓은 같은 이미지가 창 색을 잡아준다. */
    #glow {
      position: absolute; inset: -30%; pointer-events: none;
      background-size: cover; background-position: center;
      filter: blur(var(--glow-blur)) saturate(1.7); opacity: var(--glow-opacity);
      transition: background-image .4s, opacity .2s, filter .2s;
    }
    #wrap { position: relative; height: 100%; display: flex; gap: 16px; }
    #left {
      flex: 1 1 auto; min-width: 0; min-height: 0;
      display: flex; flex-direction: column; justify-content: space-between;
    }
    #art {
      flex: 0 0 auto; align-self: flex-start;
      width: clamp(64px, 30%, 132px); aspect-ratio: 1;
      object-fit: cover; border-radius: 4px; background: #1a1a1a;
      box-shadow: 0 10px 26px rgba(0,0,0,.6);
    }
    #title {
      font-size: 15px; font-weight: 600; letter-spacing: -.01em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #byline {
      margin-top: 3px; font-size: 12px; color: var(--fg-dim);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #ctrls { display: flex; align-items: center; gap: 14px; margin: 6px 0; }
    button {
      border: 0; background: none; color: var(--fg); cursor: pointer;
      display: grid; place-items: center; border-radius: 50%;
      transition: opacity .12s;
    }
    button:hover { opacity: .65; }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .side { width: 28px; height: 28px; }
    #play {
      width: 38px; height: 38px;
      background: var(--accent); color: var(--bg);
    }
    svg { pointer-events: none; }
    #bottom { display: flex; align-items: center; gap: 8px; }
    #cur, #dur {
      flex: 0 0 auto; font-size: 10px; font-variant-numeric: tabular-nums;
      color: var(--fg-faint);
    }
    #track { flex: 1 1 auto; height: 14px; display: flex; align-items: center; cursor: pointer; }
    #rail { width: 100%; height: 3px; border-radius: 2px; background: var(--rail); }
    #fill { height: 100%; width: 0; border-radius: 2px; background: var(--accent); }

    /* 세로형: 앨범아트가 남는 높이를 다 먹고, 정보와 컨트롤은 그 아래 가운데. */
    body[data-layout="col"] #wrap { flex-direction: column; gap: 12px; }
    body[data-layout="col"] #art {
      order: -1; align-self: center;
      flex: 1 1 auto; width: auto; height: 100%; max-width: 100%; min-height: 0;
    }
    body[data-layout="col"] #left { flex: 0 0 auto; gap: 6px; }
    body[data-layout="col"] #meta { text-align: center; }
    body[data-layout="col"] #ctrls { justify-content: center; margin: 2px 0; }

    /* 표시 요소 토글 */
    body[data-art="off"] #art,
    body[data-byline="off"] #byline,
    body[data-progress="off"] #bottom { display: none; }

    /* ------------------------------------------------------------ 설정 패널 */
    /* 앨범아트 모서리에 얹히는 자리라, 밝은 아트 위에서도 보이게 칩을 깐다. */
    #gear {
      position: absolute; top: 8px; right: 8px; z-index: 3;
      width: 26px; height: 26px; color: #fff;
      background: rgba(0,0,0,.5); backdrop-filter: blur(6px);
      opacity: .6; transition: opacity .15s;
    }
    body:hover #gear, #gear:focus-visible { opacity: 1; }
    #gear:hover { opacity: 1; }
    #settings {
      position: absolute; inset: 0; z-index: 2; display: none;
      background: var(--panel); color: var(--fg);
      padding: 14px 16px; overflow-y: auto;
      font-size: 12px;
    }
    body[data-settings="on"] #settings { display: block; }
    #settings h2 { font-size: 12px; font-weight: 600; margin-bottom: 10px; }
    .row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 5px 0; border-top: 1px solid var(--line);
    }
    .row:first-of-type { border-top: 0; }
    .row > span { color: var(--fg-dim); }
    .row input[type="color"] {
      width: 30px; height: 20px; padding: 0; border: 0; background: none; cursor: pointer;
    }
    .row input[type="range"] { width: 110px; accent-color: var(--accent); cursor: pointer; }
    .row input[type="checkbox"] { width: 15px; height: 15px; accent-color: var(--accent); cursor: pointer; }
    .row select {
      background: var(--bg); color: var(--fg); border: 1px solid var(--line);
      border-radius: 4px; padding: 3px 6px; font: inherit; cursor: pointer;
    }
    #reset {
      margin-top: 12px; width: 100%; border-radius: 6px; padding: 7px;
      border: 1px solid var(--line); color: var(--fg-dim); font: inherit;
    }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  `;

  const ICON = {
    prev: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M7 6h2v12H7zm3 6 8 6V6z"/></svg>`,
    next: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M15 6h2v12h-2zM6 18l8-6-8-6z"/></svg>`,
    play: `<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>`,
    gear: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/><path d="m19.4 13-.1-1 .1-1 1.6-1.3a.7.7 0 0 0 .2-.9l-1.7-2.9a.7.7 0 0 0-.8-.3l-2 .8a7 7 0 0 0-1.7-1l-.3-2.1a.7.7 0 0 0-.7-.6h-3.4a.7.7 0 0 0-.7.6l-.3 2.1a7 7 0 0 0-1.7 1l-2-.8a.7.7 0 0 0-.8.3L2.8 8.8a.7.7 0 0 0 .2.9L4.6 11l-.1 1 .1 1-1.6 1.3a.7.7 0 0 0-.2.9l1.7 2.9c.2.3.5.4.8.3l2-.8c.5.4 1.1.8 1.7 1l.3 2.1c0 .3.4.6.7.6h3.4c.3 0 .6-.3.7-.6l.3-2.1a7 7 0 0 0 1.7-1l2 .8c.3.1.6 0 .8-.3l1.7-2.9a.7.7 0 0 0-.2-.9L19.4 13z" opacity=".55"/></svg>`,
  };

  const HTML = `
    <div id="glow"></div>
    <button id="gear" title="설정">${ICON.gear}</button>
    <div id="wrap">
      <div id="left">
        <div id="meta">
          <div id="title"></div>
          <div id="byline"></div>
        </div>
        <div id="ctrls">
          <button id="prev" class="side" title="이전 곡">${ICON.prev}</button>
          <button id="play" title="재생/일시정지">${ICON.play}</button>
          <button id="next" class="side" title="다음 곡">${ICON.next}</button>
        </div>
        <div id="bottom">
          <span id="cur">0:00</span>
          <div id="track"><div id="rail"><div id="fill"></div></div></div>
          <span id="dur">0:00</span>
        </div>
      </div>
      <img id="art" alt="">
    </div>
    <div id="settings">
      <h2>모양 설정</h2>
      <label class="row"><span>강조색</span><input id="s-accent" type="color"></label>
      <label class="row"><span>배경</span>
        <select id="s-theme"><option value="dark">어둡게</option><option value="light">밝게</option></select>
      </label>
      <label class="row"><span>레이아웃</span>
        <select id="s-layout"><option value="row">가로형</option><option value="col">세로형</option></select>
      </label>
      <label class="row"><span>글래스 효과</span><input id="s-glow" type="range" min="0" max="100" step="5"></label>
      <label class="row"><span>앨범아트</span><input id="s-art" type="checkbox"></label>
      <label class="row"><span>아티스트명</span><input id="s-byline" type="checkbox"></label>
      <label class="row"><span>진행바·시간</span><input id="s-progress" type="checkbox"></label>
      <button id="reset" type="button">기본값으로 되돌리기</button>
    </div>
  `;

  let pipWindow = null;
  let ticker = null;

  // 설정값을 CSS 변수와 data 속성으로 흘려보낸다. 렌더 루프와는 무관하게 즉시 반영.
  function applySettings(win) {
    const b = win.document.body;
    b.dataset.theme = settings.theme;
    b.dataset.layout = settings.layout;
    b.dataset.art = settings.showArt ? "on" : "off";
    b.dataset.byline = settings.showByline ? "on" : "off";
    b.dataset.progress = settings.showProgress ? "on" : "off";

    const r = win.document.documentElement.style;
    r.setProperty("--accent", settings.accent);
    const g = Number(settings.glow) || 0;
    r.setProperty("--glow-opacity", String((g / 100) * 0.8));
    r.setProperty("--glow-blur", `${30 + g * 0.4}px`);
  }

  function bindSettings(win) {
    const id = (x) => win.document.getElementById(x);
    const fields = {
      accent: [id("s-accent"), "value"],
      theme: [id("s-theme"), "value"],
      layout: [id("s-layout"), "value"],
      glow: [id("s-glow"), "value"],
      showArt: [id("s-art"), "checked"],
      showByline: [id("s-byline"), "checked"],
      showProgress: [id("s-progress"), "checked"],
    };

    const fill = () => {
      for (const [key, [el, prop]] of Object.entries(fields)) el[prop] = settings[key];
    };

    for (const [key, [el, prop]] of Object.entries(fields)) {
      el.addEventListener("input", () => {
        settings[key] = key === "glow" ? Number(el.value) : el[prop];
        applySettings(win);
        saveSettings();
      });
    }

    id("reset").addEventListener("click", () => {
      settings = { ...DEFAULTS };
      fill();
      applySettings(win);
      saveSettings();
    });

    id("gear").addEventListener("click", () => {
      const b = win.document.body;
      b.dataset.settings = b.dataset.settings === "on" ? "off" : "on";
    });

    fill();
  }

  async function openMini() {
    if (!("documentPictureInPicture" in window)) {
      alert("이 브라우저는 Document Picture-in-Picture를 지원하지 않습니다. Chrome 또는 Edge 116 이상에서 써주세요.");
      return;
    }
    if (documentPictureInPicture.window) {
      documentPictureInPicture.window.focus();
      return;
    }

    // requestWindow()는 사용자 조작 직후에만 부를 수 있어서, 저장된 설정은 미리 읽어둔다.
    const win = await documentPictureInPicture.requestWindow({
      width: 420,
      height: settings.layout === "col" ? 380 : 180,
      disallowReturnToOpener: true,
    });
    pipWindow = win;

    const style = win.document.createElement("style");
    style.textContent = CSS;
    win.document.head.append(style);
    win.document.body.innerHTML = HTML;

    const el = {
      art: win.document.getElementById("art"),
      glow: win.document.getElementById("glow"),
      title: win.document.getElementById("title"),
      byline: win.document.getElementById("byline"),
      fill: win.document.getElementById("fill"),
      cur: win.document.getElementById("cur"),
      dur: win.document.getElementById("dur"),
      play: win.document.getElementById("play"),
      track: win.document.getElementById("track"),
    };

    applySettings(win);
    bindSettings(win);

    win.document.getElementById("prev").onclick = actions.prev;
    win.document.getElementById("next").onclick = actions.next;
    el.play.onclick = actions.toggle;
    el.track.onclick = (e) => {
      const r = el.track.getBoundingClientRect();
      actions.seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    };
    win.addEventListener("keydown", (e) => {
      // 설정 패널에서 타이핑·조작 중일 때는 재생 단축키를 가로채지 않는다.
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); actions.toggle(); }
      if (e.code === "ArrowRight") actions.next();
      if (e.code === "ArrowLeft") actions.prev();
      if (e.code === "Escape") win.document.body.dataset.settings = "off";
    });

    let lastArt = "";
    const render = () => {
      const s = readState();
      if (s.art && s.art !== lastArt) {
        lastArt = s.art;
        el.art.src = s.art;
        el.glow.style.backgroundImage = `url("${s.art}")`;
      }
      if (el.title.textContent !== s.title) {
        el.title.textContent = s.title;
        el.title.title = s.title;
        win.document.title = s.title;
      }
      if (el.byline.textContent !== s.byline) el.byline.textContent = s.byline;
      el.fill.style.width = s.duration ? `${(s.current / s.duration) * 100}%` : "0";
      el.cur.textContent = mmss(s.current);
      el.dur.textContent = mmss(s.duration);
      el.play.innerHTML = s.playing ? ICON.pause : ICON.play;
    };

    render();
    ticker = setInterval(render, 500);

    win.addEventListener("pagehide", () => {
      clearInterval(ticker);
      ticker = null;
      pipWindow = null;
    });
  }

  // ------------------------------------------------------- 페이지 쪽 실행 버튼
  // requestWindow()는 사용자 조작 직후에만 호출할 수 있어서,
  // 확장 아이콘이 아니라 페이지 안의 버튼/단축키로 띄운다.
  function mountLauncher() {
    if (document.getElementById("ytm-mini-launch")) return;
    const btn = document.createElement("button");
    btn.id = "ytm-mini-launch";
    btn.type = "button";
    btn.title = "미니 플레이어 열기 (Alt+P)";
    btn.textContent = "미니";
    Object.assign(btn.style, {
      position: "fixed", right: "18px", bottom: "92px", zIndex: "9999",
      padding: "8px 14px", borderRadius: "999px", border: "1px solid rgba(255,255,255,.2)",
      background: "rgba(20,20,20,.9)", color: "#fff", font: "600 12px/1 sans-serif",
      cursor: "pointer", backdropFilter: "blur(8px)",
    });
    btn.addEventListener("click", openMini);
    document.body.append(btn);
  }

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target?.tagName) || e.target?.isContentEditable;
    if (e.altKey && e.code === "KeyP" && !typing) {
      e.preventDefault();
      openMini();
    }
  });

  loadSettings();
  mountLauncher();
  // YTM은 SPA라 화면 전환 때 버튼이 날아갈 수 있어 한 번씩 다시 심는다.
  setInterval(mountLauncher, 3000);
})();
