/* WWW '26 — .ics calendar export. Favourites + top AI picks -> dated VEVENTs. */
(function () {
  "use strict";

  function selectForExport(events, favs) {
    // Liked (favourited) events only.
    return events.filter(function (e) { return favs.has(e.id); });
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // "2026-07-07" + "20:00" (+dur mins) -> {start, end} as local floating stamps.
  function stamps(dateStr, time, dur) {
    var d = dateStr.split("-").map(Number);       // [Y, M, D]
    var t = time.split(":").map(Number);          // [H, M]
    var start = new Date(d[0], d[1] - 1, d[2], t[0], t[1], 0);
    var end = new Date(start.getTime() + dur * 60000);
    return { start: fmt(start), end: fmt(end) };
  }
  function fmt(dt) {
    return dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) +
      "T" + pad(dt.getHours()) + pad(dt.getMinutes()) + "00";
  }
  function fmtDate(dateStr) { return dateStr.replace(/-/g, ""); }

  function esc(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function build(events, meta) {
    var dayDates = (meta && meta.dayDates) || {};
    var now = new Date();
    var dtstamp = fmt(now) + "Z";
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//jonasjohansson//WWW26//EN",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Elsewhere '26",
    ];
    events.forEach(function (e) {
      e.days.forEach(function (day) {
        var date = dayDates[day];
        if (!date) return;
        var uid = e.id + "-" + day + "@www26";
        var loc = [e.camp, e.loc].filter(Boolean).join(" — ");
        var desc = (e.reason ? "⭐ " + e.reason + "\n\n" : "") + (e.desc || "");
        lines.push("BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + dtstamp);
        if (e.dur >= 1440) {
          lines.push("DTSTART;VALUE=DATE:" + fmtDate(date));
        } else {
          var s = stamps(date, e.time, e.dur);
          lines.push("DTSTART:" + s.start, "DTEND:" + s.end);
        }
        lines.push(
          "SUMMARY:" + esc(e.title),
          "LOCATION:" + esc(loc),
          "DESCRIPTION:" + esc(desc),
          "CATEGORIES:" + esc((e.cat || "other").toUpperCase()),
          "END:VEVENT"
        );
      });
    });
    lines.push("END:VCALENDAR");
    // Fold long lines per RFC 5545 (<=75 octets); simple char-based fold is fine here.
    return lines.map(foldLine).join("\r\n");
  }

  function foldLine(line) {
    if (line.length <= 74) return line;
    var out = line.slice(0, 74), rest = line.slice(74);
    while (rest.length > 73) { out += "\r\n " + rest.slice(0, 73); rest = rest.slice(73); }
    return out + "\r\n " + rest;
  }

  function download(events, meta) {
    var ics = build(events, meta);
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "elsewhere-26.ics";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.WWWICS = { selectForExport: selectForExport, build: build, download: download };
})();
