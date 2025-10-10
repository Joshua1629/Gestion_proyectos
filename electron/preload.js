const { contextBridge, ipcRenderer } = require('electron');

// Exponer una API muy reducida para solicitudes HTTP a través del proceso principal
contextBridge.exposeInMainWorld('api', {
	fetch: async (url, options) => {
		return ipcRenderer.invoke('http:fetch', { url, options });
	}
});
