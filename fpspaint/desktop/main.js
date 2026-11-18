const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
function create() {
  const win = new BrowserWindow({ width: 1400, height: 900, minWidth: 720, minHeight: 520, backgroundColor: '#141517', title: 'FPSpaint', icon: path.join(__dirname, 'app', 'icon.png'), autoHideMenuBar: true, webPreferences: { contextIsolation: true, spellcheck: false, webSecurity: false } });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
