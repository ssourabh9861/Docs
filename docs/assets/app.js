/* ============================================================
   DSA Revision site — shared client logic
   - Loads data/progress.json + data/meta.json (status from tracker)
   - Renders the dashboard (index) and topic pages
   - Problem solutions are LAZY-LOADED only when a card is clicked
   ============================================================ */
(function () {
  "use strict";

  // Repo/site config — used to build the "Sync now" link to the Action.
  var GH_OWNER = "ssourabh9861";
  var GH_REPO = "Docs";
  var SYNC_WORKFLOW = "sync-tracker.yml";

  // --- helpers ---------------------------------------------------
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function diffClass(d) {
    d = (d || "").toLowerCase();
    if (d.indexOf("very") === 0) return "veryhard";
    if (d.indexOf("hard") === 0) return "hard";
    return "medium";
  }
  function esc(s) {
    return (s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function param(name) {
    return new URLSearchParams(location.search).get(name);
  }
  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + " -> " + r.status);
      return r.json();
    });
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      return d.toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch (e) { return iso; }
  }

  // --- theme -----------------------------------------------------
  function initTheme() {
    var saved = localStorage.getItem("dsa-theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    var btn = document.getElementById("themeBtn");
    if (!btn) return;
    function label() {
      var t = document.documentElement.getAttribute("data-theme");
      var dark = t !== "light";
      btn.innerHTML = dark ? "☀️ Light" : "🌙 Dark";
    }
    label();
    btn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      var next = cur === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("dsa-theme", next);
      label();
    });
  }

  function syncUrl() {
    return "https://github.com/" + GH_OWNER + "/" + GH_REPO +
      "/actions/workflows/" + SYNC_WORKFLOW;
  }

  // ============================================================
  // INDEX PAGE
  // ============================================================
  function renderIndex(meta) {
    // progress ring
    var ring = document.getElementById("ring");
    if (ring) {
      var R = 56, C = 2 * Math.PI * R;
      var pct = meta.percent || 0;
      ring.innerHTML =
        '<svg width="132" height="132" viewBox="0 0 132 132">' +
        '<defs><linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="#7c9cff"/><stop offset="100%" stop-color="#a371f7"/>' +
        "</linearGradient></defs>" +
        '<circle class="track" cx="66" cy="66" r="' + R + '" fill="none" stroke-width="11"/>' +
        '<circle class="bar" cx="66" cy="66" r="' + R + '" fill="none" stroke-width="11" ' +
        'stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/>' +
        "</svg>" +
        '<div class="center"><div class="pct">' + pct + '%</div>' +
        '<div class="lbl">solved</div></div>';
      // animate
      requestAnimationFrame(function () {
        var bar = ring.querySelector(".bar");
        bar.style.strokeDashoffset = C * (1 - pct / 100);
      });
    }

    // difficulty bars
    var db = document.getElementById("diffbars");
    if (db) {
      var order = ["Medium", "Hard", "Very Hard"];
      db.innerHTML = "";
      order.forEach(function (d) {
        var row = (meta.byDifficulty || {})[d];
        if (!row) return;
        var p = row.total ? Math.round((100 * row.solved) / row.total) : 0;
        var r = el("div", "diffrow");
        r.innerHTML =
          '<span class="name">' + d + "</span>" +
          '<span class="bar-outer"><span class="bar-inner ' + diffClass(d) +
          '" style="width:0%"></span></span>' +
          '<span class="val">' + row.solved + " / " + row.total + "</span>";
        db.appendChild(r);
        requestAnimationFrame(function () {
          r.querySelector(".bar-inner").style.width = p + "%";
        });
      });
    }

    // sync banner
    var sb = document.getElementById("syncBanner");
    if (sb) {
      sb.innerHTML =
        '<span class="dot"></span>' +
        "<span>Status synced from your <b>DSA tracker</b> sheet · last updated <b>" +
        fmtDate(meta.lastSynced) + "</b> <span style=\"color:var(--text-faint)\">(" +
        esc(meta.source || "snapshot") + ")</span></span>" +
        '<a class="btn" href="' + syncUrl() + '" target="_blank" rel="noopener">⟳ Sync now</a>';
    }

    // topic grid
    var grid = document.getElementById("topicGrid");
    if (grid) {
      grid.innerHTML = "";
      (meta.topics || []).forEach(function (t) {
        var p = t.total ? Math.round((100 * t.solved) / t.total) : 0;
        var a = el("a", "card");
        a.href = "topic.html?t=" + encodeURIComponent(t.topicSlug);
        var subline = t.subtopics && t.subtopics.length > 1
          ? t.subtopics.length + " sub-patterns"
          : "core pattern";
        a.innerHTML =
          '<div class="t-name">' + esc(t.topic) + "</div>" +
          '<div class="t-sub">' + subline + "</div>" +
          '<div class="t-meter">' +
          '<div class="t-count"><span>' + p + '% complete</span>' +
          "<span><b>" + t.solved + "</b> / " + t.total + "</span></div>" +
          '<div class="mini-bar"><span style="width:0%"></span></div></div>';
        grid.appendChild(a);
        requestAnimationFrame(function () {
          a.querySelector(".mini-bar > span").style.width = p + "%";
        });
      });
    }
  }

  // ============================================================
  // TOPIC PAGE
  // ============================================================
  function renderTopic(problems, meta) {
    var slug = param("t");
    var mine = problems.filter(function (p) { return p.topicSlug === slug; });
    var topicName = mine.length ? mine[0].topic : slug;
    document.title = topicName + " · DSA Revision";

    var h = document.getElementById("topicHead");
    var solved = mine.filter(function (p) { return p.solved; }).length;
    if (h) {
      h.innerHTML =
        '<div><div class="crumbs"><a href="index.html">All topics</a> › ' +
        esc(topicName) + "</div>" +
        "<h1>" + esc(topicName) + "</h1>" +
        '<div class="sub">' + solved + " of " + mine.length +
        " solved · click any problem to reveal the full write-up</div></div>";
    }

    var listWrap = document.getElementById("plist");
    var state = { filter: "all", q: "" };

    function passes(p) {
      if (state.filter === "solved" && !p.solved) return false;
      if (state.filter === "unsolved" && p.solved) return false;
      if (state.q) {
        var hay = (p.problem + " " + p.subtopic + " " + p.difficulty).toLowerCase();
        if (hay.indexOf(state.q) === -1) return false;
      }
      return true;
    }

    function draw() {
      listWrap.innerHTML = "";
      var groups = {};
      var order = [];
      mine.forEach(function (p) {
        if (!passes(p)) return;
        if (!groups[p.subtopic]) { groups[p.subtopic] = []; order.push(p.subtopic); }
        groups[p.subtopic].push(p);
      });
      if (!order.length) {
        listWrap.appendChild(el("div", "empty", "No problems match your filters."));
        return;
      }
      var multi = order.length > 1;
      order.forEach(function (sub) {
        if (multi) listWrap.appendChild(el("div", "subgroup-h", esc(sub)));
        var pl = el("div", "plist");
        groups[sub].forEach(function (p) { pl.appendChild(problemCard(p)); });
        listWrap.appendChild(pl);
      });
    }

    function problemCard(p) {
      var d = document.createElement("details");
      d.className = "pcard" + (p.solved ? " solved" : "");
      var dc = diffClass(p.difficulty);
      var note = p.notes ? '<span class="p-note">“' + esc(p.notes) + '”</span>' : "";
      var lock = !p.solved ? '<span class="locktag">tap to reveal</span>' : "";
      var summary = el("summary");
      summary.innerHTML =
        '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>' +
        '<span class="p-check">✓</span>' +
        '<span class="p-title">' + esc(p.problem) + "</span>" +
        note +
        '<span class="badge ' + dc + '">' + esc(p.difficulty) + "</span>" +
        lock;
      d.appendChild(summary);
      var body = el("div", "p-body");
      body.innerHTML = '<div class="loading">Loading write-up…</div>';
      d.appendChild(body);

      var loaded = false;
      d.addEventListener("toggle", function () {
        if (d.open && !loaded) {
          loaded = true;
          loadContent(p, body);
        }
      });
      return d;
    }

    function loadContent(p, body) {
      var url = "content/" + p.topicSlug + "/" + p.slug + ".md";
      fetch(url, { cache: "no-cache" })
        .then(function (r) {
          if (!r.ok) throw new Error("404");
          return r.text();
        })
        .then(function (md) {
          var html = window.marked ? window.marked.parse(md) : "<pre>" + esc(md) + "</pre>";
          body.innerHTML = '<div class="md">' + html + "</div>";
        })
        .catch(function () {
          body.innerHTML =
            '<div class="missing">📝 The full write-up for <b>' + esc(p.problem) +
            "</b> is being generated. Check back after the next content sync.</div>";
        });
    }

    // controls
    var seg = document.querySelectorAll("#seg button");
    seg.forEach(function (b) {
      b.addEventListener("click", function () {
        seg.forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        state.filter = b.dataset.f;
        draw();
      });
    });
    var si = document.getElementById("searchInput");
    if (si) si.addEventListener("input", function () {
      state.q = si.value.trim().toLowerCase();
      draw();
    });

    draw();
  }

  // ============================================================
  // BOOT
  // ============================================================
  function boot() {
    initTheme();
    var page = document.body.dataset.page;
    if (page === "index") {
      getJSON("data/meta.json").then(renderIndex).catch(showErr);
    } else if (page === "topic") {
      Promise.all([getJSON("data/progress.json"), getJSON("data/meta.json")])
        .then(function (r) { renderTopic(r[0], r[1]); })
        .catch(showErr);
    }
  }
  function showErr(e) {
    var m = document.getElementById("main") || document.body;
    m.insertBefore(
      el("div", "empty", "⚠️ Could not load data. If viewing locally, run this over a web server (e.g. <code>python3 -m http.server</code>).<br><small>" + esc(String(e)) + "</small>"),
      m.firstChild
    );
  }
  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
