/* 纸间 · 每日一句 */
(function () {
  "use strict";

  var BOOKS = (typeof window.BOOKS_DATA !== "undefined") ? window.BOOKS_DATA : [];

  // 展平所有划线
  var FLAT = [];
  BOOKS.forEach(function (b) {
    (b.hl || []).forEach(function (h) {
      FLAT.push({
        id: h[2],          // bookmarkId
        text: h[0],        // 划线原文
        ts: h[1],          // 划线时间戳（秒）
        book: b.title,
        author: b.author || "",
        link: b.link || "",
      });
    });
  });

  // ---------- 本地存储 ----------
  var K_IGNORED = "yl_ignored";    // 标记"不重要"的 bookmarkId
  var K_THOUGHTS = "yl_thoughts";  // 写下的想法
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }
  function ignoredSet() { return new Set(load(K_IGNORED)); }
  function thoughts() { return load(K_THOUGHTS); }

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var dateEl = $("date"), openLink = $("open-link");
  var card = $("card"), egg = $("egg");
  var face = card.querySelector(".face");
  var faceInner = face.querySelector(".face-inner");
  var noteBtn = $("note-btn"), thoughtsBtn = $("thoughts-btn");
  var themeBtn = $("theme-btn");

  var current = null;
  var lastYearLine = null;   // 去年今天的那条划线
  var longPress = false;
  var swapTimer = null;      // 换句淡入淡出的计时器

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDate(ts) {
    if (!ts) return "";
    var d = new Date(ts * 1000);
    return d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate());
  }
  function md(ts) {
    var d = new Date(ts * 1000);
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // ---------- 卡片内容 ----------
  function faceHTML(h) {
    var author = h.author ? " · " + h.author : "";
    return '<blockquote class="quote">' + esc(h.text) + "</blockquote>" +
      '<figcaption class="source"><span class="book">《' + esc(h.book) + "》</span>" +
      '<span class="author">' + esc(author) + "</span></figcaption>";
  }
  function maxCardHeight() {
    return Math.min(520, Math.round(window.innerHeight * 0.58));
  }
  function measureHeight(html) {
    var m = $("measure");
    var cs = window.getComputedStyle(face);
    m.style.width = face.getBoundingClientRect().width + "px";
    m.style.padding = cs.padding;   // 跟随主题的卡片内边距
    m.innerHTML = '<div class="face-inner">' + html + "</div>";
    var h = m.scrollHeight;
    m.innerHTML = "";
    return h;
  }
  function applyHeight(html) {
    card.style.height = Math.min(measureHeight(html), maxCardHeight()) + "px";
  }

  // ---------- 随机取一条 ----------
  function candidates() {
    var ig = ignoredSet();
    return FLAT.filter(function (h) { return !ig.has(h.id); });
  }
  function pick() {
    var pool = candidates();
    var next = pool.filter(function (h) { return h !== current; });
    if (next.length === 0) next = pool;
    if (next.length === 0) return null;
    return next[Math.floor(Math.random() * next.length)];
  }

  // ---------- 渲染 ----------
  function renderMeta(h) {
    if (h.isLastYear) {
      dateEl.textContent = "去年的今天 · " + md(h.ts);
      egg.hidden = true;
    } else {
      var now = new Date();
      dateEl.textContent = now.getFullYear() + "." + pad(now.getMonth() + 1) + "." + pad(now.getDate());
      egg.hidden = !lastYearLine;
    }
    if (h.link) {
      openLink.href = h.link;
      openLink.style.display = "block";
    } else {
      openLink.style.display = "none";
    }
  }
  function render(h) {
    if (!h) return;
    current = h;
    face.style.opacity = "0";            // 先淡出
    clearTimeout(swapTimer);
    swapTimer = setTimeout(function () {
      faceInner.innerHTML = faceHTML(h);
      face.scrollTop = 0;
      applyHeight(faceHTML(h));
      renderMeta(h);
      face.style.opacity = "";           // 再淡入
    }, 180);
  }
  function nextCard() {
    render(pick());
  }

  // ---------- 彩蛋：去年的今天 ----------
  function findLastYear() {
    var now = new Date();
    var target = (now.getMonth() + 1) + "-" + now.getDate();
    var hits = FLAT.filter(function (h) {
      return h.ts && md(h.ts) === target;
    });
    if (hits.length === 0) return null;
    return hits[Math.floor(Math.random() * hits.length)];
  }

  // ---------- 标记不重要 ----------
  function ignoreCurrent() {
    if (!current) return;
    var ig = load(K_IGNORED);
    if (ig.indexOf(current.id) === -1) ig.push(current.id);
    save(K_IGNORED, ig);
    card.classList.add("ignored");
    setTimeout(function () {
      card.classList.remove("ignored");
      nextCard();
    }, 180);
  }

  // ---------- 写想法 ----------
  function openNote() {
    if (!current) return;
    $("note-quote").textContent = current.text;
    $("note-input").value = "";
    $("note-overlay").classList.add("open");
    setTimeout(function () { $("note-input").focus(); }, 120);
  }
  function saveNote() {
    var v = $("note-input").value.trim();
    if (!v) return;
    var ts = Math.floor(Date.now() / 1000);
    var list = thoughts();
    list.unshift({
      id: current.id,
      text: current.text,
      book: current.book,
      author: current.author,
      note: v,
      ts: ts,
    });
    save(K_THOUGHTS, list);
    $("note-overlay").classList.remove("open");
    refreshThoughtsCount();
  }

  // ---------- 想法回顾 ----------
  function renderThoughts() {
    var list = thoughts();
    var el = $("thoughts-list");
    el.innerHTML = "";
    if (list.length === 0) {
      el.innerHTML = '<div class="list-empty">还没写下想法——遇到想留住的句子时，点卡片下的「写想法」。</div>';
      return;
    }
    list.forEach(function (t) {
      var d = document.createElement("div");
      d.className = "thought";
      d.innerHTML =
        '<div class="t-quote">' + esc(t.text) + "</div>" +
        '<div class="t-note">' + esc(t.note) + "</div>" +
        '<div class="t-meta">' + fmtDate(t.ts) + " · 《" + esc(t.book) + "》</div>";
      el.appendChild(d);
    });
  }
  function refreshThoughtsCount() {
    var n = thoughts().length;
    $("thoughts-count").textContent = n ? " (" + n + ")" : "";
  }

  // ---------- 事件：点按换句 / 滑动滚动（不换句）/ 长按忽略 ----------
  var pressTimer = null;
  var tapX = 0, tapY = 0, moved = false;
  function startPress(e) {
    if (e.target.closest("a, button")) return;
    longPress = false;
    moved = false;
    tapX = e.touches ? e.touches[0].clientX : e.clientX;
    tapY = e.touches ? e.touches[0].clientY : e.clientY;
    pressTimer = setTimeout(function () {
      longPress = true;
      ignoreCurrent();
      navigator.vibrate && navigator.vibrate(30);
    }, 500);
  }
  function movePress(e) {
    var x = e.touches ? e.touches[0].clientX : e.clientX;
    var y = e.touches ? e.touches[0].clientY : e.clientY;
    // 位移超过阈值 → 是滑动/滚动，不是点按，也不是长按
    if (Math.abs(x - tapX) > 8 || Math.abs(y - tapY) > 8) moved = true;
    if (moved) clearTimeout(pressTimer);
  }
  function endPress(e) {
    clearTimeout(pressTimer);
    if (longPress) return;
    if (e.target.closest("a, button")) return;
    if (moved) return;   // 滑动过 → 只滚动内容，不换句
    nextCard();
  }

  card.addEventListener("touchstart", startPress, { passive: true });
  card.addEventListener("touchmove", movePress, { passive: true });
  card.addEventListener("touchend", endPress);
  card.addEventListener("mousedown", startPress);
  card.addEventListener("mousemove", movePress);
  card.addEventListener("mouseup", endPress);
  card.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // ---------- 其他事件 ----------
  egg.addEventListener("click", function () {
    if (lastYearLine) {
      var h = lastYearLine;
      h.isLastYear = true;
      render(h);
    }
  });

  noteBtn.addEventListener("click", openNote);
  $("note-close").addEventListener("click", function () { $("note-overlay").classList.remove("open"); });
  $("note-save").addEventListener("click", saveNote);
  $("note-overlay").addEventListener("click", function (e) {
    if (e.target === $("note-overlay")) $("note-overlay").classList.remove("open");
  });

  thoughtsBtn.addEventListener("click", function () {
    renderThoughts();
    $("thoughts-overlay").classList.add("open");
  });
  $("thoughts-close").addEventListener("click", function () { $("thoughts-overlay").classList.remove("open"); });
  $("thoughts-overlay").addEventListener("click", function (e) {
    if (e.target === $("thoughts-overlay")) $("thoughts-overlay").classList.remove("open");
  });

  // 键盘（桌面预览用）
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") nextCard();
  });

  // ---------- 主题切换 ----------
  var K_THEME = "yl_theme";
  var metaTheme = document.querySelector('meta[name="theme-color"]');
  function readTheme() {
    try { return localStorage.getItem(K_THEME) || ""; } catch (e) { return ""; }
  }
  function writeTheme(t) {
    try { localStorage.setItem(K_THEME, t); } catch (e) {}
  }
  var THEME_META = { "": "#0E1626", "ao3": "#111111", "ao3-light": "#ffffff", "paper": "#ece3c9" };
  function nextThemeName(t) {
    if (t === "ao3") return "日间";
    if (t === "ao3-light") return "报纸";
    if (t === "paper") return "电台";
    return "AO3";
  }
  function applyTheme(t) {
    document.body.removeAttribute("data-theme");
    if (t) document.body.setAttribute("data-theme", t);
    if (metaTheme) metaTheme.setAttribute("content", THEME_META[t] || THEME_META[""]);
    themeBtn.textContent = nextThemeName(t);
  }
  themeBtn.addEventListener("click", function () {
    var cur = readTheme();
    var next = cur === "" ? "ao3" : cur === "ao3" ? "ao3-light" : cur === "ao3-light" ? "paper" : "";
    writeTheme(next);
    applyTheme(next);
  });

  window.addEventListener("resize", function () {
    if (current) applyHeight(faceHTML(current));
  });

  // ---------- 口令（首次设置 / 之后验证） ----------
  var K_PIN = "yl_pin";
  function hashPin(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h >>> 0);
  }
  function readPin() {
    try { return localStorage.getItem(K_PIN) || ""; } catch (e) { return ""; }
  }
  function writePin(v) {
    try { localStorage.setItem(K_PIN, v); } catch (e) {}
  }

  function setupGate(onOk) {
    var stored = readPin();
    var overlay = document.createElement("div");
    var box = document.createElement("div");
    var title = document.createElement("p");
    var desc = document.createElement("p");
    var input = document.createElement("input");
    var input2 = document.createElement("input");
    var err = document.createElement("p");
    var btn = document.createElement("button");
    var tip = document.createElement("p");

    overlay.className = "gate";
    box.className = "gate-box";
    title.className = "gate-title";
    desc.className = "gate-desc";
    err.className = "gate-err";
    tip.className = "gate-tip";
    input.className = "gate-input";
    input2.className = "gate-input";
    btn.className = "gate-btn";

    [title, desc, input, input2, err, btn, tip].forEach(function (el) { box.appendChild(el); });
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    title.textContent = "纸间";
    input.setAttribute("type", "password");
    input.setAttribute("placeholder", "输入口令");
    input2.setAttribute("type", "password");
    input2.setAttribute("placeholder", "再输一遍");
    err.setAttribute("role", "alert");
    btn.setAttribute("type", "button");
    tip.textContent = "口令存在本机浏览器 · 清除浏览器缓存会重置";

    if (stored) {
      desc.textContent = "输入口令进入";
      input2.style.display = "none";
      btn.textContent = "进入";
    } else {
      desc.textContent = "设置一个口令，保护你的划线";
      btn.textContent = "设置口令";
    }

    function fail(msg) {
      err.textContent = msg;
      input.value = "";
      if (input2.style.display !== "none") input2.value = "";
      input.focus();
    }
    function submit() {
      var v = input.value.trim();
      if (!v) { fail("口令不能为空"); return; }
      if (stored) {
        if (hashPin(v) === stored) { overlay.remove(); onOk(); }
        else { fail("口令不对"); }
      } else {
        if (v !== input2.value.trim()) { fail("两次输入不一致"); return; }
        writePin(hashPin(v));
        overlay.remove();
        onOk();
      }
    }
    btn.addEventListener("click", submit);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    input2.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    input.focus();
  }

  // ---------- 启动 ----------
  function initApp() {
    lastYearLine = findLastYear();
    if (!lastYearLine) egg.hidden = true;
    render(pick() || FLAT[0]);
    refreshThoughtsCount();
  }

  // PWA 离线缓存
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  applyTheme(readTheme());
  setupGate(initApp);
})();
