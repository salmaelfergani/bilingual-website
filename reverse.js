/**
 * A single box that reverses its own contents on Enter.
 *
 * Typing is left completely alone — the field only ever holds what the
 * browser's normal editing put there, so backspace, the caret, and paste
 * all behave exactly as expected. Enter is the only thing that touches the
 * value: it replaces it with the reversed text and flips the box's
 * direction. Because that is a direct swap rather than a continuous
 * self-reversing loop, there is no caret bookkeeping to get wrong — a
 * single box that reversed live as you typed would have to guess whether
 * each keystroke was meant for the text before or after reversal, and
 * that guess breaks on the first backspace.
 *
 * Enter reverses whatever the box currently holds, so pressing it twice
 * with no typing in between is a round trip: "hello" -> "olleh" -> "hello".
 * Shift+Enter inserts a real newline instead, so multi-line text is still
 * possible.
 *
 * Reversal is per Unicode code point (Array.from, not .split("")), so a
 * surrogate-pair character such as an emoji survives intact. Combining
 * marks — Arabic tashkeel, an accent built from a base letter plus a
 * combiner — are their own code points and do get detached from their
 * base letter by a literal reversal. That is the requested behaviour
 * ("literally backwards"), not a bug to route around.
 */
(function () {
  "use strict";

  // Arabic occupies a contiguous Unicode block, so this is a regex rather
  // than a round-trip to a detection service.
  var ARABIC = /[؀-ۿ]/;

  var els = {};

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

  function detect(text) {
    return ARABIC.test(text) ? "ar" : "en";
  }

  function naturalDir(text) {
    return detect(text) === "ar" ? "rtl" : "ltr";
  }

  function reverseText(text) {
    return Array.from(text).reverse().join("");
  }

  // The badge and the box's own dir attribute are always kept in sync, so
  // reading dir back is the single source of truth for what the badge
  // should say — no separate "which mode are we in" state to drift out of
  // sync with what is actually on screen.
  function showDir() {
    var dir = els.input.dir;
    els.dir.textContent = dir ? phrase("rev.dir." + dir) : "";
  }

  function showCount() {
    var text = els.input.value;
    els.count.textContent = text
      ? phrase("rev.count", { n: Array.from(text).length })
      : "";
  }

  function onInput() {
    var text = els.input.value;

    // Follows what is being typed, not the page, so an English sentence in
    // the Arabic UI still types left-to-right. This is the box's natural,
    // unreversed direction — Enter is what flips it.
    els.input.dir = text ? naturalDir(text) : "";

    showDir();
    showCount();
  }

  function onKeydown(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault(); // Enter reverses; it does not add a line

    var text = els.input.value;
    if (!text) return;

    var natural = naturalDir(text);
    var flipped = natural === "rtl" ? "ltr" : "rtl";

    // The box's current dir is the single source of truth for whether it
    // is showing the flipped state or the natural one. A pure reversal
    // does not change which script the text is in, so comparing against
    // detect() alone would flip the same way every time and never
    // restore the original on a second press. Comparing against dir
    // instead also means resuming normal typing — which resets dir to
    // natural on the next keystroke — always starts a fresh flip rather
    // than getting confused about earlier presses.
    var alreadyFlipped = els.input.dir === flipped;

    els.input.value = reverseText(text);
    els.input.dir = alreadyFlipped ? natural : flipped;

    var end = els.input.value.length;
    els.input.setSelectionRange(end, end);

    showDir();
    showCount();
  }

  function init() {
    els.input = document.getElementById("rev-input");
    if (!els.input) return;

    els.dir = document.getElementById("rev-dir");
    els.count = document.getElementById("rev-count");

    els.input.addEventListener("input", onInput);
    els.input.addEventListener("keydown", onKeydown);

    // app.js owns the static strings; this module's badge reads the
    // current input, so it needs its own re-render on a language switch
    // rather than being caught by the data-i18n sweep.
    document.addEventListener("langchange", showDir);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
