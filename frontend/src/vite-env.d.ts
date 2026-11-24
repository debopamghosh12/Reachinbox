/// <reference types="vite/client" />

// Typed Vite env variables (otherwise import.meta.env.* is `any`).
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
