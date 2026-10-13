/* Diagnose: meldet Eingaben, Fehler und Browser-Infos an den Dienst-Log. */
(function () {
  "use strict";
  function send(msg) {
    try {
      var x = new XMLHttpRequest();
      x.open("POST", (location.protocol === "https:" ? "http://127.0.0.1:8645" : "") + "/api/debug", true);
      x.send(String(msg));
    } catch (e) {}
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
