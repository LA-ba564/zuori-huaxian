/* 昨日划线 · 每日一句 */
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
  var dateEl = $("date"), quoteEl = $("quote"), sourceEl = $("source");
  var card = $("card"), egg = $("egg"), openLink = $("open-link");
  var noteBtn = $("note-btn"), thoughtsBtn = $("thoughts-btn");

  var current = null;
  var lastYearLine = null;   // 去年今天的那条划线
  var longPress = false;

  function fmtDate(ts) {
    if (!ts) return "";
    var d = new Date(ts * 1000);
    return d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function md(ts) {
    var d = new Date(ts * 1000);
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
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
  function render(h) {
    if (!h) return;
    current = h;
    quoteEl.innerHTML = esc(h.text);
    var author = h.author ? " · " + h.author : "";
    sourceEl.innerHTML = '<span class="book">《' + esc(h.book) + '》</span>' +
      '<span class="author">' + esc(author) + "</span>";

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

  function nextCard() {
    var h = pick();
    if (!h) return;
    card.classList.add("leaving");
    setTimeout(function () {
      card.classList.remove("leaving");
      render(h);
    }, 240);
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
    $("note-overlay").hidden = false;
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
    $("note-overlay").hidden = true;
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

  // ---------- 事件：点屏换卡 / 长按忽略 ----------
  var pressTimer = null;
  function startPress(e) {
    if (e.target.closest("a, button")) return;
    longPress = false;
    pressTimer = setTimeout(function () {
      longPress = true;
      ignoreCurrent();
      navigator.vibrate && navigator.vibrate(30);
    }, 500);
  }
  function cancelPress() {
    clearTimeout(pressTimer);
  }
  function endPress(e) {
    clearTimeout(pressTimer);
    if (longPress) return;
    if (e.target.closest("a, button")) return;
    nextCard();
  }

  card.addEventListener("touchstart", startPress, { passive: true });
  card.addEventListener("touchmove", cancelPress, { passive: true });
  card.addEventListener("touchend", endPress);
  card.addEventListener("mousedown", startPress);
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
  $("note-close").addEventListener("click", function () { $("note-overlay").hidden = true; });
  $("note-save").addEventListener("click", saveNote);
  $("note-overlay").addEventListener("click", function (e) {
    if (e.target === $("note-overlay")) $("note-overlay").hidden = true;
  });

  thoughtsBtn.addEventListener("click", function () {
    renderThoughts();
    $("thoughts-overlay").hidden = false;
  });
  $("thoughts-close").addEventListener("click", function () { $("thoughts-overlay").hidden = true; });
  $("thoughts-overlay").addEventListener("click", function (e) {
    if (e.target === $("thoughts-overlay")) $("thoughts-overlay").hidden = true;
  });

  // 键盘（桌面预览用）
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") nextCard();
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
    var inputStyle = "width:100%;box-sizing:border-box;background:#0C1526;border:1px solid #2A3245;border-radius:12px;color:#E9C9A0;font-family:inherit;font-size:16px;letter-spacing:.2em;text-align:center;padding:12px 14px;margin-bottom:10px;";

    [title, desc, input, input2, err, btn, tip].forEach(function (el) { box.appendChild(el); });
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.setAttribute("style", "position:fixed;inset:0;background:#0E1626;display:flex;align-items:center;justify-content:center;z-index:100;");
    box.setAttribute("style", "width:86%;max-width:360px;text-align:center;");
    title.setAttribute("style", "color:#E9C9A0;font-size:20px;letter-spacing:.15em;margin-bottom:8px;");
    title.textContent = "昨日划线";
    desc.setAttribute("style", "color:#8A93A8;font-size:13px;margin-bottom:20px;");
    input.setAttribute("type", "password");
    input.setAttribute("placeholder", "输入口令");
    input.setAttribute("style", inputStyle);
    input2.setAttribute("type", "password");
    input2.setAttribute("placeholder", "再输一遍");
    input2.setAttribute("style", inputStyle);
    err.setAttribute("style", "color:#D9A85B;font-size:13px;margin-bottom:10px;min-height:1em;");
    btn.setAttribute("type", "button");
    btn.setAttribute("style", "width:100%;padding:14px 0;border-radius:12px;background:#D9A85B;color:#0E1626;font-family:inherit;font-size:15px;letter-spacing:.1em;border:none;cursor:pointer;font-weight:600;");
    tip.setAttribute("style", "color:#3A4155;font-size:11px;margin-top:16px;letter-spacing:.05em;");
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

  setupGate(initApp);
})();
