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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
