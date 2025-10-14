const { contextBridge, ipcRenderer } = require('electron');

// Exponer una API muy reducida para solicitudes HTTP a través del proceso principal
contextBridge.exposeInMainWorld('api', {
	fetch: async (url, options) => {
		return ipcRenderer.invoke('http:fetch', { url, options });
	},
	uploadMultipart: async (payload) => {
		// payload: { url, method, fields: Record<string,string>, files: [{ fieldName, name, type, buffer(ArrayBuffer) }] }
		return ipcRenderer.invoke('http:uploadMultipart', payload);
	},
	getBinary: async (url) => {
		return ipcRenderer.invoke('http:fetchBinary', { url });
	}
});
