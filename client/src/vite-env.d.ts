/// <reference types="vite/client" />

interface ImportMetaEnv {
  // další env proměnné zde...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}