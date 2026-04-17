/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly API_URL: string;
  readonly API_PUBLIC_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
