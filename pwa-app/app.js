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

  // ---------- 启动 ----------
  lastYearLine = findLastYear();
  if (!lastYearLine) egg.hidden = true;
  render(pick() || FLAT[0]);
  refreshThoughtsCount();

  // PWA 离线缓存
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
