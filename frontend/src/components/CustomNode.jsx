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
  } else if (type === 'browse' || type === 'browse') {
    description = 'View Data';
  } else if (data?.description) {
    description = data.description;
  }

  return (
    <div className={`custom-node ${category} ${selected ? 'selected' : ''}`}>
      {/* Target port (Left) for all nodes except FileInput and ImageCaption */}
      {type !== 'fileInput' && type !== 'imageCaption' && (
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="node-handle left-handle"
        />
      )}

      {/* Node Square Box (The tool icon) */}
      <div className={`node-icon-box ${category} ${status} ${selected ? 'selected' : ''}`}>
        <IconComponent size={16} className="node-icon" />
        
        {/* Status indicator on the top corner */}
        {status !== 'idle' && (
          <div className={`node-status-dot ${status}`} title={`Status: ${status}`} />
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

      {/* Source port (Right) for all nodes */}
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
      ) : type !== 'browse' ? (
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
