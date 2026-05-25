import React, { useRef, useCallback, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react';
import { Hand, MousePointer } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';

const CanvasContent = ({
  nodes,
  nodeTypes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeSelect,
  onEdgeSelect,
  onAddNode,
  onNodesDelete,
  onEdgesDelete,
}) => {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');

      // Check if dropped element is valid
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      onAddNode(type, position);
    },
    [screenToFlowPosition, onAddNode]
  );

  const onNodeClick = useCallback((event, node) => {
    onNodeSelect(node);
    if (onEdgeSelect) onEdgeSelect(null);
  }, [onNodeSelect, onEdgeSelect]);

  const onEdgeClick = useCallback((event, edge) => {
    if (onEdgeSelect) onEdgeSelect(edge);
    onNodeSelect(null);
  }, [onEdgeSelect, onNodeSelect]);

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
    if (onEdgeSelect) onEdgeSelect(null);
  }, [onNodeSelect, onEdgeSelect]);

  const [isPanMode, setIsPanMode] = useState(true);

  return (
    <div
      ref={reactFlowWrapper}
      className="canvas-container"
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Canvas Interaction Modes */}
      <div className="canvas-mode-controls">
        <button
          className={`mode-btn ${isPanMode ? 'active' : ''}`}
          onClick={() => setIsPanMode(true)}
          title="Pan Mode (Drag to move canvas)"
        >
          <Hand size={14} />
          <span>Pan</span>
        </button>
        <button
          className={`mode-btn ${!isPanMode ? 'active' : ''}`}
          onClick={() => setIsPanMode(false)}
          title="Select Mode (Drag to draw selection box)"
        >
          <MousePointer size={14} />
          <span>Select Box</span>
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        snapToGrid={true}
        snapGrid={[16, 16]}
        panOnDrag={isPanMode}
        selectionOnDrag={!isPanMode}
        selectionMode={SelectionMode.Partial}
        fitView
        fitViewOptions={{ maxZoom: 1.1, padding: 0.2 }}
        defaultViewport={{ x: 50, y: 50, zoom: 1.1 }}
      >
        <Controls showInteractive={false} style={{ bottom: 15, left: 15 }} />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="rgba(0, 0, 0, 0.08)" />
      </ReactFlow>
    </div>
  );
};

// Wrap in ReactFlowProvider to enable screenToFlowPosition hook
const Canvas = (props) => (
  <ReactFlowProvider>
    <CanvasContent {...props} />
  </ReactFlowProvider>
);

export default Canvas;
