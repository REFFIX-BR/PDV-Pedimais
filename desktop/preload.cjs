const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("horusDesktop", {
  isElectron: true,
  onUpdate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pdv-update", listener);
    return () => ipcRenderer.removeListener("pdv-update", listener);
  },
  installUpdate: () => ipcRenderer.invoke("pdv-install-update"),
  getVersion: () => ipcRenderer.invoke("pdv-app-version"),
  updatedVersion: () => ipcRenderer.invoke("pdv-updated-version"),
  dismissUpdated: () => ipcRenderer.invoke("pdv-dismiss-updated"),
});

contextBridge.exposeInMainWorld("pdvLocal", {
  invoke: (payload) => ipcRenderer.invoke("pdv-local", payload),
});
