/// <reference types="vite/client" />

// Typed Vite env variables (otherwise import.meta.env.* is `any`).
interface ImportMetaEnv {
  // Backend origin, e.g. http://localhost:4000. Empty/unset = same origin.
  readonly VITE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
