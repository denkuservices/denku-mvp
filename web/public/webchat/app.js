/**
 * The Web Chat widget, running inside the iframe on Denku's own origin.
 *
 * It talks to three endpoints and nothing else: `session` to open or resume a thread, `send` to
 * say something, `poll` to pick up a reply a person typed from the Inbox after the AI had
 * already answered (or instead of it). Everything it knows about who the visitor is came from a
 * signed token the server issued — this file never states an org, a connection or a session id
 * of its own.
 *
 * Written as plain ES5 with no build step, for the same reason the loader is: it ships as a
 * static file, and adding a bundler to the path between a customer's website and their chat
 * would buy nothing a 300-line file needs.
 */
(function () {
  "use strict";

  var boot = {};
  try {
    boot = JSON.parse(document.getElementById("denku-boot").textContent);
  } catch (e) {
    return;
  }

  var host = boot.parentOrigin || null;
  var token = null;
  var visitorId = null;
  var context = { pageUrl: null, referrer: null, locale: null };
  var lastAt = null;
  var sending = false;
  /**
   * Files the visitor has attached but not yet sent.
   *
   * Uploaded the moment they pick one, so that pressing Send is instant rather than a wait — and
   * so a file that is too big is refused while they are still looking at the picker, not after
   * they have written a paragraph to go with it.
   */
  var pendingFiles = [];
  var uploading = 0;
  var pollTimer = null;
  var seen = {};

  /**
   * How often the widget asks for messages it has not been handed.
   *
   * Only while the widget is OPEN and the tab is visible — a closed widget and a backgrounded
   * tab both poll not at all. Five seconds is slower than a chat feels, which is fine: the AI's
   * answer arrives in the `send` response, and this interval only governs how late a HUMAN reply
   * shows up. A shop owner typing from the Inbox is not racing anyone.
   */
  var POLL_MS = 5000;

  /**
   * Colours, validated a second time on the way to the DOM.
   *
   * The server already sanitised these. Doing it again here is not distrust of the server — it is
   * the rule that whatever ends up in a CSS custom property was checked by the code that puts it
   * there, so a future caller (a live preview posting a colour as the owner types, say) cannot
   * become the one path that skipped the check. A rejected value simply does not get set, and the
   * stylesheet's own default shows through.
   */
  var THEME_VARS = {
    accent: "--denku-accent",
    surface: "--denku-ground",
    headerBg: "--denku-header-bg",
    headerText: "--denku-header-text",
  };

  function applyTheme(theme) {
    if (!theme || typeof theme !== "object") return;
    for (var key in THEME_VARS) {
      if (!Object.prototype.hasOwnProperty.call(THEME_VARS, key)) continue;
      var value = theme[key];
      if (typeof value !== "string" || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())) continue;
      document.documentElement.style.setProperty(THEME_VARS[key], value.trim());
    }
  }

  applyTheme(boot.theme);

  // ---------------------------------------------------------------- rendering

  var log, input, sendButton, typing, fileInput, attachmentBar;

  function build() {
    document.body.innerHTML =
      '<div class="denku-header">' +
      "<strong>" +
      escapeHtml(boot.displayName || "Chat") +
      '<span class="denku-sub">Usually replies in a moment</span></strong>' +
      '<button class="denku-close" type="button" aria-label="Close chat">&times;</button>' +
      "</div>" +
      '<div class="denku-log" id="denku-log" role="log" aria-live="polite"></div>' +
      '<div class="denku-attachments" id="denku-attachments"></div>' +
      '<form class="denku-form" id="denku-form">' +
      '<input type="file" id="denku-file" class="denku-file" tabindex="-1" ' +
      'accept="image/jpeg,image/png,image/webp,image/gif,image/heic,audio/*">' +
      '<button class="denku-attach" id="denku-attach" type="button" aria-label="Attach a photo or voice note">' +
      "&#128206;</button>" +
      '<textarea class="denku-input" id="denku-input" rows="1" placeholder="Write a message…" ' +
      'aria-label="Write a message"></textarea>' +
      '<button class="denku-send" id="denku-send" type="submit">Send</button>' +
      "</form>";

    log = document.getElementById("denku-log");
    input = document.getElementById("denku-input");
    sendButton = document.getElementById("denku-send");
    fileInput = document.getElementById("denku-file");
    attachmentBar = document.getElementById("denku-attachments");

    document.getElementById("denku-attach").addEventListener("click", function () {
      fileInput.click();
    });

    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      // Cleared immediately so picking the SAME file twice still fires a change event.
      fileInput.value = "";
      if (file) upload(file);
    });

    document.querySelector(".denku-close").addEventListener("click", function () {
      tell({ type: "close" });
    });

    document.getElementById("denku-form").addEventListener("submit", function (event) {
      event.preventDefault();
      submit();
    });

    input.addEventListener("keydown", function (event) {
      // Enter sends, Shift+Enter is a new line — what every chat this visitor has ever used does.
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });

    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Every message is inserted as TEXT, never as markup.
   *
   * The content of a message is written by two untrusted parties — a stranger on the internet
   * and a language model — and rendered in a document that holds a session token. `textContent`
   * is what makes that safe, and it is why nothing here builds a bubble out of an HTML string.
   */
  function addMessage(role, content, key, pending) {
    if (key) {
      if (seen[key]) return seen[key];
      seen[key] = true;
    }
    var el = document.createElement("div");
    el.className = "denku-msg " + (role === "user" ? "user" : "assistant") + (pending ? " pending" : "");
    el.textContent = content;
    log.appendChild(el);
    scroll();
    return el;
  }

  function addNote(text) {
    var el = document.createElement("div");
    el.className = "denku-note";
    el.textContent = text;
    log.appendChild(el);
    scroll();
  }

  function showTyping(on) {
    if (on && !typing) {
      typing = document.createElement("div");
      typing.className = "denku-typing";
      typing.innerHTML = "<span></span><span></span><span></span>";
      log.appendChild(typing);
      scroll();
    } else if (!on && typing) {
      typing.parentNode.removeChild(typing);
      typing = null;
    }
  }

  function scroll() {
    log.scrollTop = log.scrollHeight;
  }

  function render(messages) {
    if (!messages || !messages.length) return;
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      addMessage(m.role, m.content, m.id);
      if (!lastAt || m.createdAt > lastAt) lastAt = m.createdAt;
    }
  }

  // ------------------------------------------------------------------ network

  function api(path, body) {
    return fetch("/api/webchat/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return { ok: false, error: "server_error" };
        })
        .then(function (data) {
          return { status: res.status, data: data };
        });
    });
  }

  /**
   * Send one file to the upload endpoint and remember what came back.
   *
   * The visitor sees a chip the moment they pick the file, and it says "sending…" until the
   * server has it — because a photo that silently does nothing for four seconds on a phone
   * connection reads as a broken widget.
   */
  function upload(file) {
    if (pendingFiles.length + uploading >= 4) {
      addNote("You can attach up to four files at a time.");
      return;
    }

    var chip = addChip(file.name || "attachment", true);
    uploading += 1;
    updateSendState();

    var form = new FormData();
    form.append("token", token || "");
    form.append("file", file);

    fetch("/api/webchat/upload", { method: "POST", body: form })
      .then(function (res) {
        return res.json().then(
          function (data) {
            return { status: res.status, data: data };
          },
          function () {
            return { status: res.status, data: { ok: false, error: "server_error" } };
          }
        );
      })
      .then(function (result) {
        uploading -= 1;
        if (!result.data || !result.data.ok || !result.data.attachment) {
          removeChip(chip);
          addNote(messageForError(result.data && result.data.error));
          updateSendState();
          return;
        }
        var attachment = result.data.attachment;
        pendingFiles.push(attachment);
        chip.classList.remove("uploading");
        chip.dataset.ref = attachment.ref;
        updateSendState();
      })
      .catch(function () {
        uploading -= 1;
        removeChip(chip);
        addNote("That file did not upload. Check your connection and try again.");
        updateSendState();
      });
  }

  function addChip(name, busy) {
    var chip = document.createElement("span");
    chip.className = "denku-chip" + (busy ? " uploading" : "");

    var label = document.createElement("span");
    // The name came from the visitor's own filesystem, so it goes in as text like everything else.
    label.textContent = name;
    chip.appendChild(label);

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "denku-chip-x";
    remove.setAttribute("aria-label", "Remove attachment");
    remove.textContent = "×";
    remove.addEventListener("click", function () {
      // The uploaded copy is left in storage: it expires with the session's own cleanup, and
      // deleting from an anonymous browser request is a capability this endpoint should not have.
      if (chip.dataset.ref) {
        pendingFiles = pendingFiles.filter(function (f) {
          return f.ref !== chip.dataset.ref;
        });
      }
      removeChip(chip);
      updateSendState();
    });
    chip.appendChild(remove);

    attachmentBar.appendChild(chip);
    return chip;
  }

  function removeChip(chip) {
    if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
  }

  function clearChips() {
    attachmentBar.innerHTML = "";
    pendingFiles = [];
  }

  /** Send is available when there is something to send and nothing still on its way up. */
  function updateSendState() {
    if (!sendButton) return;
    sendButton.disabled = sending || uploading > 0;
  }

  function openSession() {
    return api("session", {
      frameToken: boot.frameToken,
      visitorId: visitorId,
      pageUrl: context.pageUrl,
      referrer: context.referrer,
      locale: context.locale,
    }).then(function (result) {
      if (!result.data || !result.data.ok) {
        addNote(messageForError(result.data && result.data.error));
        return false;
      }
      token = result.data.token;
      if (result.data.widget && result.data.widget.greeting && !result.data.messages.length) {
        // A greeting is shown, never stored: it is the widget saying hello, not something the
        // business said, and it must not appear in their Inbox as a message they sent.
        addMessage("assistant", result.data.widget.greeting);
      }
      render(result.data.messages);
      return true;
    });
  }

  function submit() {
    var text = (input.value || "").trim();
    // A photo on its own is a message. Nothing at all, or an upload still in flight, is not.
    if ((!text && pendingFiles.length === 0) || sending || uploading > 0) return;

    sending = true;
    sendButton.disabled = true;
    input.value = "";
    input.style.height = "auto";

    var attachments = pendingFiles.slice();
    clearChips();

    var clientMessageId = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    addMessage(
      "user",
      text || attachmentSummary(attachments),
      null,
      true
    );
    showTyping(true);

    // The same clientMessageId on a retry, so a flaky connection produces one message in the
    // owner's Inbox rather than three.
    send(text, clientMessageId, true, attachments);
  }

  /** What the visitor's own bubble says while an attachment-only message is in flight. */
  function attachmentSummary(attachments) {
    if (attachments.length === 1) {
      return attachments[0].kind === "audio" ? "Voice message" : "Photo";
    }
    return attachments.length + " attachments";
  }

  function send(text, clientMessageId, mayRetry, attachments) {
    api("send", {
      token: token,
      text: text,
      clientMessageId: clientMessageId,
      pageUrl: context.pageUrl,
      after: lastAt,
      attachments: attachments || [],
    })
      .then(function (result) {
        if (result.status === 401 && mayRetry) {
          // The session expired while the visitor was reading. Re-open it and try once — they
          // should never be told to "refresh the page" for something we can fix silently.
          return openSession().then(function (ok) {
            if (ok) return send(text, clientMessageId, false, attachments);
            finish();
          });
        }
        if (!result.data || !result.data.ok) {
          finish();
          addNote(messageForError(result.data && result.data.error));
          return;
        }
        finish();
        // The server's copy replaces the optimistic bubble: same words, but now it is a message
        // that actually exists.
        clearPending();
        render(result.data.messages);
      })
      .catch(function () {
        finish();
        addNote("That message did not go through. Check your connection and try again.");
      });
  }

  function finish() {
    sending = false;
    updateSendState();
    showTyping(false);
  }

  function clearPending() {
    var pending = log.querySelectorAll(".denku-msg.pending");
    for (var i = 0; i < pending.length; i++) pending[i].parentNode.removeChild(pending[i]);
  }

  function poll() {
    if (!token || document.hidden) return;
    api("poll", { token: token, after: lastAt }).then(function (result) {
      if (result.data && result.data.ok) render(result.data.messages);
    });
  }

  function messageForError(code) {
    switch (code) {
      case "rate_limited":
        return "That is a lot of messages at once. Give it a minute and try again.";
      case "too_large":
        return "That file is too big. Please send something under 8 MB.";
      case "unsupported_type":
        return "You can attach a photo or an audio clip.";
      case "disabled":
      case "origin_not_allowed":
      case "unknown_site":
        return "This chat is not available right now.";
      default:
        return "Something went wrong. Please try again.";
    }
  }

  // ------------------------------------------------------------------- host

  function tell(message) {
    if (!host) return;
    message.source = "denku-chat";
    // Addressed to the embedding origin the server recorded, never "*".
    parent.postMessage(message, host);
  }

  window.addEventListener("message", function (event) {
    if (host && event.origin !== host) return;
    var data = event.data;
    if (!data || data.source !== "denku-chat-host") return;

    if (data.type === "init") {
      visitorId = data.visitorId || null;
      context.pageUrl = data.pageUrl || null;
      context.referrer = data.referrer || null;
      context.locale = data.locale || null;
      start();
      return;
    }
    if (data.type === "open" && input) input.focus();

    /**
     * Live theming from the dashboard preview.
     *
     * Only ever changes colours — there is no message that can make this widget say something,
     * send something, or reveal a session. The preview is the real widget precisely so that what
     * the owner sees while picking a colour is what their customers will get, and repainting it
     * as they drag a colour picker is the whole reason this is not a static mock.
     */
    if (data.type === "theme") applyTheme(data.theme);
  });

  var started = false;
  function start() {
    if (started) return;
    started = true;
    openSession().then(function (ok) {
      if (!ok) return;
      if (input) input.focus();
      pollTimer = setInterval(poll, POLL_MS);
      // A visitor who comes back to the tab may have been answered while they were away.
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) poll();
      });
    });
  }

  build();
  tell({ type: "ready" });

  /**
   * If the host never answers — because someone opened this URL directly rather than through
   * the loader — start anyway, with no visitor id. The server has already checked the Referer,
   * so this is a real embed; it just has nowhere to keep an id, and the conversation lasts as
   * long as the page does.
   */
  setTimeout(function () {
    if (!started) start();
  }, 800);
})();
