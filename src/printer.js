/**
 * printer.js — Printer enumeration and label printing.
 * Uses Electron's BrowserWindow + webContents.print() — same approach as printly-main.
 */

const { BrowserWindow, app } = require('electron')
const { exec } = require('child_process')
const { writeFileSync, unlinkSync } = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const { buildLabelHtml, LABEL_DIMENSIONS } = require('./labels')

// Small persistent window used only for printer enumeration
let enumWindow = null

function getEnumWindow() {
  if (enumWindow && !enumWindow.isDestroyed()) return enumWindow
  enumWindow = new BrowserWindow({
    show: false, skipTaskbar: true, width: 1, height: 1,
    webPreferences: { sandbox: false, contextIsolation: true }
  })
  return enumWindow
}

app.on('before-quit', () => {
  if (enumWindow && !enumWindow.isDestroyed()) { enumWindow.destroy(); enumWindow = null }
})

async function getAvailablePrinters() {
  return getEnumWindow().webContents.getPrintersAsync()
}

// ── Print queue (serial — one job at a time) ────────────────────────────────
let printQueue = []
let printRunning = false

function enqueuePrint(job) {
  return new Promise((resolve) => {
    printQueue.push(async () => { const r = await job(); resolve(r); return r })
    if (!printRunning) drainQueue()
  })
}

async function drainQueue() {
  printRunning = true
  while (printQueue.length > 0) { await printQueue.shift()() }
  printRunning = false
}

function runPrintJob(dataUrl, printOpts, viewportMicrons) {
  return new Promise((resolve) => {
    const micronToPx = (m) => Math.round(m / 25400 * 96)
    const w = viewportMicrons ? micronToPx(viewportMicrons.width)  : 816
    const h = viewportMicrons ? micronToPx(viewportMicrons.height) : 1056
    const win = new BrowserWindow({
      show: false, skipTaskbar: true, useContentSize: true, width: w, height: h,
      webPreferences: { sandbox: false, contextIsolation: true }
    })
    const cleanup = (result) => { win.destroy(); resolve(result) }
    win.webContents.loadURL(dataUrl)
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        win.webContents.print(printOpts, (success, reason) => {
          cleanup(success ? { success: true } : { success: false, error: reason })
        })
      }, 500)
    })
    win.webContents.once('did-fail-load', (_e, _code, desc) => cleanup({ success: false, error: desc }))
  })
}

// macOS Dymo path: render HTML → PDF → send via lp with CUPS paper name
const DYMO_PAPER_FALLBACK = {
  '1.125x3.5': 'w79h252',
  '1x2.125':   'w72h152',
  '1.25x2.25': 'w90h162',
}
const cupsPaperCache = new Map()

function findCupsPaperSize(printerName, wPts, hPts) {
  return new Promise((resolve) => {
    exec(`/usr/bin/lpoptions -p "${printerName}" -l`, (err, stdout) => {
      if (err) return resolve(null)
      const line = stdout.split('\n').find(l => l.toLowerCase().startsWith('pagesize'))
      if (!line) return resolve(null)
      const sizes = (line.split(':')[1] ?? '').trim().split(/\s+/)
        .map(s => s.replace(/^\*/, '').trim()).filter(s => /^w\d+h\d+$/.test(s))
      const tol = 3
      const match = sizes.find(s => {
        const m = s.match(/^w(\d+)h(\d+)$/)
        return m && Math.abs(parseInt(m[1]) - wPts) <= tol && Math.abs(parseInt(m[2]) - hPts) <= tol
      })
      resolve(match ?? null)
    })
  })
}

function printDymoMacOS(html, dims, printerName, cupsPaper) {
  return new Promise((resolve) => {
    const micronToPx = (m) => Math.round(m / 25400 * 96)
    const win = new BrowserWindow({
      show: false, skipTaskbar: true, useContentSize: true,
      width: micronToPx(dims.width), height: micronToPx(dims.height),
      webPreferences: { sandbox: false, contextIsolation: true }
    })
    win.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        win.webContents.printToPDF({
          printBackground: true,
          pageSize: { width: dims.width / 25400, height: dims.height / 25400 },
          margins: { marginType: 'none' }
        }).then((pdfBuffer) => {
          win.destroy()
          const tmpFile = join(tmpdir(), `printly-${Date.now()}.pdf`)
          try { writeFileSync(tmpFile, pdfBuffer) } catch (e) { return resolve({ success: false, error: String(e) }) }
          exec(`/usr/bin/lp -d "${printerName}" -o PageSize=${cupsPaper} "${tmpFile}"`, (err) => {
            try { unlinkSync(tmpFile) } catch {}
            err ? resolve({ success: false, error: err.message }) : resolve({ success: true })
          })
        }).catch((err) => { win.destroy(); resolve({ success: false, error: err.message }) })
      }, 500)
    })
    win.webContents.once('did-fail-load', (_e, _code, desc) => { win.destroy(); resolve({ success: false, error: desc }) })
  })
}

async function printLabel(printerName, data) {
  const dims = LABEL_DIMENSIONS[data.labelSize] ?? LABEL_DIMENSIONS['2x3']
  const html = buildLabelHtml(data)

  const isDymo = /dymo|labelwriter/i.test(printerName)
  if (isDymo && process.platform === 'darwin') {
    const cacheKey = `${printerName}|${data.labelSize}`
    let cupsPaper = cupsPaperCache.get(cacheKey)
    if (!cupsPaper) {
      const wPts = Math.round(dims.width  / 25400 * 72)
      const hPts = Math.round(dims.height / 25400 * 72)
      cupsPaper = await findCupsPaperSize(printerName, wPts, hPts) ?? DYMO_PAPER_FALLBACK[data.labelSize]
      if (cupsPaper) cupsPaperCache.set(cacheKey, cupsPaper)
    }
    if (cupsPaper) return enqueuePrint(() => printDymoMacOS(html, dims, printerName, cupsPaper))
  }

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
  return enqueuePrint(() => runPrintJob(dataUrl, {
    silent: true, printBackground: true, deviceName: printerName,
    pageSize: { width: dims.width, height: dims.height },
    margins: { marginType: 'none' }, scaleFactor: 100
  }, dims))
}

module.exports = { getAvailablePrinters, printLabel }
