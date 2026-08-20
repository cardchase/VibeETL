import React, { createContext, useState, useContext } from 'react';

const LayoutContext = createContext();

export const LayoutProvider = ({ children }) => {
  const [layoutDirection, setLayoutDirection] = useState('horizontal'); // 'horizontal' or 'vertical'

  const toggleLayout = () => {
    setLayoutDirection(prev => prev === 'horizontal' ? 'vertical' : 'horizontal');
  };

  return (
    <LayoutContext.Provider value={{ layoutDirection, toggleLayout }}>
      {children}
    </LayoutContext.Provider>
  );
};

export const useLayout = () => useContext(LayoutContext);
