import React, { useMemo } from 'react';
import * as Icons from 'lucide-react';
import { Play, RefreshCw } from 'lucide-react';

const ToolPalette = ({ onRunPipeline, isRunning, autoRun, setAutoRun, availableTools = [] }) => {
  // Drag start handler for tool items
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  // Group tools by category
  const categories = useMemo(() => {
    const grouped = {};
    availableTools.forEach(tool => {
      const cat = tool.category || 'misc';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(tool);
    });
    return grouped;
  }, [availableTools]);

  const categoryTitles = {
    'inout': 'In / Out',
    'prep': 'Preparation',
    'transform': 'Transform',
    'misc': 'Miscellaneous'
  };

  return (
    <div className="tool-palette">
      {/* Logo Section */}
      <div className="palette-logo">
        <div className="logo-icon">ETL</div>
        <div className="logo-text">VibeETL</div>
      </div>

      {/* Tool Categories Section */}
      <div className="tool-categories">
        {Object.entries(categories).map(([catKey, tools]) => (
          <div key={catKey} className="category-group">
            <span className={`category-title ${catKey}`}>
              {categoryTitles[catKey] || catKey.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
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
                    title={tool.description || `Drag onto canvas to add ${tool.name}`}
                  >
                    <IconComponent size={16} />
                    <span>{tool.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Execution Actions Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <label className="auto-run-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={autoRun}
            onChange={(e) => setAutoRun(e.target.checked)}
            style={{ accentColor: 'var(--color-accent)' }}
          />
          <span>Auto-Run</span>
        </label>

        <button
          className="run-button"
          onClick={onRunPipeline}
          disabled={isRunning}
        >
          {isRunning ? (
            <>
              <RefreshCw className="animate-spin" size={16} />
              <span>Running...</span>
            </>
          ) : (
            <>
              <Play size={16} fill="white" />
              <span>Run Workflow</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ToolPalette;
