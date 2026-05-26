import React, { useState, useRef, useEffect } from 'react';

const MentionsInput = ({ value, onChange, placeholder, style, schema }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const columnNames = schema ? schema.map(col => col.name) : [];
  const filteredCols = columnNames.filter(col => col.toLowerCase().includes(filterText.toLowerCase()));

  const handleInput = (e) => {
    const val = e.target.value;
    onChange(e);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/\[([^\]]*)$/);

    if (match) {
      setFilterText(match[1]);
      setShowDropdown(true);
      setSelectedIndex(0);
    } else {
      setShowDropdown(false);
    }
  };

  const handleKeyDown = (e) => {
    if (showDropdown && filteredCols.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCols.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCols.length) % filteredCols.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertColumn(filteredCols[selectedIndex]);
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
      }
    }
  };

  const insertColumn = (colName) => {
    if (!inputRef.current) return;
    const cursorPos = inputRef.current.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);

    // Find the last '[' before cursor
    const lastBracketIdx = textBeforeCursor.lastIndexOf('[');

    if (lastBracketIdx !== -1) {
      const newBefore = textBeforeCursor.slice(0, lastBracketIdx);
      const newVal = `${newBefore}[${colName}]${textAfterCursor}`;

      const syntheticEvent = {
        target: { value: newVal }
      };
      onChange(syntheticEvent);

      setShowDropdown(false);

      // Attempt to restore cursor after render
      setTimeout(() => {
        if (inputRef.current) {
          const newCursorPos = lastBracketIdx + colName.length + 2;
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          inputRef.current.focus();
        }
      }, 0);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        ref={inputRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{ ...style, width: '100%', boxSizing: 'border-box' }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
      />

      {showDropdown && filteredCols.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          maxHeight: '150px',
          overflowY: 'auto',
          zIndex: 1000,
          width: '100%',
          marginTop: '4px'
        }}>
          {filteredCols.map((col, idx) => (
            <div
              key={col}
              onClick={() => insertColumn(col)}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                background: idx === selectedIndex ? 'var(--color-accent)' : 'transparent',
                color: idx === selectedIndex ? 'white' : 'var(--text-primary)',
                fontSize: '0.8rem',
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              {col}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MentionsInput;
