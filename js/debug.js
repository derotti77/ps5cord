/* Diagnose: meldet Eingaben, Fehler und Browser-Infos an den Dienst-Log. */
(function () {
  "use strict";
  var bases = location.protocol === "https:" ? ["http://127.0.0.1:8645", "http://localhost:8645"] : [""];
  function send(msg) {
    bases.forEach(function (b) {
      try {
        var x = new XMLHttpRequest();
        x.open("POST", b + "/api/debug", true);
        x.send("[" + (b || "rel") + "] " + String(msg));
      } catch (e) {}
    });
  }
  window.dbg = send;
  window.onerror = function (msg, src, line, col) {
    send("ERROR " + msg + " @" + src + ":" + line + ":" + col);
  };
  send("UA " + navigator.userAgent + " | " + window.innerWidth + "x" + window.innerHeight +
       " dpr=" + window.devicePixelRatio + " fetch=" + (typeof fetch) + " Promise=" + (typeof Promise));
  ["keydown", "keyup", "keypress"].forEach(function (t) {
    document.addEventListener(t, function (e) {
      send(t + " key=" + e.key + " code=" + e.code + " keyCode=" + e.keyCode + " which=" + e.which +
           " target=" + (e.target && e.target.tagName));
    }, true);
  });
  ["click", "mousedown", "pointerdown", "touchstart"].forEach(function (t) {
    document.addEventListener(t, function (e) {
      var el = e.target;
      send(t + " on " + (el && el.tagName) + "#" + (el && el.id) + "." + (el && el.className) +
           " x=" + e.clientX + " y=" + e.clientY);
    }, true);
  });
  window.addEventListener("gamepadconnected", function (e) { send("gamepadconnected " + e.gamepad.id); });
  setTimeout(function () {
    var pads = navigator.getGamepads ? navigator.getGamepads() : null;
    send("getGamepads=" + (navigator.getGamepads ? "yes" : "no") + " pads=" + (pads ? Array.prototype.filter.call(pads, Boolean).length : "-"));
    var qr = document.getElementById("qr");
    send("qr html len=" + (qr ? qr.innerHTML.length : -1) + " start=" + (qr ? qr.innerHTML.slice(0, 120) : ""));
  }, 4000);
})();

/* Verbindungs-Probe fuer die Vollbild-App (von HTTPS geladen). */
(function () {
  if (location.protocol !== "https:") return;
  var out = [];
  function note(s) {
    out.push(s);
    var el = document.getElementById("probe-out");
    if (!el) {
      el = document.createElement("pre");
      el.id = "probe-out";
      el.style.cssText = "position:fixed;left:10px;top:10px;z-index:99;color:#0f0;background:rgba(0,0,0,.8);font-size:18px;max-width:90%;white-space:pre-wrap";
      document.body.appendChild(el);
    }
    el.textContent = out.join("\n");
  }
  var hosts = ["127.0.0.1", "localhost"];
  hosts.forEach(function (h) {
    var base = "http://" + h + ":8645/api/probe?m=";
    fetch(base + "fetch-" + h).then(function (r) { note("fetch " + h + " OK " + r.status); })
      .catch(function (e) { note("fetch " + h + " FAIL " + e); });
    fetch(base + "fetchnc-" + h, { mode: "no-cors" }).then(function () { note("fetch no-cors " + h + " OK"); })
      .catch(function (e) { note("fetch no-cors " + h + " FAIL " + e); });
    var img = new Image();
    img.onload = function () { note("img " + h + " OK"); };
    img.onerror = function () { note("img " + h + " FAIL"); };
    img.src = base + "img-" + h;
    var sc = document.createElement("script");
    sc.onerror = function () { note("script " + h + " FAIL"); };
    sc.onload = function () { note("script " + h + " OK"); };
    sc.src = base + "script-" + h;
    document.head.appendChild(sc);
    try {
      var ws = new WebSocket("ws://" + h + ":8645/api/probe?m=ws-" + h);
      ws.onerror = function () { note("ws " + h + " error"); };
    } catch (e) { note("ws " + h + " throw " + e); }
    var fr = document.createElement("iframe");
    fr.style.display = "none";
    fr.src = base + "iframe-" + h;
    document.body.appendChild(fr);
  });
  fetch("https://127.0.0.1:8645/api/probe?m=https").catch(function (e) { note("https 127 FAIL " + e); });
  // Entwickler-Mac im LAN (nur waehrend der Fehlersuche)
  ["http://192.168.2.1:9080", "https://192.168.2.1:9443"].forEach(function (b) {
    fetch(b + "/?m=fetch").then(function () { note(b + " fetch OK"); }).catch(function (e) { note(b + " fetch FAIL " + e); });
    var im = new Image(); im.src = b + "/?m=img";
  });
  note("UA " + navigator.userAgent + " " + innerWidth + "x" + innerHeight);
  setTimeout(function () {
    note("navigating...");
    location.href = "http://127.0.0.1:8645/api/probe?m=nav";
  }, 8000);
})();
