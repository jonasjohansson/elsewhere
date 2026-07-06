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
      if (p.forYouOnly) state.forYouOnly = true;
      if (p.likedOnly) state.likedOnly = true;
      if (p.hideAdult) state.hideAdult = true;
      if (p.sortByTime) state.sortByTime = true;
      if (p.view) state.view = p.view;
    } catch (e) {}
  }
  function saveFavs() { localStorage.setItem(LS.favs, JSON.stringify([].concat(Array.from(state.favs)))); }
  function savePrefs() {
    localStorage.setItem(LS.prefs, JSON.stringify({
      forYouOnly: state.forYouOnly, likedOnly: state.likedOnly,
      hideAdult: state.hideAdult, sortByTime: state.sortByTime, view: state.view,
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
    return '<span class="tag" style="background:' + c.color + '">' + c.emoji + " " + c.label + "</span>";
  }

  function cardHTML(e) {
    var fav = state.favs.has(e.id);
    var open = state.open.has(e.id);
    var daysTxt = e.days.length === 6 ? "Every day" : e.days.join(" · ");
    var reason = e.reason
      ? '<div class="reason">⭐ ' + escapeHtml(e.reason) + "</div>" : "";
    var scoreBadge = (e.score >= 65)
      ? '<span class="score-badge">' + e.score + "</span>" : "";
    return (
      '<article class="card' + (open ? " open" : "") + '" data-id="' + e.id + '">' +
        '<div class="card-top">' +
          '<h3 class="card-title">' + escapeHtml(e.title) + "</h3>" +
          '<button class="heart' + (fav ? " on" : "") + '" data-fav="' + e.id + '" aria-label="Favourite">❤</button>' +
        "</div>" +
        '<div class="meta">' +
          '<span>🕑 ' + timeRange(e) + (durLabel(e.dur) ? " · " + durLabel(e.dur) : "") + "</span>" +
          (e.camp ? '<span class="camp">🏕 ' + escapeHtml(e.camp) + "</span>" : "") +
          (e.loc ? "<span>📍 " + escapeHtml(e.loc) + "</span>" : "") +
          catTag(e.cat) + scoreBadge +
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
  }

  function emptyMsg(t) { return '<p class="empty">' + t + "</p>"; }

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
    search.addEventListener("input", function () { state.search = search.value.trim(); render(); });

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
      tabs.forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-view") === view); });
      syncSortToggle();
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
      var favBtn = ev.target.closest("[data-fav]");
      if (favBtn) {
        ev.stopPropagation();
        var id = favBtn.getAttribute("data-fav");
        if (state.favs.has(id)) state.favs.delete(id); else state.favs.add(id);
        saveFavs();
        favBtn.classList.toggle("on");
        if (state.view === "favs") render();
        return;
      }
      var card = ev.target.closest(".card");
      if (card) {
        var cid = card.getAttribute("data-id");
        if (state.open.has(cid)) { state.open.delete(cid); card.classList.remove("open"); }
        else { state.open.add(cid); card.classList.add("open"); }
      }
    });
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

  // ---------- boot ----------
  function boot() {
    loadPrefs();
    buildFilterUI();
    buildTabs();
    bindList();
    bindExport();
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
