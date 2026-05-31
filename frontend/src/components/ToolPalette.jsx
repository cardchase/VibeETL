import React, { useMemo, useRef, useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { Play, RefreshCw, Save, FolderOpen, Database, Bot, Search, Plus, X, Star, Maximize, Minimize } from 'lucide-react';

const CATEGORY_TITLES = {
  'favorites': '⭐ Favorites',
  'inout': 'In / Out',
  'prep': 'Preparation',
  'transform': 'Transform',
  'cloud': '☁️ Cloud Connectors',
  'misc': 'Miscellaneous'
};

const ToolPalette = ({ onRunPipeline, onSaveWorkflow, onLoadWorkflow, onExportYAML, onClearGlobalCache, isRunning, autoRun, setAutoRun, availableTools = [], selectedNode, onUpdateParams, onAddNode }) => {
  const fileInputRef = useRef(null);
  const dropdownRef = useRef(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState(null);
  const authFileInputRef = useRef(null);

  useEffect(() => {
    const handleHistoryUpdate = (e) => {
      setCanUndo(e.detail.canUndo);
      setCanRedo(e.detail.canRedo);
    };
    window.addEventListener('vibe-history-update', handleHistoryUpdate);
    return () => window.removeEventListener('vibe-history-update', handleHistoryUpdate);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    if (isAuthModalOpen) {
      fetch('http://localhost:8000/api/google/auth/status')
        .then(res => res.json())
        .then(data => setAuthStatus(data.status))
        .catch(err => console.error("Failed to fetch auth status", err));
    }
  }, [isAuthModalOpen]);

  const handleAuthUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    fetch('http://localhost:8000/api/google/auth/setup', {
      method: 'POST',
      body: formData,
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setAuthStatus('authenticated');
          alert("Successfully authenticated with Google Cloud!");
        } else {
          alert("Error: " + data.detail);
        }
      })
      .catch(err => alert("Upload failed: " + err));
    
    // Reset input
    e.target.value = '';
  };

  const handleAuthDelete = () => {
    if (!window.confirm("Are you sure you want to remove your Google Cloud credentials?")) return;
    
    fetch('http://localhost:8000/api/google/auth/logout', { method: 'POST' })
      .then(res => res.json())
      .then(() => {
        setAuthStatus('needs_setup');
        alert("Credentials successfully removed.");
      })
      .catch(err => alert("Failed to remove credentials: " + err));
  };

  // Favorites State
  const [favoriteToolIds, setFavoriteToolIds] = useState(() => {
    try {
      const saved = localStorage.getItem('vibeetl_favorites');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Failed to load favorites", e);
    }
    return ['fileInput', 'browse', 'select', 'formula'];
  });

  const toggleFavorite = (toolId, e) => {
    e.stopPropagation();
    setFavoriteToolIds(prev => {
      const newFavorites = prev.includes(toolId) 
        ? prev.filter(id => id !== toolId)
        : [...prev, toolId];
      localStorage.setItem('vibeetl_favorites', JSON.stringify(newFavorites));
      return newFavorites;
    });
  };

  const resetFavorites = () => {
    const defaultFavs = ['fileInput', 'browse', 'select', 'formula'];
    setFavoriteToolIds(defaultFavs);
    localStorage.removeItem('vibeetl_favorites');
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Drag start handler for tool items
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  // Group tools by category
  const categories = useMemo(() => {
    const grouped = { favorites: [] };
    
    availableTools.forEach(tool => {
      const cat = tool.category || 'misc';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(tool);
      
      if (favoriteToolIds.includes(tool.id)) {
        grouped.favorites.push(tool);
      }
    });
    return grouped;
  }, [availableTools, favoriteToolIds]);

  return (
    <div className="tool-palette">
      {/* Logo Section */}
      <div className="palette-logo">
        <div className="logo-icon">ETL</div>
        <div className="logo-text">VibeETL</div>
      </div>

      {/* Tool Categories Section */}
      <div className="tool-dropdown-container" style={{ margin: '0 16px', display: 'flex', alignItems: 'center', position: 'relative' }} ref={dropdownRef}>
        <button 
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
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
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
          title="Select a tool to add it to the canvas"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} />
            <span>Add Tool...</span>
          </div>
        </button>

        {isDropdownOpen && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            background: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
            width: '220px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>
              <Search size={14} style={{ color: '#94a3b8', marginRight: '8px' }} />
              <input 
                autoFocus
                type="text" 
                placeholder="Search tools..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', outline: 'none', width: '100%', fontSize: '12px' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#94a3b8' }}>
                  <X size={14} />
                </button>
              )}
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {Object.entries(categories).filter(([catKey]) => catKey !== 'favorites').map(([catKey, tools]) => {
                const filteredTools = tools.filter(tool => 
                  tool.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  tool.id.toLowerCase().includes(searchQuery.toLowerCase())
                );
                
                if (filteredTools.length === 0) return null;
                
                return (
                  <div key={catKey}>
                    <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', backgroundColor: '#f8fafc' }}>
                      {CATEGORY_TITLES[catKey] || catKey.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </div>
                    {filteredTools.map(tool => (
                      <div 
                        key={tool.id}
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('vibe-add-node', { detail: { type: tool.id } }));
                          setIsDropdownOpen(false);
                          setSearchQuery('');
                        }}
                        style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        {React.createElement(Icons[tool.icon] || Icons.Square, { size: 14, style: { color: '#64748b' } })}
                        <span style={{ fontWeight: 600, color: '#334155' }}>{tool.name}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="tool-categories" style={{ overflowX: 'auto', overflowY: 'hidden', paddingTop: '10px', paddingBottom: '6px' }}>
        {Object.entries(categories).map(([catKey, tools]) => {
          if (tools.length === 0) return null;
          return (
          <div key={catKey} className="category-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px', marginBottom: '4px' }}>
              <span className={`category-title ${catKey}`} style={{ margin: 0 }}>
                {CATEGORY_TITLES[catKey] || catKey.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </span>
              {catKey === 'favorites' && (
                <button 
                  onClick={resetFavorites}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', padding: '2px' }}
                  title="Reset Favorites to Default"
                >
                  <Icons.RotateCcw size={12} />
                </button>
              )}
            </div>
            <div className="category-items">
              {tools.map(tool => {
                const IconComponent = Icons[tool.icon] || Icons.Square;
                return (
                  <div
                    key={tool.id}
                    className={`tool-item ${catKey}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, tool.id)}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('vibe-add-node', { detail: { type: tool.id } }));
                    }}
                    title={tool.description || `Click or drag onto canvas to add ${tool.name}`}
                    style={{ cursor: 'pointer', position: 'relative' }}
                  >
                    <IconComponent size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                    <span>{tool.name}</span>
                    <div 
                      onClick={(e) => toggleFavorite(tool.id, e)}
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        padding: '3px',
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        zIndex: 10,
                        cursor: 'pointer'
                      }}
                      title={favoriteToolIds.includes(tool.id) ? "Remove from Favorites" : "Add to Favorites"}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      <Star size={10} fill={favoriteToolIds.includes(tool.id) ? '#fbbf24' : 'none'} color={favoriteToolIds.includes(tool.id) ? '#fbbf24' : '#cbd5e1'} strokeWidth={favoriteToolIds.includes(tool.id) ? 1 : 2.5} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )})}
      </div>

      {/* Execution Actions Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0, marginLeft: 'auto' }}>
        <button 
          className="run-button" 
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', opacity: canUndo ? 1 : 0.5, cursor: canUndo ? 'pointer' : 'not-allowed', padding: '6px 10px' }} 
          onClick={() => canUndo && window.dispatchEvent(new CustomEvent('vibe-undo'))} 
          title="Undo"
        >
          <Icons.Undo size={16} />
        </button>
        <button 
          className="run-button" 
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', opacity: canRedo ? 1 : 0.5, cursor: canRedo ? 'pointer' : 'not-allowed', padding: '6px 10px' }} 
          onClick={() => canRedo && window.dispatchEvent(new CustomEvent('vibe-redo'))} 
          title="Redo"
        >
          <Icons.Redo size={16} />
        </button>
        
        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />

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
        <button 
          className="run-button" 
          style={{ background: '#e8f0fe', color: '#1a73e8', border: '1px solid #d2e3fc', marginLeft: '4px' }} 
          onClick={() => setIsAuthModalOpen(true)} 
          title="Google Cloud Connections"
        >
          <Icons.Cloud size={16} />
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

        <button
          className="run-button"
          style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', marginLeft: '8px' }}
          onClick={() => {
            if (window.confirm("Are you sure you want to clear all cached nodes? This will un-cache everything on the canvas.")) {
              onClearGlobalCache();
            }
          }}
          title="Clear all cached nodes in the workflow"
        >
          <Icons.Trash2 size={16} />
          <span>Clear All Cache</span>
        </button>

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

        <button
          className="run-button"
          style={{ background: 'var(--panel-bg)', color: 'var(--text-color)', border: '1px solid var(--border-color)', marginLeft: '8px' }}
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      </div>

      {/* Google Auth Modal */}
      {isAuthModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#ffffff',
            padding: '24px',
            borderRadius: '12px',
            width: '450px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-primary)', color: '#333333' }}>☁️ Cloud Integrations</h3>
              <button 
                onClick={() => setIsAuthModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#666666' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <p style={{ fontSize: '0.9rem', color: '#555555', margin: 0, lineHeight: 1.5 }}>
              VibeETL needs credentials to bypass anonymous restrictions and access private Google Sheets.
              You can upload either a <strong>Service Account JSON</strong> or an <strong>OAuth 2.0 Client Secret</strong>.
              <br/><br/>
              Don't have one? 
              <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" style={{ color: '#1a73e8', textDecoration: 'none', fontWeight: 600, marginLeft: '4px' }}>Get a Service Account</a>
              <span style={{ margin: '0 8px' }}>or</span>
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: '#1a73e8', textDecoration: 'none', fontWeight: 600 }}>Get an OAuth 2.0 Client Secret</a>.
            </p>

            <div style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ 
                  width: '10px', height: '10px', borderRadius: '50%', 
                  background: authStatus === 'authenticated' ? '#10b981' : '#f59e0b' 
                }} />
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#333333' }}>
                  Google Sheets Status: {authStatus === 'authenticated' ? 'Connected' : 'Not Connected'}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#666666', margin: 0 }}>
                {authStatus === 'authenticated' 
                  ? 'Your global Service Account / OAuth credentials are active. Nodes will use them automatically.'
                  : 'Currently operating in anonymous fallback mode. Upload a Service Account JSON or OAuth Client Secret to unlock full access.'}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              {authStatus === 'authenticated' ? (
                <button 
                  onClick={handleAuthDelete}
                  style={{
                    background: 'transparent',
                    color: '#ef4444',
                    border: '1px solid #fca5a5',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  Remove Credentials
                </button>
              ) : (
                <div /> // Placeholder for flex-between
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="file" 
                  accept=".json" 
                  ref={authFileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleAuthUpload}
                />
                <button 
                  onClick={() => authFileInputRef.current?.click()}
                  style={{
                    background: '#1a73e8',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.9rem'
                  }}
                >
                  <Icons.UploadCloud size={16} />
                  {authStatus === 'authenticated' ? 'Replace Credentials JSON' : 'Upload Credentials JSON'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolPalette;
