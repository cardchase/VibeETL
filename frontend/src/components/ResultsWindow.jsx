import React, { useState, useMemo } from 'react';
import { Terminal, Database, FileText, Copy, Check } from 'lucide-react';

const ResultsWindow = ({ selectedNode, originalNode, results, globalLogs, style = {} }) => {
  const [activeTab, setActiveTab] = useState('data'); // 'logs' or 'data'
  const [selectedPort, setSelectedPort] = useState(null);
  const [prevNodeId, setPrevNodeId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [dataCopied, setDataCopied] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [wrapText, setWrapText] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [scrollTop, setScrollTop] = useState(0);

  const nodeId = selectedNode?.id;
  const isInspectingUpstream = originalNode && selectedNode && originalNode.id !== selectedNode.id;

  // Reset selectedPort and rows if we select a different node
  if (nodeId !== prevNodeId) {
    setPrevNodeId(nodeId);
    setSelectedPort(null);
    setSelectedRows(new Set());
    setSortConfig({ key: null, direction: 'asc' });
  }

  const nodeResult = nodeId ? results?.[nodeId] : null;
  const hasPorts = nodeResult?.ports && Object.keys(nodeResult.ports).length > 0;
  const availablePorts = hasPorts ? Object.keys(nodeResult.ports) : [];

  // Determine active port to show. Default to 'true' if available, otherwise first port, or fallback to default
  const activePort = selectedPort || (availablePorts.includes('true') ? 'true' : (availablePorts[0] || null));
  const activePortData = hasPorts && activePort ? nodeResult.ports[activePort] : null;

  // Extract preview data and columns
  const schema = activePortData ? (activePortData.schema || []) : (nodeResult?.schema || []);
  const rawPreviewData = activePortData ? (activePortData.preview || []) : (nodeResult?.preview || []);
  const rowCount = activePortData ? (activePortData.row_count || 0) : (nodeResult?.row_count || 0);
  
  // Sort data
  const previewData = useMemo(() => {
    if (!sortConfig.key) return rawPreviewData;
    const sorted = [...rawPreviewData];
    sorted.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rawPreviewData, sortConfig]);
  const colCount = activePortData ? (activePortData.column_count || 0) : (nodeResult?.column_count || 0);
  const duration = nodeResult?.duration_ms || 0;
  const error = nodeResult?.error;
  const status = nodeResult?.status;

  const nodeLogs = nodeResult?.logs || [];

  const handleCopyLogs = () => {
    let logText = "";
    if (globalLogs.length > 0) {
      logText += "GLOBAL ENGINE SYSTEM LOGS\n";
      globalLogs.forEach(log => {
        logText += `[${new Date().toLocaleTimeString()}] ${log}\n`;
      });
      logText += "\n";
    }
    if (selectedNode && nodeLogs.length > 0) {
      logText += `SELECTED NODE LOGS (${selectedNode.data?.label || selectedNode.id})\n`;
      nodeLogs.forEach(log => {
        logText += `${log}\n`;
      });
    }
    navigator.clipboard.writeText(logText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleRowSelection = (rowIdx) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(rowIdx)) {
      newSelection.delete(rowIdx);
    } else {
      newSelection.add(rowIdx);
    }
    setSelectedRows(newSelection);
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleCopyData = () => {
    let sortedIndices = [];
    if (selectedRows.size === 0) {
      // Copy all visible rows if none selected
      sortedIndices = Array.from({ length: previewData.length }, (_, i) => i);
    } else {
      // Sort selected indices
      sortedIndices = Array.from(selectedRows).sort((a, b) => a - b);
    }
    
    if (sortedIndices.length === 0) return;
    
    // Get headers
    const headers = schema.map(c => c.name).join('\t');
    
    // Get rows data
    const rowsText = sortedIndices.map(idx => {
      const row = previewData[idx];
      return schema.map(col => {
        const val = row[col.name];
        return val !== null && val !== undefined ? String(val) : '';
      }).join('\t');
    }).join('\n');
    
    const clipboardText = headers + '\n' + rowsText;
    
    navigator.clipboard.writeText(clipboardText).then(() => {
      setDataCopied(true);
      setTimeout(() => setDataCopied(false), 2000);
    });
  };

  return (
    <div className="results-window" style={style}>
      {/* Header and Tabs */}
      <div className="results-header">
        <div className="results-tabs">
          <button
            className={`results-tab ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            <Database size={14} />
            <span>Data Preview</span>
          </button>
          <button
            className={`results-tab ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <Terminal size={14} />
            <span>Execution Logs</span>
          </button>
        </div>

        {/* Multi-port Selector */}
        {hasPorts && activeTab === 'data' && (
          <div className="results-port-selector">
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginRight: 4 }}>Port:</span>
            {availablePorts.map((port) => (
              <button
                key={port}
                className={`port-btn ${activePort === port ? 'active' : ''}`}
                onClick={() => setSelectedPort(port)}
              >
                {port === 'true' ? 'T (True)' : port === 'false' ? 'F (False)' : port.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* Selected Node Summary */}
        <div className="results-summary">
          {selectedNode ? (
            status === 'success' ? (
              <span>
                {isInspectingUpstream && (
                  <span style={{ color: '#8b5cf6', fontWeight: 'bold', marginRight: 8, padding: '2px 6px', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: '4px' }}>
                    Incoming Data to {originalNode?.data?.label || originalNode?.id}
                  </span>
                )}
                Node '{selectedNode.data?.label || selectedNode.id}' {hasPorts ? `[Port: ${activePort === 'true' ? 'True' : activePort === 'false' ? 'False' : activePort}]` : ''}: <strong>{rowCount}</strong> rows, <strong>{colCount}</strong> columns ({typeof duration === 'number' ? duration.toFixed(0) : '0'}ms)
              </span>
            ) : status === 'error' ? (
              <span style={{ color: 'var(--color-error)' }}>
                {isInspectingUpstream && (
                  <span style={{ color: '#8b5cf6', fontWeight: 'bold', marginRight: 8, padding: '2px 6px', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: '4px' }}>
                    Incoming Data to {originalNode?.data?.label || originalNode?.id}
                  </span>
                )}
                Node '{selectedNode.data?.label || selectedNode.id}' failed.
              </span>
            ) : (
              <span>
                {isInspectingUpstream && (
                  <span style={{ color: '#8b5cf6', fontWeight: 'bold', marginRight: 8, padding: '2px 6px', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: '4px' }}>
                    Incoming Data to {originalNode?.data?.label || originalNode?.id}
                  </span>
                )}
                Node '{selectedNode.data?.label || selectedNode.id}' (Not executed)
              </span>
            )
          ) : (
            <span>No node selected</span>
          )}
        </div>
      </div>

      {/* Pane Content */}
      <div className="results-content">
        {activeTab === 'data' && (
          <div style={{ height: '100%' }}>
            {!selectedNode ? (
              <div className="no-node-selected" style={{ padding: 20 }}>
                <Database />
                <p>Select a node on the canvas to inspect its output dataframe.</p>
              </div>
            ) : status === 'error' ? (
              error?.toLowerCase().includes("awaiting connection") || error?.toLowerCase().includes("input dataframe is missing") || error?.toLowerCase().includes("missing input") || error?.toLowerCase().includes("requires an input") ? (
                <div className="no-node-selected" style={{ color: 'var(--text-secondary)', padding: 20 }}>
                  <span style={{ fontSize: '2.5rem', marginBottom: 10 }}>🔌</span>
                  <p style={{ fontWeight: 600, color: '#f59e0b' }}>Awaiting Connection</p>
                  <p style={{ fontSize: '0.85rem', marginTop: 5, maxWidth: '500px' }}>Connect an incoming data stream to this tool to begin processing data.</p>
                </div>
              ) : error?.toLowerCase().includes("pending configuration") ? (
                <div className="no-node-selected" style={{ color: 'var(--text-secondary)', padding: 20 }}>
                  <span style={{ fontSize: '2.5rem', marginBottom: 10 }}>⚙️</span>
                  <p style={{ fontWeight: 600, color: '#f59e0b' }}>Pending Configuration</p>
                  <p style={{ fontSize: '0.85rem', marginTop: 5, maxWidth: '500px' }}>{error.replace("Pending Configuration: ", "")}</p>
                </div>
              ) : (
                <div className="no-node-selected" style={{ color: 'var(--color-error)', padding: 20 }}>
                  <span style={{ fontSize: '2.5rem', marginBottom: 10 }}>&otimes;</span>
                  <p style={{ fontWeight: 600 }}>Execution Failed</p>
                  <p style={{ fontSize: '0.85rem', marginTop: 5, maxWidth: '500px' }}>{error}</p>
                </div>
              )
            ) : status === 'success' ? (
              previewData.length > 0 && schema.some(c => c.name === '__vibe_html_payload__') ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', padding: '20px', overflow: 'hidden', alignItems: 'flex-start', boxSizing: 'border-box' }}>
                  <div style={{ 
                    backgroundColor: 'white', 
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', 
                    borderRadius: '8px', 
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    resize: 'both',
                    overflow: 'auto',
                    minWidth: '300px',
                    minHeight: '200px',
                    width: `${(parseInt(selectedNode?.data?.parameters?.width) || 800)}px`, 
                    height: `${(parseInt(selectedNode?.data?.parameters?.height) || 500) + 45}px`,
                    maxWidth: '100%',
                    maxHeight: '100%',
                    boxSizing: 'border-box'
                  }}>
                    <div style={{ padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600, color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ whiteSpace: 'nowrap', marginRight: '30px' }}>Interactive Report Visualization 📊</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 400, color: '#94a3b8', whiteSpace: 'nowrap' }}>Hover to export</span>
                    </div>
                    <iframe 
                      srcDoc={previewData[0]['__vibe_html_payload__']} 
                      style={{ 
                        width: '100%', 
                        height: 'calc(100% - 45px)', 
                        border: 'none', 
                        background: 'white',
                        transition: 'opacity 0.3s ease'
                      }}
                      title="Plotly Chart"
                    />
                  </div>
                </div>
              ) : previewData.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {selectedRows.size > 0 && (
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {selectedRows.size} row{selectedRows.size > 1 ? 's' : ''} selected
                        </span>
                      )}
                      <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <input 
                          type="checkbox" 
                          checked={wrapText} 
                          onChange={(e) => setWrapText(e.target.checked)} 
                          style={{ margin: 0 }}
                        />
                        Wrap Text
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        className="copy-logs-btn" 
                        onClick={() => {
                          window.open(`http://localhost:8000/api/download/csv?nodeId=${nodeId}&portId=${activePort || ''}`, '_blank');
                        }}
                      >
                        <FileText size={12} />
                        Download CSV
                      </button>
                      <button className="copy-logs-btn" onClick={handleCopyData}>
                        {dataCopied ? <Check size={12} color="var(--color-inout)" /> : <Copy size={12} />}
                        {dataCopied ? "Copied Data" : (selectedRows.size > 0 ? "Copy Selected Rows" : "Copy Preview Data")}
                      </button>
                    </div>
                  </div>
                  <div 
                    className="spreadsheet-container" 
                    style={{ flex: 1, overflow: 'auto' }}
                    onScroll={(e) => setScrollTop(e.target.scrollTop)}
                  >
                    <table className="spreadsheet" style={{ tableLayout: 'auto' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '40px', minWidth: '40px', textAlign: 'center', background: 'var(--bg-secondary)' }}>#</th>
                          {schema.map((col) => (
                            <th 
                              key={col.name} 
                              onClick={() => handleSort(col.name)}
                              style={{ resize: 'horizontal', overflow: 'hidden', minWidth: '80px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                  {col.name}
                                  {col.semantic_type === 'currency_usd' && (
                                    <span title="Currency" style={{ marginLeft: '6px', color: 'var(--color-success)', fontWeight: 800 }}>$</span>
                                  )}
                                  {col.semantic_type === 'percentage' && (
                                    <span title="Percentage" style={{ marginLeft: '6px', color: 'var(--color-accent)', fontWeight: 800 }}>%</span>
                                  )}
                                  <span className="col-header-type" style={{ marginLeft: '6px' }}>
                                    {col.type && typeof col.type === 'string' ? col.type.split('.').pop() : 'Unknown'}
                                  </span>
                                </div>
                                {sortConfig.key === col.name && (
                                  <span style={{ fontSize: '0.7rem', color: 'var(--color-accent)' }}>
                                    {sortConfig.direction === 'asc' ? '▲' : '▼'}
                                  </span>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const ROW_HEIGHT = 32;
                          const buffer = 10;
                          const viewportRows = Math.ceil(800 / ROW_HEIGHT);
                          const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - buffer);
                          const endIndex = Math.min(previewData.length, startIndex + viewportRows + (buffer * 2));
                          const visibleRows = previewData.slice(startIndex, endIndex);
                          const topSpacerHeight = startIndex * ROW_HEIGHT;
                          const bottomSpacerHeight = Math.max(0, (previewData.length - endIndex) * ROW_HEIGHT);

                          return (
                            <>
                              {topSpacerHeight > 0 && (
                                <tr style={{ height: topSpacerHeight }}>
                                  <td colSpan={schema.length + 1} style={{ padding: 0, border: 'none' }}></td>
                                </tr>
                              )}
                              {visibleRows.map((row, relativeIdx) => {
                                const rowIdx = startIndex + relativeIdx;
                                return (
                                  <tr 
                                    key={rowIdx} 
                                    onClick={() => toggleRowSelection(rowIdx)}
                                    style={{ 
                                      cursor: 'pointer',
                                      backgroundColor: selectedRows.has(rowIdx) ? 'rgba(59, 130, 246, 0.1)' : undefined,
                                      height: ROW_HEIGHT
                                    }}
                                  >
                                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, background: 'var(--bg-secondary)', height: ROW_HEIGHT, padding: '0 8px' }}>
                                      {rowIdx + 1}
                                    </td>
                                    {schema.map((col) => (
                                      <td 
                                        key={col.name} 
                                        title={String(row[col.name] ?? '')}
                                        style={wrapText ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: '300px', lineHeight: '1.4', verticalAlign: 'top', padding: '0 8px' } : { height: ROW_HEIGHT, padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}
                                      >
                                        {row[col.name] !== null && row[col.name] !== undefined ? String(row[col.name]) : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                              {bottomSpacerHeight > 0 && (
                                <tr style={{ height: bottomSpacerHeight }}>
                                  <td colSpan={schema.length + 1} style={{ padding: 0, border: 'none' }}></td>
                                </tr>
                              )}
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="no-node-selected" style={{ padding: 20 }}>
                  <Database />
                  <p>Empty DataFrame. The execution returned 0 rows or columns.</p>
                </div>
              )
            ) : (
              <div className="no-node-selected" style={{ padding: 20 }}>
                <Database />
                <p>Workflow has not been executed yet. Click "Run Workflow" to see results.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="log-viewer">
            {globalLogs.length === 0 && nodeLogs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>Console is empty. Run the workflow to generate logs.</div>
            ) : (
              <>
                {globalLogs.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: 4, marginBottom: 8 }}>
                      <div style={{ color: 'var(--color-accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileText size={12} /> GLOBAL ENGINE SYSTEM LOGS
                      </div>
                      <button className="copy-logs-btn" onClick={handleCopyLogs}>
                        {copied ? <Check size={12} color="var(--color-inout)" /> : <Copy size={12} />}
                        {copied ? "Copied" : "Copy Logs"}
                      </button>
                    </div>
                    {globalLogs.map((log, idx) => (
                      <div key={`g-${idx}`} className={`log-entry ${typeof log === 'string' && (log.includes('failed') || log.includes('Error')) ? 'error' : ''}`}>
                        [{new Date().toLocaleTimeString()}] {log}
                      </div>
                    ))}
                  </div>
                )}
                {selectedNode && nodeLogs.length > 0 && (
                  <div>
                    <div style={{ color: 'var(--color-inout)', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: 4, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Terminal size={12} /> SELECTED NODE LOGS ({selectedNode.data?.label || selectedNode.id})
                    </div>
                    {nodeLogs.map((log, idx) => (
                      <div key={`n-${idx}`} className={`log-entry ${typeof log === 'string' && log.toLowerCase().includes('error') ? 'error' : typeof log === 'string' && log.toLowerCase().includes('warning') ? 'warning' : ''}`}>
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultsWindow;
