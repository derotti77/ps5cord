/* Discord-Markdown (Teilmenge) -> sicheres HTML. */
var Markdown = (function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtTimestamp(sec, style) {
    var d = new Date(sec * 1000);
    if (style === "R") {
      var diff = Math.round((d.getTime() - Date.now()) / 1000);
      var abs = Math.abs(diff), unit, n;
      if (abs < 60) { n = abs; unit = n === 1 ? "Sekunde" : "Sekunden"; }
      else if (abs < 3600) { n = Math.round(abs / 60); unit = n === 1 ? "Minute" : "Minuten"; }
      else if (abs < 86400) { n = Math.round(abs / 3600); unit = n === 1 ? "Stunde" : "Stunden"; }
      else { n = Math.round(abs / 86400); unit = n === 1 ? "Tag" : "Tagen"; }
      return diff < 0 ? "vor " + n + " " + unit : "in " + n + " " + unit;
    }
    if (style === "t") return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    if (style === "d") return d.toLocaleDateString("de-DE");
    return d.toLocaleString("de-DE");
  }

  // ctx: { users: {id: name}, channels: {id: name}, roles: {id: name} }
  function inline(text, ctx) {
    var out = esc(text);

    // Platzhalter fuer Inline-Code, damit darin nichts formatiert wird.
    var codes = [];
    out = out.replace(/`([^`\n]+)`/g, function (_, c) {
      codes.push("<code>" + c + "</code>");
      return "\u0000" + (codes.length - 1) + "\u0000";
    });

    out = out
      .replace(/&lt;(a?):(\w+):(\d+)&gt;/g, function (_, a, name, id) {
        return '<img class="emoji" alt=":' + name + ':" src="https://cdn.discordapp.com/emojis/' +
          id + (a ? ".gif" : ".png") + '?size=48">';
      })
      .replace(/&lt;@!?(\d+)&gt;/g, function (_, id) {
        return '<span class="mention">@' + esc(ctx.users[id] || "Unbekannt") + "</span>";
      })
      .replace(/&lt;@&amp;(\d+)&gt;/g, function (_, id) {
        return '<span class="mention">@' + esc(ctx.roles[id] || "Rolle") + "</span>";
      })
      .replace(/&lt;#(\d+)&gt;/g, function (_, id) {
        return '<span class="mention">#' + esc(ctx.channels[id] || "Kanal") + "</span>";
      })
      .replace(/&lt;t:(-?\d+)(?::([tTdDfFR]))?&gt;/g, function (_, t, s) {
        return '<span class="ts">' + esc(fmtTimestamp(parseInt(t, 10), s)) + "</span>";
      })
      .replace(/@(everyone|here)\b/g, '<span class="mention">@$1</span>')
      .replace(/\*\*\*([^*]+)\*\*\*/g, "<b><i>$1</i></b>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/__([^_]+)__/g, "<u>$1</u>")
      .replace(/(^|[^\w*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
      .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<i>$2</i>")
      .replace(/~~([^~]+)~~/g, "<s>$1</s>")
      .replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler">$1</span>')
      .replace(/(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g, '<span class="link">$1</span>');

    out = out.replace(/\u0000(\d+)\u0000/g, function (_, i) { return codes[+i]; });
    return out;
  }

  function render(text, ctx) {
    if (!text) return "";
    var parts = String(text).split(/```/);
    var html = "";
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1 && i < parts.length - 1) {
        // Codeblock; erste Zeile kann eine Sprachangabe sein.
        var code = parts[i].replace(/^[a-zA-Z0-9+-]*\n/, "");
        html += "<pre>" + esc(code.replace(/\n$/, "")) + "</pre>";
      } else {
        var seg = i % 2 === 1 ? "```" + parts[i] : parts[i];
        var lines = seg.split("\n");
        var buf = [];
        for (var j = 0; j < lines.length; j++) {
          var l = lines[j];
          var m = /^(#{1,3}) (.*)$/.exec(l);
          if (/^&gt; |^> /.test(l)) {
            buf.push('<span class="quote">' + inline(l.slice(2), ctx) + "</span>");
          } else if (m) {
            buf.push('<span class="h' + m[1].length + '">' + inline(m[2], ctx) + "</span>");
          } else if (/^-# /.test(l)) {
            buf.push('<span class="subtext">' + inline(l.slice(3), ctx) + "</span>");
          } else {
            buf.push(inline(l, ctx));
          }
        }
        html += buf.join("<br>");
      }
    }
    return html;
  }

  return { render: render, esc: esc };
})();
