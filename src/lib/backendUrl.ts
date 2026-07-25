// Env-safe backend URL (Phase 1D). Configured via VITE_BACKEND_URL, with
// the previous hardcoded localhost value kept only as a development
// fallback. Never a provider API key or anything backend-secret — Vite
// only exposes VITE_-prefixed variables to the browser bundle, so no
// provider credential may ever use that prefix (see .env.example).
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
