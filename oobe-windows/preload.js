const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs seguras al renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Usuario
  createUser: (username, password, profilePicture) => 
    ipcRenderer.invoke('create-user', username, password, profilePicture),
  
  // Red
  getWifiNetworks: () => 
    ipcRenderer.invoke('get-wifi-networks'),
  connectWifi: (ssid, password) => 
    ipcRenderer.invoke('connect-wifi', ssid, password),
  checkInternet: () => 
    ipcRenderer.invoke('check-internet'),
  
  // Programas
  installPrograms: (programs) => 
    ipcRenderer.invoke('install-programs', programs),
  
  // Personalización
  applyTheme: (theme) => 
    ipcRenderer.invoke('apply-theme', theme),
  applyWallpaper: (wallpaperPath) => 
    ipcRenderer.invoke('apply-wallpaper', wallpaperPath),
  applyLockscreen: (lockscreenPath) => 
    ipcRenderer.invoke('apply-lockscreen', lockscreenPath),
  
  // Reseñas
  saveReview: (review) => 
    ipcRenderer.invoke('save-review', review),
  
  // Finalizar
  finishOOBE: () => 
    ipcRenderer.invoke('finish-oobe'),
  
  // Cámara
  capturePhoto: () => 
    ipcRenderer.invoke('capture-photo')
});
