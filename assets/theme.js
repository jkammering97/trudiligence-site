/** Theme toggle logic, shared by every page. See assets/theme-init.js for
 * the pre-paint half of this (applying a stored override before first
 * render) — this module is the interactive half, wired up after the page
 * loads. */

const THEME_KEY = "accordingto.theme";

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function currentTheme() {
  return getStoredTheme() || (systemPrefersDark() ? "dark" : "light");
}

export function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore — worst case the choice doesn't persist across a reload.
  }
}

export function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/** Wires up a single button as the page's theme toggle: click to switch,
 * icon/label always reflecting the current theme. Call once per page. */
export function initThemeToggle(button) {
  if (!button) return;
  const render = () => {
    const isDark = currentTheme() === "dark";
    button.textContent = isDark ? "☀️" : "🌙";
    const label = isDark ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.title = label;
  };
  render();
  button.addEventListener("click", () => {
    toggleTheme();
    render();
  });
}
