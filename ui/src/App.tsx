// Standalone SPA entry. Used by `vite dev` and `vite build --mode pages`.
// In this mode the page IS the head satellite — no JarvYZ wrapper. The
// host-fed WS channels (mode/tts_level/audio_level/announce) won't fire
// without a JarvYZ, so the head sits idle; the mesh library + paint-picker
// all work against the satellite's own routes.

import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { HeadDashboard } from './HeadDashboard'
import { createSatelliteApi } from './lib/api'
import type { WSApi } from './lib/ws'

const api = createSatelliteApi({ apiBase: '' })

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#7dd3fc' },   // sky — the head's idle wire color
    background: { default: '#04060e', paper: '#0b0f1a' },
  },
})

/** WS bridge for the standalone SPA — connects to ws://<origin>/events,
 *  auto-reconnects, fans server frames out to subscribers by `event` key. */
function useStandaloneWs(): WSApi {
  const [isConnected, setIsConnected] = useState(false)
  const subscribersRef = useRef<Map<string, Set<(data: unknown) => void>>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let cancelled = false
    let backoff = 0.5
    function open() {
      if (cancelled) return
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${location.host}/events`)
      wsRef.current = ws
      ws.onopen = () => { backoff = 0.5; setIsConnected(true) }
      ws.onclose = () => {
        setIsConnected(false)
        if (cancelled) return
        backoff = Math.min(backoff * 2, 8)
        setTimeout(open, backoff * 1000)
      }
      ws.onerror = () => { /* will trigger onclose */ }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          const event = msg.event
          if (!event) return
          const { event: _drop, ...payload } = msg
          const subs = subscribersRef.current.get(event)
          if (!subs) return
          for (const cb of subs) {
            try { cb(payload) } catch { /* one sub's error doesn't break others */ }
          }
        } catch { /* not JSON — ignore */ }
      }
    }
    open()
    return () => {
      cancelled = true
      try { wsRef.current?.close() } catch { /* ignore */ }
    }
  }, [])

  return {
    isConnected,
    send: () => { /* satellite /events doesn't need subscribe messages */ },
    subscribe: (eventType, cb) => {
      let set = subscribersRef.current.get(eventType)
      if (!set) { set = new Set(); subscribersRef.current.set(eventType, set) }
      set.add(cb)
      return () => { set!.delete(cb) }
    },
  }
}

function StandaloneRoot() {
  const wsApi = useStandaloneWs()
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div style={{ height: '100dvh', padding: 12, boxSizing: 'border-box' }}>
        <HeadDashboard
          theme={theme}
          wsApi={wsApi}
          api={api}
          capabilities={{ apiBase: '', deployTarget: 'standalone' }}
        />
      </div>
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StandaloneRoot />
  </StrictMode>,
)
