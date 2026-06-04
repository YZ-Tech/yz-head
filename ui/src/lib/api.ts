// Semantic API for the head module.
//
// Like yz-body, most data access happens through `apiUrl()` (lib/assetBase)
// inside the component, but the host's SatelliteDashboardLoader REQUIRES every
// satellite IIFE to export a `createSatelliteApi` factory (it loads that export
// and renders a fallback if it's missing). So we ship a thin one carrying the
// resolved apiBase + settings helpers, and it publishes the base so the
// component's lazy `apiUrl` calls resolve regardless of mount order.

import { setApiBase } from './assetBase'


export interface SatelliteSettings {
  data_root: string
}

export interface MeshMeta {
  file: string
  lipIndices: number[]
  eyeIndices: number[]
}

export interface HeadApi {
  readonly apiBase: string
  getSettings(): Promise<SatelliteSettings>
  patchSettings(patch: Partial<SatelliteSettings>): Promise<SatelliteSettings>
}


export class NotSupportedError extends Error {
  constructor(operation: string) {
    super(`Operation '${operation}' is not supported by this host`)
    this.name = 'NotSupportedError'
  }
}


export function createSatelliteApi({ apiBase = '' }: { apiBase?: string } = {}): HeadApi {
  setApiBase(apiBase)
  const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase

  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method }
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' }
      init.body = JSON.stringify(body)
    }
    const res = await fetch(base + path, init)
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`${method} ${base + path} -> ${res.status} ${detail}`)
    }
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  return {
    apiBase: base,
    getSettings: () => req<SatelliteSettings>('GET', '/settings'),
    patchSettings: (patch) => req<SatelliteSettings>('PATCH', '/settings', patch),
  }
}
