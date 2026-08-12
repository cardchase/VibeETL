import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('vibeetl_settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Failed to load settings", e);
    }
    return {
      primaryFont: 'Outfit',
      secondaryFont: 'Inter',
      theme: 'light',
      canvasBackground: 'dots', // 'dots', 'lines', 'cross'
      wireStyle: 'smoothstep',  // 'smoothstep', 'step', 'straight', 'default' (bezier)
      fontWeight: 'normal'      // 'light', 'normal', 'bold'
    };
  });

  useEffect(() => {
    localStorage.setItem('vibeetl_settings', JSON.stringify(settings));
    
    // Apply theme & font-weight
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.body.setAttribute('data-font-weight', settings.fontWeight || 'normal');
    
    // Apply fonts
    const root = document.documentElement;
    root.style.setProperty('--font-primary', `'${settings.primaryFont}', sans-serif`);
    root.style.setProperty('--font-secondary', `'${settings.secondaryFont}', sans-serif`);
    
    if (settings.secondaryFont === 'Geist Mono') {
        root.style.setProperty('--font-mono', `'Geist Mono', monospace`);
    } else {
        root.style.setProperty('--font-mono', `'JetBrains Mono', monospace`);
    }
  }, [settings]);

  const updateSettings = (updates) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};
