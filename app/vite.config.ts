import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

const COMFY = 'http://127.0.0.1:8188'

// ComfyUI runs create_origin_only_middleware (server.py:158) unless started with
// --enable-cors-header. It returns a hard 403 -- not a missing CORS header -- for any
// request whose Sec-Fetch-Site is cross-site, or whose Origin host:port differs from its
// Host. A port-only difference counts, so 127.0.0.1:5173 -> 127.0.0.1:8188 is rejected.
//
// changeOrigin only rewrites Host; the browser's Origin survives and still mismatches.
// The headers have to be removed so the middleware's `'Origin' in headers` guard is false.
const SCRUB = ['origin', 'referer', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest']

const scrub = (proxyReq: { removeHeader(name: string): void }) => {
  for (const header of SCRUB) proxyReq.removeHeader(header)
}

// Both proxyReq and proxyReqWs hand back an http.ClientRequest as their first argument.
const comfy: ProxyOptions = {
  target: COMFY,
  changeOrigin: true,
  ws: true,
  configure: (proxy) => {
    proxy.on('proxyReq', scrub)
    proxy.on('proxyReqWs', scrub)
  },
}

// server.py:1233 re-mounts every route under /api, so one rule covers the whole API
// surface. /internal is add_subapp'd and is NOT under /api, so it needs its own.
const proxy = { '/api': comfy, '/internal': comfy }

// host 127.0.0.1 keeps the dev server off the LAN and avoids a Windows Firewall prompt.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
})
