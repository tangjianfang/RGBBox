// R226.3: tools-only preload — exposes a single file-save bridge to the
// extraction page. Not part of the product preload (src/preload).
// CJS: electron preload default resolution (see main.cjs note).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__vdSave', async (files) =>
  ipcRenderer.invoke('vision-dataset:save', files))
contextBridge.exposeInMainWorld('__vdLog', (msg) => ipcRenderer.send('vision-dataset:log', String(msg)))
