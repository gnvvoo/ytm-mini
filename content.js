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
    like: "ytmusic-player-bar #button-shape-like button",
  };

  const $ = (sel) => document.querySelector(sel);
  const video = () => document.querySelector("video");

  function readState() {
    const v = video();
    const img = $(SEL.art);
    // 썸네일 URL 끝의 =w60-h60 같은 크기 지시자를 키워서 선명하게 받는다.
    const art = img?.src ? img.src.replace(/=w\d+-h\d+/, "=w600-h600") : "";
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

  // ------------------------------------------------------------------ PiP 창
  const CSS = `
    @font-face { font-family: "PretendardLocal"; src: local("Pretendard Variable"), local("Pretendard"); }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root { color-scheme: dark; }
    body {
      font-family: "PretendardLocal", Pretendard, -apple-system, "Segoe UI",
                   "Malgun Gothic", system-ui, sans-serif;
      background: #000; color: #fff; height: 100vh;
      display: flex; flex-direction: column; overflow: hidden;
      user-select: none; -webkit-user-select: none;
    }
    /* 앨범아트가 주인공. 뒤로 흘려놓은 같은 이미지가 창 전체 색을 잡아준다. */
    #stage { position: relative; flex: 1 1 auto; min-height: 0; display: grid; place-items: center; }
    #glow {
      position: absolute; inset: -20%; background-size: cover; background-position: center;
      filter: blur(48px) saturate(1.6); opacity: .45; transform: scale(1.1);
      transition: background-image .4s;
    }
    #stage::after {
      content: ""; position: absolute; inset: 0;
      background: linear-gradient(to bottom, transparent 55%, rgba(0,0,0,.85));
    }
    #art {
      position: relative; width: min(82vw, 82vh); aspect-ratio: 1;
      object-fit: cover; border-radius: 6px; background: #1a1a1a;
      box-shadow: 0 18px 44px rgba(0,0,0,.6);
    }
    #panel { flex: 0 0 auto; padding: 14px 18px 18px; }
    #title {
      font-size: 15px; font-weight: 600; letter-spacing: -.01em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #byline {
      margin-top: 3px; font-size: 12px; color: rgba(255,255,255,.55);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #track { margin: 14px 0 6px; height: 14px; display: flex; align-items: center; cursor: pointer; }
    #rail { width: 100%; height: 3px; border-radius: 2px; background: rgba(255,255,255,.18); }
    #fill { height: 100%; width: 0; border-radius: 2px; background: #fff; }
    #times {
      display: flex; justify-content: space-between;
      font-size: 10px; font-variant-numeric: tabular-nums; color: rgba(255,255,255,.4);
    }
    #ctrls { margin-top: 12px; display: flex; align-items: center; justify-content: center; gap: 22px; }
    button {
      border: 0; background: none; color: #fff; cursor: pointer;
      display: grid; place-items: center; border-radius: 50%;
      transition: opacity .12s;
    }
    button:hover { opacity: .65; }
    button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
    .side { width: 34px; height: 34px; }
    #play { width: 46px; height: 46px; background: #fff; color: #000; }
    svg { pointer-events: none; }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  `;

  const ICON = {
    prev: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 6h2v12H7zm3 6 8 6V6z"/></svg>`,
    next: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15 6h2v12h-2zM6 18l8-6-8-6z"/></svg>`,
    play: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>`,
  };

  const HTML = `
    <div id="stage"><div id="glow"></div><img id="art" alt=""></div>
    <div id="panel">
      <div id="title"></div>
      <div id="byline"></div>
      <div id="track"><div id="rail"><div id="fill"></div></div></div>
      <div id="times"><span id="cur">0:00</span><span id="dur">0:00</span></div>
      <div id="ctrls">
        <button id="prev" class="side" title="이전 곡">${ICON.prev}</button>
        <button id="play" title="재생/일시정지">${ICON.play}</button>
        <button id="next" class="side" title="다음 곡">${ICON.next}</button>
      </div>
    </div>
  `;

  let pipWindow = null;
  let ticker = null;

  async function openMini() {
    if (!("documentPictureInPicture" in window)) {
      alert("이 브라우저는 Document Picture-in-Picture를 지원하지 않습니다. Chrome 또는 Edge 116 이상에서 써주세요.");
      return;
    }
    if (documentPictureInPicture.window) {
      documentPictureInPicture.window.focus();
      return;
    }

    const win = await documentPictureInPicture.requestWindow({
      width: 320,
      height: 430,
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

    win.document.getElementById("prev").onclick = actions.prev;
    win.document.getElementById("next").onclick = actions.next;
    el.play.onclick = actions.toggle;
    el.track.onclick = (e) => {
      const r = el.track.getBoundingClientRect();
      actions.seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    };
    win.addEventListener("keydown", (e) => {
      if (e.code === "Space") { e.preventDefault(); actions.toggle(); }
      if (e.code === "ArrowRight") actions.next();
      if (e.code === "ArrowLeft") actions.prev();
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

  mountLauncher();
  // YTM은 SPA라 화면 전환 때 버튼이 날아갈 수 있어 한 번씩 다시 심는다.
  setInterval(mountLauncher, 3000);
})();
