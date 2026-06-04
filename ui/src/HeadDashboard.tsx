// Root component for dashboard variant 11 — the stylized robot head.
//
// Shipped as a react-dynamic-module IIFE export (`window.YzHead.HeadDashboard`)
// loaded by JarvYZ's SatelliteDashboardLoader, and rendered directly by the
// standalone SPA (src/App.tsx). The host passes the conventional satellite-UI
// prop shape: `theme` / `wsApi` / `api` / `capabilities`.
//
// React context can't cross the IIFE bundle boundary by identity, so the
// host's theme + WS values arrive as PROPS and we re-establish module-local
// providers here (the same pattern as yz-body / the other satellites). The
// head mesh reads no Zustand store, so there's no store provider.

import { ThemeProvider, type Theme } from '@mui/material/styles'
import { useMemo } from 'react'
import { HeadMesh } from './HeadMesh'
import { WSContext, type WSApi } from './lib/ws'
import { setApiBase } from './lib/assetBase'
import {
  CapabilitiesContext,
  DEFAULT_CAPABILITIES,
  type Capabilities,
} from './lib/capabilities'
import type { HeadApi } from './lib/api'

export interface HeadDashboardProps {
  /** MUI theme from the host (`useTheme()`), re-applied via our own
   *  ThemeProvider so MUI components inside the IIFE pick it up. */
  theme: Theme
  /** WS bridge from the host — drives mode/tts_level/audio_level/announce. */
  wsApi: WSApi
  /** The api adapter from `createSatelliteApi` (carries the apiBase). */
  api?: HeadApi
  /** Host capabilities; `capabilities.apiBase` is the proxy prefix. */
  capabilities?: Capabilities & { canSynthesize?: boolean }
}

export function HeadDashboard({ theme, wsApi, api, capabilities }: HeadDashboardProps) {
  // Resolve + publish the API/asset base in the render body (not an effect)
  // so it's current before HeadMesh's mount effect fires any fetch / OBJ load.
  const apiBase = capabilities?.apiBase ?? api?.apiBase ?? ''
  setApiBase(apiBase)

  const caps = useMemo<Capabilities>(
    () => capabilities ?? { ...DEFAULT_CAPABILITIES, apiBase },
    [capabilities, apiBase],
  )

  return (
    <ThemeProvider theme={theme}>
      <CapabilitiesContext.Provider value={caps}>
        <WSContext.Provider value={wsApi}>
          <HeadMesh />
        </WSContext.Provider>
      </CapabilitiesContext.Provider>
    </ThemeProvider>
  )
}
