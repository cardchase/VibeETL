import React, { memo } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import * as Icons from 'lucide-react';

const CustomNode = ({ id, data, selected, type }) => {
  const IconComponent = data.icon ? (Icons[data.icon] || Icons.Square) : Icons.Square;
  const category = data?.category || 'inout';
  const status = data?.status || 'idle'; // idle, success, error, running
  
  const reactFlow = useReactFlow();

  // Determine display description dynamically based on common parameter fields (supports custom tools out-of-the-box!)
  let description = '';
  if (data?.parameters?.filePath) {
    description = data.parameters.filePath;
  } else if (data?.parameters?.outputPath) {
    description = data.parameters.outputPath;
  } else if (data?.parameters?.tableName) {
    description = `Table: ${data.parameters.tableName}`;
  } else if (data?.parameters?.connectionString) {
    description = data.parameters.connectionString;
  } else if (data?.parameters?.pattern) {
    description = `/${data.parameters.pattern}/`;
  } else if (data?.parameters?.imagePath) {
    description = data.parameters.imagePath;
  } else if (data?.parameters?.column) {
    const op = data.parameters.operator || '';
    const val = data.parameters.value || '';
    const dir = data.parameters.descending !== undefined ? (data.parameters.descending ? 'DESC' : 'ASC') : '';
    description = `${data.parameters.column}${op ? ' ' + op : ''}${val ? ' ' + val : ''}${dir ? ' ' + dir : ''}`;
  } else if (data?.parameters?.columns && Array.isArray(data.parameters.columns)) {
    const activeCols = data.parameters.columns.filter(c => c && c.keep).length;
    description = `${activeCols} cols`;
  } else if (type === 'browse') {
    description = 'View Data';
  } else if (data?.description) {
    description = data.description;
  }

  // If node has executed successfully, replace the sub-label with the output row counts!
  if (status === 'success' && data?.resultSummary) {
    if (type === 'filter' && data.resultSummary.ports) {
      const trueCount = data.resultSummary.ports['true']?.row_count || 0;
      const falseCount = data.resultSummary.ports['false']?.row_count || 0;
      description = `T: ${trueCount} | F: ${falseCount} rows`;
    } else if (type === 'join') {
      const edges = reactFlow.getEdges();
      const nodes = reactFlow.getNodes();
      const leftEdge = edges.find(e => e.target === id && e.targetHandle === 'left');
      const rightEdge = edges.find(e => e.target === id && e.targetHandle === 'right');
      const leftNode = leftEdge ? nodes.find(n => n.id === leftEdge.source) : null;
      const rightNode = rightEdge ? nodes.find(n => n.id === rightEdge.source) : null;
      
      const leftCount = leftNode?.data?.resultSummary?.row_count ?? '?';
      const rightCount = rightNode?.data?.resultSummary?.row_count ?? '?';
      const outCount = data.resultSummary.row_count ?? 0;
      
      description = `L:${leftCount} R:${rightCount} ➔ ${outCount}`;
    } else if (type === 'union') {
      const edges = reactFlow.getEdges();
      const nodes = reactFlow.getNodes();
      const incomingEdges = edges.filter(e => e.target === id);
      const incomingCounts = incomingEdges.map(e => {
        const sourceNode = nodes.find(n => n.id === e.source);
        const count = sourceNode?.data?.resultSummary?.row_count ?? '?';
        return `[${e.source}]: ${count}`;
      });
      const inStr = incomingCounts.length > 0 ? incomingCounts.join('\n') : '0';
      const outCount = data.resultSummary.row_count ?? 0;
      description = `In:\n${inStr}\n➔ Out: ${outCount}`;
    } else if (data.resultSummary.row_count !== undefined) {
      if (description && type !== 'select' && type !== 'formula' && type !== 'cleanse') {
        description = `${description}\n➔ Out: ${data.resultSummary.row_count} rows`;
      } else {
        description = `${data.resultSummary.row_count} rows`;
      }
    }
  }

  const isCached = data?.parameters?.isCached || false;

  const handleAnchorClick = (e, handleType, handleId) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('vibe-handle-click', { 
      detail: { nodeId: id, handleType, handleId } 
    }));
  };

  const buildTooltip = () => {
    let t = `${data?.label || type} Tool`;
    if (data?.description) t += `\n${data.description}`;
    t += `\nStatus: ${status}`;
    if (data?.parameters && Object.keys(data.parameters).length > 0) {
      t += `\nConfig: ${Object.keys(data.parameters).join(', ')}`;
    }
    if (status === 'skipped') t += `\n(Bypassed: Data is cached downstream)`;
    return t;
  };

  return (
    <div 
      className={`custom-node ${category} ${selected ? 'selected' : ''} ${isCached ? 'is-cached' : ''}`} 
      style={status === 'skipped' ? { opacity: 0.55 } : {}}
      title={buildTooltip()}
    >
      {/* Target port (Left) for all nodes except FileInput, DatabaseInput, and ImageCaption */}
      {type === 'join' ? (
        <>
          <div className="join-port-label left-label">L</div>
          <Handle
            type="target"
            position={Position.Left}
            id="left"
            style={{ top: '30%' }}
            className="node-handle left-handle join-left-handle"
            onClick={(e) => handleAnchorClick(e, 'target', 'left')}
          />
          <div className="join-port-label right-label">R</div>
          <Handle
            type="target"
            position={Position.Left}
            id="right"
            style={{ top: '70%' }}
            className="node-handle left-handle join-right-handle"
            onClick={(e) => handleAnchorClick(e, 'target', 'right')}
          />
        </>
      ) : (!['file_input', 'fileInput', 'database_input', 'databaseInput', 'image_caption', 'imageCaption', 'gcs_in', 'gcsIn', 'google_sheets_in', 'googleSheetsIn'].includes(type)) ? (
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="node-handle left-handle"
          onClick={(e) => handleAnchorClick(e, 'target', 'input')}
        />
      ) : null}

      {/* Node ID label floating above the square box */}
      <div style={{ position: 'absolute', top: '-14px', width: '100px', textAlign: 'center', opacity: 0.4, fontSize: '0.55em', fontWeight: 'normal', color: 'var(--text-muted)', pointerEvents: 'none', left: '50%', transform: 'translateX(-50%)' }}>
        [{id}]
      </div>

      {/* Node Square Box (The tool icon) */}
      <div className={`node-icon-box ${category} ${status} ${selected ? 'selected' : ''}`}>
        <IconComponent size={12} className="node-icon" />
        
        {/* Status indicator on the top corner */}
        {status !== 'idle' && status !== 'waiting' && status !== 'running' && status !== 'skipped' && (
          <div className={`node-status-dot ${status}`} title={`Status: ${status}`} />
        )}
        {status === 'running' && (
          <div className="node-status-running" title="Processing...">
            <Icons.Loader2 size={12} className="animate-spin" style={{ color: '#3b82f6' }} />
          </div>
        )}
        {status === 'skipped' && (
          <div className="node-status-skipped" title="Bypassed: Data is cached downstream" style={{
            position: 'absolute', top: -6, right: -6, background: '#f1f5f9', border: '1px solid #cbd5e1', 
            borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10
          }}>
            <Icons.FastForward size={10} style={{ color: '#64748b' }} />
          </div>
        )}
        
        {/* Cached indicator on the top left corner */}
        {isCached && (
          <div className="node-cached-icon" title="Node Output is Cached">
            <span style={{ fontSize: '10px', fontWeight: 'bold' }}>©</span>
          </div>
        )}
      </div>

      {/* Node Labels floating underneath the square box */}
      <div className="node-labels-container">
        <div className="node-label-main" style={{ textAlign: 'center' }}>
          {data?.label || 'Node'}
        </div>
        {description && (
          <div className="node-label-sub" title={description}>
            {description}
          </div>
        )}
      </div>

      {/* Source port (Right) for all nodes except terminal nodes */}
      {type === 'filter' ? (
        <>
          <div className="filter-port-label true-label">T</div>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: '30%' }}
            className="node-handle right-handle true-handle"
            onClick={(e) => handleAnchorClick(e, 'source', 'true')}
          />
          <div className="filter-port-label false-label">F</div>
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ top: '70%' }}
            className="node-handle right-handle false-handle"
            onClick={(e) => handleAnchorClick(e, 'source', 'false')}
          />
        </>
      ) : (!['browse', 'file_output', 'fileOutput', 'database_output', 'databaseOutput', 'gcs_out', 'gcsOut', 'google_sheets_out', 'googleSheetsOut'].includes(type)) ? (
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="node-handle right-handle"
          onClick={(e) => handleAnchorClick(e, 'source', 'output')}
        />
      ) : null}
    </div>
  );
};

export default memo(CustomNode);
