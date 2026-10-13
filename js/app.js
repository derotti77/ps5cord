/* PS5Cord UI: Serverleiste, Kanalliste, Chat, Login, Controller-Navigation. */
(function () {
  "use strict";

  var K = Input.KEY;
  var CDN = "https://cdn.discordapp.com";
  var QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "✅", "👀"];

  var S = {
    seq: 0,
    status: "",
    me: null,
    guilds: [],
    dms: [],
    view: "home",          // "home" oder Server-ID
    zone: "guilds",        // guilds | channels | messages
    idx: { guilds: 0, channels: 0, messages: 0 },
    channel: null,         // geoeffneter Kanal {id, name, guild_id, can_send, dm}
    messages: [],          // aelteste zuerst
    hasMore: true,
    loadingOlder: false,
    typing: {},            // userId -> {name, until}
    replyTo: null,
    editing: null,
    menu: null,            // {items:[{label, action}], idx}
    pollActive: false,
    loginShown: false
  };

  var $ = function (id) { return document.getElementById(id); };
  var esc = Markdown.esc;

  /* Die UI ist fuer 1920x1080 gebaut; der PS5-Browser hat je nach Modus
   * weniger Platz (z.B. 1540x700). Daher auf das Fenster skalieren. */
  function fitToWindow() {
    var w = window.innerWidth || 1920, h = window.innerHeight || 1080;
    var scale = Math.min(w / 1920, h / 1080);
    var root = $("root");
    root.style.transform = "scale(" + scale + ")";
    root.style.left = Math.max(0, (w - 1920 * scale) / 2) + "px";
    root.style.top = Math.max(0, (h - 1080 * scale) / 2) + "px";
  }
  window.addEventListener("resize", fitToWindow);
  fitToWindow();

  /* ------------------------------------------------------------ Helfer */

  function cmpId(a, b) {
    a = a || "0"; b = b || "0";
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function userName(u, member) {
    if (member && member.nick) return member.nick;
    if (!u) return "Unbekannt";
    return u.global_name || u.username || "Unbekannt";
  }

  function defaultAvatar(id) {
    var n = parseInt(String(id || "0").slice(-6), 10) || 0;
    return CDN + "/embed/avatars/" + (n % 6) + ".png";
  }

  function avatarUrl(u) {
    if (!u) return defaultAvatar(0);
    if (u.avatar) return CDN + "/avatars/" + u.id + "/" + u.avatar + ".png?size=64";
    return defaultAvatar(u.id);
  }

  function initials(name) {
    return String(name || "?").split(/\s+/).map(function (w) { return w.charAt(0); })
      .join("").slice(0, 3);
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    var now = new Date();
    var t = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return "Heute um " + t;
    var y = new Date(now.getTime() - 86400000);
    if (d.toDateString() === y.toDateString()) return "Gestern um " + t;
    return d.toLocaleDateString("de-DE") + " " + t;
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, ms || 3500);
  }

  function show(id) {
    ["splash", "login", "app"].forEach(function (s) { $(s).hidden = s !== id; });
    $("hints").hidden = id === "splash";
    renderHints();
  }

  function currentGuild() {
    if (S.view === "home") return null;
    for (var i = 0; i < S.guilds.length; i++) {
      if (S.guilds[i].id === S.view) return S.guilds[i];
    }
    return null;
  }

  function findChannel(id) {
    for (var i = 0; i < S.dms.length; i++) if (S.dms[i].id === id) return { ch: S.dms[i], guild: null };
    for (var g = 0; g < S.guilds.length; g++) {
      var chs = S.guilds[g].channels;
      for (var c = 0; c < chs.length; c++) if (chs[c].id === id) return { ch: chs[c], guild: S.guilds[g] };
    }
    return null;
  }

  function isUnread(ch) {
    if (!ch.last_message_id) return false;
    if (!ch.read) return !!ch.recipients; // DMs ohne Lesestatus gelten als ungelesen
    return cmpId(ch.last_message_id, ch.read.last_message_id) > 0;
  }

  function mentionCount(ch) {
    return ch.read && ch.read.mention_count ? ch.read.mention_count : 0;
  }

  function dmName(dm) {
    if (dm.name) return dm.name;
    var r = dm.recipients || [];
    if (!r.length) return "Leere Gruppe";
    return r.map(function (u) { return userName(u); }).join(", ");
  }

  function dmIcon(dm) {
    if (dm.type === 3) {
      return dm.icon ? CDN + "/channel-icons/" + dm.id + "/" + dm.icon + ".png?size=64"
                     : defaultAvatar(dm.id);
    }
    return avatarUrl((dm.recipients || [])[0]);
  }

  /* Aktualisiert nur geaenderte Kinder (per Schluessel), damit Bilder nicht
   * bei jedem Event neu geladen werden und flackern. items: [{key, html}] */
  function patch(container, items) {
    var existing = {};
    var keep = {};
    Array.prototype.forEach.call(container.children, function (el) {
      if (el._key) existing[el._key] = el;
    });
    var prev = null;
    items.forEach(function (it) {
      var el = existing[it.key];
      if (!el || el._html !== it.html) {
        var tmp = document.createElement("div");
        tmp.innerHTML = it.html;
        var n = tmp.firstElementChild;
        n._key = it.key;
        n._html = it.html;
        if (el) container.replaceChild(n, el);
        el = n;
      }
      keep[it.key] = true;
      var want = prev ? prev.nextSibling : container.firstChild;
      if (want !== el) container.insertBefore(el, want);
      prev = el;
    });
    Array.prototype.slice.call(container.children).forEach(function (el) {
      if (!el._key || !keep[el._key]) container.removeChild(el);
    });
  }

  /* ------------------------------------------------------- Hinweisleiste */

  function renderHints() {
    var h = [];
    if (S.pointer) {
      h = [["✕", "Klicken"], ["L", "Cursor bewegen"], ["R", "Scrollen"]];
      if (!$("app").hidden && !S.menu) h.push(["☰", "Menü oben rechts"]);
    } else if (S.menu) {
      h = [["✕", "Auswählen"], ["○", "Schließen"]];
    } else if (!$("login").hidden) {
      h = [["✕", "Auswählen"]];
    } else if (document.activeElement === $("composer-input")) {
      h = [["✕", "Tastatur"], ["△", "Senden"], ["○", "Abbrechen"]];
    } else if (S.zone === "messages") {
      h = [["✕", "Nachricht-Optionen"], ["△", "Schreiben"], ["○", "Zurück"], ["□", "Menü"]];
    } else {
      h = [["✕", "Öffnen"], S.channel ? ["△", "Schreiben"] : null, ["○", "Zurück"], ["□", "Menü"]];
    }
    $("hints").innerHTML = h.filter(Boolean).map(function (x) {
      return '<span class="hint"><b class="btn-' + ({ "✕": "x", "○": "o", "△": "t", "□": "s" }[x[0]] || "x") +
        '">' + x[0] + "</b>" + esc(x[1]) + "</span>";
    }).join("");
  }

  /* ---------------------------------------------------------- Rendering */

  function guildItems() {
    return [{ id: "home" }].concat(S.guilds);
  }

  function guildUnread(g) {
    var unread = false, mentions = 0;
    var list = g.id === "home" ? S.dms : g.channels;
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === 4 || list[i].type === 2) continue;
      if (g.id === "home") {
        if (isUnread(list[i])) { unread = true; mentions += mentionCount(list[i]) || 1; }
      } else {
        if (isUnread(list[i])) unread = true;
        mentions += mentionCount(list[i]);
      }
    }
    return { unread: unread, mentions: mentions };
  }

  function renderGuilds() {
    var items = guildItems().map(function (g, i) {
      var u = guildUnread(g);
      var inner;
      if (g.id === "home") {
        inner = '<div class="rail-icon home">💬</div>';
      } else if (g.icon) {
        inner = '<img class="rail-icon" loading="lazy" src="' + CDN + "/icons/" + g.id + "/" + g.icon + '.png?size=96" alt="">';
      } else {
        inner = '<div class="rail-icon">' + esc(initials(g.name)) + "</div>";
      }
      return { key: "g" + g.id, html: '<div class="rail-item focusable' + (S.view === g.id ? " selected" : "") +
        (u.unread ? " unread" : "") + '" data-i="' + i + '" title="' + esc(g.name || "Direktnachrichten") + '">' +
        inner + (u.mentions ? '<span class="badge">' + u.mentions + "</span>" : "") + "</div>" };
    });
    items.push({ key: "sep", html: '<div class="rail-sep"></div>' });
    patch($("guilds"), items);
    applyFocus(false);
  }

  function sortedGuildChannels(g) {
    var chs = g.channels.slice();
    var byPos = function (a, b) {
      var ta = a.type === 2 || a.type === 13 ? 1 : 0, tb = b.type === 2 || b.type === 13 ? 1 : 0;
      return ta - tb || a.position - b.position || cmpId(a.id, b.id);
    };
    var top = chs.filter(function (c) { return !c.parent_id && c.type !== 4; }).sort(byPos);
    var cats = chs.filter(function (c) { return c.type === 4; })
      .sort(function (a, b) { return a.position - b.position; });
    var out = top.map(function (c) { return { ch: c }; });
    cats.forEach(function (cat) {
      var kids = chs.filter(function (c) { return c.parent_id === cat.id && c.type !== 4; }).sort(byPos);
      if (!kids.length) return;
      out.push({ cat: cat });
      kids.forEach(function (c) { out.push({ ch: c }); });
    });
    return out;
  }

  function channelRows() {
    if (S.view === "home") {
      return S.dms.slice().sort(function (a, b) {
        return cmpId(b.last_message_id, a.last_message_id);
      }).map(function (d) { return { ch: d, dm: true }; });
    }
    var g = currentGuild();
    return g ? sortedGuildChannels(g) : [];
  }

  function voiceMembers(g, channelId) {
    return (g.voice_states || []).filter(function (v) { return v.channel_id === channelId; });
  }

  function renderChannels() {
    var g = currentGuild();
    $("sidebar-head").textContent = g ? g.name : "Direktnachrichten";
    var rows = channelRows();
    var i = 0;
    var items = [];
    rows.forEach(function (r) {
      if (r.cat) { items.push({ key: "c" + r.cat.id, html: '<div class="cat">' + esc(r.cat.name) + "</div>" }); return; }
      var c = r.ch;
      var cls = "chan focusable" + (S.channel && S.channel.id === c.id ? " selected" : "") +
        (isUnread(c) ? " unread" : "");
      var m = mentionCount(c);
      var badge = m ? '<span class="badge">' + m + "</span>" : "";
      var out;
      if (r.dm) {
        out = '<div class="' + cls + ' dm" data-i="' + i + '" data-id="' + c.id + '">' +
          '<img class="avatar" loading="lazy" src="' + dmIcon(c) + '" alt="">' +
          '<span class="name">' + esc(dmName(c)) + "</span>" + badge + "</div>";
        items.push({ key: "ch" + c.id, html: out });
      } else {
        var icon = c.type === 2 || c.type === 13 ? "🔊" : c.type === 5 ? "📢" : "#";
        out = '<div class="' + cls + '" data-i="' + i + '" data-id="' + c.id + '">' +
          '<span class="hash">' + icon + '</span><span class="name">' + esc(c.name) + "</span>" + badge + "</div>";
        items.push({ key: "ch" + c.id, html: out });
        if (c.type === 2 && g) {
          voiceMembers(g, c.id).forEach(function (v) {
            var u = v.member && v.member.user;
            items.push({ key: "v" + c.id + "-" + v.user_id, html: '<div class="voice-member">' +
              esc(u ? userName(u, v.member) : "Mitglied") + "</div>" });
          });
        }
      }
      i++;
    });
    if (!items.length) items.push({ key: "empty", html: '<div class="empty">Keine Kanäle</div>' });
    var key = S.view;
    if ($("channels")._view !== key) {
      $("channels")._view = key;
      $("channels").scrollTop = 0;
    }
    patch($("channels"), items);
    applyFocus(false);
  }

  function renderMe() {
    var u = S.me;
    if (!u) { $("me").innerHTML = ""; return; }
    $("me").innerHTML = '<img class="avatar" src="' + avatarUrl(u) + '" alt="">' +
      '<div class="me-names"><div class="me-name">' + esc(userName(u)) + "</div>" +
      '<div class="me-tag">' + esc(u.username) + "</div></div>";
  }

  function renderConnState() {
    var map = {
      ready: "", connecting: "Verbinde …", reconnecting: "Verbindung wird wiederhergestellt …",
      offline: "Offline – neuer Versuch …", auth_failed: "Anmeldung abgelaufen", logged_out: ""
    };
    var t = map[S.status] !== undefined ? map[S.status] : S.status;
    $("conn-state").textContent = t;
    $("conn-state").hidden = !t;
  }

  /* --------------------------------------------------------- Nachrichten */

  function mdContext() {
    var ctx = { users: {}, channels: {}, roles: {} };
    var g = currentGuild();
    if (g) g.channels.forEach(function (c) { ctx.channels[c.id] = c.name; });
    return ctx;
  }

  function attachmentHtml(a) {
    var type = a.content_type || "";
    var isImg = /^image\//.test(type) || /\.(png|jpe?g|gif|webp)$/i.test(a.filename || "");
    if (isImg) {
      var w = a.width || 400, h = a.height || 300;
      var scale = Math.min(1, 520 / w, 360 / h);
      var src = (a.proxy_url || a.url) + (/\?/.test(a.proxy_url || a.url) ? "&" : "?") + "width=" +
        Math.round(w * scale) + "&height=" + Math.round(h * scale);
      return '<img class="attach-img" loading="lazy" data-full="' + esc(a.url) + '" src="' + esc(src) +
        '" width="' + Math.round(w * scale) + '" height="' + Math.round(h * scale) + '" alt="">';
    }
    var size = a.size > 1048576 ? (a.size / 1048576).toFixed(1) + " MB" : Math.round((a.size || 0) / 1024) + " KB";
    return '<div class="attach-file">📎 ' + esc(a.filename) + ' <span class="dim">' + size + "</span></div>";
  }

  function embedHtml(e, ctx) {
    if (e.type === "image" && e.thumbnail) {
      return attachmentHtml({ url: e.thumbnail.url, proxy_url: e.thumbnail.proxy_url,
        width: e.thumbnail.width, height: e.thumbnail.height, content_type: "image/png" });
    }
    if (e.type === "gifv" && e.thumbnail) {
      return attachmentHtml({ url: e.thumbnail.url, proxy_url: e.thumbnail.proxy_url,
        width: e.thumbnail.width, height: e.thumbnail.height, content_type: "image/png" });
    }
    var color = e.color ? "#" + ("000000" + e.color.toString(16)).slice(-6) : "#4e5058";
    var html = '<div class="embed" style="border-left-color:' + color + '">';
    if (e.author && e.author.name) html += '<div class="embed-author">' + esc(e.author.name) + "</div>";
    if (e.title) html += '<div class="embed-title">' + esc(e.title) + "</div>";
    if (e.description) html += '<div class="embed-desc">' + Markdown.render(e.description, ctx) + "</div>";
    (e.fields || []).forEach(function (f) {
      html += '<div class="embed-field"><b>' + esc(f.name) + "</b><br>" + Markdown.render(f.value, ctx) + "</div>";
    });
    if (e.image) {
      html += attachmentHtml({ url: e.image.url, proxy_url: e.image.proxy_url, width: e.image.width,
        height: e.image.height, content_type: "image/png" });
    } else if (e.thumbnail && e.type !== "article") {
      html += attachmentHtml({ url: e.thumbnail.url, proxy_url: e.thumbnail.proxy_url,
        width: e.thumbnail.width, height: e.thumbnail.height, content_type: "image/png" });
    }
    if (e.footer && e.footer.text) html += '<div class="embed-footer">' + esc(e.footer.text) + "</div>";
    return html + "</div>";
  }

  function reactionsHtml(m) {
    if (!m.reactions || !m.reactions.length) return "";
    return '<div class="reactions">' + m.reactions.map(function (r) {
      var e = r.emoji || {};
      var icon = e.id
        ? '<img class="emoji" src="' + CDN + "/emojis/" + e.id + (e.animated ? ".gif" : ".png") + '?size=32" alt="">'
        : esc(e.name || "?");
      return '<span class="reaction' + (r.me ? " me" : "") + '">' + icon + " " + r.count + "</span>";
    }).join("") + "</div>";
  }

  function systemText(m) {
    var n = esc(userName(m.author, m.member));
    switch (m.type) {
      case 1: return n + " hat jemanden zur Gruppe hinzugefügt.";
      case 2: return n + " hat jemanden aus der Gruppe entfernt.";
      case 3: return n + " hat einen Anruf gestartet.";
      case 4: return n + " hat den Gruppennamen geändert.";
      case 6: return n + " hat eine Nachricht angepinnt.";
      case 7: return n + " ist dem Server beigetreten. 👋";
      case 8: return n + " hat den Server geboostet! 🚀";
      default: return null;
    }
  }

  function messageHtml(m, prev) {
    var ctx = mdContext();
    (m.mentions || []).forEach(function (u) { ctx.users[u.id] = userName(u, u.member); });
    var sys = systemText(m);
    var cls = "msg focusable";
    if (sys) {
      return '<div class="' + cls + ' system" data-id="' + m.id + '">' + sys +
        ' <span class="time">' + fmtTime(m.timestamp) + "</span></div>";
    }
    var grouped = prev && !prev._sys && prev.author && m.author && prev.author.id === m.author.id &&
      !m.message_reference && new Date(m.timestamp) - new Date(prev.timestamp) < 7 * 60000;
    if (m._pending) cls += " pending";
    if (m._failed) cls += " failed";
    if ((m.mentions || []).some(function (u) { return S.me && u.id === S.me.id; }) || m.mention_everyone) {
      cls += " mentioned";
    }
    var html = '<div class="' + cls + (grouped ? " grouped" : "") + '" data-id="' + m.id + '">';
    if (m.referenced_message) {
      var r = m.referenced_message;
      html += '<div class="reply-ref">↱ <b>' + esc(userName(r.author, r.member)) + "</b> " +
        esc((r.content || "[Anhang]").slice(0, 120)) + "</div>";
    }
    if (!grouped) {
      html += '<img class="avatar" loading="lazy" src="' + avatarUrl(m.author) + '" alt="">' +
        '<div class="msg-head"><span class="author">' + esc(userName(m.author, m.member)) + "</span>" +
        (m.author && m.author.bot ? '<span class="bot">BOT</span>' : "") +
        '<span class="time">' + fmtTime(m.timestamp) + "</span></div>";
    }
    html += '<div class="content">' + Markdown.render(m.content, ctx) +
      (m.edited_timestamp ? ' <span class="dim">(bearbeitet)</span>' : "") + "</div>";
    (m.attachments || []).forEach(function (a) { html += attachmentHtml(a); });
    (m.embeds || []).forEach(function (e) { html += embedHtml(e, ctx); });
    (m.sticker_items || []).forEach(function (s) {
      html += '<img class="sticker" loading="lazy" src="' + CDN + "/stickers/" + s.id + '.png?size=160" alt="' + esc(s.name) + '">';
    });
    html += reactionsHtml(m);
    return html + "</div>";
  }

  function renderMessages(keepScroll) {
    var box = $("messages");
    var inner = $("messages-inner");
    var oldHeight = inner.scrollHeight, oldTop = box.scrollTop;
    var items = [];
    if (!S.hasMore) {
      items.push({ key: "start", html: '<div class="chan-start">Anfang von ' + esc(S.channel.title) + "</div>" });
    }
    for (var i = 0; i < S.messages.length; i++) {
      S.messages[i]._sys = !!systemText(S.messages[i]);
      items.push({ key: "m" + S.messages[i].id, html: messageHtml(S.messages[i], S.messages[i - 1]) });
    }
    patch(inner, items);
    bindImages(inner);
    if (keepScroll === "top") {
      box.scrollTop = oldTop + (inner.scrollHeight - oldHeight);
    } else if (keepScroll !== true) {
      box.scrollTop = box.scrollHeight;
    }
    applyFocus();
  }

  function bindImages(root) {
    // Bilder verschieben das Layout beim Laden; am unteren Rand bleiben.
    Array.prototype.forEach.call(root.querySelectorAll("img"), function (img) {
      if (img.onload) return;
      img.onload = function () {
        var box = $("messages");
        if (S.idx.messages >= S.messages.length - 1 && S.zone !== "messages") {
          box.scrollTop = box.scrollHeight;
        }
      };
    });
  }

  function atBottom() {
    var box = $("messages");
    return box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  }

  function appendMessage(m) {
    var wasBottom = atBottom();
    var followFocus = S.zone !== "messages" || S.idx.messages >= S.messages.length - 1;
    S.messages.push(m);
    if (S.messages.length > 300) S.messages.splice(0, S.messages.length - 300);
    if (followFocus) S.idx.messages = S.messages.length - 1;
    renderMessages(!wasBottom);
  }

  function openChannel(ch, guild) {
    var title = ch.recipients ? dmName(ch) : "#" + ch.name;
    S.channel = {
      id: ch.id, name: ch.name, title: title,
      guild_id: guild ? guild.id : "", dm: !guild,
      can_send: guild ? ch.can_send !== false : true,
      type: ch.type
    };
    S.messages = [];
    S.hasMore = true;
    S.typing = {};
    S.replyTo = null;
    S.editing = null;
    updateComposer();
    $("chat-title").textContent = title;
    $("chat-topic").textContent = ch.topic || "";
    $("messages-inner").innerHTML = '<div class="loading">Lade Nachrichten …</div>';
    $("messages").scrollTop = 0;
    renderTyping();
    renderChannels();
    Api.focus(S.channel.guild_id, ch.id).catch(function () {});

    var id = ch.id;
    Api.rest("GET", "/channels/" + id + "/messages?limit=50").then(function (list) {
      if (!S.channel || S.channel.id !== id) return;
      S.messages = (list || []).reverse();
      S.hasMore = list && list.length === 50;
      S.idx.messages = S.messages.length - 1;
      renderMessages();
      ackLatest();
    }).catch(function (e) {
      if (!S.channel || S.channel.id !== id) return;
      $("messages-inner").innerHTML = '<div class="loading">Nachrichten konnten nicht geladen werden (' +
        esc(e.message) + ")</div>";
    });
  }

  function loadOlder() {
    if (!S.channel || !S.hasMore || S.loadingOlder || !S.messages.length) return;
    S.loadingOlder = true;
    var id = S.channel.id;
    Api.rest("GET", "/channels/" + id + "/messages?limit=50&before=" + S.messages[0].id).then(function (list) {
      S.loadingOlder = false;
      if (!S.channel || S.channel.id !== id) return;
      list = (list || []).reverse();
      S.hasMore = list.length === 50;
      S.messages = list.concat(S.messages);
      S.idx.messages += list.length;
      renderMessages("top");
    }).catch(function (e) {
      S.loadingOlder = false;
      toast("Ältere Nachrichten: " + e.message);
    });
  }

  var ackTimer = null;
  function ackLatest() {
    clearTimeout(ackTimer);
    ackTimer = setTimeout(function () {
      if (!S.channel || !S.messages.length) return;
      var last = S.messages[S.messages.length - 1];
      if (last._pending) return;
      var f = findChannel(S.channel.id);
      if (f && f.ch.read && cmpId(f.ch.read.last_message_id, last.id) >= 0) return;
      if (f) {
        f.ch.read = { last_message_id: last.id, mention_count: 0 };
        renderGuilds();
        renderChannels();
      }
      Api.rest("POST", "/channels/" + S.channel.id + "/messages/" + last.id + "/ack", { token: null })
        .catch(function () {});
    }, 800);
  }

  /* --------------------------------------------------------- Composer */

  function updateComposer() {
    var input = $("composer-input");
    var bar = $("reply-bar");
    if (!S.channel) {
      input.placeholder = "Wähle einen Kanal";
      input.disabled = true;
    } else if (!S.channel.can_send) {
      input.placeholder = "Du darfst in diesem Kanal nicht schreiben";
      input.disabled = true;
    } else if (S.channel.type === 2 || S.channel.type === 13) {
      input.placeholder = "Nachricht an " + S.channel.title;
      input.disabled = false;
    } else {
      input.placeholder = "Nachricht an " + S.channel.title;
      input.disabled = false;
    }
    $("btn-send").disabled = input.disabled;
    if (S.editing) {
      bar.hidden = false;
      $("reply-text").textContent = "Nachricht bearbeiten";
    } else if (S.replyTo) {
      bar.hidden = false;
      $("reply-text").textContent = "Antwort an " + userName(S.replyTo.author, S.replyTo.member);
    } else {
      bar.hidden = true;
    }
  }

  var lastTypingSent = 0;
  function openComposer() {
    if (!S.channel || !S.channel.can_send) return;
    var input = $("composer-input");
    input.focus();
    renderHints();
    if (Date.now() - lastTypingSent > 8000) {
      lastTypingSent = Date.now();
      Api.rest("POST", "/channels/" + S.channel.id + "/typing").catch(function () {});
    }
  }

  function closeComposer() {
    $("composer-input").blur();
    renderHints();
  }

  function nonce() {
    return String(Date.now() * 4194304 + Math.floor(Math.random() * 4194304)).slice(0, 19);
  }

  function submitComposer() {
    var input = $("composer-input");
    var text = input.value.replace(/\s+$/, "");
    if (!S.channel || !text) { closeComposer(); return; }
    var ch = S.channel;
    input.value = "";
    closeComposer();

    if (S.editing) {
      var edit = S.editing;
      S.editing = null;
      updateComposer();
      Api.rest("PATCH", "/channels/" + ch.id + "/messages/" + edit.id, { content: text })
        .catch(function (e) { toast("Bearbeiten fehlgeschlagen: " + e.message); });
      return;
    }

    var n = nonce();
    var body = { content: text, nonce: n, tts: false, flags: 0 };
    if (S.replyTo) {
      body.message_reference = { message_id: S.replyTo.id, channel_id: ch.id };
      if (ch.guild_id) body.message_reference.guild_id = ch.guild_id;
    }
    var pending = {
      id: "pending-" + n, nonce: n, content: text, author: S.me, timestamp: new Date().toISOString(),
      _pending: true, referenced_message: S.replyTo || undefined,
      message_reference: S.replyTo ? body.message_reference : undefined
    };
    S.replyTo = null;
    updateComposer();
    S.idx.messages = S.messages.length;
    appendMessage(pending);

    Api.rest("POST", "/channels/" + ch.id + "/messages", body).then(function (m) {
      if (m && m.id) replacePending(n, m);
    }).catch(function (e) {
      pending._pending = false;
      pending._failed = true;
      if (S.channel && S.channel.id === ch.id) renderMessages(true);
      toast("Senden fehlgeschlagen: " + (e.status === 429 ? "zu schnell, bitte warten" : e.message));
    });
  }

  function replacePending(n, m) {
    for (var i = 0; i < S.messages.length; i++) {
      if (S.messages[i].nonce === n && S.messages[i]._pending) {
        S.messages[i] = m;
        renderMessages(true);
        return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------ Typing */

  function renderTyping() {
    var now = Date.now();
    var names = [];
    Object.keys(S.typing).forEach(function (k) {
      if (S.typing[k].until > now) names.push(S.typing[k].name);
      else delete S.typing[k];
    });
    var t = "";
    if (names.length === 1) t = names[0] + " schreibt …";
    else if (names.length > 1 && names.length < 4) t = names.join(", ") + " schreiben …";
    else if (names.length >= 4) t = "Mehrere Personen schreiben …";
    $("typing").textContent = t;
  }
  setInterval(renderTyping, 2000);

  /* ------------------------------------------------------------- Fokus */

  function zoneItems(zone) {
    var root = $(zone);
    return root ? Array.prototype.slice.call(root.querySelectorAll(".focusable")) : [];
  }

  function applyFocus(scroll) {
    ["guilds", "channels", "messages"].forEach(function (z) {
      var items = zoneItems(z);
      if (S.idx[z] >= items.length) S.idx[z] = items.length - 1;
      if (S.idx[z] < 0) S.idx[z] = 0;
      items.forEach(function (el, i) {
        var on = S.zone === z && i === S.idx[z] && !S.menu && document.activeElement !== $("composer-input");
        el.classList.toggle("focused", on);
        if (on && scroll !== false) reveal(el, z);
      });
    });
  }

  function reveal(el, zone) {
    var box = zone === "messages" ? $("messages") : $(zone);
    var er = el.getBoundingClientRect(), br = box.getBoundingClientRect();
    var margin = zone === "messages" ? 40 : 60;
    if (er.top < br.top + margin) box.scrollTop -= br.top + margin - er.top;
    else if (er.bottom > br.bottom - margin) {
      // Lange Nachrichten: oberen Rand zeigen statt ans Ende zu springen.
      if (er.height > br.height - 2 * margin) box.scrollTop += er.top - br.top - margin;
      else box.scrollTop += er.bottom - br.bottom + margin;
    }
  }

  function setZone(z) {
    S.zone = z;
    applyFocus();
    renderHints();
  }

  function move(delta) {
    var items = zoneItems(S.zone);
    if (!items.length) return;
    var i = S.idx[S.zone] + delta;
    if (S.zone === "messages" && i < 0) {
      loadOlder();
      var box = $("messages");
      box.scrollTop = 0;
      return;
    }
    S.idx[S.zone] = Math.max(0, Math.min(items.length - 1, i));
    applyFocus();
  }

  /* ------------------------------------------------------------- Menue */

  function openMenu(title, items) {
    S.menu = { items: items, idx: 0 };
    $("menu-title").textContent = title;
    $("menu-items").innerHTML = items.map(function (it, i) {
      return '<div class="menu-item focusable" data-i="' + i + '">' + esc(it.label) + "</div>";
    }).join("");
    $("menu").hidden = false;
    renderMenuFocus();
    applyFocus();
    renderHints();
  }

  function renderMenuFocus() {
    Array.prototype.forEach.call($("menu-items").children, function (el, i) {
      el.classList.toggle("focused", i === S.menu.idx);
    });
  }

  function closeMenu() {
    S.menu = null;
    $("menu").hidden = true;
    applyFocus();
    renderHints();
  }

  function menuKey(code, el) {
    var m = S.menu;
    if (code === K.UP) m.idx = Math.max(0, m.idx - 1);
    else if (code === K.DOWN) m.idx = Math.min(m.items.length - 1, m.idx + 1);
    else if (code === K.CIRCLE || code === K.SQUARE) closeMenu();
    else if (code === K.CROSS || code === "click") {
      if (el) m.idx = +el.getAttribute("data-i");
      var it = m.items[m.idx];
      closeMenu();
      if (it) it.action();
      return;
    }
    renderMenuFocus();
  }

  function mainMenu() {
    openMenu("PS5Cord " + (S.version || ""), [
      { label: "Neu laden", action: function () { location.reload(); } },
      { label: "Abmelden", action: function () {
        openMenu("Wirklich abmelden?", [
          { label: "Ja, abmelden", action: function () { Api.logout().then(loadState); } },
          { label: "Abbrechen", action: function () {} }
        ]);
      } }
    ]);
  }

  function messageMenu(m) {
    if (!m || m._pending) return;
    var mine = S.me && m.author && m.author.id === S.me.id;
    var items = [];
    if (S.channel.can_send) {
      items.push({ label: "Antworten", action: function () {
        S.replyTo = m; S.editing = null; updateComposer(); openComposer();
      } });
    }
    items.push({ label: "Reaktion hinzufügen", action: function () { reactionMenu(m); } });
    var imgs = (m.attachments || []).filter(function (a) { return /^image\//.test(a.content_type || ""); });
    if (imgs.length) {
      items.push({ label: "Bild ansehen", action: function () { viewImage(imgs[0].url); } });
    }
    if (mine && m.type === 0) {
      items.push({ label: "Bearbeiten", action: function () {
        S.editing = m; S.replyTo = null;
        $("composer-input").value = m.content;
        updateComposer(); openComposer();
      } });
    }
    if (mine) {
      items.push({ label: "Löschen", action: function () {
        openMenu("Nachricht löschen?", [
          { label: "Ja, löschen", action: function () {
            Api.rest("DELETE", "/channels/" + S.channel.id + "/messages/" + m.id)
              .catch(function (e) { toast("Löschen fehlgeschlagen: " + e.message); });
          } },
          { label: "Abbrechen", action: function () {} }
        ]);
      } });
    }
    openMenu(userName(m.author, m.member) + ": " + (m.content || "").slice(0, 40), items);
  }

  function reactionMenu(m) {
    openMenu("Reaktion", QUICK_REACTIONS.map(function (e) {
      return { label: e, action: function () {
        Api.rest("PUT", "/channels/" + S.channel.id + "/messages/" + m.id + "/reactions/" +
          encodeURIComponent(e) + "/@me?location=Message").catch(function (err) {
          toast("Reaktion fehlgeschlagen: " + err.message);
        });
      } };
    }));
  }

  function viewImage(url) {
    $("viewer-img").src = url;
    $("viewer").hidden = false;
  }

  /* ----------------------------------------------------------- Tasten */

  function selectGuild(i) {
    var g = guildItems()[i];
    if (!g) return;
    S.view = g.id;
    S.idx.channels = 0;
    renderGuilds();
    renderChannels();
    // Auf den ersten ungelesenen Kanal springen.
    var rows = channelRows().filter(function (r) { return r.ch; });
    for (var k = 0; k < rows.length; k++) {
      if (isUnread(rows[k].ch)) { S.idx.channels = k; break; }
    }
    setZone("channels");
  }

  function selectChannel(i) {
    var rows = channelRows().filter(function (r) { return r.ch; });
    var r = rows[i];
    if (!r) return;
    if (r.ch.type === 2 || r.ch.type === 13) {
      toast("Sprachkanäle: Beitreten kommt mit dem Voice-Update. Text-Chat im Sprachkanal wird angezeigt.");
    }
    openChannel(r.ch, currentGuild());
    setZone("messages");
  }

  function onKey(code, e, fromField, el) {
    if (code === "click" && !S.pointer) { S.pointer = true; renderHints(); }
    if (!$("viewer").hidden) { $("viewer").hidden = true; return; }
    if (S.menu) {
      if (code === "click" && !el.classList.contains("menu-item")) { closeMenu(); return; }
      menuKey(code, el);
      return;
    }

    if (!$("login").hidden) { loginKey(code, el); return; }

    if (fromField) {
      if (code === K.CIRCLE) {
        if (S.editing) { S.editing = null; $("composer-input").value = ""; }
        updateComposer();
        closeComposer();
        applyFocus();
      } else if (code === K.TRIANGLE) {
        submitComposer();
      }
      return;
    }

    if (code === "click") {
      var action = el.getAttribute("data-action");
      if (action === "menu") { mainMenu(); return; }
      if (action === "cancel-reply") {
        S.replyTo = null; S.editing = null; $("composer-input").value = "";
        updateComposer(); return;
      }
      var zoneEl = el.closest(".zone");
      if (!zoneEl) return;
      S.zone = zoneEl.getAttribute("data-zone");
      S.idx[S.zone] = zoneItems(S.zone).indexOf(el);
      code = K.CROSS;
    }

    if (code === K.SQUARE) { mainMenu(); return; }
    if (code === K.TRIANGLE) { openComposer(); return; }

    switch (S.zone) {
      case "guilds":
        if (code === K.UP) move(-1);
        else if (code === K.DOWN) move(1);
        else if (code === K.CROSS || code === K.RIGHT) selectGuild(S.idx.guilds);
        break;
      case "channels":
        if (code === K.UP) move(-1);
        else if (code === K.DOWN) move(1);
        else if (code === K.LEFT || code === K.CIRCLE) setZone("guilds");
        else if (code === K.CROSS) selectChannel(S.idx.channels);
        else if (code === K.RIGHT && S.channel) setZone("messages");
        break;
      case "messages":
        if (code === K.UP) move(-1);
        else if (code === K.DOWN) move(1);
        else if (code === K.PGUP) move(-10);
        else if (code === K.PGDN) move(10);
        else if (code === K.LEFT || code === K.CIRCLE) {
          if (S.replyTo) { S.replyTo = null; updateComposer(); }
          else setZone("channels");
        }
        else if (code === K.CROSS) {
          var m = S.messages[S.idx.messages];
          var img = e && e.target && e.target.tagName === "IMG" ? e.target : null;
          if (img && img.getAttribute("data-full")) viewImage(img.getAttribute("data-full"));
          else messageMenu(m);
        }
        break;
    }
    renderHints();
  }

  $("messages").addEventListener("scroll", function () {
    if ($("messages").scrollTop < 60) loadOlder();
  });

  $("composer").addEventListener("submit", function (e) {
    e.preventDefault();
    submitComposer();
  });
  $("composer-input").addEventListener("focus", function () { applyFocus(false); renderHints(); });
  $("composer-input").addEventListener("blur", function () { applyFocus(false); renderHints(); });

  /* ------------------------------------------------------------- Login */

  var loginIdx = 0;
  function loginItems() {
    return Array.prototype.slice.call($("login").querySelectorAll(".focusable"))
      .filter(function (el) { return el.offsetParent !== null; });
  }
  function renderLoginFocus() {
    var items = loginItems();
    if (loginIdx >= items.length) loginIdx = items.length - 1;
    items.forEach(function (el, i) { el.classList.toggle("focused", i === loginIdx); });
  }
  function loginKey(code, el) {
    var items = loginItems();
    if (code === "click") { loginIdx = items.indexOf(el); code = K.CROSS; }
    if (code === K.UP || code === K.LEFT) loginIdx = Math.max(0, loginIdx - 1);
    else if (code === K.DOWN || code === K.RIGHT) loginIdx = Math.min(items.length - 1, loginIdx + 1);
    else if (code === K.CROSS) {
      var t = items[loginIdx];
      if (t === $("btn-qr-retry")) startQr();
      else if (t === $("btn-token")) {
        $("token-form").hidden = false;
        loginIdx = loginItems().indexOf($("token-input"));
        renderLoginFocus();
        $("token-input").focus();
        return;
      } else if (t && t.tagName === "INPUT") t.focus();
      else if (t && t.type === "submit") submitToken();
    } else if (code === K.TRIANGLE && !$("token-form").hidden) {
      submitToken();
    }
    renderLoginFocus();
  }

  $("token-form").addEventListener("submit", function (e) {
    e.preventDefault();
    submitToken();
  });

  function submitToken() {
    var token = $("token-input").value.trim();
    if (!token) return;
    $("login-error").hidden = true;
    Api.loginToken(token).then(function () {
      $("token-input").value = "";
      show("splash");
      $("splash-text").textContent = "Angemeldet – lade Discord …";
    }).catch(function (e) {
      $("login-error").textContent = e.message;
      $("login-error").hidden = false;
    });
  }

  function startQr() {
    $("qr").innerHTML = "";
    $("qr-status").textContent = "QR-Code wird geladen …";
    Api.loginQr().catch(function (e) { $("qr-status").textContent = "Fehler: " + e.message; });
  }

  var qrUrl = "";
  function renderQr(st) {
    st = st || {};
    var text = {
      idle: "", starting: "QR-Code wird geladen …",
      waiting: "Scanne den Code mit der Discord-App",
      logging_in: "Anmeldung läuft …", done: "Angemeldet!",
      expired: "QR-Code abgelaufen – drücke „QR-Code neu laden“",
      cancelled: "Login am Handy abgebrochen",
      error: "Fehler: " + (st.error || "")
    }[st.state] || "";
    if (st.state === "scanned") {
      var u = st.user || {};
      text = "Bestätige den Login am Handy (" + (u.username || "") + ")";
      $("qr").innerHTML = '<img class="qr-avatar" src="' +
        (u.avatar ? CDN + "/avatars/" + u.id + "/" + u.avatar + ".png?size=256" : defaultAvatar(u.id)) + '" alt="">';
      qrUrl = "";
    } else if (st.state === "waiting" && st.url && st.url !== qrUrl) {
      qrUrl = st.url;
      var qr = qrcode(0, "M");
      qr.addData(st.url);
      qr.make();
      $("qr").innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    } else if (st.state !== "waiting") {
      if (st.state !== "scanned") $("qr").innerHTML = "";
      qrUrl = "";
    }
    $("qr-status").textContent = text;
  }

  function showLogin(st) {
    if (!S.loginShown) {
      S.loginShown = true;
      show("login");
      loginIdx = 0;
      renderLoginFocus();
      var q = st && st.qr;
      if (!q || q.state === "idle" || q.state === "expired" || q.state === "error" || q.state === "cancelled" || q.state === "done") {
        startQr();
      } else {
        renderQr(q);
      }
    } else if (st) {
      renderQr(st.qr);
    }
  }

  /* -------------------------------------------------- Zustand & Events */

  function applyState(st) {
    S.status = st.status;
    S.version = st.version;
    S.seq = st.seq;
    renderConnState();

    if (!st.logged_in) {
      S.me = null;
      showLogin(st);
      return;
    }
    S.loginShown = false;
    if (!st.me) {
      show("splash");
      $("splash-text").textContent = st.status === "auth_failed"
        ? "Anmeldung abgelaufen – bitte neu einloggen."
        : "Verbinde mit Discord …";
      return;
    }
    S.me = st.me;
    S.guilds = st.guilds || [];
    S.dms = st.dms || [];
    if (S.view !== "home" && !currentGuild()) S.view = "home";
    if ($("app").hidden) show("app");
    renderMe();
    renderGuilds();
    renderChannels();
    if (S.channel) {
      var f = findChannel(S.channel.id);
      if (f) S.channel.can_send = f.guild ? f.ch.can_send !== false : true;
      updateComposer();
    }
  }

  function loadState() {
    return Api.state().then(function (st) {
      applyState(st);
      startPolling();
    }).catch(function () {
      show("splash");
      $("splash-text").textContent = "PS5Cord-Dienst nicht erreichbar. Läuft der Payload?";
      setTimeout(loadState, 3000);
    });
  }

  var stateTimer = null;
  function reloadStateSoon() {
    clearTimeout(stateTimer);
    stateTimer = setTimeout(function () {
      Api.state().then(applyState).catch(function () {});
    }, 300);
  }

  function updateMessage(d) {
    for (var i = 0; i < S.messages.length; i++) {
      if (S.messages[i].id === d.id) {
        var m = S.messages[i];
        Object.keys(d).forEach(function (k) { m[k] = d[k]; });
        renderMessages(true);
        return;
      }
    }
  }

  function updateReaction(d, add) {
    for (var i = 0; i < S.messages.length; i++) {
      var m = S.messages[i];
      if (m.id !== d.message_id) continue;
      m.reactions = m.reactions || [];
      var key = d.emoji.id || d.emoji.name, r = null;
      for (var j = 0; j < m.reactions.length; j++) {
        var e = m.reactions[j].emoji;
        if ((e.id || e.name) === key) r = m.reactions[j];
      }
      var mine = S.me && d.user_id === S.me.id;
      if (add) {
        if (!r) { r = { emoji: d.emoji, count: 0, me: false }; m.reactions.push(r); }
        r.count++;
        if (mine) r.me = true;
      } else if (r) {
        r.count--;
        if (mine) r.me = false;
        if (r.count <= 0) m.reactions.splice(m.reactions.indexOf(r), 1);
      }
      renderMessages(true);
      return;
    }
  }

  function onEvent(ev) {
    var d = ev.d;
    switch (ev.t) {
      case "status":
        S.status = d;
        renderConnState();
        if (d === "auth_failed") loadState();
        break;
      case "ready":
      case "logout":
      case "STATE_CHANGED":
        reloadStateSoon();
        break;
      case "qr":
        if (!$("login").hidden) renderQr(d);
        if (d && d.state === "done") reloadStateSoon();
        break;
      case "MESSAGE_CREATE": {
        var f = findChannel(d.channel_id);
        if (f) {
          f.ch.last_message_id = d.id;
          var mine = S.me && d.author && d.author.id === S.me.id;
          if (mine) f.ch.read = { last_message_id: d.id, mention_count: 0 };
          else if (!f.guild || (d.mentions || []).some(function (u) { return S.me && u.id === S.me.id; })) {
            var rd = f.ch.read || { last_message_id: "0", mention_count: 0 };
            f.ch.read = { last_message_id: rd.last_message_id, mention_count: (rd.mention_count || 0) + 1 };
          }
        } else if (!d.guild_id) {
          reloadStateSoon(); // neue DM
        }
        if (S.channel && S.channel.id === d.channel_id) {
          if (d.author) delete S.typing[d.author.id];
          renderTyping();
          if (!(d.nonce && replacePending(d.nonce, d))) {
            var dup = S.messages.some(function (m) { return m.id === d.id; });
            if (!dup) appendMessage(d);
          }
          ackLatest();
        }
        renderGuilds();
        if (S.view === "home" ? !d.guild_id : d.guild_id === S.view) renderChannels();
        break;
      }
      case "MESSAGE_UPDATE":
        if (S.channel && S.channel.id === d.channel_id) updateMessage(d);
        break;
      case "MESSAGE_DELETE":
        if (S.channel && S.channel.id === d.channel_id) {
          S.messages = S.messages.filter(function (m) { return m.id !== d.id; });
          renderMessages(true);
        }
        break;
      case "MESSAGE_ACK": {
        var fa = findChannel(d.channel_id);
        if (fa) {
          fa.ch.read = { last_message_id: d.message_id, mention_count: 0 };
          renderGuilds();
          renderChannels();
        }
        break;
      }
      case "MESSAGE_REACTION_ADD":
      case "MESSAGE_REACTION_REMOVE":
        if (S.channel && S.channel.id === d.channel_id) updateReaction(d, ev.t === "MESSAGE_REACTION_ADD");
        break;
      case "TYPING_START":
        if (S.channel && S.channel.id === d.channel_id && (!S.me || d.user_id !== S.me.id)) {
          var name = d.member ? userName(d.member.user, d.member) : null;
          if (!name) {
            var fc = findChannel(d.channel_id);
            (fc && fc.ch.recipients || []).forEach(function (u) { if (u.id === d.user_id) name = userName(u); });
          }
          S.typing[d.user_id] = { name: name || "Jemand", until: Date.now() + 10000 };
          renderTyping();
        }
        break;
      case "VOICE_STATE_UPDATE":
        reloadStateSoon();
        break;
    }
  }

  function startPolling() {
    if (S.pollActive) return;
    S.pollActive = true;
    (function poll() {
      Api.events(S.seq).then(function (res) {
        if (res.reset) {
          S.seq = res.seq;
          reloadStateSoon();
        } else {
          S.seq = res.seq;
          res.events.forEach(function (ev) {
            try { onEvent(ev); } catch (e) { console.error(e); }
          });
        }
        setTimeout(poll, 50);
      }).catch(function () {
        renderConnState();
        $("conn-state").textContent = "PS5Cord-Dienst nicht erreichbar …";
        $("conn-state").hidden = false;
        setTimeout(function () {
          Api.state().then(function (st) {
            applyState(st);
            poll();
          }).catch(function () { setTimeout(poll, 3000); });
        }, 2000);
      });
    })();
  }

  Input.setHandler(onKey);
  loadState();
})();
