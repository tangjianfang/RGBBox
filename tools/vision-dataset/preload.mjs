// R226.3: tools-only preload — exposes a single file-save bridge to the
// extraction page. Not part of the product preload (src/preload).
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('__vdSave', async (files) =>
  ipcRenderer.invoke('vision-dataset:save', files))
