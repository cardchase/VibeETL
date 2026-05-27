import React, { useMemo, useRef } from 'react';
import * as Icons from 'lucide-react';
import { Play, RefreshCw, Save, FolderOpen, Database, Bot } from 'lucide-react';

const CATEGORY_TITLES = {
  'favorites': '⭐ Favorites',
  'inout': 'In / Out',
  'prep': 'Preparation',
  'transform': 'Transform',
  'misc': 'Miscellaneous'
};

const ToolPalette = ({ onRunPipeline, onSaveWorkflow, onLoadWorkflow, onExportYAML, isRunning, autoRun, setAutoRun, availableTools = [], selectedNode, onUpdateParams, onAddNode }) => {
  const fileInputRef = useRef(null);
  // Drag start handler for tool items
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  // Group tools by category
  const categories = useMemo(() => {
    const grouped = { favorites: [] };
    const favoriteToolIds = ['fileInput', 'browse', 'select', 'formula'];
    
    availableTools.forEach(tool => {
      const cat = tool.category || 'misc';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(tool);
      
      if (favoriteToolIds.includes(tool.id)) {
        grouped.favorites.push(tool);
      }
    });
    return grouped;
  }, [availableTools]);

  return (
    <div className="tool-palette">
      {/* Logo Section */}
      <div className="palette-logo">
        <div className="logo-icon">ETL</div>
        <div className="logo-text">VibeETL</div>
      </div>

      {/* Tool Categories Section */}
      <div className="tool-dropdown-container" style={{ margin: '0 16px', display: 'flex', alignItems: 'center' }}>
        <select 
          onChange={(e) => {
            if (e.target.value) {
              onAddNode && onAddNode(e.target.value);
              e.target.value = ""; // Reset after selection
            }
          }}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            background: 'white',
            color: 'var(--text-primary)',
            fontSize: '0.8rem',
            fontFamily: 'var(--font-primary)',
            fontWeight: 600,
            cursor: 'pointer',
            minWidth: '160px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
          title="Select a tool to add it to the canvas"
        >
          <option value="">+ Add Tool...</option>
          {Object.entries(categories).filter(([catKey]) => catKey !== 'favorites').map(([catKey, tools]) => (
            <optgroup key={catKey} label={CATEGORY_TITLES[catKey] || catKey.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}>
              {tools.map(tool => (
                <option key={tool.id} value={tool.id}>{tool.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="tool-categories" style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: '4px' }}>
        {Object.entries(categories).map(([catKey, tools]) => {
          if (tools.length === 0) return null;
          return (
          <div key={catKey} className="category-group">
            <span className={`category-title ${catKey}`}>
              {CATEGORY_TITLES[catKey] || catKey.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
            </span>
            <div className="category-items">
              {tools.map(tool => {
                const IconComponent = Icons[tool.icon] || Icons.Square;
                return (
                  <div
                    key={tool.id}
                    className={`tool-item ${catKey}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, tool.id)}
                    onClick={() => onAddNode && onAddNode(tool.id)}
                    title={tool.description || `Click or drag onto canvas to add ${tool.name}`}
                    style={{ cursor: 'pointer', padding: '6px 10px', gap: '6px', fontSize: '0.75rem' }}
                  >
                    <IconComponent size={14} />
                    <span>{tool.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )})}
      </div>

      {/* Execution Actions Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0, marginLeft: 'auto' }}>
        <input 
          type="file" 
          accept=".json" 
          style={{ display: 'none' }} 
          ref={fileInputRef} 
          onChange={onLoadWorkflow} 
        />
        <button className="run-button" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} onClick={() => fileInputRef.current?.click()} title="Load Workflow">
          <FolderOpen size={16} />
        </button>
        <button className="run-button" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} onClick={onSaveWorkflow} title="Save Workflow">
          <Save size={16} />
        </button>
        <button className="run-button" style={{ background: 'var(--color-accent)', color: 'white', border: '1px solid var(--border-color)', marginLeft: '4px' }} onClick={onExportYAML} title="Export Agent YAML">
          <Bot size={16} />
        </button>
        
        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />

        <label className="auto-run-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }} title="Toggle automatic execution on parameter changes">
          <input
            type="checkbox"
            checked={autoRun}
            onChange={(e) => setAutoRun(e.target.checked)}
            style={{ accentColor: 'var(--color-accent)' }}
          />
          <span>Auto-Run</span>
        </label>

        {selectedNode && (
          <button
            className="run-button"
            style={{
              background: selectedNode.data?.parameters?.isCached ? 'var(--color-error)' : 'var(--color-success)',
              color: 'white',
              border: '1px solid var(--border-color)',
              marginRight: '8px'
            }}
            onClick={() => {
              const currentlyCached = selectedNode.data?.parameters?.isCached;
              onUpdateParams(selectedNode.id, { ...selectedNode.data?.parameters, isCached: !currentlyCached });
              if (!currentlyCached) {
                // Wait briefly for state to update, then run workflow
                setTimeout(() => onRunPipeline(), 50);
              }
            }}
            disabled={isRunning}
            title={selectedNode.data?.parameters?.isCached ? "Un-cache this Node" : "Cache Output for Selected Node"}
          >
            {selectedNode.data?.parameters?.isCached ? <Icons.Trash2 size={16} /> : <Database size={16} />}
            <span>{selectedNode.data?.parameters?.isCached ? 'Clear Cache' : 'Cache & Run'}</span>
          </button>
        )}

        <button
          className="run-button"
          onClick={onRunPipeline}
          disabled={isRunning}
          title="Run the entire pipeline from start to finish"
        >
          {isRunning ? (
            <>
              <RefreshCw className="animate-spin" size={16} />
              <span>Running...</span>
            </>
          ) : (
            <>
              <Play size={16} fill="white" />
              <span>Run</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ToolPalette;
