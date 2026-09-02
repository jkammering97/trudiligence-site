/**
 * Auth + data access for the web dashboard, talking directly to Supabase
 * (Auth + PostgREST) rather than through the FastAPI backend.
 *
 * Why direct-to-Supabase instead of BACKEND_URL (like the extension uses):
 * every table this dashboard touches (trusted_sources, searches) already
 * has Row Level Security policies scoping rows to `auth.uid()` (see
 * backend/supabase_setup.sql) — the anon key plus a signed-in user's own
 * access token is exactly the credential PostgREST expects, so there's no
 * safety gained by proxying through the backend for reads/writes that RLS
 * already protects. It also sidesteps CORS coordination with the backend
 * deploy (Supabase's own API allows any origin; the backend's does not),
 * and gets us real per-row updates (PATCH by id) that the backend's
 * /sources endpoint doesn't expose (it only upserts by domain).
 *
 * Session handling below intentionally mirrors extension/auth.js — same
 * grant flows, same proactive-refresh-then-retry-on-401 pattern — just
 * swapping chrome.storage.local for localStorage, since this runs as an
 * ordinary web page instead of an extension popup.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const BASE_URL = SUPABASE_URL.replace(/\/$/, "");
const AUTH_URL = `${BASE_URL}/auth/v1`;
const REST_URL = `${BASE_URL}/rest/v1`;

const SESSION_KEY = "accordingto.session";
const LAST_EMAIL_KEY = "accordingto.lastEmail";

// Refresh proactively this far ahead of the stored expiry, same buffer the
// extension uses, so an ordinary page load rarely eats a round-trip on an
// already-stale token.
const REFRESH_BUFFER_MS = 60_000;

/** Thrown when the session is truly gone (refresh itself failed) rather
 * than for an ordinary request failure — callers can catch this
 * specifically to bounce back to login.html with a clear message. */
export class SessionExpiredError extends Error {}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(authResponse) {
  const session = {
    accessToken: authResponse.access_token,
    refreshToken: authResponse.refresh_token,
    expiresAt: Date.now() + authResponse.expires_in * 1000,
    user: { id: authResponse.user.id, email: authResponse.user.email }
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
}

export function currentUser() {
  return getSession()?.user || null;
}

/** Last email that successfully signed in or signed up — kept separate
 * from the session (survives sign-out) purely so a returning user only has
 * to retype their password. */
export function getRememberedEmail() {
  return localStorage.getItem(LAST_EMAIL_KEY) || "";
}
function rememberEmail(email) {
  localStorage.setItem(LAST_EMAIL_KEY, email);
}

async function authRequest(grantType, body) {
  const res = await fetch(`${AUTH_URL}/token?grant_type=${grantType}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || "Authentication failed.");
  return data;
}

export async function signIn(email, password) {
  const data = await authRequest("password", { email, password });
  rememberEmail(email);
  return saveSession(data);
}

/** Returns the new session, or null if the project requires email
 * confirmation before a session is issued (caller should show a "check
 * your inbox" message in that case, matching the extension's behavior). */
export async function signUp(email, password) {
  const res = await fetch(`${AUTH_URL}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || "Sign-up failed.");
  rememberEmail(email);
  if (data.access_token) return saveSession(data);
  return null;
}

/** Requests a password-reset code via Supabase Auth. Supabase always
 * responds 200 regardless of whether the address has an account (avoids
 * leaking which emails are registered), so a resolved promise here means
 * only "the request was accepted". */
export async function requestPasswordReset(email) {
  const res = await fetch(`${AUTH_URL}/recover`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error_description || data.msg || "Couldn't send a reset code.");
  }
}

/** Verifies the 6-digit code from the reset email and, since a successful
 * verify itself returns a real session, immediately uses it to set the new
 * password — the user ends up signed in rather than needing to sign in
 * again right after resetting. Uses the same code-based flow as the
 * extension (rather than a magic-link redirect) so it works without
 * needing this domain added to the Supabase project's redirect allowlist. */
export async function confirmPasswordReset(email, token, newPassword) {
  const verifyRes = await fetch(`${AUTH_URL}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ type: "recovery", email, token })
  });
  const verifyData = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok) {
    throw new Error(verifyData.error_description || verifyData.msg || "That code didn't work.");
  }
  const session = saveSession(verifyData);

  const passwordRes = await fetch(`${AUTH_URL}/user`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.accessToken}`
    },
    body: JSON.stringify({ password: newPassword })
  });
  if (!passwordRes.ok) {
    const passwordData = await passwordRes.json().catch(() => ({}));
    throw new Error(passwordData.error_description || passwordData.msg || "Couldn't set the new password.");
  }
  rememberEmail(email);
  return session;
}

// At most one refresh in flight at a time — several table requests can fire
// together (e.g. a page load kicking off both the Searches and Sources
// fetch), and with Supabase's refresh-token rotation only the first of
// several concurrent refresh attempts would succeed. Every caller awaits
// the one in-flight refresh instead of racing its own.
let refreshPromise = null;

async function refreshSession(refreshToken) {
  if (!refreshPromise) {
    refreshPromise = authRequest("refresh_token", { refresh_token: refreshToken })
      .then(saveSession)
      .catch(() => {
        signOut();
        throw new SessionExpiredError("Your session expired — please sign in again.");
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function ensureFreshSession() {
  let session = getSession();
  if (!session) throw new SessionExpiredError("Not signed in.");
  if (session.expiresAt - Date.now() < REFRESH_BUFFER_MS && session.refreshToken) {
    session = await refreshSession(session.refreshToken);
  }
  return session;
}

/** Authenticated fetch against Supabase's PostgREST API (`/rest/v1/...`).
 * Refreshes proactively when the token is close to expiry, and reactively
 * once more on a 401 that slips through anyway. */
export async function pgFetch(path, options = {}) {
  let session = await ensureFreshSession();
  const withAuth = (token) => ({
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  let res = await fetch(`${REST_URL}${path}`, withAuth(session.accessToken));
  if (res.status === 401 && session.refreshToken) {
    session = await refreshSession(session.refreshToken);
    res = await fetch(`${REST_URL}${path}`, withAuth(session.accessToken));
  }
  return res;
}

async function pgError(res, fallback) {
  const data = await res.json().catch(() => ({}));
  return new Error(data.message || data.error_description || fallback);
}

/** Fetches one page of rows from `table` using PostgREST's Range header,
 * returning both the page and the total matching row count (from the
 * Content-Range response header) so callers can render "Page X of Y". */
export async function pgSelectPage(table, { select = "*", params = {}, order, from = 0, to = 24 } = {}) {
  const qs = new URLSearchParams(params);
  qs.set("select", select);
  if (order) qs.set("order", order);
  const res = await pgFetch(`/${table}?${qs.toString()}`, {
    headers: { Prefer: "count=exact", Range: `${from}-${to}`, "Range-Unit": "items" }
  });
  if (!res.ok) throw await pgError(res, `Could not load ${table}.`);
  const rows = await res.json();
  const contentRange = res.headers.get("content-range") || ""; // e.g. "0-24/137"
  const total = contentRange.includes("/") ? parseInt(contentRange.split("/")[1], 10) : rows.length;
  return { rows, total: Number.isFinite(total) ? total : rows.length };
}

export async function pgInsert(table, body) {
  const res = await pgFetch(`/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw await pgError(res, "Could not save.");
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function pgUpdate(table, id, patch) {
  const res = await pgFetch(`/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw await pgError(res, "Could not update.");
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function pgDelete(table, id) {
  const res = await pgFetch(`/${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw await pgError(res, "Could not delete.");
}
