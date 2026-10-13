/* Controller-Eingabe. Die PS5-Web-App liefert das Steuerkreuz und die Tasten
 * als Tastatur-Events: X = Enter, O = Escape, △ = F1, □ = F2. */
var Input = (function () {
  "use strict";

  var KEY = {
    CROSS: 13, CIRCLE: 27, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
    TRIANGLE: 112, SQUARE: 113,
    L1: 116, R1: 117, // nur falls die Konsole sie liefert
    PGUP: 33, PGDN: 34
  };

  var NAMES = {
    Enter: 13, Escape: 27, Esc: 27, Backspace: 27,
    ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
    Left: 37, Up: 38, Right: 39, Down: 40,
    F1: 112, F2: 113, F5: 116, F6: 117, PageUp: 33, PageDown: 34
  };

  var REPEAT_MS = 80;
  var lastRepeat = 0;
  var handler = null;

  function isTextField(el) {
    return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  }

  document.addEventListener("keydown", function (e) {
    var code = e.keyCode || e.which || NAMES[e.key] || 0;
    var active = document.activeElement;

    // Waehrend ein Textfeld aktiv ist, bekommt es alle Tasten ausser O/Escape
    // (Abbrechen) und △ (Senden ohne Bildschirmtastatur-Umweg).
    if (isTextField(active)) {
      if (code === KEY.CIRCLE && e.key !== "Backspace") {
        e.preventDefault();
        active.blur();
        if (handler) handler(KEY.CIRCLE, e, true);
      } else if (code === KEY.TRIANGLE) {
        e.preventDefault();
        if (handler) handler(KEY.TRIANGLE, e, true);
      }
      return;
    }

    if (!code || !handler) return;
    if ([13, 27, 37, 38, 39, 40, 112, 113, 116, 117, 33, 34].indexOf(code) < 0) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.repeat) {
      var now = Date.now();
      if (now - lastRepeat < REPEAT_MS) return;
      lastRepeat = now;
    }
    handler(code, e, false);
  }, true);

  // Im PS5-Browser ist X ein Mausklick an der Cursor-Position.
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest(".focusable, [data-action]") : null;
    if (!el || isTextField(el) || !handler) return;
    if (el.form) return; // Submit-Buttons laufen ueber das submit-Event
    e.preventDefault();
    handler("click", e, false, el);
  });

  return {
    KEY: KEY,
    setHandler: function (fn) { handler = fn; }
  };
})();
