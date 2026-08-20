import React, { memo } from 'react';
import { NodeResizer, Handle, Position } from '@xyflow/react';
import { Box, Power, PowerOff, Minimize2, Maximize2 } from 'lucide-react';

const ContainerNode = ({ id, data, selected }) => {
  const isEnabled = data.enabled !== false;
  const isMinimized = data.minimized === true;
  
  const handleToggle = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('vibe-toggle-container', {
      detail: { nodeId: id, enabled: !isEnabled }
    }));
  };

  const handleToggleMinimize = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('vibe-toggle-minimize-container', {
      detail: { nodeId: id, minimized: !isMinimized }
    }));
  };

  return (
    <>
      <NodeResizer 
        color="#2563eb" 
        isVisible={selected} 
        minWidth={200} 
        minHeight={150} 
      />
      <div 
        style={{ 
          width: '100%', 
          height: '100%', 
          backgroundColor: isEnabled ? (data.backgroundColor || 'rgba(250, 204, 21, 0.25)') : 'rgba(156, 163, 175, 0.2)',
          border: `2px solid ${isEnabled ? (data.borderColor || 'rgba(250, 204, 21, 0.6)') : 'rgba(156, 163, 175, 0.5)'}`,
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: -1
        }}
      >
        {isMinimized && <Handle type="target" position={Position.Left} id="input" style={{ opacity: 0 }} />}
        {isMinimized && <Handle type="source" position={Position.Right} id="output" style={{ opacity: 0 }} />}
        <div 
          className="container-drag-handle"
          style={{
            height: '30px',
            backgroundColor: isEnabled ? (data.backgroundColor ? data.backgroundColor.replace('0.25', '0.4') : 'rgba(250, 204, 21, 0.4)') : 'rgba(156, 163, 175, 0.4)',
            borderBottom: `1px solid ${isEnabled ? (data.borderColor || 'rgba(250, 204, 21, 0.6)') : 'rgba(156, 163, 175, 0.5)'}`,
            borderTopLeftRadius: '6px',
            borderTopRightRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 10px',
            cursor: 'grab'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Box size={14} color={isEnabled ? '#ca8a04' : '#6b7280'} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: isEnabled ? '#854d0e' : '#4b5563' }}>
              {data.parameters?.label || data.label || 'Tool Container'}
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button 
              onClick={handleToggleMinimize}
              title={isMinimized ? "Expand Container" : "Minimize Container"}
              style={{ 
                background: 'none', 
                border: 'none', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                color: '#6b7280',
                borderRadius: '4px',
                transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
            <button 
              onClick={handleToggle}
              title={isEnabled ? "Disable Container" : "Enable Container"}
              style={{ 
                background: 'none', 
                border: 'none', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                color: isEnabled ? '#16a34a' : '#9ca3af',
                borderRadius: '4px',
                transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              {isEnabled ? <Power size={14} /> : <PowerOff size={14} />}
            </button>
          </div>
        </div>
        
        {/* Child nodes will render over this empty body */}
        <div style={{ flex: 1, pointerEvents: 'none' }} />
      </div>
    </>
  );
};

export default memo(ContainerNode);
