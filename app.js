/* WWW '26 — offline festival guide. Vanilla JS, no deps. */
(function () {
  "use strict";

  var CATS = {
    heal:  { label: "Healing", emoji: "🌿", color: "var(--cat-heal)" },
    chill: { label: "Chill",   emoji: "🌙", color: "var(--cat-chill)" },
    adult: { label: "Adult",   emoji: "🔥", color: "var(--cat-adult)" },
    work:  { label: "Workshop",emoji: "🛠", color: "var(--cat-work)" },
    food:  { label: "Food",    emoji: "🍲", color: "var(--cat-food)" },
    party: { label: "Party",   emoji: "🎉", color: "var(--cat-party)" },
    kids:  { label: "Kids",    emoji: "🧸", color: "var(--cat-kids)" },
    other: { label: "Other",   emoji: "✨", color: "var(--cat-other)" },
  };
  var DAY_ORDER = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var DAY_LABEL = { Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

  var LS = {
    favs: "www26.favs",
    prefs: "www26.prefs",
  };

  var state = {
    events: [],
    meta: {},
    view: "schedule",
    search: "",
    day: null,          // null = all days
    barrio: "",         // "" = all barrios/camps
    cats: new Set(),    // empty = all categories
    likedOnly: false,
    hideAdult: false,
    forceList: false,   // force card list instead of timetable
    favs: new Set(),
    open: new Set(),
  };

  // ---------- persistence ----------
  function loadPrefs() {
    try {
      var f = JSON.parse(localStorage.getItem(LS.favs) || "[]");
      state.favs = new Set(f);
    } catch (e) {}
    try {
      var p = JSON.parse(localStorage.getItem(LS.prefs) || "{}");
      if (p.likedOnly) state.likedOnly = true;
      if (p.hideAdult) state.hideAdult = true;
      if (p.forceList) state.forceList = true;
      if (["schedule", "favs", "camps"].indexOf(p.view) >= 0) state.view = p.view;
    } catch (e) {}
  }
  function saveFavs() { localStorage.setItem(LS.favs, JSON.stringify([].concat(Array.from(state.favs)))); }
  function savePrefs() {
    localStorage.setItem(LS.prefs, JSON.stringify({
      likedOnly: state.likedOnly, hideAdult: state.hideAdult,
      forceList: state.forceList, view: state.view,
    }));
  }

  // ---------- helpers ----------
  function endTime(time, dur) {
    var parts = time.split(":");
    var mins = (+parts[0]) * 60 + (+parts[1]) + dur;
    mins = ((mins % 1440) + 1440) % 1440;
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }
  function timeRange(e) {
    if (e.dur >= 1440) return "All day";
    return e.time + "–" + endTime(e.time, e.dur);
  }
  function durLabel(dur) {
    if (dur >= 1440) return "";
    if (dur >= 60) { var h = dur / 60; return (Number.isInteger(h) ? h : h.toFixed(1)) + "h"; }
    return dur + "m";
  }
  function timeToMin(t) { var p = t.split(":"); return (+p[0]) * 60 + (+p[1]); }
  // A festival "day" runs 07:00 -> 06:59; events before 07:00 are late-night, sort last.
  var DAY_START = 7 * 60;
  function dayMin(t) { var m = timeToMin(t); return m < DAY_START ? m + 1440 : m; }
  function dayHour(h) { return h < 7 ? h + 24 : h; }

  // Real datetime of an event's occurrence on a given festival day (00:00–06:59
  // belongs to the next calendar day, matching the 07:00 day boundary).
  function occEnd(e, day) {
    var ds = state.meta.dayDates && state.meta.dayDates[day];
    if (!ds) return null;
    var d = ds.split("-").map(Number), t = e.time.split(":").map(Number);
    var off = timeToMin(e.time) < DAY_START ? 1 : 0;
    return new Date(d[0], d[1] - 1, d[2] + off, t[0], t[1], 0).getTime() + (e.dur || 60) * 60000;
  }
  function isPast(e, day) { var end = occEnd(e, day); return end != null && end < Date.now(); }
  function isPastAll(e) { return e.days.every(function (d) { return isPast(e, d); }); }

  // Which festival day "now" falls in, and its position on the day timeline
  // (dm in dayMin units: 07:00 = 420). null if outside the festival.
  function nowInfo() {
    var dd = state.meta.dayDates; if (!dd) return null;
    var now = Date.now();
    for (var i = 0; i < DAY_ORDER.length; i++) {
      var ds = dd[DAY_ORDER[i]]; if (!ds) continue;
      var p = ds.split("-").map(Number);
      var start = new Date(p[0], p[1] - 1, p[2], 7, 0, 0).getTime();
      if (now >= start && now < start + 86400000) {
        return { day: DAY_ORDER[i], dm: 420 + Math.round((now - start) / 60000) };
      }
    }
    return null;
  }
  function firstDayIdx(e) {
    var min = 99;
    e.days.forEach(function (d) { var i = DAY_ORDER.indexOf(d); if (i >= 0 && i < min) min = i; });
    return min;
  }
  // ---------- filtering ----------
  function passesFilters(e) {
    if (state.hideAdult && e.cat === "adult") return false;
    if (state.likedOnly && !state.favs.has(e.id)) return false;
    if (state.barrio && e.camp !== state.barrio) return false;
    if (state.cats.size && !state.cats.has(e.cat)) return false;
    if (state.day && e.days.indexOf(state.day) < 0) return false;
    if (state.search) {
      var q = state.search.toLowerCase();
      var hay = (e.title + " " + e.camp + " " + e.loc + " " + e.desc).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  // ---------- rendering ----------
  var listEl = document.getElementById("list");

  function catTag(cat) {
    var c = CATS[cat] || CATS.other;
    return '<span class="tag" style="--tagc:' + c.color + '">' + c.label + "</span>";
  }

  function cardHTML(e, dayCtx) {
    var fav = state.favs.has(e.id);
    var open = state.open.has(e.id);
    var past = dayCtx ? isPast(e, dayCtx) : isPastAll(e);
    var daysTxt = e.days.length === 6 ? "Every day" : e.days.join(" · ");
    var heartLabel = (fav ? "Remove from liked: " : "Add to liked: ") + e.title;
    return (
      '<article class="card' + (open ? " open" : "") + (past ? " past" : "") + '" data-id="' + e.id + '"' +
        ' tabindex="0" aria-expanded="' + (open ? "true" : "false") + '">' +
        '<div class="card-top">' +
          '<h3 class="card-title">' + escapeHtml(e.title) + "</h3>" +
          '<button class="heart' + (fav ? " on" : "") + '" data-fav="' + e.id +
            '" aria-pressed="' + (fav ? "true" : "false") + '" aria-label="' + escapeHtml(heartLabel) + '">♥</button>' +
        "</div>" +
        '<div class="meta">' +
          '<span>🕑 ' + timeRange(e) + (durLabel(e.dur) ? " · " + durLabel(e.dur) : "") + "</span>" +
          (e.camp ? '<span class="camp">🏕 ' + escapeHtml(e.camp) + "</span>" : "") +
          (e.loc ? "<span>📍 " + escapeHtml(e.loc) + "</span>" : "") +
          catTag(e.cat) +
        "</div>" +
        '<div class="days-line">📅 ' + daysTxt + "</div>" +
        '<div class="desc">' + escapeHtml(e.desc || "No description.") +
          (gcalUrl(e) ? '<a class="gcal" href="' + gcalUrl(e) + '" target="_blank" rel="noopener">＋ Add to Google Calendar</a>' : "") +
        "</div>" +
      "</article>"
    );
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function render() {
    var v = state.view;
    var html = "";

    // Schedule "timetable" needs a single day: desktop = category grid,
    // mobile = collision day view. "All days" (or forced list) shows the list.
    if (v === "schedule" && !state.forceList && state.day) {
      var gItems = state.events.filter(passesFilters);
      if (desktopMQ.matches) {
        listEl.className = "list grid-mode";
        listEl.innerHTML = gridHTML(gItems);
        fitGrid();
        if (state._scrollToNow) {
          var ni2 = nowInfo();
          if (ni2 && ni2.day === state.day) {
            var hs = ("0" + Math.floor((ni2.dm % 1440) / 60)).slice(-2);
            listEl.querySelectorAll(".gtime").forEach(function (c) { if (c.textContent === hs) c.scrollIntoView({ block: "center" }); });
          }
        }
      } else {
        listEl.className = "list tt-mode";
        listEl.innerHTML = timetableHTML(gItems, state.day);
        if (state._scrollToNow) {
          var nl = listEl.querySelector(".tt-now");
          if (nl) nl.scrollIntoView({ block: "center" });
        }
      }
      state._scrollToNow = false;
      updateStatus(gItems);
      return;
    }
    listEl.className = "list";

    var items = state.events.filter(passesFilters);

    if (v === "favs") {
      var favItems = items.filter(function (e) { return state.favs.has(e.id); });
      var favBar = '<div class="favs-actions"><button class="ghost-btn" data-action="gcal">📅 Add liked to Google Calendar</button></div>';
      html = favBar + (favItems.length ? groupByDay(favItems)
        : emptyMsg("No liked events yet. Tap ♡ on events you like — they gather here, ready to add to your calendar."));
    } else if (v === "camps") {
      html = groupByCamp(items);
    } else { // schedule
      html = groupByDay(items);
    }
    listEl.innerHTML = html;
    updateStatus(items);
  }

  function updateStatus(items) {
    var status = document.getElementById("filterStatus");
    if (status) status.textContent = items.length + " events" +
      (state.day ? " on " + DAY_LABEL[state.day] : "") +
      (state.barrio ? " at " + state.barrio : "");
  }

  function syncDayPills() {
    var pills = document.querySelectorAll("#dayPills .pill");
    pills.forEach(function (p) {
      p.classList.toggle("active", (p.getAttribute("data-day") || "") === (state.day || ""));
    });
  }

  function emptyMsg(t) { return '<p class="empty">' + t + "</p>"; }

  // ---------- desktop timetable grid ----------
  var desktopMQ = window.matchMedia("(min-width: 1000px)");
  function gridActive() { return desktopMQ.matches && state.view === "schedule" && !state.forceList && !!state.day; }

  function gridHTML(items) {
    // items are already filtered (incl. day + category). Grid shows one day.
    var cats = Object.keys(CATS);
    var visibleCats = state.cats.size ? cats.filter(function (c) { return state.cats.has(c); }) : cats;
    // bucket by start-hour -> category
    var grid = {}, hoursSet = {};
    items.forEach(function (e) {
      var h = parseInt(e.time.slice(0, 2), 10);
      hoursSet[h] = true;
      (grid[h] = grid[h] || {});
      (grid[h][e.cat] = grid[h][e.cat] || []).push(e);
    });
    var hours = Object.keys(hoursSet).map(Number).sort(function (a, b) { return dayHour(a) - dayHour(b); });
    if (!hours.length) return '<div class="gridwrap">' + emptyMsg("No events for this day/filter.") + "</div>";

    var cols = visibleCats.length;
    var tpl = "3rem repeat(" + cols + ", minmax(0, 1fr))";
    var html = '<div class="gridwrap"><div class="ggrid" style="grid-template-columns:' + tpl + '">';
    // header row
    html += '<div class="gcell gcorner gtime" style="top:0"></div>';
    visibleCats.forEach(function (c) {
      var m = CATS[c];
      html += '<div class="gcell ghead" style="--c:' + m.color + '">' + m.emoji + " " + m.label + "</div>";
    });
    // body rows
    hours.forEach(function (h) {
      var hh = (h < 10 ? "0" : "") + h;
      html += '<div class="gcell gtime">' + hh + "</div>";
      visibleCats.forEach(function (c) {
        var list = (grid[h] && grid[h][c]) || [];
        list.sort(function (a, b) { return dayMin(a.time) - dayMin(b.time) || b.score - a.score; });
        html += '<div class="gcell gbody">' + list.map(function (e) { return chipHTML(e, state.day); }).join("") + "</div>";
      });
    });
    html += "</div></div>";
    return html;
  }

  function chipHTML(e, day) {
    var fav = state.favs.has(e.id), past = day && isPast(e, day);
    return '<button class="chip-ev cat-' + e.cat + (fav ? " fav" : "") + (past ? " past" : "") + '" data-chip="' + e.id + '" title="' +
      escapeHtml(e.title + " — " + (e.camp || "") + " · " + timeRange(e)) + '">' +
      '<span class="cet">' + e.time + "</span>" + escapeHtml(e.title) + "</button>";
  }

  function fitGrid() {
    var wrap = listEl.querySelector(".gridwrap");
    if (!wrap) return;
    var tb = document.querySelector(".topbar");
    var top = tb ? tb.getBoundingClientRect().height : 0;
    var h = window.innerHeight - top - 58 /* tabbar */;
    wrap.style.height = Math.max(200, h) + "px";
  }

  // ---------- mobile timetable (collision day view) ----------
  var TT_PPM = 1.3;   // px per minute (vertical scale)
  var TT_LONG = 240;  // dur >= 4h -> long/all-day strip, not the timed grid
  // Greedy column packing per overlap-cluster so concurrent events sit side by side.
  function packColumns(evs) {
    var group = [], colsEnd = [];
    function flush() {
      var n = colsEnd.length;
      group.forEach(function (x) { x.cols = n; });
      group = []; colsEnd = [];
    }
    evs.forEach(function (x) {
      if (colsEnd.length && x.start >= Math.max.apply(null, colsEnd)) flush();
      var placed = -1;
      for (var i = 0; i < colsEnd.length; i++) { if (colsEnd[i] <= x.start) { placed = i; break; } }
      if (placed < 0) { placed = colsEnd.length; colsEnd.push(x.end); }
      else colsEnd[placed] = x.end;
      x.col = placed; group.push(x);
    });
    flush();
  }

  function timetableHTML(items, day) {
    var evs = items.filter(function (e) { return e.days.indexOf(day) >= 0; });
    var longer = [], timed = [];
    evs.forEach(function (e) {
      if ((e.dur || 60) >= TT_LONG) { longer.push(e); return; }
      var s = dayMin(e.time);
      timed.push({ e: e, start: s, end: s + Math.max(20, e.dur || 60) });
    });
    if (!timed.length && !longer.length) return emptyMsg("No events for this day/filter.");
    longer.sort(function (a, b) { return dayMin(a.time) - dayMin(b.time); });
    timed.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
    packColumns(timed);

    var minS = timed.length ? timed[0].start : 7 * 60;
    var maxE = timed.length ? Math.max.apply(null, timed.map(function (x) { return x.end; })) : 24 * 60;
    minS = Math.floor(minS / 60) * 60; maxE = Math.ceil(maxE / 60) * 60;
    // Fixed-width columns + horizontal scroll: concurrent events sit in adjacent
    // columns (readable), sticky time gutter on the left keeps orientation.
    var GUT = 42, COLW = 104, GAP = 3;
    var maxCols = timed.reduce(function (m, x) { return Math.max(m, x.cols || 1); }, 1);
    var canvasW = GUT + maxCols * COLW;
    var H = (maxE - minS) * TT_PPM;

    var html = "";
    if (longer.length) {
      html += '<div class="tt-allday"><span class="tt-adlabel">long / all&#8209;day</span><div class="tt-adchips">' +
        longer.map(function (e) {
          return '<button class="tt-chip cat-' + e.cat + (state.favs.has(e.id) ? " fav" : "") + (isPast(e, day) ? " past" : "") + '" data-chip="' + e.id +
            '"><span class="tt-et">' + e.time + "</span>" + escapeHtml(e.title) + "</button>";
        }).join("") + "</div></div>";
    }
    html += '<div class="tt-scroll"><div class="tt-canvas" style="width:' + canvasW + 'px;height:' + H + 'px">';
    // sticky time gutter
    html += '<div class="tt-gutter" style="height:' + H + 'px">';
    for (var h = minS; h <= maxE; h += 60) {
      var clock = Math.floor((h % 1440) / 60);
      html += '<div class="tt-hlabel" style="top:' + ((h - minS) * TT_PPM) + 'px">' + (clock < 10 ? "0" : "") + clock + "</div>";
    }
    html += "</div>";
    // hour lines across the canvas
    for (var h2 = minS; h2 <= maxE; h2 += 60) {
      html += '<div class="tt-hline" style="top:' + ((h2 - minS) * TT_PPM) + 'px;left:' + GUT + 'px;width:' + (canvasW - GUT) + 'px"></div>';
    }
    // "now" line (only when viewing the current festival day)
    var ni = nowInfo();
    if (ni && ni.day === day && ni.dm >= minS && ni.dm <= maxE) {
      html += '<div class="tt-now" style="top:' + ((ni.dm - minS) * TT_PPM) + 'px;left:' + (GUT - 4) + 'px;width:' + (canvasW - GUT + 4) + 'px"><span class="tt-now-dot"></span></div>';
    }
    // event blocks (one fixed column each)
    timed.forEach(function (x) {
      var e = x.e;
      var top = (x.start - minS) * TT_PPM, ht = (x.end - x.start) * TT_PPM;
      var left = GUT + (x.col || 0) * COLW;
      var style = "top:" + top + "px;height:" + (ht - 1) + "px;left:" + left + "px;width:" + (COLW - GAP) + "px;";
      html += '<button class="tt-ev cat-' + e.cat + (state.favs.has(e.id) ? " fav" : "") + (isPast(e, day) ? " past" : "") +
        '" data-chip="' + e.id + '" style="' + style + '" title="' +
        escapeHtml(e.title + " · " + timeRange(e)) + '">' +
        '<span class="tt-et">' + e.time + "</span>" + escapeHtml(e.title) + "</button>";
    });
    html += "</div></div>";
    return html;
  }

  // ---------- detail modal (grid chip -> full card) ----------
  function openModal(id) {
    var e = state.events.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    state.open.add(e.id);
    document.getElementById("modalCard").innerHTML = cardHTML(e);
    var m = document.getElementById("modal");
    m.hidden = false;
    var close = document.getElementById("modalClose");
    if (close) close.focus();
  }
  function closeModal() { document.getElementById("modal").hidden = true; }

  function groupByDay(items) {
    // Expand each event under each day it runs (respecting an active day filter).
    var byDay = {};
    DAY_ORDER.forEach(function (d) { byDay[d] = []; });
    items.forEach(function (e) {
      e.days.forEach(function (d) {
        if (state.day && d !== state.day) return;
        if (byDay[d]) byDay[d].push(e);
      });
    });
    var out = "";
    DAY_ORDER.forEach(function (d) {
      var list = byDay[d];
      if (!list.length) return;
      list.sort(function (a, b) { return dayMin(a.time) - dayMin(b.time) || b.score - a.score; });
      var date = (state.meta.dayDates && state.meta.dayDates[d]) || "";
      var dateTxt = date ? " " + date.slice(8) + "/" + date.slice(5, 7) : "";
      out += '<div class="day-head">' + DAY_LABEL[d] + dateTxt + " · " + list.length + "</div>";
      out += list.map(function (e) { return cardHTML(e, d); }).join("");
    });
    return out || emptyMsg("Nothing matches. Loosen the filters.");
  }

  function groupByCamp(items) {
    var byCamp = {};
    items.forEach(function (e) {
      var c = e.camp || "— No camp —";
      (byCamp[c] = byCamp[c] || []).push(e);
    });
    var names = Object.keys(byCamp).sort(function (a, b) { return a.localeCompare(b); });
    if (!names.length) return emptyMsg("Nothing matches. Loosen the filters.");
    var out = "";
    names.forEach(function (c) {
      var list = byCamp[c].sort(function (a, b) { return b.score - a.score; });
      out += '<div class="day-head">🏕 ' + escapeHtml(c) + " · " + list.length + "</div>";
      out += list.map(cardHTML).join("");
    });
    return out;
  }

  // ---------- filter UI ----------
  function buildFilterUI() {
    var dayPills = document.getElementById("dayPills");
    var allBtn = '<button class="pill active" data-day="">All days</button>';
    dayPills.innerHTML = allBtn + DAY_ORDER.map(function (d) {
      return '<button class="pill" data-day="' + d + '">' + d + "</button>";
    }).join("");

    var chips = document.getElementById("catChips");
    chips.innerHTML = Object.keys(CATS).map(function (k) {
      var c = CATS[k];
      return '<button class="chip" data-cat="' + k + '"><span class="dot" style="background:' + c.color + '"></span>' + c.label + "</button>";
    }).join("");

    dayPills.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-day]"); if (!b) return;
      state.day = b.getAttribute("data-day") || null;
      state._scrollToNow = true;
      dayPills.querySelectorAll(".pill").forEach(function (p) { p.classList.remove("active"); });
      b.classList.add("active");
      if (typeof syncLayoutToggle === "function") syncLayoutToggle();
      render();
    });
    chips.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-cat]"); if (!b) return;
      var cat = b.getAttribute("data-cat");
      if (state.cats.has(cat)) { state.cats.delete(cat); b.classList.remove("active"); }
      else { state.cats.add(cat); b.classList.add("active"); }
      render();
    });

    var search = document.getElementById("search");
    var searchT;
    search.addEventListener("input", function () {
      clearTimeout(searchT);
      searchT = setTimeout(function () { state.search = search.value.trim(); render(); }, 180);
    });

    var barrio = document.getElementById("barrio");
    barrio.addEventListener("change", function () { state.barrio = barrio.value; render(); });

    var lo = document.getElementById("likedOnly");
    var ha = document.getElementById("hideAdult");
    lo.checked = state.likedOnly; ha.checked = state.hideAdult;
    lo.addEventListener("change", function () { state.likedOnly = lo.checked; savePrefs(); render(); });
    ha.addEventListener("change", function () { state.hideAdult = ha.checked; savePrefs(); render(); });
  }

  // ---------- barrio dropdown ----------
  function populateBarrios() {
    var sel = document.getElementById("barrio");
    if (!sel) return;
    var counts = {};
    state.events.forEach(function (e) { if (e.camp) counts[e.camp] = (counts[e.camp] || 0) + 1; });
    var names = Object.keys(counts).sort(function (a, b) { return a.localeCompare(b); });
    var frag = names.map(function (c) {
      return '<option value="' + escapeHtml(c) + '">🏕 ' + escapeHtml(c) + " (" + counts[c] + ")</option>";
    }).join("");
    sel.insertAdjacentHTML("beforeend", frag);
  }

  // ---------- tabs ----------
  function buildTabs() {
    var tabs = document.querySelectorAll(".tab");
    function activate(view) {
      state.view = view; savePrefs();
      tabs.forEach(function (t) {
        var on = t.getAttribute("data-view") === view;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      if (typeof syncLayoutToggle === "function") syncLayoutToggle();
      window.scrollTo(0, 0);
      render();
    }
    tabs.forEach(function (t) {
      t.addEventListener("click", function () { activate(t.getAttribute("data-view")); });
      if (t.getAttribute("data-view") === state.view) t.classList.add("active");
      else t.classList.remove("active");
    });
  }

  // ---------- card interactions (event delegation) ----------
  function bindList() {
    listEl.addEventListener("click", function (ev) {
      if (ev.target.closest("a.gcal")) return; // let the Google Calendar link open
      var sync = ev.target.closest('[data-action="gcal"]');
      if (sync) { syncGoogleCalendar(); return; }
      var chip = ev.target.closest("[data-chip]");
      if (chip) { openModal(chip.getAttribute("data-chip")); return; }
      var favBtn = ev.target.closest("[data-fav]");
      if (favBtn) {
        ev.stopPropagation();
        var id = favBtn.getAttribute("data-fav");
        if (state.favs.has(id)) state.favs.delete(id); else state.favs.add(id);
        saveFavs();
        var nowFav = state.favs.has(id);
        favBtn.classList.toggle("on", nowFav);
        favBtn.setAttribute("aria-pressed", nowFav ? "true" : "false");
        if (state.view === "favs" || state.likedOnly) render();
        return;
      }
      var card = ev.target.closest(".card");
      if (card) toggleCard(card);
    });
    // Keyboard: Enter/Space expands the focused card.
    listEl.addEventListener("keydown", function (ev) {
      if (ev.target.classList && ev.target.classList.contains("card") &&
          (ev.key === "Enter" || ev.key === " ")) {
        ev.preventDefault();
        toggleCard(ev.target);
      }
    });
  }

  function toggleCard(card) {
    var cid = card.getAttribute("data-id");
    if (state.open.has(cid)) { state.open.delete(cid); card.classList.remove("open"); card.setAttribute("aria-expanded", "false"); }
    else { state.open.add(cid); card.classList.add("open"); card.setAttribute("aria-expanded", "true"); }
  }

  // ---------- export ----------
  // Bulk: favourites + top AI picks -> .ics (importable into Google Calendar).
  function syncGoogleCalendar() {
    if (!window.WWWICS) return;
    var picked = window.WWWICS.selectForExport(state.events, state.favs);
    if (!picked.length) { alert("Heart a few events first — your liked events plus your top suggestions will be added to your calendar."); return; }
    window.WWWICS.download(picked, state.meta);
  }

  // Single event -> Google Calendar "add event" link (first day it runs).
  function gcalUrl(e) {
    var dayDates = (state.meta && state.meta.dayDates) || {};
    var day = DAY_ORDER.filter(function (d) { return e.days.indexOf(d) >= 0; })[0];
    var date = dayDates[day];
    if (!date) return "";
    function p(n) { return (n < 10 ? "0" : "") + n; }
    var d = date.split("-").map(Number), t = e.time.split(":").map(Number);
    var start = new Date(d[0], d[1] - 1, d[2], t[0], t[1], 0);
    var end = new Date(start.getTime() + (e.dur || 60) * 60000);
    function fmt(x) { return "" + x.getFullYear() + p(x.getMonth() + 1) + p(x.getDate()) + "T" + p(x.getHours()) + p(x.getMinutes()) + "00"; }
    var params = [
      "action=TEMPLATE",
      "text=" + encodeURIComponent(e.title),
      "dates=" + fmt(start) + "/" + fmt(end),
      "details=" + encodeURIComponent(e.desc || ""),
      "location=" + encodeURIComponent([e.camp, e.loc].filter(Boolean).join(" — ")),
      "ctz=Europe/Madrid",
    ];
    return "https://calendar.google.com/calendar/render?" + params.join("&");
  }

  // ---------- chrome: modal, layout toggle, responsive ----------
  function syncLayoutToggle() {
    var btn = document.getElementById("layoutToggle");
    if (!btn) return;
    // Schedule + a specific day: offer List <-> Timetable/Grid. Hidden for "All days".
    btn.hidden = !(state.view === "schedule" && state.day);
    btn.textContent = state.forceList
      ? "▦ " + (desktopMQ.matches ? "Grid" : "Timetable")
      : "☰ List";
    btn.setAttribute("aria-pressed", state.forceList ? "false" : "true");
  }

  function bindChrome() {
    var modal = document.getElementById("modal");
    document.getElementById("modalClose").addEventListener("click", closeModal);
    modal.addEventListener("click", function (ev) { if (ev.target === modal) closeModal(); });
    // favourite from inside the modal
    document.getElementById("modalCard").addEventListener("click", function (ev) {
      var favBtn = ev.target.closest("[data-fav]");
      if (!favBtn) return;
      var id = favBtn.getAttribute("data-fav");
      if (state.favs.has(id)) state.favs.delete(id); else state.favs.add(id);
      saveFavs();
      var nowFav = state.favs.has(id);
      favBtn.classList.toggle("on", nowFav);
      favBtn.setAttribute("aria-pressed", nowFav ? "true" : "false");
      render();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !modal.hidden) closeModal();
    });

    var toggle = document.getElementById("layoutToggle");
    if (toggle) toggle.addEventListener("click", function () {
      state.forceList = !state.forceList; savePrefs(); syncLayoutToggle(); render();
    });

    desktopMQ.addEventListener("change", function () { syncLayoutToggle(); render(); });
    window.addEventListener("resize", function () { if (gridActive()) fitGrid(); });
    syncLayoutToggle();
  }

  // ---------- boot ----------
  function boot() {
    loadPrefs();
    buildFilterUI();
    buildTabs();
    bindList();
    bindChrome();
    fetch("events.json")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.events = data.events || [];
        state.meta = data.meta || {};
        populateBarrios();
        render();
      })
      .catch(function (e) {
        listEl.innerHTML = emptyMsg("Couldn’t load events. " + e.message);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
