/**
 * Applies a saved theme override before first paint. Loaded as a plain
 * blocking <script> (not type="module") at the very top of <head>, before
 * the page's own <style> block, specifically so it runs before anything is
 * drawn — a module script would be deferred until after parsing, which
 * would show the wrong theme for a moment and then flash to the right one.
 *
 * If nothing is stored, this does nothing: the page's own
 * `@media (prefers-color-scheme: dark)` rules already handle following the
 * system setting with no JS involved at all.
 */
(function () {
  try {
    var stored = localStorage.getItem("accordingto.theme");
    if (stored === "dark" || stored === "light") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (e) {
    // Storage can throw in locked-down contexts (private browsing, etc.) —
    // falling back to the system preference is a fine default either way.
  }
})();
