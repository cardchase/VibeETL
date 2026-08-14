import React from 'react';
import * as Icons from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';

const SettingsModal = ({ onClose }) => {
  const { settings, updateSettings, resetSettings } = useSettings();

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(2px)'
    }} onClick={onClose}>
      <div 
        style={{
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          width: '500px',
          borderRadius: '8px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
          fontFamily: 'var(--font-secondary)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            <Icons.Settings size={20} style={{ color: 'var(--text-muted)' }} />
            Application Settings
          </h2>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px' }}
          >
            <Icons.X size={20} />
          </button>
        </div>
        
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Appearance Section */}
          <div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Appearance</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Color Theme</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Switch between Light and Dark mode.</div>
                </div>
                <select 
                  value={settings.theme}
                  onChange={(e) => updateSettings({ theme: e.target.value })}
                  style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-dark)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-secondary)', fontWeight: 500 }}
                >
                  <option value="light">Light (Default)</option>
                  <option value="dark">Dark (VS Code Style)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Typography Section */}
          <div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Typography</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Primary Font</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Used for headings and tool names.</div>
                </div>
                <select 
                  value={settings.primaryFont}
                  onChange={(e) => updateSettings({ primaryFont: e.target.value })}
                  style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-dark)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-secondary)', fontWeight: 500 }}
                >
                  <option value="Outfit">Outfit</option>
                  <option value="Inter">Inter</option>
                  <option value="Geist">Geist</option>
                  <option value="Fira Sans">Fira Sans</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Open Sans">Open Sans</option>
                  <option value="system-ui">System Default</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Secondary / UI Font</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Used for descriptions, menus, and interfaces.</div>
                </div>
                <select 
                  value={settings.secondaryFont}
                  onChange={(e) => updateSettings({ secondaryFont: e.target.value })}
                  style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-dark)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-secondary)', fontWeight: 500 }}
                >
                  <option value="Inter">Inter</option>
                  <option value="Outfit">Outfit</option>
                  <option value="Geist">Geist</option>
                  <option value="Geist Mono">Geist Mono</option>
                  <option value="Fira Sans">Fira Sans</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Open Sans">Open Sans</option>
                  <option value="system-ui">System Default</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Global Text Styling</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fun global overrides for all text.</div>
                </div>
                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-primary)', padding: '4px', borderRadius: '6px', border: '1px solid var(--border-dark)' }}>
                  <button
                    onClick={() => updateSettings({ fontStyleBold: !settings.fontStyleBold })}
                    style={{
                      background: settings.fontStyleBold ? 'var(--bg-tertiary)' : 'transparent',
                      color: settings.fontStyleBold ? 'var(--text-primary)' : 'var(--text-muted)',
                      border: 'none', borderRadius: '4px', padding: '6px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    title="Bold"
                  >
                    <Icons.Bold size={16} />
                  </button>
                  <button
                    onClick={() => updateSettings({ fontStyleItalic: !settings.fontStyleItalic })}
                    style={{
                      background: settings.fontStyleItalic ? 'var(--bg-tertiary)' : 'transparent',
                      color: settings.fontStyleItalic ? 'var(--text-primary)' : 'var(--text-muted)',
                      border: 'none', borderRadius: '4px', padding: '6px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    title="Italic"
                  >
                    <Icons.Italic size={16} />
                  </button>
                  <button
                    onClick={() => updateSettings({ fontStyleUnderline: !settings.fontStyleUnderline })}
                    style={{
                      background: settings.fontStyleUnderline ? 'var(--bg-tertiary)' : 'transparent',
                      color: settings.fontStyleUnderline ? 'var(--text-primary)' : 'var(--text-muted)',
                      border: 'none', borderRadius: '4px', padding: '6px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                    title="Underline"
                  >
                    <Icons.Underline size={16} />
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Canvas Section */}
          <div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Canvas Editor</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Background Variant</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Choose the pattern used on the workspace.</div>
                </div>
                <select 
                  value={settings.canvasBackground}
                  onChange={(e) => updateSettings({ canvasBackground: e.target.value })}
                  style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-dark)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-secondary)', fontWeight: 500 }}
                >
                  <option value="dots">Dots</option>
                  <option value="lines">Grid Lines</option>
                  <option value="cross">Crosshairs</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Connection Wire Style</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>How nodes connect to each other.</div>
                </div>
                <select 
                  value={settings.wireStyle}
                  onChange={(e) => updateSettings({ wireStyle: e.target.value })}
                  style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-dark)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-secondary)', fontWeight: 500 }}
                >
                  <option value="smoothstep">Smooth Step</option>
                  <option value="step">Step</option>
                  <option value="straight">Straight</option>
                  <option value="default">Bezier (Curved)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Animated Wires</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Show a flowing data effect across the connections.</div>
                </div>
                <select 
                  value={settings.animatedWires ? 'true' : 'false'}
                  onChange={(e) => updateSettings({ animatedWires: e.target.value === 'true' })}
                  style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-dark)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-secondary)', fontWeight: 500 }}
                >
                  <option value="true">On</option>
                  <option value="false">Off</option>
                </select>
              </div>
            </div>
          </div>
          
        </div>
        
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icons.Info size={14} />
            Settings are saved locally in your browser's cache.
          </div>
          <button 
            onClick={resetSettings}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', padding: '6px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
          >
            <Icons.RotateCcw size={14} />
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
