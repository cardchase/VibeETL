import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

const DEFAULT_SETTINGS = {
  primaryFont: 'Outfit',
  secondaryFont: 'Inter',
  theme: 'light',
  canvasBackground: 'dots',
  wireStyle: 'default',
  animatedWires: false,
  fontStyleBold: false,
  fontStyleItalic: false,
  fontStyleUnderline: false
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('vibeetl_settings');
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {
      console.warn("Failed to load settings", e);
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem('vibeetl_settings', JSON.stringify(settings));
    
    // Apply theme & text styles
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.body.setAttribute('data-font-bold', settings.fontStyleBold);
    document.body.setAttribute('data-font-italic', settings.fontStyleItalic);
    document.body.setAttribute('data-font-underline', settings.fontStyleUnderline);
    
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

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};
