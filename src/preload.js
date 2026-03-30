const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('agent', {
  sendCode:   (email)       => ipcRenderer.invoke('send-code', email),
  verifyCode: (email, code) => ipcRenderer.invoke('verify-code', email, code),
})
