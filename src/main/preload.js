const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('planify', {
  // Data
  loadData: () => ipcRenderer.invoke('data:load'),
  savePlans: (plans) => ipcRenderer.invoke('plans:save', plans),
  addPlan: (plan) => ipcRenderer.invoke('plan:add', plan),
  updatePlan: (plan) => ipcRenderer.invoke('plan:update', plan),
  deletePlan: (id) => ipcRenderer.invoke('plan:delete', id),
  togglePlan: (planId, enabled) => ipcRenderer.invoke('plan:toggle', { planId, enabled }),

  // Startup
  sendStartupResponse: (data) => ipcRenderer.send('startup:response', data),

  // Timer
  timerComplete: (data) => ipcRenderer.send('timer:complete', data),
  timerDismiss: (data) => ipcRenderer.send('timer:dismiss', data),

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Listeners
  on: (channel, callback) => {
    const allowed = ['plan:triggered', 'session:completed', 'timer:state', 'timer:init'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_, data) => callback(data));
    }
  },
  off: (channel) => ipcRenderer.removeAllListeners(channel),
});
