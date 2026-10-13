/* Zugriff auf den lokalen PS5Cord-Dienst (http://127.0.0.1:8645/api/...). */
var Api = (function () {
  "use strict";

  // Von HTTPS geladen (Vollbild-App ueber GitHub Pages): den Dienst auf der
  // Konsole direkt ansprechen. Lokal geladen: relative URLs.
  var BASE = location.protocol === "https:" ? "http://127.0.0.1:8645" : "";

  function request(method, url, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(BASE + url, opts).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
        if (!res.ok) {
          var err = new Error((data && data.message) || ("HTTP " + res.status));
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  // Discord-REST ueber den Dienst. path z.B. "/channels/123/messages?limit=50"
  function rest(method, path, body) {
    var q = "";
    var i = path.indexOf("?");
    if (i >= 0) {
      q = "?q=" + encodeURIComponent(path.slice(i + 1));
      path = path.slice(0, i);
    }
    return request(method, "/api/rest" + path + q, body);
  }

  return {
    state: function () { return request("GET", "/api/state"); },
    events: function (since) { return request("GET", "/api/events?since=" + since); },
    loginToken: function (token) { return request("POST", "/api/login/token", { token: token }); },
    loginQr: function () { return request("POST", "/api/login/qr", {}); },
    cancelQr: function () { return request("POST", "/api/login/qr/cancel", {}); },
    logout: function () { return request("POST", "/api/logout", {}); },
    focus: function (guildId, channelId) {
      return request("POST", "/api/focus", { guild_id: guildId || "", channel_id: channelId || "" });
    },
    rest: rest
  };
})();
