// Lib (IIFE) entry. The IIFE attaches these exports to `window.YzHead`;
// JarvYZ loads it via @yz-dev/react-dynamic-module and looks up
// `createSatelliteApi` (api factory) + `HeadDashboard` (the variant-11
// component) by name.

export { HeadDashboard } from './HeadDashboard'
export type { HeadDashboardProps } from './HeadDashboard'
export { createSatelliteApi, NotSupportedError } from './lib/api'
export type { HeadApi, SatelliteSettings, MeshMeta } from './lib/api'
export type { WSApi } from './lib/ws'
export type { Capabilities } from './lib/capabilities'
