/**
 * LocalAI Appliance Suite - Universal Navigation Bar
 * <appliance-nav current="hub|terminal|materials"></appliance-nav>
 *
 * Lightweight, zero-dependency Web Component for seamless 1-click transit
 * across LocalAI Hub, LocalAI Terminal (Workshop OS), and LocalAI Materials (Filament Inventory).
 */
class ApplianceNav extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['current', 'hub-url', 'terminal-url', 'materials-url'];
  }

  attributeChangedCallback() {
    this.render();
  }

  connectedCallback() {
    this.render();
    this.checkHealth();
  }

  playChime(kind = 'done') {
    ApplianceSound.play(kind);
  }

  get currentApp() {
    const attr = this.getAttribute('current');
    if (attr) return attr.toLowerCase();
    const host = window.location.hostname;
    const port = window.location.port;
    if (host === '10.0.0.124' || host.includes('workshop') || host.includes('bambuhelper')) return 'terminal';
    if (port === '3000' || window.location.pathname.startsWith('/materials')) return 'materials';
    return 'hub';
  }

  get hubUrl() {
    return this.getAttribute('hub-url') || (window.location.hostname === '10.0.0.21' && window.location.port === '3080' ? '/' : 'http://10.0.0.21:3080');
  }

  get terminalUrl() {
    return this.getAttribute('terminal-url') || (window.location.hostname === '10.0.0.124' ? '/' : 'http://10.0.0.124');
  }

  get materialsUrl() {
    return this.getAttribute('materials-url') || (window.location.port === '3000' ? '/' : 'http://10.0.0.21:3000');
  }

  async checkHealth() {
    const dot = this.shadowRoot.getElementById('lan-dot');
    const label = this.shadowRoot.getElementById('lan-label');
    if (!dot || !label) return;

    try {
      // Lightweight check to current host
      const res = await fetch('/api/healthz', { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(2500) }).catch(() => null);
      if (res && res.ok) {
        dot.className = 'dot online';
        label.textContent = 'LAN Online';
      } else {
        dot.className = 'dot standby';
        label.textContent = 'LAN Active';
      }
    } catch {
      dot.className = 'dot standby';
      label.textContent = 'LAN Active';
    }
  }

  render() {
    const cur = this.currentApp;
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: Figtree, system-ui, -apple-system, sans-serif;
          background: #0a111c;
          border-bottom: 1px solid #1b2740;
          color: #eaf0f8;
          font-size: 13px;
          user-select: none;
          z-index: 1000;
          position: sticky;
          top: 0;
        }

        .bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 16px;
          max-width: 1400px;
          margin: 0 auto;
          gap: 12px;
        }

        .brand-section {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .brand-mark {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: grid;
          place-items: center;
          background: linear-gradient(145deg, #a9c4ff, #7f89ff);
          box-shadow: 0 4px 12px rgba(111, 132, 255, 0.28);
        }

        .brand-title {
          font-weight: 700;
          letter-spacing: -0.01em;
          color: #eaf0f8;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .brand-pill {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 2px 6px;
          border-radius: 999px;
          background: #172238;
          color: #6cb6ff;
          border: 1px solid #1f2c42;
        }

        .links {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .links::-webkit-scrollbar {
          display: none;
        }

        .nav-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 11px;
          border-radius: 8px;
          color: #93a4bc;
          text-decoration: none;
          font-weight: 550;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
          border: 1px solid transparent;
          white-space: nowrap;
        }

        .nav-item:hover {
          color: #eaf0f8;
          background: #121b2b;
          border-color: #1b2740;
        }

        .nav-item.active {
          color: #6cb6ff;
          background: #172238;
          border-color: #2d4a6d;
          font-weight: 600;
        }

        .nav-item svg {
          width: 14px;
          height: 14px;
          stroke: currentColor;
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .status-section {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
          font-size: 11px;
          color: #8698b1;
        }

        .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #8698b1;
          display: inline-block;
        }

        .dot.online {
          background: #3ed598;
          box-shadow: 0 0 0 3px rgba(62, 213, 152, 0.2);
        }

        .dot.standby {
          background: #6cb6ff;
        }

        @media (max-width: 640px) {
          .brand-title span:not(.brand-pill) {
            display: none;
          }
          .status-section {
            display: none;
          }
          .bar {
            padding: 6px 10px;
          }
        }
      </style>

      <div class="bar">
        <div class="brand-section">
          <div class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
              <path d="M5 12c2.6-5.6 11.4-5.6 14 0-2.6 5.6-11.4 5.6-14 0Z" stroke="#04111f" stroke-width="2.2"/>
              <circle cx="12" cy="12" r="2.2" fill="#04111f"/>
            </svg>
          </div>
          <div class="brand-title">
            <span>LocalAI</span>
            <span class="brand-pill">Suite</span>
          </div>
        </div>

        <nav class="links">
          <a href="${this.hubUrl}" class="nav-item ${cur === 'hub' ? 'active' : ''}" id="link-hub">
            <svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/></svg>
            <span>Hub</span>
          </a>

          <a href="${this.terminalUrl}" class="nav-item ${cur === 'terminal' ? 'active' : ''}" id="link-terminal">
            <svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7.5 9.5 3 2.5-3 2.5"/><path d="M13 15h4"/></svg>
            <span>Terminal</span>
          </a>

          <a href="${this.materialsUrl}" class="nav-item ${cur === 'materials' ? 'active' : ''}" id="link-materials">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5"/></svg>
            <span>Materials</span>
          </a>
        </nav>

        <div class="status-section">
          <span class="dot online" id="lan-dot"></span>
          <span id="lan-label">LAN Online</span>
        </div>
      </div>
    `;
  }
}

if (!customElements.get('appliance-nav')) {
  customElements.define('appliance-nav', ApplianceNav);
}

/**
 * Universal Acoustic Alert Synthesizer
 * Harmonized with LocalAI Terminal ESP32 piezo tones (C5-E5-G5 success, A4-E5 notice, F5-C#5 error)
 */
let _applianceAudioCtx = null;
const ApplianceSound = {
  play(kind = 'done') {
    try {
      if (!_applianceAudioCtx) _applianceAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (_applianceAudioCtx.state === 'suspended') _applianceAudioCtx.resume();
      const t = _applianceAudioCtx.currentTime;
      let notes = [523.25, 659.25, 783.99]; // done / complete: C5 -> E5 -> G5
      let step = 0.12, decay = 0.45;

      if (kind === 'notice' || kind === 'info') {
        notes = [440.00, 659.25]; // A4 -> E5 rising fifth
        step = 0.14; decay = 0.40;
      } else if (kind === 'attention' || kind === 'warning') {
        notes = [659.25, 440.00]; // E5 -> A4 falling fifth
        step = 0.14; decay = 0.40;
      } else if (kind === 'error' || kind === 'bad') {
        notes = [698.46, 554.37]; // F5 -> C#5 descending tritone/minor third
        step = 0.16; decay = 0.50;
      }

      notes.forEach((freq, idx) => {
        const osc = _applianceAudioCtx.createOscillator();
        const gain = _applianceAudioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * step);
        gain.gain.setValueAtTime(0, t + idx * step);
        gain.gain.linearRampToValueAtTime(0.12, t + idx * step + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + idx * step + decay);
        osc.connect(gain);
        gain.connect(_applianceAudioCtx.destination);
        osc.start(t + idx * step);
        osc.stop(t + idx * step + decay + 0.05);
      });
    } catch {}
  }
};

if (typeof window !== 'undefined') {
  window.ApplianceSound = ApplianceSound;
  window.LocalAISound = ApplianceSound;
}

