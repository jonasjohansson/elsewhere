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
    view: "foryou",
    search: "",
    day: null,          // null = all days
    barrio: "",         // "" = all barrios/camps
    cats: new Set(),    // empty = all categories
    forYouOnly: false,
    likedOnly: false,
    hideAdult: false,
    sortByTime: false,
    forceList: false,   // desktop: force card list instead of grid
    favs: new Set(),
    open: new Set(),
    mapSvg: null,       // null = loading, false = failed, string = loaded
    mapZoom: 100,
  };

  // ---------- persistence ----------
  function loadPrefs() {
    try {
      var f = JSON.parse(localStorage.getItem(LS.favs) || "[]");
      state.favs = new Set(f);
    } catch (e) {}
    try {
      var p = JSON.parse(localStorage.getItem(LS.prefs) || "{}");
      if (p.forYouOnly) state.forYouOnly = true;
      if (p.likedOnly) state.likedOnly = true;
      if (p.hideAdult) state.hideAdult = true;
      if (p.sortByTime) state.sortByTime = true;
      if (p.forceList) state.forceList = true;
      if (p.view) state.view = p.view;
    } catch (e) {}
  }
  function saveFavs() { localStorage.setItem(LS.favs, JSON.stringify([].concat(Array.from(state.favs)))); }
  function savePrefs() {
    localStorage.setItem(LS.prefs, JSON.stringify({
      forYouOnly: state.forYouOnly, likedOnly: state.likedOnly,
      hideAdult: state.hideAdult, sortByTime: state.sortByTime,
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
  function firstDayIdx(e) {
    var min = 99;
    e.days.forEach(function (d) { var i = DAY_ORDER.indexOf(d); if (i >= 0 && i < min) min = i; });
    return min;
  }
  function byDayThenTime(a, b) {
    // If a single day is active, order is purely by time; else group by first day.
    if (!state.day) { var d = firstDayIdx(a) - firstDayIdx(b); if (d) return d; }
    return timeToMin(a.time) - timeToMin(b.time) || b.score - a.score;
  }

  // ---------- filtering ----------
  function passesFilters(e) {
    if (state.hideAdult && e.cat === "adult") return false;
    if (state.forYouOnly && !e.forYou) return false;
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
    return '<span class="tag" style="--tagc:' + c.color + '"><span class="tdot"></span>' + c.label + "</span>";
  }

  function cardHTML(e) {
    var fav = state.favs.has(e.id);
    var open = state.open.has(e.id);
    var daysTxt = e.days.length === 6 ? "Every day" : e.days.join(" · ");
    var reason = e.reason
      ? '<div class="reason"><span class="fystar">★</span> ' + escapeHtml(e.reason) + "</div>" : "";
    var fyStar = e.forYou ? '<span class="fystar" title="Suggested for you">★</span>' : "";
    var heartLabel = (fav ? "Remove from liked: " : "Add to liked: ") + e.title;
    return (
      '<article class="card' + (open ? " open" : "") + (e.forYou ? " foryou" : "") + '" data-id="' + e.id + '"' +
        ' tabindex="0" aria-expanded="' + (open ? "true" : "false") + '">' +
        '<div class="card-top">' +
          '<h3 class="card-title">' + fyStar + escapeHtml(e.title) + "</h3>" +
          '<button class="heart' + (fav ? " on" : "") + '" data-fav="' + e.id +
            '" aria-pressed="' + (fav ? "true" : "false") + '" aria-label="' + escapeHtml(heartLabel) + '">' +
            (fav ? "♥" : "♡") + "</button>" +
        "</div>" +
        '<div class="meta">' +
          '<span>🕑 ' + timeRange(e) + (durLabel(e.dur) ? " · " + durLabel(e.dur) : "") + "</span>" +
          (e.camp ? '<span class="camp">🏕 ' + escapeHtml(e.camp) + "</span>" : "") +
          (e.loc ? "<span>📍 " + escapeHtml(e.loc) + "</span>" : "") +
          catTag(e.cat) +
        "</div>" +
        '<div class="days-line">📅 ' + daysTxt + "</div>" +
        reason +
        '<div class="desc">' + escapeHtml(e.desc || "No description.") + "</div>" +
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

    // Map view — the festival "City" map, tap a barrio to filter.
    if (v === "map") {
      listEl.className = "list map-mode";
      listEl.innerHTML = mapHTML();
      wireMap();
      var st = document.getElementById("filterStatus");
      if (st) st.textContent = "Map of the city — tap a barrio to see its events";
      return;
    }

    // Desktop timetable grid for the Schedule view.
    if (v === "schedule" && gridActive()) {
      if (!state.day) { state.day = DAY_ORDER[0]; syncDayPills(); }
      var gItems = state.events.filter(passesFilters);
      listEl.className = "list grid-mode";
      listEl.innerHTML = gridHTML(gItems);
      fitGrid();
      updateStatus(gItems);
      return;
    }
    listEl.className = "list";

    var items = state.events.filter(passesFilters);

    if (v === "foryou") {
      if (state.sortByTime) items.sort(byDayThenTime);
      else items.sort(function (a, b) { return b.score - a.score || timeToMin(a.time) - timeToMin(b.time); });
      html = items.length ? items.map(cardHTML).join("") : emptyMsg("Nothing matches. Loosen the filters.");
    } else if (v === "favs") {
      var favItems = items.filter(function (e) { return state.favs.has(e.id); });
      html = favItems.length ? groupByDay(favItems) : emptyMsg("No favourites yet. Tap ❤ on events you like — they’ll gather here, ready to export.");
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
  function gridActive() { return desktopMQ.matches && state.view === "schedule" && !state.forceList; }

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
    var hours = Object.keys(hoursSet).map(Number).sort(function (a, b) { return a - b; });
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
        list.sort(function (a, b) { return timeToMin(a.time) - timeToMin(b.time) || b.score - a.score; });
        html += '<div class="gcell gbody">' + list.map(chipHTML).join("") + "</div>";
      });
    });
    html += "</div></div>";
    return html;
  }

  function chipHTML(e) {
    var fav = state.favs.has(e.id);
    var star = e.forYou ? '<span class="cst">★</span>' : "";
    return '<button class="chip-ev' + (fav ? " fav on" : "") + '" data-chip="' + e.id + '" title="' +
      escapeHtml(e.title + " — " + (e.camp || "") + " · " + timeRange(e)) + '">' +
      '<span class="cet">' + e.time + "</span>" + star + escapeHtml(e.title) + "</button>";
  }

  function fitGrid() {
    var wrap = listEl.querySelector(".gridwrap");
    if (!wrap) return;
    var tb = document.querySelector(".topbar");
    var top = tb ? tb.getBoundingClientRect().height : 0;
    var h = window.innerHeight - top - 58 /* tabbar */;
    wrap.style.height = Math.max(200, h) + "px";
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
      list.sort(function (a, b) { return timeToMin(a.time) - timeToMin(b.time) || b.score - a.score; });
      var date = (state.meta.dayDates && state.meta.dayDates[d]) || "";
      var dateTxt = date ? " " + date.slice(8) + "/" + date.slice(5, 7) : "";
      out += '<div class="day-head">' + DAY_LABEL[d] + dateTxt + " · " + list.length + "</div>";
      out += list.map(cardHTML).join("");
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
      dayPills.querySelectorAll(".pill").forEach(function (p) { p.classList.remove("active"); });
      b.classList.add("active");
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

    var fyo = document.getElementById("forYouOnly");
    var lo = document.getElementById("likedOnly");
    var ha = document.getElementById("hideAdult");
    var sbt = document.getElementById("sortByTime");
    fyo.checked = state.forYouOnly; lo.checked = state.likedOnly;
    ha.checked = state.hideAdult; sbt.checked = state.sortByTime;
    fyo.addEventListener("change", function () { state.forYouOnly = fyo.checked; savePrefs(); render(); });
    lo.addEventListener("change", function () { state.likedOnly = lo.checked; savePrefs(); render(); });
    ha.addEventListener("change", function () { state.hideAdult = ha.checked; savePrefs(); render(); });
    sbt.addEventListener("change", function () { state.sortByTime = sbt.checked; savePrefs(); render(); });
  }

  // ---------- map view ----------
  function mapHTML() {
    if (state.mapSvg === null) return '<div class="map-wrap"><p class="loading">Loading map…</p></div>';
    if (state.mapSvg === false) return '<div class="map-wrap">' + emptyMsg("Map unavailable offline until first load.") + "</div>";
    return (
      '<div class="map-wrap">' +
        '<div class="map-toolbar">' +
          '<span class="map-hint">🗺 The City · tap a barrio</span>' +
          '<div class="map-zoom">' +
            '<button data-mz="out" aria-label="Zoom out">−</button>' +
            '<button data-mz="in" aria-label="Zoom in">+</button>' +
          "</div>" +
        "</div>" +
        '<div class="map-scroll"><div class="map-inner" style="width:' + state.mapZoom + '%">' +
          state.mapSvg +
        "</div></div>" +
      "</div>"
    );
  }

  function wireMap() {
    var inner = listEl.querySelector(".map-inner");
    if (!inner) return;
    // Make barrio labels that match a real camp tappable -> filter to that barrio.
    var camps = {};
    state.events.forEach(function (e) { if (e.camp) camps[e.camp] = true; });
    function gotoBarrio(name) {
      state.barrio = name;
      var sel = document.getElementById("barrio");
      if (sel) sel.value = name;
      state.view = "schedule"; savePrefs();
      document.querySelectorAll(".tab").forEach(function (tb) {
        var on = tb.getAttribute("data-view") === "schedule";
        tb.classList.toggle("active", on); tb.setAttribute("aria-selected", on ? "true" : "false");
      });
      if (typeof syncSortToggle === "function") syncSortToggle();
      if (typeof syncLayoutToggle === "function") syncLayoutToggle();
      window.scrollTo(0, 0);
      render();
    }
    inner.querySelectorAll("text").forEach(function (t) {
      var name = (t.textContent || "").trim();
      if (!camps[name]) return;
      t.classList.add("map-barrio");
      t.style.cursor = "pointer";
      t.style.pointerEvents = "all";          // whole text box clickable, not just glyphs
      t.setAttribute("tabindex", "0");
      t.setAttribute("role", "button");
      t.setAttribute("aria-label", "See events at " + name);
      t.addEventListener("click", function () { gotoBarrio(name); });
      t.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); gotoBarrio(name); }
      });
    });
    // zoom buttons
    var toolbar = listEl.querySelector(".map-zoom");
    if (toolbar) toolbar.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-mz]"); if (!b) return;
      var dir = b.getAttribute("data-mz");
      state.mapZoom = Math.max(100, Math.min(400, state.mapZoom + (dir === "in" ? 60 : -60)));
      var el = listEl.querySelector(".map-inner");
      if (el) el.style.width = state.mapZoom + "%";
    });
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
    var sortWrap = document.getElementById("sortByTimeWrap");
    function syncSortToggle() {
      if (sortWrap) sortWrap.style.display = state.view === "foryou" ? "" : "none";
    }
    function activate(view) {
      state.view = view; savePrefs();
      tabs.forEach(function (t) {
        var on = t.getAttribute("data-view") === view;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      syncSortToggle();
      if (typeof syncLayoutToggle === "function") syncLayoutToggle();
      window.scrollTo(0, 0);
      render();
    }
    tabs.forEach(function (t) {
      t.addEventListener("click", function () { activate(t.getAttribute("data-view")); });
      if (t.getAttribute("data-view") === state.view) t.classList.add("active");
      else t.classList.remove("active");
    });
    syncSortToggle();
  }

  // ---------- card interactions (event delegation) ----------
  function bindList() {
    listEl.addEventListener("click", function (ev) {
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
        favBtn.textContent = nowFav ? "♥" : "♡";
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
  function bindExport() {
    document.getElementById("exportBtn").addEventListener("click", function () {
      if (!window.WWWICS) return;
      var picked = window.WWWICS.selectForExport(state.events, state.favs);
      if (!picked.length) { alert("Nothing to export yet. Favourite a few events (❤) — your favourites plus your top AI picks will be exported."); return; }
      window.WWWICS.download(picked, state.meta);
    });
  }

  // ---------- chrome: modal, layout toggle, responsive ----------
  function syncLayoutToggle() {
    var btn = document.getElementById("layoutToggle");
    if (!btn) return;
    // Only relevant on desktop while on the Schedule view.
    var show = desktopMQ.matches && state.view === "schedule";
    btn.hidden = !show;
    btn.textContent = state.forceList ? "▦ Grid" : "☰ List";
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
      favBtn.textContent = nowFav ? "♥" : "♡";
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
    bindExport();
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
    // Map SVG loads independently (never masks an events-load error).
    fetch("map.svg")
      .then(function (r) { return r.ok ? r.text() : Promise.reject(); })
      .then(function (svg) { state.mapSvg = svg; if (state.view === "map") render(); })
      .catch(function () { state.mapSvg = false; if (state.view === "map") render(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
