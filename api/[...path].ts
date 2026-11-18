/**
 * Vercel Function: serves the whole API at /api/* from the same deployment
 * as the web app, so the browser calls it same-origin (no CORS, CSP 'self').
 * The build step (`npm run build`) compiles server/ to server/dist first.
 */
// @ts-expect-error compiled output has no co-located types for this entry
export { default } from "../server/dist/src/vercel.js";
