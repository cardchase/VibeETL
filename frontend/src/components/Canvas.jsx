import React, { useRef, useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow,
  Controls,
  ControlButton,
  Background,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
  Panel
} from '@xyflow/react';
import { Hand, MousePointer, Search, X, Box, Wand, CheckSquare, Check, Copy, Scissors, ClipboardPaste, Trash2, Maximize } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';
import ContainerNode from './ContainerNode';
import { useSettings } from '../contexts/SettingsContext';

const nodeTypes = {
  vibeNode: CustomNode,
  container: ContainerNode
};

const FindNodePanel = ({ nodes, onNodeSelect }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const { setCenter } = useReactFlow();

  useEffect(() => {
    const handleOpenFind = () => {
      setIsOpen(true);
    };
    window.addEventListener('vibe-open-find', handleOpenFind);
    return () => window.removeEventListener('vibe-open-find', handleOpenFind);
  }, []);

  const matchingNodes = query.trim() ? nodes.filter(n => 
    n.id.toLowerCase().includes(query.toLowerCase()) || 
    (n.data?.label || '').toLowerCase().includes(query.toLowerCase())
  ) : [];

  const handleSelect = (node) => {
    // Pan to node
    setCenter(node.position.x + 50, node.position.y + 50, { zoom: 1.2, duration: 800 });
    // Select node
    onNodeSelect(node);
    // Close search
    setIsOpen(false);
    setQuery('');
  };

  return (
    <Panel position="top-right" className="find-node-panel" style={{ right: '64px', top: '16px' }}>
      {isOpen && (
        <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', width: '250px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #e2e8f0' }}>
            <Search size={14} style={{ color: '#94a3b8', marginRight: '8px' }} />
            <input 
              autoFocus
              type="text" 
              placeholder="Find by ID or Name..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '12px' }}
            />
            <button onClick={() => { setIsOpen(false); setQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#94a3b8' }}>
              <X size={14} />
            </button>
          </div>
          {query.trim() && (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {matchingNodes.length === 0 ? (
                <div style={{ padding: '12px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>No tools found</div>
              ) : (
                matchingNodes.map(node => (
                  <div 
                    key={node.id}
                    onClick={() => handleSelect(node)}
                    style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', borderBottom: '1px solid #f1f5f9', ':hover': { backgroundColor: '#f8fafc' } }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{node.data?.label || 'Node'}</span>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>ID: {node.id}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};

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
  onNodeDragStop,
  initialViewport,
  onMoveEnd,
  onCopyConfig,
  onPasteConfig,
}) => {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition, fitView, getViewport, setViewport, getNodes, setCenter } = useReactFlow();
  const [isPanMode, setIsPanMode] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [menuConfig, setMenuConfig] = useState({ visible: false, x: 0, y: 0, type: null, nodeId: null });
  const [minimapTarget, setMinimapTarget] = useState(null);
  const { settings } = useSettings();
  
  // Continuously monitor for minimap portal target changes since ConfigWindow remounts it
  useEffect(() => {
    const interval = setInterval(() => {
      const el = document.getElementById('minimap-portal-target');
      // Update state if the element is different from the currently stored one
      setMinimapTarget(prevEl => (prevEl !== el ? el : prevEl));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));
  };
  const handleCut = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true }));
  };
  const handlePaste = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }));
  };
  const handleDelete = () => {
    const selectedNodes = nodes.filter(n => n.selected);
    const selectedEdgesList = edges.filter(e => e.selected);
    
    if (selectedNodes.length > 0) {
      const selectedNodeIds = selectedNodes.map(n => n.id);
      if (onNodesDelete) onNodesDelete(selectedNodes);
      onNodesChange(selectedNodes.map(n => ({ id: n.id, type: 'remove' })));
      
      const connectedEdges = edges.filter(e => selectedNodeIds.includes(e.source) || selectedNodeIds.includes(e.target));
      if (connectedEdges.length > 0) {
        if (onEdgesDelete) onEdgesDelete(connectedEdges);
        onEdgesChange(connectedEdges.map(e => ({ id: e.id, type: 'remove' })));
      }
    }
    if (selectedEdgesList.length > 0) {
      if (onEdgesDelete) onEdgesDelete(selectedEdgesList);
      onEdgesChange(selectedEdgesList.map(e => ({ id: e.id, type: 'remove' })));
    }
  };
  const handleSelectAll = () => {
    const changes = nodes.map(n => ({ id: n.id, type: 'select', selected: true }));
    console.log('Changes:', changes, 'Nodes:', nodes); onNodesChange(changes);
  };

  useEffect(() => {
    const handleFitView = () => {
      // 1. Fit the view to get optimal zoom to fit the entire workflow
      fitView({ padding: 0.1, maxZoom: 1.0, minZoom: 0.05, duration: 0 });
      
      // 2. Adjust it immediately to be left-aligned
      setTimeout(() => {
        const { x, y, zoom } = getViewport();
        const nodesList = getNodes();
        if (nodesList.length === 0) return;
        
        let minX = Infinity;
        nodesList.forEach(n => {
          if (n.position.x < minX) minX = n.position.x;
        });
        
        // Use the optimal zoom calculated by fitView (capped at 1.0)
        const newZoom = zoom;
        
        // 96px is approximately 1 inch. Calculate X so the leftmost node is at 96px.
        // screenX = nodeFlowX * zoom + viewportX  =>  96 = minX * newZoom + newX
        const newX = 96 - minX * newZoom;
        
        setViewport({ x: newX, y, zoom: newZoom }, { duration: 0 });
        if (onMoveEnd) {
          onMoveEnd(null, { x: newX, y, zoom: newZoom });
        }
      }, 50);
    };
    window.addEventListener('vibe-fit-view', handleFitView);
    return () => window.removeEventListener('vibe-fit-view', handleFitView);
  }, [fitView, getViewport, setViewport, getNodes, onMoveEnd]);

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

      let position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Check for Drop on Wire
      let splitEdgeId = null;
      let minDistance = 40; // 40 pixel threshold
      
      for (const edge of edges) {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        if (sourceNode && targetNode) {
          const ax = sourceNode.position.x + (sourceNode.measured?.width || 150);
          const ay = sourceNode.position.y + (sourceNode.measured?.height || 80) / 2;
          const bx = targetNode.position.x;
          const by = targetNode.position.y + (targetNode.measured?.height || 80) / 2;
          
          const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
          let dist = 0;
          if (l2 === 0) {
            dist = Math.hypot(position.x - ax, position.y - ay);
          } else {
            let t = ((position.x - ax) * (bx - ax) + (position.y - ay) * (by - ay)) / l2;
            t = Math.max(0, Math.min(1, t));
            const projX = ax + t * (bx - ax);
            const projY = ay + t * (by - ay);
            dist = Math.hypot(position.x - projX, position.y - projY);
          }
          
          if (dist < minDistance) {
            minDistance = dist;
            splitEdgeId = edge.id;
          }
        }
      }

      if (splitEdgeId) {
        onAddNode(type, position, null, splitEdgeId);
      } else {
        onAddNode(type, position);
      }
    },
    [screenToFlowPosition, onAddNode, nodes, edges]
  );

  const onNodeClick = useCallback((event, node) => {
    setMenuConfig({ visible: false, x: 0, y: 0, type: null, nodeId: null });
    onNodeSelect(node);
    if (onEdgeSelect) onEdgeSelect(null);
  }, [onNodeSelect, onEdgeSelect]);

  const onEdgeClick = useCallback((event, edge) => {
    if (onEdgeSelect) onEdgeSelect(edge ? edge.id : null);
    onNodeSelect(null);
  }, [onEdgeSelect, onNodeSelect]);

  const [lastClickedPosition, setLastClickedPosition] = useState(null);

  const onPaneClick = useCallback((event) => {
    setMenuConfig({ visible: false, x: 0, y: 0, type: null, nodeId: null });
    onNodeSelect(null);
    if (onEdgeSelect) onEdgeSelect(null);
    
    if (reactFlowWrapper.current && event) {
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setLastClickedPosition(position);
    }
  }, [onNodeSelect, onEdgeSelect, screenToFlowPosition]);


  // Listen for add node events from ToolPalette
  useEffect(() => {
    const handleAddNodeEvent = (e) => {
      const type = e.detail.type;
      const explicitPosition = e.detail.position;
      const splitEdgeId = e.detail.splitEdgeId;
      
      if (reactFlowWrapper.current) {
        let position;
        let anchorNodeId = null;
        
        if (explicitPosition) {
          position = explicitPosition;
        } else {
          const selectedNodes = nodes.filter(n => n.selected);
          if (selectedNodes.length > 0) {
            // If a node is explicitly selected, place it to the right of that node
            const refNode = selectedNodes[selectedNodes.length - 1];
            anchorNodeId = refNode.id;
            position = {
              x: refNode.position.x + (refNode.width || 150) + 60,
              y: refNode.position.y
            };
          } else {
            // Fallback for empty canvas or no selection: use last clicked position OR center of viewport
            if (lastClickedPosition) {
              position = lastClickedPosition;
            } else {
              const bounds = reactFlowWrapper.current.getBoundingClientRect();
              position = screenToFlowPosition({
                x: bounds.x + bounds.width / 2 - 100,
                y: bounds.y + bounds.height / 2 - 50,
              });
            }
          }
          
          // Prevent stacking via Vertical Deflection ONLY for auto-layout
          let conflict = true;
          let loopCounter = 0;
          
          while (conflict && loopCounter < 50) {
            // eslint-disable-next-line no-loop-func
            conflict = nodes.some(n => 
              Math.abs(n.position.x - position.x) < 160 && 
              Math.abs(n.position.y - position.y) < 100
            );
            
            if (conflict) {
              loopCounter++;
              // Shift exactly "1 tool height + spacing" downward
              position = {
                x: position.x,
                y: position.y + (80) + 60
              };
            }
          }
        }

        onAddNode(type, position, anchorNodeId, splitEdgeId);
      }
    };
    window.addEventListener('vibe-add-node', handleAddNodeEvent);
    return () => window.removeEventListener('vibe-add-node', handleAddNodeEvent);
  }, [screenToFlowPosition, onAddNode, nodes, setCenter, getViewport]);

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
        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 4px' }} />
        <button
          className="mode-btn"
          onClick={handleSelectAll}
          title="Select All Nodes"
        >
          <CheckSquare size={14} />
          <span>Select All</span>
        </button>

        <button
          className="mode-btn"
          onClick={handlePaste}
          title="Paste Nodes"
        >
          <ClipboardPaste size={14} />
          <span>Paste</span>
        </button>

        {(nodes.filter(n => n.selected && n.type !== 'container').length > 0 || edges.filter(e => e.selected).length > 0) && (
          <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 4px' }} />
        )}
        {(nodes.filter(n => n.selected && n.type !== 'container').length > 0 || edges.filter(e => e.selected).length > 0) && (
          <>
            {nodes.filter(n => n.selected && n.type !== 'container').length > 0 && (
              <button
                className="mode-btn"
                onClick={() => {
                  handleCopy();
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 1500);
                }}
                title="Copy Selected Nodes"
              >
                {isCopied ? <CheckSquare size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
                <span style={isCopied ? { color: 'var(--color-success)', fontWeight: 600 } : {}}>
                  {isCopied ? 'Copied!' : 'Copy'}
                </span>
              </button>
            )}
            {nodes.filter(n => n.selected && n.type !== 'container').length > 0 && (
              <button
                className="mode-btn"
                onClick={handleCut}
                title="Cut Selected Nodes"
              >
                <Scissors size={14} />
                <span>Cut</span>
              </button>
            )}
            {nodes.filter(n => n.selected && n.type !== 'container').length === 1 && (
              <>
                <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 4px' }} />
                <button
                  className="mode-btn"
                  onClick={() => {
                    const selectedNode = nodes.find(n => n.selected && n.type !== 'container');
                    if (onCopyConfig) onCopyConfig(selectedNode);
                  }}
                  title="Copy Tool Logic/Config"
                >
                  <Copy size={14} />
                  <span>Copy Config</span>
                </button>
                <button
                  className="mode-btn"
                  onClick={() => {
                    const selectedNode = nodes.find(n => n.selected && n.type !== 'container');
                    if (onPasteConfig) onPasteConfig(selectedNode);
                  }}
                  title="Paste Tool Logic/Config"
                >
                  <ClipboardPaste size={14} />
                  <span>Paste Config</span>
                </button>
              </>
            )}
            <button
              className="mode-btn"
              onClick={handleDelete}
              title="Delete Selected Nodes"
              style={{ color: '#ef4444' }}
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
            {nodes.filter(n => n.selected && n.type !== 'container').length > 0 && (
              <button
                className="mode-btn"
                onClick={() => {
                  const selectedNodes = nodes.filter(n => n.selected && n.type !== 'container');
                  if (selectedNodes.length === 0) return;
                  
                  // Calculate bounding box
                  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                  selectedNodes.forEach(n => {
                    if (n.position.x < minX) minX = n.position.x;
                    if (n.position.y < minY) minY = n.position.y;
                    if (n.position.x + (n.width || 150) > maxX) maxX = n.position.x + (n.width || 150);
                    if (n.position.y + (n.height || 60) > maxY) maxY = n.position.y + (n.height || 60);
                  });

                // Add padding
                minX -= 40;
                minY -= 60; // Extra for header
                maxX += 40;
                maxY += 40;

                // Fire custom event to create container and group nodes
                window.dispatchEvent(new CustomEvent('vibe-create-container', {
                  detail: {
                    x: minX,
                    y: minY,
                    width: maxX - minX,
                    height: maxY - minY,
                    childIds: selectedNodes.map(n => n.id)
                  }
                }));
              }}
              title="Group selected nodes into a container"
              style={{ color: '#2563eb', fontWeight: 600, background: 'rgba(37, 99, 235, 0.1)' }}
            >
              <Box size={14} />
              <span>Put in Container</span>
            </button>
            )}
          </>
        )}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges.map(e => ({ ...e, type: settings?.wireStyle || 'smoothstep' }))}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        onMoveEnd={onMoveEnd}
        onNodesDelete={(nodes) => {
          const activeTag = document.activeElement?.tagName;
          if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
            return;
          }
          if (onNodesDelete) onNodesDelete(nodes);
        }}
        onEdgesDelete={onEdgesDelete}
        minZoom={0.05}
        snapToGrid={true}
        snapGrid={[16, 16]}
        panOnDrag={isPanMode}
        selectionOnDrag={!isPanMode}
        selectionMode={SelectionMode.Partial}
        connectionRadius={50}
        defaultViewport={initialViewport || { x: 50, y: 50, zoom: 1.0 }}
      >
        <Controls showInteractive={false} showFitView={false} style={{ bottom: 15, left: 15 }}>
          <ControlButton onClick={() => window.dispatchEvent(new Event('vibe-fit-view'))} title="fit view">
            <Maximize size={16} />
          </ControlButton>
        </Controls>
        <Background 
          variant={
            settings?.canvasBackground === 'lines' ? BackgroundVariant.Lines : 
            settings?.canvasBackground === 'cross' ? BackgroundVariant.Cross : 
            BackgroundVariant.Dots
          } 
          gap={16} 
          size={1} 
          color={settings?.theme === 'dark' ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"} 
        />
        <FindNodePanel nodes={nodes} onNodeSelect={onNodeSelect} />
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
