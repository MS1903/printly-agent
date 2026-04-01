const { app, Tray, Menu, BrowserWindow, shell, nativeImage, Notification } = require('electron')
const http = require('http')
const path = require('path')
const Store = require('electron-store')
const { getAvailablePrinters, printLabel } = require('./printer')

const API_URL = process.env.PRINTLY_API_URL || 'https://printlyapp.me'
const PORT    = 7799

const store = new Store()

let tray        = null
let loginWin    = null
let server      = null
let userEmail   = null
let settings    = null  // user_settings row
let orderCounter = store.get('orderCounter', 1)

// ── Helpers ──────────────────────────────────────────────────────────────────

function getToken() { return store.get('token') ?? null }

async function apiFetch(path, opts = {}) {
  const token = getToken()
  const res = await fetch(API_URL + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers ?? {}) }
  })
  return res
}

function nextOrderNumber() {
  const n = orderCounter
  orderCounter = (orderCounter % 999) + 1
  store.set('orderCounter', orderCounter)
  return n
}

function syncOrderCounter(lastOrderNumber) {
  if (typeof lastOrderNumber === 'number' && lastOrderNumber >= orderCounter) {
    orderCounter = (lastOrderNumber % 999) + 1
    store.set('orderCounter', orderCounter)
    console.log('[Printly Agent] Order counter synced to', orderCounter)
  }
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show()
  }
}

// ── Tray ─────────────────────────────────────────────────────────────────────

function buildTrayMenu() {
  const items = []
  if (userEmail) {
    items.push({ label: `Signed in as ${userEmail}`, enabled: false })
    items.push({ type: 'separator' })
    items.push({ label: 'Open Dashboard', click: () => shell.openExternal(`${API_URL}/dashboard`) })
    items.push({ type: 'separator' })
    items.push({
      label: 'Sign Out', click: () => {
        store.delete('token')
        userEmail = null
        settings  = null
        updateTray()
        showLoginWindow()
      }
    })
  } else {
    items.push({ label: 'Not signed in', enabled: false })
    items.push({ type: 'separator' })
    items.push({ label: 'Sign In…', click: showLoginWindow })
  }
  items.push({ type: 'separator' })
  items.push({ label: 'Quit Printly Agent', click: () => app.quit() })
  return Menu.buildFromTemplate(items)
}

function updateTray() {
  if (!tray) return
  tray.setContextMenu(buildTrayMenu())
  tray.setToolTip(userEmail ? `Printly — ${userEmail}` : 'Printly — Not signed in')
}

// ── Login window ──────────────────────────────────────────────────────────────

function showLoginWindow() {
  if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return }
  loginWin = new BrowserWindow({
    width: 420, height: 540, resizable: false, title: 'Printly — Sign In',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  loginWin.loadFile(path.join(__dirname, 'login.html'))
  loginWin.on('closed', () => { loginWin = null })
}

// ── Auth IPC (called from login window) ──────────────────────────────────────

const { ipcMain } = require('electron')

ipcMain.handle('send-code', async (_e, email) => {
  try {
    const res = await apiFetch('/api/auth/send-code', { method: 'POST', body: JSON.stringify({ email }) })
    return await res.json()
  } catch { return { error: 'Network error' } }
})

ipcMain.handle('verify-code', async (_e, email, code) => {
  try {
    const res = await apiFetch('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email, code, device_id: 'agent-' + require('os').hostname() })
    })
    const data = await res.json()
    if (data.valid && data.token) {
      store.set('token', data.token)
      userEmail = email
      loginWin?.close()
      updateTray()
      await fetchSettings()
    }
    return data
  } catch { return { valid: false, error: 'Network error' } }
})

// ── Settings ──────────────────────────────────────────────────────────────────

async function fetchSettings() {
  try {
    const res = await apiFetch('/api/agent/settings')
    if (res.ok) {
      const data = await res.json()
      settings  = data.settings  ?? null
      userEmail = data.email     ?? userEmail
      syncOrderCounter(data.last_order_number)
      // Update printer list in Supabase
      const printers = await getAvailablePrinters()
      const printerList = printers.map(p => ({ name: p.name, isDefault: p.isDefault }))
      apiFetch('/api/agent/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ printer_list: printerList, device_id: 'agent-' + require('os').hostname() })
      }).catch(() => {})
      updateTray()
    }
  } catch {}
}

// ── HTTP server (localhost:7799) ──────────────────────────────────────────────

function startServer() {
  server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Content-Type', 'application/json')

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200)
      res.end(JSON.stringify({
        ok: true,
        signed_in: !!userEmail,
        email: userEmail,
        printer: settings?.printer_name ?? null,
        version: app.getVersion()
      }))
      return
    }

    if (req.method === 'POST' && req.url === '/win') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', async () => {
        try {
          const win = JSON.parse(body)

          // Record win to Printly backend
          const winRes = await apiFetch('/api/agent/win', {
            method: 'POST',
            body: JSON.stringify({
              buyer_name:   win.buyer_name,
              item_name:    win.item_name,
              price:        win.price,
              source:       win.source ?? 'extension',
              detected_at:  win.detected_at ?? new Date().toISOString(),
            })
          }).catch(() => null)

          let winId = null
          if (winRes?.ok) {
            const winData = await winRes.json().catch(() => ({}))
            winId = winData.win_id
          }

          // Warn if no printer configured
          if (!settings?.printer_name) {
            notify('No printer configured', 'Open Printly settings to select a printer')
            res.writeHead(200)
            res.end(JSON.stringify({ ok: true, warning: 'no_printer' }))
            return
          }

          // If wait_for_payment is on, only print wins confirmed via WebSocket (post-payment)
          // DOM-detected wins fire before payment is processed — skip them in this mode
          if (settings?.wait_for_payment && win.source === 'dom') {
            console.log('[Printly Agent] Skipping dom win — wait_for_payment is on')
            res.writeHead(200)
            res.end(JSON.stringify({ ok: true, skipped: 'waiting_for_payment' }))
            return
          }

          // Print if auto_print is enabled
          if (settings?.auto_print !== false) {
            const orderNumber = nextOrderNumber()
            const labelData = {
              orderNumber,
              buyerName:     win.buyer_name ?? 'unknown',
              itemName:      win.item_name  ?? '',
              price:         Number(win.price) || 0,
              labelSize:     settings.label_size     ?? '2x3',
              showPrice:     settings.show_price     ?? true,
              showTimestamp: settings.show_timestamp ?? false,
              timestamp:     new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              printerName:   settings.printer_name,
              accentColor:   settings.brand_accent_color ?? '#000000',
              sellerName:    settings.brand_seller_name  ?? '',
            }

            const copies = settings.copies ?? 1
            for (let i = 0; i < copies; i++) {
              printLabel(settings.printer_name, labelData).then((result) => {
                if (result.success) {
                  notify(
                    'Label printed ✓',
                    `@${labelData.buyerName} · Order ${String(orderNumber).padStart(3, '0')}${labelData.price ? ` · $${labelData.price.toFixed(2)}` : ''}`
                  )
                } else {
                  notify(
                    'Print failed',
                    `@${labelData.buyerName} — ${result.error ?? 'Unknown error'}`
                  )
                }
                // Record print job result to backend
                if (winId) {
                  apiFetch('/api/agent/print-result', {
                    method: 'POST',
                    body: JSON.stringify({ win_id: winId, success: result.success, error: result.error })
                  }).catch(() => {})
                }
              }).catch((err) => {
                notify('Print error', `@${labelData.buyerName} — ${err.message}`)
              })
            }
          }

          res.writeHead(200)
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.writeHead(400)
          res.end(JSON.stringify({ ok: false, error: String(e) }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end(JSON.stringify({ error: 'Not found' }))
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Printly Agent] Port ${PORT} already in use — another instance may be running`)
    } else {
      console.error('[Printly Agent] Server error:', err)
    }
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Printly Agent] Listening on localhost:${PORT}`)
  })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.setLoginItemSettings({ openAtLogin: true })  // auto-start on login
app.dock?.hide()  // macOS: hide from dock

app.whenReady().then(async () => {
  // Create tray icon
  const iconPath = path.join(__dirname, '..', 'build',
    process.platform === 'darwin' ? 'iconTemplate.png' : 'icon.ico')
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }))
  tray.setToolTip('Printly Agent')
  updateTray()

  // Start HTTP server
  startServer()

  // Check existing session
  const token = getToken()
  if (token) {
    try {
      const res = await apiFetch('/api/auth/validate-session', {
        method: 'POST',
        body: JSON.stringify({ token, device_id: 'agent-' + require('os').hostname() })
      })
      const data = await res.json()
      if (data.valid) {
        userEmail = data.email
        updateTray()
        await fetchSettings()
        return
      }
    } catch {}
    store.delete('token')
  }

  showLoginWindow()
})

// Heartbeat every 60 seconds — syncs settings + order counter
setInterval(() => {
  if (!getToken()) return
  getAvailablePrinters().then(printers => {
    apiFetch('/api/agent/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ printer_list: printers.map(p => ({ name: p.name, isDefault: p.isDefault })), device_id: 'agent-' + require('os').hostname() })
    }).then(res => res.ok ? res.json() : null).then(data => {
      if (data?.settings) { settings = data.settings }
      syncOrderCounter(data?.last_order_number)
    }).catch(() => {})
  }).catch(() => {})
}, 60000)

app.on('window-all-closed', (e) => e.preventDefault())  // keep running when windows close
