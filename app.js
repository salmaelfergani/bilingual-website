/**
 * Language switching.
 *
 * Every translatable node carries either:
 *   data-i18n="key"                        -> replaces textContent
 *   data-i18n-attr="attr:key, attr2:key2"  -> replaces the named attributes
 *
 * The <html> lang/dir are set first (an inline script in <head> already did
 * this before paint on load), then text is swapped. Layout mirroring is
 * handled entirely by CSS logical properties reacting to dir.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "lang";
  var DEFAULT_LANG = "en";

  function isSupported(lang) {
    return Object.prototype.hasOwnProperty.call(TRANSLATIONS, lang);
  }

  function readSavedLang() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && isSupported(saved)) return saved;
    } catch (e) {
      /* private mode / storage disabled — fall through to the default */
    }
    return DEFAULT_LANG;
  }

  function saveLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* nothing to do; the choice just won't persist */
    }
  }

  function applyLang(lang) {
    if (!isSupported(lang)) lang = DEFAULT_LANG;

    var dict = TRANSLATIONS[lang];
    var root = document.documentElement;

    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";

    // Text content
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (key in dict) el.textContent = dict[key];
    });

    // Attributes: "placeholder:some.key, aria-label:other.key"
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr")
        .split(",")
        .forEach(function (pair) {
          var parts = pair.split(":");
          if (parts.length !== 2) return;
          var attr = parts[0].trim();
          var key = parts[1].trim();
          if (key in dict) el.setAttribute(attr, dict[key]);
        });
    });

    saveLang(lang);

    // Text this module didn't render — the translator's status line — has to
    // re-render itself, so announce the switch rather than reaching into it.
    document.dispatchEvent(
      new CustomEvent("langchange", { detail: { lang: lang } })
    );
  }

  function init() {
    applyLang(readSavedLang());

    var toggle = document.getElementById("lang-toggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        applyLang(document.documentElement.lang === "ar" ? "en" : "ar");
      });
    }

    // The contact form is a placeholder — keep it from navigating away.
    var form = document.querySelector(".contact-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
      });
    }

    initTapEffects();
  }

  /**
   * On a touch screen there is no hover, so a tap plays the card's effect
   * once: .fx-on goes on, and comes back off a beat later so the card
   * settles instead of latching — the same in-and-out a pointer gives.
   */
  function initTapEffects() {
    var HOLD_MS = 900; // outlasts the 0.6s bounce and the 1.1s pulse cycle
    var cards = document.querySelector(".cards");
    if (!cards) return;

    var touch = window.matchMedia("(hover: none)");
    var active = null;
    var timer = null;

    function release() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (active) {
        active.classList.remove("fx-on");
        active = null;
      }
    }

    cards.addEventListener("click", function (event) {
      if (!touch.matches) return; // a real pointer is present; :hover handles it

      var card = event.target.closest(".card");
      if (!card) return;

      release();
      // Reflow between removing and re-adding the class, so tapping the same
      // card twice replays its animation instead of being a no-op.
      void card.offsetWidth;

      card.classList.add("fx-on");
      active = card;
      timer = setTimeout(release, HOLD_MS);
    });

    // Attaching a mouse mid-session hands control back to :hover.
    if (touch.addEventListener) {
      touch.addEventListener("change", release);
    } else if (touch.addListener) {
      touch.addListener(release); // older Safari
    }

    // Browsers throttle timers in a backgrounded tab, so a card tapped just
    // before the user switched away would still be lit on their return.
    // Drop the effect on the way out instead of waiting for the timer.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) release();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
