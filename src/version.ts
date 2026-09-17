/** App version and build date, injected by vite.config.ts from package.json; "dev" when not built. */
export const APP_NAME = 'Perennial Field Book'
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
export const BUILD_DATE = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : ''
