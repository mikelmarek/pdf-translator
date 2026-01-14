/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_PASSWORD: string
  // další env proměnné zde...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}