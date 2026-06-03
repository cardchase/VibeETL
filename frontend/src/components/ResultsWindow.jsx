import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Terminal, Database, FileText, Copy, Check } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);
const ResultsWindow = ({ selectedNode, originalNode, results, globalLogs, style = {} }) => {
  const [activeTab, setActiveTab] = useState('data'); // 'logs' or 'data'
  const [selectedPort, setSelectedPort] = useState(null);
  const [prevNodeId, setPrevNodeId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [dataCopied, setDataCopied] = useState(false);
  const [wrapText, setWrapText] = useState(false);
  const [selectedRowCount, setSelectedRowCount] = useState(0);
  
  const gridRef = useRef(null);

  const nodeId = selectedNode?.id;
  const isInspectingUpstream = originalNode && selectedNode && originalNode.id !== selectedNode.id;

  // Reset selectedPort and rows if we select a different node
  if (nodeId !== prevNodeId) {
    setPrevNodeId(nodeId);
    setSelectedPort(null);
    setSelectedRowCount(0);
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
  // Data for AG Grid
  const previewData = rawPreviewData;
  const colCount = activePortData ? (activePortData.column_count || 0) : (nodeResult?.column_count || 0);

  // AG Grid Column Definitions
  const columnDefs = useMemo(() => {
    return schema.map((col) => {
      let filterType = 'agTextColumnFilter';
      if (['int64', 'Int64', 'Float64', 'float64', 'number', 'integer'].includes(col.type) || ['currency_usd', 'percentage'].includes(col.semantic_type)) {
        filterType = 'agNumberColumnFilter';
      } else if (['date', 'datetime', 'timestamp'].includes(col.type)) {
        filterType = 'agDateColumnFilter';
      }

      const colDef = {
        field: col.name,
        headerName: col.name,
        filter: filterType,
        sortable: true,
        resizable: true,
        wrapText: wrapText,
        autoHeight: wrapText
      };

      if (col.semantic_type === 'currency_usd') {
        colDef.headerName = col.name + ' ($)';
      } else if (col.semantic_type === 'percentage') {
        colDef.headerName = col.name + ' (%)';
      }

      return colDef;
    });
  }, [schema, wrapText]);

  const onSelectionChanged = useCallback(() => {
    if (gridRef.current && gridRef.current.api) {
      const selectedRows = gridRef.current.api.getSelectedRows();
      setSelectedRowCount(selectedRows.length);
    }
  }, []);


  
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

  const handleCopyData = useCallback(() => {
    if (!gridRef.current || !gridRef.current.api) return;
    
    let rowsToCopy = [];
    const selectedRows = gridRef.current.api.getSelectedRows();
    
    if (selectedRows.length > 0) {
      rowsToCopy = selectedRows;
    } else {
      // Get all sorted/filtered rows
      gridRef.current.api.forEachNodeAfterFilterAndSort((node) => {
        rowsToCopy.push(node.data);
      });
    }
    
    if (rowsToCopy.length === 0) return;
    
    const headers = schema.map(c => c.name).join('\t');
    const rowsText = rowsToCopy.map(row => {
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
  }, [schema]);

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
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {selectedRowCount > 0 && (
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {selectedRowCount} row{selectedRowCount > 1 ? 's' : ''} selected
                        </span>
                      )}
                      <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <input 
                          type="checkbox" 
                          checked={wrapText} 
                          onChange={(e) => {
                            setWrapText(e.target.checked);
                            if (gridRef.current && gridRef.current.api) {
                              gridRef.current.api.resetRowHeights();
                            }
                          }} 
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
                        {dataCopied ? "Copied Data" : (selectedRowCount > 0 ? "Copy Selected Rows" : "Copy Preview Data")}
                      </button>
                    </div>
                  </div>
                  <div className="ag-theme-quartz" style={{ flex: 1, width: '100%', minHeight: 0 }}>
                    <AgGridReact
                      key={`${nodeId}-${activePort || 'default'}`}
                      ref={gridRef}
                      rowData={previewData}
                      columnDefs={columnDefs}
                      rowSelection="multiple"
                      onSelectionChanged={onSelectionChanged}
                      enableCellTextSelection={true}
                      suppressRowClickSelection={true}
                      rowMultiSelectWithClick={true}
                      autoSizeStrategy={{ type: 'fitCellContents' }}
                      suppressColumnVirtualisation={true}
                      defaultColDef={{
                        sortable: true,
                        filter: true,
                        resizable: true,
                        wrapText: wrapText,
                        autoHeight: wrapText,
                        cellRenderer: (params) => {
                          if (params.value === null) {
                            return <span style={{ color: 'var(--text-secondary, #888)', fontStyle: 'italic' }}>null</span>;
                          }
                          if (typeof params.value === 'boolean') {
                            return String(params.value);
                          }
                          if (typeof params.value === 'object') {
                            return JSON.stringify(params.value);
                          }
                          return params.value;
                        }
                      }}
                      pagination={true}
                      paginationPageSize={100}
                    />
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
