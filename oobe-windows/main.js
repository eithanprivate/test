const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    frame: false,
    kiosk: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('src/index.html');
  
  // Bloquear teclas de escape
  mainWindow.on('focus', () => {
    blockShortcuts();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevenir cierre de ventana
  mainWindow.on('close', (e) => {
    e.preventDefault();
  });
}

function blockShortcuts() {
  // Bloquear Ctrl+Alt+Del (no se puede bloquear completamente, pero se intenta)
  // Bloquear Alt+F4
  globalShortcut.register('Alt+F4', () => {
    return false;
  });
  
  // Bloquear Ctrl+Shift+Esc (Administrador de tareas)
  globalShortcut.register('Control+Shift+Escape', () => {
    return false;
  });
  
  // Bloquear Ctrl+Tab
  globalShortcut.register('Control+Tab', () => {
    return false;
  });
  
  // Bloquear Windows key
  globalShortcut.register('Super', () => {
    return false;
  });
  
  // Bloquear Alt+Tab
  globalShortcut.register('Alt+Tab', () => {
    return false;
  });
  
  // Bloquear F11 (pantalla completa)
  globalShortcut.register('F11', () => {
    return false;
  });
  
  // Bloquear Escape
  globalShortcut.register('Escape', () => {
    return false;
  });
}

app.on('ready', () => {
  createWindow();
});

app.on('window-all-closed', () => {
  // No cerrar la aplicación
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// IPC Handlers para comunicación con el renderer

// Crear usuario de Windows
ipcMain.handle('create-user', async (event, username, password, profilePicture) => {
  try {
    const script = `
      $username = "${username}"
      $password = ConvertTo-SecureString "${password}" -AsPlainText -Force
      New-LocalUser -Name $username -Password $password -FullName $username -Description "Usuario creado por OOBE personalizado"
      Add-LocalGroupMember -Group "Usuarios" -Member $username
      
      # Configurar imagen de perfil
      $profilePath = "C:\\Users\\Public\\AccountPictures\\${username}"
      New-Item -ItemType Directory -Force -Path $profilePath
      Copy-Item "${profilePicture}" "$profilePath\\user.jpg"
      
      Write-Output "Usuario creado exitosamente"
    `;
    
    const { stdout, stderr } = await execPromise(`powershell -Command "${script.replace(/\n/g, '; ')}"`);
    return { success: true, message: stdout };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Obtener redes WiFi disponibles
ipcMain.handle('get-wifi-networks', async () => {
  try {
    const script = `
      $networks = netsh wlan show networks mode=bssid
      $networks | Out-String
    `;
    
    const { stdout } = await execPromise(`powershell -Command "${script}"`);
    
    // Parsear las redes
    const lines = stdout.split('\n');
    const networks = [];
    let currentNetwork = null;
    
    for (const line of lines) {
      if (line.includes('SSID')) {
        const ssid = line.split(':')[1]?.trim();
        if (ssid && ssid !== '') {
          currentNetwork = { ssid, signal: 0, secured: false };
          networks.push(currentNetwork);
        }
      }
      if (line.includes('Signal') && currentNetwork) {
        const signal = line.match(/(\d+)%/);
        if (signal) currentNetwork.signal = parseInt(signal[1]);
      }
      if (line.includes('Authentication') && currentNetwork) {
        currentNetwork.secured = !line.includes('Open');
      }
    }
    
    return { success: true, networks };
  } catch (error) {
    return { success: false, error: error.message, networks: [] };
  }
});

// Conectar a red WiFi
ipcMain.handle('connect-wifi', async (event, ssid, password) => {
  try {
    let script;
    if (password) {
      script = `
        $profileXml = @"
<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${ssid}</name>
  <SSIDConfig>
    <SSID>
      <name>${ssid}</name>
    </SSID>
  </SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM>
    <security>
      <authEncryption>
        <authentication>WPA2PSK</authentication>
        <encryption>AES</encryption>
        <useOneX>false</useOneX>
      </authEncryption>
      <sharedKey>
        <keyType>passPhrase</keyType>
        <protected>false</protected>
        <keyMaterial>${password}</keyMaterial>
      </sharedKey>
    </security>
  </MSM>
</WLANProfile>
"@
        $profileXml | Out-File -FilePath "$env:TEMP\\wifi_profile.xml" -Encoding UTF8
        netsh wlan add profile filename="$env:TEMP\\wifi_profile.xml"
        netsh wlan connect name="${ssid}"
        Remove-Item "$env:TEMP\\wifi_profile.xml"
      `;
    } else {
      script = `netsh wlan connect name="${ssid}"`;
    }
    
    const { stdout } = await execPromise(`powershell -Command "${script.replace(/\n/g, '; ')}"`);
    return { success: true, message: stdout };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Verificar conexión a internet
ipcMain.handle('check-internet', async () => {
  try {
    const { stdout } = await execPromise('ping -n 1 8.8.8.8');
    return { connected: stdout.includes('TTL=') };
  } catch (error) {
    return { connected: false };
  }
});

// Descargar e instalar programas
ipcMain.handle('install-programs', async (event, programs) => {
  try {
    const results = [];
    
    for (const program of programs) {
      const script = `
        $url = "${program.url}"
        $output = "$env:TEMP\\${program.name}.exe"
        Invoke-WebRequest -Uri $url -OutFile $output
        Start-Process -FilePath $output -ArgumentList "${program.silentArgs || '/S'}" -Wait
        Remove-Item $output
      `;
      
      try {
        await execPromise(`powershell -Command "${script.replace(/\n/g, '; ')}"`);
        results.push({ name: program.name, success: true });
      } catch (err) {
        results.push({ name: program.name, success: false, error: err.message });
      }
    }
    
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Aplicar tema de Windows
ipcMain.handle('apply-theme', async (event, theme) => {
  try {
    const themeValue = theme === 'dark' ? 0 : 1;
    const script = `
      Set-ItemProperty -Path "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" -Name "AppsUseLightTheme" -Value ${themeValue}
      Set-ItemProperty -Path "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" -Name "SystemUsesLightTheme" -Value ${themeValue}
    `;
    
    await execPromise(`powershell -Command "${script.replace(/\n/g, '; ')}"`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Aplicar fondo de pantalla
ipcMain.handle('apply-wallpaper', async (event, wallpaperPath) => {
  try {
    const script = `
      Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "Wallpaper" -Value "${wallpaperPath}"
      rundll32.exe user32.dll, UpdatePerUserSystemParameters, 1, True
    `;
    
    await execPromise(`powershell -Command "${script.replace(/\n/g, '; ')}"`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Aplicar pantalla de bloqueo
ipcMain.handle('apply-lockscreen', async (event, lockscreenPath) => {
  try {
    const script = `
      $regPath = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization"
      if (!(Test-Path $regPath)) {
        New-Item -Path $regPath -Force
      }
      Set-ItemProperty -Path $regPath -Name "LockScreenImage" -Value "${lockscreenPath}"
    `;
    
    await execPromise(`powershell -Command "${script.replace(/\n/g, '; ')}"`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Guardar reseña
ipcMain.handle('save-review', async (event, review) => {
  try {
    // Enviar a la API local
    const response = await fetch('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(review)
    });
    
    return { success: response.ok };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Finalizar OOBE
ipcMain.handle('finish-oobe', async () => {
  try {
    // Desactivar el inicio automático del OOBE
    const script = `
      Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "CustomOOBE" -ErrorAction SilentlyContinue
    `;
    
    await execPromise(`powershell -Command "${script}"`);
    
    // Cerrar la aplicación después de 3 segundos
    setTimeout(() => {
      globalShortcut.unregisterAll();
      mainWindow.destroy();
      app.quit();
    }, 3000);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Tomar foto con cámara
ipcMain.handle('capture-photo', async () => {
  // Esta funcionalidad se implementará en el renderer usando getUserMedia
  return { success: true };
});
