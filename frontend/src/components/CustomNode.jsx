import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import * as Icons from 'lucide-react';

const CustomNode = ({ id, data, selected, type }) => {
  const IconComponent = data.icon ? (Icons[data.icon] || Icons.Square) : Icons.Square;
  const category = data?.category || 'inout';
  const status = data?.status || 'idle'; // idle, success, error, running

  // Determine display description dynamically based on common parameter fields (supports custom tools out-of-the-box!)
  let description = '';
  if (data?.parameters?.filePath) {
    description = data.parameters.filePath;
  } else if (data?.parameters?.outputPath) {
    description = data.parameters.outputPath;
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
    } else if (data.resultSummary.row_count !== undefined) {
      description = `${data.resultSummary.row_count} rows`;
    }
  }

  const isCached = data?.parameters?.isCached || false;

  return (
    <div className={`custom-node ${category} ${selected ? 'selected' : ''} ${isCached ? 'is-cached' : ''}`}>
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
          />
          <div className="join-port-label right-label">R</div>
          <Handle
            type="target"
            position={Position.Left}
            id="right"
            style={{ top: '70%' }}
            className="node-handle left-handle join-right-handle"
          />
        </>
      ) : (type !== 'fileInput' && type !== 'databaseInput' && type !== 'imageCaption') ? (
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="node-handle left-handle"
        />
      ) : null}

      {/* Node Square Box (The tool icon) */}
      <div className={`node-icon-box ${category} ${status} ${selected ? 'selected' : ''}`}>
        <IconComponent size={16} className="node-icon" />
        
        {/* Status indicator on the top corner */}
        {status !== 'idle' && status !== 'waiting' && status !== 'running' && (
          <div className={`node-status-dot ${status}`} title={`Status: ${status}`} />
        )}
        {status === 'running' && (
          <div className="node-status-running" title="Processing...">
            <Icons.Loader2 size={12} className="animate-spin" style={{ color: '#3b82f6' }} />
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
        <div className="node-label-main">{data?.label || 'Node'}</div>
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
          />
          <div className="filter-port-label false-label">F</div>
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ top: '70%' }}
            className="node-handle right-handle false-handle"
          />
        </>
      ) : (type !== 'browse' && type !== 'fileOutput' && type !== 'databaseOutput') ? (
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="node-handle right-handle"
        />
      ) : null}
    </div>
  );
};

export default memo(CustomNode);
