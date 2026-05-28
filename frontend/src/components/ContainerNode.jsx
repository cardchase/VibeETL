import React, { memo } from 'react';
import { NodeResizer } from '@xyflow/react';
import { Box, Power, PowerOff } from 'lucide-react';

const ContainerNode = ({ id, data, selected }) => {
  const isEnabled = data.enabled !== false;
  
  const handleToggle = (e) => {
    e.stopPropagation();
    // Dispatch a custom event to update the node's enabled state
    window.dispatchEvent(new CustomEvent('vibe-toggle-container', {
      detail: { nodeId: id, enabled: !isEnabled }
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
          backgroundColor: isEnabled ? 'rgba(37, 99, 235, 0.05)' : 'rgba(156, 163, 175, 0.1)',
          border: `2px solid ${isEnabled ? 'rgba(37, 99, 235, 0.3)' : 'rgba(156, 163, 175, 0.5)'}`,
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}
      >
        <div 
          className="container-drag-handle"
          style={{
            height: '30px',
            backgroundColor: isEnabled ? 'rgba(37, 99, 235, 0.15)' : 'rgba(156, 163, 175, 0.3)',
            borderBottom: `1px solid ${isEnabled ? 'rgba(37, 99, 235, 0.3)' : 'rgba(156, 163, 175, 0.5)'}`,
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
            <Box size={14} color={isEnabled ? '#2563eb' : '#6b7280'} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: isEnabled ? '#1e3a8a' : '#4b5563' }}>
              {data.label || 'Tool Container'}
            </span>
          </div>
          
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
              padding: '2px',
              color: isEnabled ? '#16a34a' : '#9ca3af'
            }}
          >
            {isEnabled ? <Power size={14} /> : <PowerOff size={14} />}
          </button>
        </div>
        
        {/* Child nodes will render over this empty body */}
        <div style={{ flex: 1, pointerEvents: 'none' }} />
      </div>
    </>
  );
};

export default memo(ContainerNode);
