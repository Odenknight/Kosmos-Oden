// Minimal Obsidian runtime stub so agent-api.ts can run under plain Node for tests.
class Notice { constructor(msg) { console.log('[Notice]', String(msg).slice(0, 120)); } }
class PluginSettingTab { constructor() {} }
class Setting {
  constructor() {
    const p = new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => p) });
    return p;
  }
}
const Platform = { isDesktopApp: true, isMobile: false };
class Plugin {}
class ItemView {}
class TFile {}
class TFolder {}
class App {}
module.exports = { Notice, PluginSettingTab, Setting, Platform, Plugin, ItemView, TFile, TFolder, App };
