/**
 * Free-text EN <-> AR translation.
 *
 * Kept separate from app.js on purpose: app.js swaps the page between two
 * fixed dictionaries, which is a different job from translating arbitrary
 * text. Mixing them would blur two things that are easy to confuse.
 *
 * Two engines, tried in order:
 *   1. The browser's built-in Translator (Chrome/Edge). On-device, so the
 *      text never leaves the machine. Needs a secure context — file:// will
 *      not do — and a one-time language-pack download that Chrome only
 *      grants off a user gesture.
 *   2. MyMemory, a keyless public API. Works everywhere, but the text goes
 *      to a third party and the free endpoint caps a query at 500 chars.
 *      The status line always says which engine produced a result.
 */
(function () {
  "use strict";

  // Arabic occupies a contiguous Unicode block, so picking the direction is a
  // regex rather than a round-trip to a detection service.
  var ARABIC = /[؀-ۿ]/;

  var DEBOUNCE_MS = 400;
  var FALLBACK_MAX = 500; // MyMemory's free endpoint truncates beyond this
  var FALLBACK_URL = "https://api.mymemory.translated.net/get";
  var PROBE_TIMEOUT_MS = 2500;   // availability should be near-instant
  var TRANSLATE_TIMEOUT_MS = 15000;

  var els = {};
  var timer = null;
  var seq = 0; // guards against a slow response overwriting a newer one
  var engines = {}; // cached Translator instances, keyed "en>ar"
  var downloadAllowed = false;
  var lastStatus = null; // {key, vars} so it can re-render on a language switch

  function dict() {
    var lang = document.documentElement.lang;
    return TRANSLATIONS[lang] || TRANSLATIONS.en;
  }

  function phrase(key, vars) {
    var s = dict()[key];
    if (s === undefined) return "";
    Object.keys(vars || {}).forEach(function (k) {
      s = s.replace("{" + k + "}", vars[k]);
    });
    return s;
  }

  function setStatus(key, vars, tone) {
    lastStatus = key ? { key: key, vars: vars } : null;
    els.status.textContent = key ? phrase(key, vars) : "";
    els.status.className = "tr-status" + (tone ? " is-" + tone : "");
  }

  function detect(text) {
    return ARABIC.test(text) ? "ar" : "en";
  }

  function showPair(from, to) {
    els.from.textContent = phrase("tr.lang." + from);
    els.to.textContent = phrase("tr.lang." + to);
  }

  function showCount(text) {
    els.count.textContent = text
      ? phrase("tr.count", { n: text.length, max: FALLBACK_MAX })
      : "";
    els.count.classList.toggle("is-over", text.length > FALLBACK_MAX);
  }

  /* ---------------------------------------------------------------
     Engine 1 — the browser's on-device model
     --------------------------------------------------------------- */

  /**
   * Resolves to null rather than hanging. The built-in engine is tried first,
   * so if any of its promises stall the online fallback would never run and
   * the box would sit on "Translating…" forever.
   */
  function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
      var done = false;
      function settle(value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }
      var timer = setTimeout(function () {
        settle(null);
      }, ms);
      promise.then(settle, function () {
        settle(null);
      });
    });
  }

  function builtInUsable() {
    return typeof Translator !== "undefined" && window.isSecureContext;
  }

  function getBuiltIn(from, to) {
    var key = from + ">" + to;
    if (engines[key]) return Promise.resolve(engines[key]);
    if (!builtInUsable()) return Promise.resolve(null);

    return withTimeout(
      Translator.availability({ sourceLanguage: from, targetLanguage: to }),
      PROBE_TIMEOUT_MS
    )
      .then(function (state) {
        if (!state || state === "unavailable") return null;

        // Chrome only starts the download from a user gesture, so surface a
        // button rather than failing silently on the first keystroke.
        if (state === "downloadable" && !downloadAllowed) {
          els.enable.hidden = false;
          setStatus("tr.status.needsEnable", null, "hint");
          return null;
        }

        return Translator.create({
          sourceLanguage: from,
          targetLanguage: to,
          monitor: function (m) {
            m.addEventListener("downloadprogress", function (event) {
              setStatus(
                "tr.status.downloading",
                { n: Math.round(event.loaded * 100) },
                "hint"
              );
            });
          },
        }).then(function (engine) {
          engines[key] = engine;
          els.enable.hidden = true;
          return engine;
        });
      })
      .catch(function () {
        return null; // fall through to the online engine
      });
  }

  /* ---------------------------------------------------------------
     Engine 2 — keyless public API
     --------------------------------------------------------------- */

  function viaFallback(text, from, to) {
    if (text.length > FALLBACK_MAX) {
      return Promise.reject(new Error("too-long"));
    }
    var url =
      FALLBACK_URL +
      "?q=" +
      encodeURIComponent(text) +
      "&langpair=" +
      encodeURIComponent(from + "|" + to);

    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("http-" + res.status);
        return res.json();
      })
      .then(function (data) {
        // MyMemory reports quota trouble in the body, not the HTTP status.
        var code = Number(data.responseStatus);
        if (code >= 400) throw new Error("quota");
        var out = data.responseData && data.responseData.translatedText;
        if (!out) throw new Error("empty");
        return out;
      });
  }

  /* ---------------------------------------------------------------
     Flow
     --------------------------------------------------------------- */

  function render(text, from, to, onDevice) {
    els.output.value = text;
    els.output.dir = to === "ar" ? "rtl" : "ltr";
    setStatus(
      onDevice ? "tr.status.onDevice" : "tr.status.online",
      null,
      onDevice ? "ok" : "warn"
    );
  }

  function translate(text) {
    var id = ++seq;
    var from = detect(text);
    var to = from === "en" ? "ar" : "en";

    showPair(from, to);
    setStatus("tr.status.translating", null, "hint");

    getBuiltIn(from, to)
      .then(function (engine) {
        if (!engine) return null;
        return withTimeout(engine.translate(text), TRANSLATE_TIMEOUT_MS).then(
          function (out) {
            if (out === null) return null; // stalled — let the fallback try
            if (id === seq) render(out, from, to, true);
            return true;
          }
        );
      })
      .then(function (done) {
        if (done || id !== seq) return;
        return viaFallback(text, from, to).then(function (out) {
          if (id === seq) render(out, from, to, false);
        });
      })
      .catch(function (err) {
        if (id !== seq) return;
        els.output.value = "";
        if (err && err.message === "too-long") {
          setStatus("tr.status.tooLong", { n: FALLBACK_MAX }, "warn");
        } else {
          setStatus("tr.status.failed", null, "warn");
        }
      });
  }

  function onInput() {
    var text = els.input.value.trim();
    showCount(text);

    // Follow what is being typed, not the page. Left as-is, an English
    // sentence in the Arabic UI renders with its "?" on the wrong end.
    els.input.dir = text ? (detect(text) === "ar" ? "rtl" : "ltr") : "";

    if (timer) clearTimeout(timer);

    if (!text) {
      seq++; // cancel anything in flight
      els.output.value = "";
      els.output.dir = "";
      els.from.textContent = "";
      els.to.textContent = "";
      setStatus(null);
      return;
    }

    timer = setTimeout(function () {
      translate(text);
    }, DEBOUNCE_MS);
  }

  function init() {
    els.input = document.getElementById("tr-input");
    if (!els.input) return;

    els.output = document.getElementById("tr-output");
    els.status = document.getElementById("tr-status");
    els.from = document.getElementById("tr-from");
    els.to = document.getElementById("tr-to");
    els.count = document.getElementById("tr-count");
    els.enable = document.getElementById("tr-enable");

    els.input.addEventListener("input", onInput);

    // The click is the user gesture Chrome wants before downloading a pack.
    els.enable.addEventListener("click", function () {
      downloadAllowed = true;
      els.enable.hidden = true;
      onInput();
    });

    // app.js owns the static strings; the status line renders itself.
    document.addEventListener("langchange", function () {
      var text = els.input.value.trim();
      if (text) {
        var from = detect(text);
        showPair(from, from === "en" ? "ar" : "en");
      }
      showCount(text);
      if (lastStatus) setStatus(lastStatus.key, lastStatus.vars,
        els.status.className.replace("tr-status", "").replace("is-", "").trim());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
