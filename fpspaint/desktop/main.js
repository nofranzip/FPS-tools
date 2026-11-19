const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');
function create() {
  const win = new BrowserWindow({ width: 1400, height: 900, minWidth: 720, minHeight: 520, backgroundColor: '#141517', title: 'FPSpaint', icon: path.join(__dirname, 'app', 'icon.png'), autoHideMenuBar: true, webPreferences: { contextIsolation: true, spellcheck: false, webSecurity: false } });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // al cerrar: si hay cambios sin guardar, preguntar
  let closing = false;
  win.on('close', async e => {
    if (closing) return;
    e.preventDefault();
    let dirty = false;
    try { dirty = await win.webContents.executeJavaScript('!!(window.fpsDirty && window.fpsDirty())'); } catch { }
    if (!dirty) { closing = true; win.close(); return; }
    const { response } = await dialog.showMessageBox(win, { type: 'question', buttons: ['Guardar', 'No guardar', 'Cancelar'], defaultId: 0, cancelId: 2, noLink: true, title: 'FPSpaint', message: '¿Guardar los cambios antes de salir?', detail: 'Si no guardas, se perderán los cambios desde el último guardado.' });
    if (response === 2) return;
    if (response === 0) { try { await win.webContents.executeJavaScript('window.fpsSaveAll ? window.fpsSaveAll() : true'); } catch { } }
    closing = true; win.close();
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
