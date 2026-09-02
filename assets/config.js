/**
 * Fixed production configuration for the according to web dashboard.
 *
 * This mirrors extension/config.js from the Chrome extension's codebase —
 * same Supabase project, same anon key. The anon key is safe to ship in
 * client-side code: it identifies the project, not a user, and every table
 * it can touch is locked down with Row Level Security (see
 * backend/supabase_setup.sql) so a request only ever sees/changes rows
 * owned by whoever's access token is attached to it. It is NOT the
 * service-role key, which is never used outside the backend.
 */

export const SUPABASE_URL = "https://tvrnwuzjhiuhjfptxfep.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2cm53dXpqaGl1aGpmcHR4ZmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNjQ2MDQsImV4cCI6MjEwMjc0MDYwNH0.3GyCsOl8b4Ad908uaIoheCCaVqe_uueKCB0rPsWpkl4";
