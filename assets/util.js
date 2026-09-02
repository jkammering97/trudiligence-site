/** Shared small helpers used by both login.html and app.html. */

/** Escapes text before interpolating into innerHTML — every value below
 * that ends up in a template string (claim text, domain, snippet, email…)
 * passes through this first. Same convention extension/popup.js uses. */
export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

/** Only allow http(s) links to actually be clickable — source URLs come
 * from third-party search results, so this is a defensive floor against a
 * stray javascript: URL ever reaching an href. */
export function safeHref(url) {
  try {
    const u = new URL(url, window.location.href);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

/** Mirrors backend/main.py's normalize_domain: lowercase, strip any
 * scheme/path/query/port, drop a leading "www.". Client-side mirror so the
 * Sources table can show/validate the normalized form immediately, since
 * writes here go straight to Postgres (no backend in the loop to do this
 * server-side) — the `domain` column itself carries no such constraint. */
export function normalizeDomain(raw) {
  let s = String(raw ?? "").trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // strip scheme://
  s = s.split(/[/?#]/)[0]; // strip path/query/fragment
  s = s.split(":")[0]; // strip port
  if (s.startsWith("www.")) s = s.slice(4);
  return s;
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso || "";
  }
}

export function formatPct(x) {
  return `${Math.round((Number(x) || 0) * 100)}%`;
}

export function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** CSV-escapes one field: wraps in quotes and doubles any embedded quote
 * whenever the value contains a comma, quote, or newline. */
export function csvField(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
