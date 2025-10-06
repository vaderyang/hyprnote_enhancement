/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETIS_GLOBAL_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
