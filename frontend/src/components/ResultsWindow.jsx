import React, { useState } from 'react';
import { Terminal, Database, FileText, Copy, Check } from 'lucide-react';

const ResultsWindow = ({ selectedNode, results, globalLogs, style = {} }) => {
  const [activeTab, setActiveTab] = useState('data'); // 'logs' or 'data'
  const [selectedPort, setSelectedPort] = useState(null);
  const [prevNodeId, setPrevNodeId] = useState(null);
  const [copied, setCopied] = useState(false);

  const nodeId = selectedNode?.id;

  // Reset selectedPort if we select a different node
  if (nodeId !== prevNodeId) {
    setPrevNodeId(nodeId);
    setSelectedPort(null);
  }

  const nodeResult = nodeId ? results?.[nodeId] : null;
  const hasPorts = nodeResult?.ports && Object.keys(nodeResult.ports).length > 0;
  const availablePorts = hasPorts ? Object.keys(nodeResult.ports) : [];

  // Determine active port to show. Default to 'true' if available, otherwise first port, or fallback to default
  const activePort = selectedPort || (availablePorts.includes('true') ? 'true' : (availablePorts[0] || null));
  const activePortData = hasPorts && activePort ? nodeResult.ports[activePort] : null;

  // Extract preview data and columns
  const schema = activePortData ? (activePortData.schema || []) : (nodeResult?.schema || []);
  const previewData = activePortData ? (activePortData.preview || []) : (nodeResult?.preview || []);
  const rowCount = activePortData ? (activePortData.row_count || 0) : (nodeResult?.row_count || 0);
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
                Node '{selectedNode.data?.label || selectedNode.id}' {hasPorts ? `[Port: ${activePort === 'true' ? 'True' : activePort === 'false' ? 'False' : activePort}]` : ''}: <strong>{rowCount}</strong> rows, <strong>{colCount}</strong> columns ({typeof duration === 'number' ? duration.toFixed(0) : '0'}ms)
              </span>
            ) : status === 'error' ? (
              <span style={{ color: 'var(--color-error)' }}>
                Node '{selectedNode.data?.label || selectedNode.id}' failed.
              </span>
            ) : (
              <span>Node '{selectedNode.data?.label || selectedNode.id}' (Not executed)</span>
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
              <div className="no-node-selected" style={{ color: 'var(--color-error)', padding: 20 }}>
                <span style={{ fontSize: '2.5rem', marginBottom: 10 }}>&otimes;</span>
                <p style={{ fontWeight: 600 }}>Execution Failed</p>
                <p style={{ fontSize: '0.85rem', marginTop: 5, maxWidth: '500px' }}>{error}</p>
              </div>
            ) : status === 'success' ? (
              previewData.length > 0 ? (
                <div className="spreadsheet-container">
                  <table className="spreadsheet">
                    <thead>
                      <tr>
                        {schema.map((col) => (
                          <th key={col.name}>
                            {col.name}
                            <span className="col-header-type">
                              {col.type && typeof col.type === 'string' ? col.type.split('.').pop() : 'Unknown'}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, rowIdx) => (
                        <tr key={rowIdx}>
                          {schema.map((col) => (
                            <td key={col.name} title={String(row[col.name] ?? '')}>
                              {row[col.name] !== null && row[col.name] !== undefined ? String(row[col.name]) : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
