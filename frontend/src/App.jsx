import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import ToolPalette from './components/ToolPalette';
import Canvas from './components/Canvas';
import ConfigWindow from './components/ConfigWindow';
import ResultsWindow from './components/ResultsWindow';
import ErrorBoundary from './components/ErrorBoundary';
import CustomNode from './components/CustomNode';
import CommentNode from './components/CommentNode';
import ContainerNode from './components/ContainerNode';
import './App.css';
const getLayoutedElements = (nodes, edges) => {
  // Identify connected nodes
  const connectedNodeIds = new Set();
  edges.forEach((edge) => {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });

  const connectedNodes = nodes.filter(n => connectedNodeIds.has(n.id) && n.type !== 'container');
  const disconnectedNodes = nodes.filter(n => !connectedNodeIds.has(n.id) || n.type === 'container');

  if (connectedNodes.length === 0) return nodes;

  // Simple topological layout (bfs)
  let roots = connectedNodes.filter(n => !edges.some(e => e.target === n.id));
  if (roots.length === 0) roots = [connectedNodes[0]]; // fallback for cycles
  
  const visited = new Set();
  const nodeLevels = {}; // Map of nodeId -> level (x coordinate depth)
  
  const queue = [...roots];
  queue.forEach(q => { if (q) nodeLevels[q.id] = 0; });
  
  while(queue.length > 0) {
    const node = queue.shift();
    if(!node || visited.has(node.id)) continue;
    visited.add(node.id);
    
    const outgoingEdges = edges.filter(e => e.source === node.id);
    outgoingEdges.forEach(e => {
      nodeLevels[e.target] = Math.max(nodeLevels[e.target] || 0, nodeLevels[node.id] + 1);
      const targetNode = connectedNodes.find(n => n.id === e.target);
      if (targetNode) queue.push(targetNode);
    });
  }

  // Group nodes by level to calculate Y positions
  const levelCounts = {};
  const layoutedNodes = connectedNodes.map(node => {
    const level = nodeLevels[node.id] || 0;
    levelCounts[level] = (levelCounts[level] || 0) + 1;
    const yIndex = levelCounts[level] - 1;
    
    return {
      ...node,
      position: {
        x: 20 + level * 90, // 20px start, 90px interval (44px node + 46px right padding)
        y: 50 + yIndex * 120 // Vertical spacing
      }
    };
  });

  return [...layoutedNodes, ...disconnectedNodes];
};

// Dynamic API Base URL from environment variables
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// Initial nodes to populate the workspace with a working demo out-of-the-box
const initialNodes = [
  {
    id: 'node_1',
    type: 'fileInput',
    position: { x: 100, y: 180 },
    data: {
      label: 'File Input',
      category: 'inout',
      status: 'idle',
      icon: 'Database',
      parameters: {
        filePath: 'employees.csv',
        fileType: 'csv',
        csvDelimiter: ',',
        csvHeader: true,
        detectedSchema: [
          { name: 'Name', type: 'String' },
          { name: 'Age', type: 'Int64' },
          { name: 'Department', type: 'String' },
          { name: 'Salary', type: 'Int64' },
          { name: 'JoinDate', type: 'String' }
        ]
      }
    }
  },
  {
    id: 'node_2',
    type: 'filter',
    position: { x: 380, y: 180 },
    data: {
      label: 'Filter',
      category: 'prep',
      status: 'idle',
      icon: 'Filter',
      parameters: {
        column: 'Age',
        operator: '>',
        value: '30'
      }
    }
  }
];

const initialEdges = [
  {
    id: 'edge_1',
    source: 'node_1',
    target: 'node_2',
    sourcePort: 'output',
    targetPort: 'input',
    sourceHandle: 'output',
    targetHandle: 'input',
    style: { stroke: '#9ca3af', strokeWidth: 2 }
  }
];

// Recursive helper to resolve schema of any node in the pipeline
const resolveNodeSchema = (nodeId, nodes, edges, results = {}) => {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return [];

  // File Input returns its detected schema
  if (node.type === 'fileInput') {
    return node.data?.parameters?.detectedSchema || [];
  }

  // Image Caption returns its fixed schema
  if (node.type === 'imageCaption') {
    return [
      { name: 'ImagePath', type: 'String' },
      { name: 'ResolvedPath', type: 'String' },
      { name: 'Description', type: 'String' },
      { name: 'Dimensions', type: 'String' },
      { name: 'Format', type: 'String' }
    ];
  }

  // Find incoming connections
  const incomingEdges = edges.filter(
    (e) => e.target === nodeId && (e.targetPort === 'input' || e.targetHandle === 'input')
  );
  if (incomingEdges.length === 0) return [];

  // Resolve upstream node's schema recursively
  // If union, we merge all incoming schemas (deduplicated by name)
  let upstreamSchema = [];
  if (node.type === 'union' && incomingEdges.length > 1) {
    const allSchemas = incomingEdges.map(edge => resolveNodeSchema(edge.source, nodes, edges, results));
    const mergedMap = new Map();
    allSchemas.forEach(schema => {
      schema.forEach(col => {
        if (!mergedMap.has(col.name)) {
          mergedMap.set(col.name, col);
        }
      });
    });
    upstreamSchema = Array.from(mergedMap.values());
  } else {
    upstreamSchema = resolveNodeSchema(incomingEdges[0].source, nodes, edges, results);
  }

  // If node is select, modify the schema according to the select parameters
  if (node.type === 'select') {
    const selectCols = node.data?.parameters?.columns || [];
    if (selectCols.length === 0) {
      return upstreamSchema;
    }
    // Return columns that are kept, with their rename field
    // Return columns that are kept, with their rename field and potential new type
    return selectCols
      .filter(c => c && c.keep)
      .map(c => {
        const upstreamCol = upstreamSchema.find(uc => uc.name === c.name);
        return {
          name: c.rename || c.name,
          type: c.type || (upstreamCol ? upstreamCol.type : 'String')
        };
      });
  }

  // Regex appends new columns to the upstream schema
  if (node.type === 'regex') {
    const outputCols = node.data?.parameters?.outputColumns || [];
    const newSchema = outputCols.map(c => ({
      name: c.name || 'Unknown',
      type: c.type || 'String'
    }));
    return [...upstreamSchema, ...newSchema];
  }

  // Formula node appends or replaces a column
  if (node.type === 'formula') {
    const outputCol = node.data?.parameters?.output_column;
    if (outputCol) {
      const exists = upstreamSchema.some(c => c.name === outputCol);
      if (!exists) {
        return [...upstreamSchema, { name: outputCol, type: 'String' }];
      }
    }
    return upstreamSchema;
  }

  // Record ID appends a column
  if (node.type === 'record_id') {
    const outputCol = node.data?.parameters?.column_name || 'RecordID';
    const exists = upstreamSchema.some(c => c.name === outputCol);
    if (!exists) {
      return [{ name: outputCol, type: 'Int64' }, ...upstreamSchema];
    }
    return upstreamSchema;
  }

  // Pivot returns index columns + dynamic columns
  if (node.type === 'pivot') {
    const indices = node.data?.parameters?.index || [];
    return indices.map(i => ({ name: i, type: 'String' })).concat([{ name: '...Pivoted Columns', type: 'Any' }]);
  }

  // Unpivot returns id columns + variable_name + value_name
  if (node.type === 'unpivot') {
    const idVars = node.data?.parameters?.id_vars || [];
    const varName = node.data?.parameters?.variable_name || 'name';
    const valName = node.data?.parameters?.value_name || 'value';
    const idSchema = idVars.map(v => {
      const existing = upstreamSchema.find(s => s.name === v);
      return { name: v, type: existing ? existing.type : 'String' };
    });
    return [...idSchema, { name: varName, type: 'String' }, { name: valName, type: 'Any' }];
  }

  // Filter, Sort, Cleansing, Union, and File Output don't fundamentally change the column names (for simulation)
  return upstreamSchema;
};

const getInitialTabs = () => {
  try {
    const savedTabs = localStorage.getItem('vibeetl_autosave_workflow_tabs');
    if (savedTabs) {
      const parsed = JSON.parse(savedTabs);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    const savedSingle = localStorage.getItem('vibeetl_autosave_workflow');
    if (savedSingle) {
      const parsed = JSON.parse(savedSingle);
      return [{
        id: 'tab-1',
        name: 'Untitled Workflow',
        nodes: parsed.nodes || initialNodes,
        edges: parsed.edges || initialEdges,
        results: {},
        globalLogs: [],
        isDirty: false
      }];
    }
  } catch (e) {}
  return [{
    id: 'tab-1',
    name: 'Untitled Workflow',
    nodes: initialNodes,
    edges: initialEdges,
    results: {},
    globalLogs: [],
    isDirty: false
  }];
};

function App() {
  const [tabs, setTabs] = useState(getInitialTabs());
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id || 'tab-1');

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  
  const [nodes, setNodes, onNodesChangeCore] = useNodesState(activeTab.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(activeTab.edges || []);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(activeTab.results || {});
  const [globalLogs, setGlobalLogs] = useState(activeTab.globalLogs || []);
  const [isDirty, setIsDirty] = useState(activeTab.isDirty || false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectedHandle, setSelectedHandle] = useState(null);

  // Tab-Canvas Synchronization Hook
  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
      setNodes(tab.nodes || []);
      setEdges(tab.edges || []);
      setResults(tab.results || {});
      setGlobalLogs(tab.globalLogs || []);
      setIsDirty(tab.isDirty || false);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  }, [activeTabId, setNodes, setEdges]); // Explicitly omitted 'tabs' to prevent recursive rendering loops

  const isDraggingNode = React.useRef(false);

  const onNodesChange = useCallback((changes) => {
    onNodesChangeCore(changes);
    const isDrag = changes.some(c => c.type === 'position' || c.type === 'dimensions');
    if (isDrag) {
      isDraggingNode.current = true;
    }
  }, [onNodesChangeCore]);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);

  // Listen for snap layout event
  useEffect(() => {
    const handleSnapLayout = () => {
      try {
        setNodes((nds) => {
          const layouted = getLayoutedElements(nds, edges);
          setTimeout(() => window.dispatchEvent(new CustomEvent('vibe-fit-view')), 100);
          return layouted;
        });
      } catch (err) {
        alert("Snap Layout Error: " + err.message);
        console.error(err);
      }
    };
    window.addEventListener('vibe-snap-layout', handleSnapLayout);
    return () => window.removeEventListener('vibe-snap-layout', handleSnapLayout);
  }, [edges, setNodes]);
  // State hooks moved above the sync hook

  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const lastSavedState = React.useRef({ nodes: [], edges: [] });
  const isRestoring = React.useRef(false);

  // Clear history on tab change
  useEffect(() => {
    setPast([]);
    setFuture([]);
    lastSavedState.current = { nodes, edges };
  }, [activeTabId]);

  // Debounced history tracker
  useEffect(() => {
    if (isRestoring.current) {
      isRestoring.current = false;
      return;
    }
    const timer = setTimeout(() => {
      // Remove deep ui states that trigger constantly without structure change
      const stripUI = (nds, eds) => ({
        nodes: nds.map(n => ({ ...n, selected: false, dragging: false, positionAbsolute: undefined })),
        edges: eds.map(e => ({ ...e, selected: false }))
      });
      
      const current = stripUI(nodes, edges);
      const last = stripUI(lastSavedState.current.nodes || [], lastSavedState.current.edges || []);
      
      const currentStr = JSON.stringify(current);
      const lastStr = JSON.stringify(last);
      
      if (currentStr !== lastStr) {
        setPast(p => {
           setFuture([]);
           // Make deep copies before pushing
           const stateCopy = { 
             nodes: (lastSavedState.current.nodes || []).map(n => ({...n})), 
             edges: (lastSavedState.current.edges || []).map(e => ({...e}))
           };
           return [...p.slice(-49), stateCopy]; // Max 50 states
        });
        lastSavedState.current = { 
           nodes: nodes.map(n => ({...n})), 
           edges: edges.map(e => ({...e})) 
        };
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  useEffect(() => {
    const handleUndo = () => {
      setPast(p => {
        if (p.length === 0) return p;
        isRestoring.current = true;
        const previous = p[p.length - 1];
        
        setFuture(f => {
          const currentCopy = {
            nodes: lastSavedState.current.nodes.map(n => ({...n})),
            edges: lastSavedState.current.edges.map(e => ({...e}))
          };
          return [currentCopy, ...f];
        });
        
        const restoredNodes = previous.nodes.map(n => ({...n}));
        const restoredEdges = previous.edges.map(e => ({...e}));
        
        setNodes(restoredNodes);
        setEdges(restoredEdges);
        lastSavedState.current = { nodes: restoredNodes, edges: restoredEdges };
        
        // Notify canvas to disable selection temporarily to avoid ghost selections
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        
        return p.slice(0, -1);
      });
    };

    const handleRedo = () => {
      setFuture(f => {
        if (f.length === 0) return f;
        isRestoring.current = true;
        const next = f[0];
        
        setPast(p => {
          const currentCopy = {
            nodes: lastSavedState.current.nodes.map(n => ({...n})),
            edges: lastSavedState.current.edges.map(e => ({...e}))
          };
          return [...p, currentCopy];
        });
        
        const restoredNodes = next.nodes.map(n => ({...n}));
        const restoredEdges = next.edges.map(e => ({...e}));
        
        setNodes(restoredNodes);
        setEdges(restoredEdges);
        lastSavedState.current = { nodes: restoredNodes, edges: restoredEdges };
        
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        
        return f.slice(1);
      });
    };

    window.addEventListener('vibe-undo', handleUndo);
    window.addEventListener('vibe-redo', handleRedo);
    
    // Pass availability to a custom event if we want buttons to react, but for now we'll just check global length
    window.dispatchEvent(new CustomEvent('vibe-history-update', { detail: { canUndo: past.length > 0, canRedo: future.length > 0 } }));

    return () => {
      window.removeEventListener('vibe-undo', handleUndo);
      window.removeEventListener('vibe-redo', handleRedo);
    };
  }, [setNodes, setEdges, past.length, future.length]);

  useEffect(() => {
    const handleHandleClick = (e) => {
      setSelectedHandle(e.detail);
      setSelectedNodeId(e.detail.nodeId);
    };
    window.addEventListener('vibe-handle-click', handleHandleClick);
    return () => window.removeEventListener('vibe-handle-click', handleHandleClick);
  }, []);

  useEffect(() => {
    const handleCreateContainer = (e) => {
      const { x, y, width, height, childIds } = e.detail;
      const maxId = nodes.reduce((max, n) => {
        const match = n.id.match(/^node_(\d+)$/);
        return match && parseInt(match[1]) < 1000000 ? Math.max(max, parseInt(match[1])) : max;
      }, 0);
      
      const containerId = `node_${maxId + 1}`;
      const containerNode = {
        id: containerId,
        type: 'container',
        position: { x, y },
        style: { width, height },
        data: { label: 'Tool Container', enabled: true }
      };

      setNodes(nds => {
        let resultNodes = [];
        let modifiedChildren = [];
        
        nds.forEach(n => {
          if (childIds.includes(n.id)) {
            // It's a child. Adjust to relative position and set parent
            const { positionAbsolute, ...restNode } = n;
            modifiedChildren.push({
              ...restNode,
              parentId: containerId,
              position: { 
                x: (n.positionAbsolute?.x || n.position.x) - x, 
                y: (n.positionAbsolute?.y || n.position.y) - y 
              }
            });
          } else {
            resultNodes.push(n);
          }
        });
        
        // Put the container first, then the children, to satisfy React Flow's z-index rules
        return [...resultNodes, containerNode, ...modifiedChildren];
      });
      setSelectedNodeId(containerId);
    };

    const handleToggleContainer = (e) => {
      const { nodeId, enabled } = e.detail;
      setNodes(nds => nds.map(n => 
        n.id === nodeId ? { ...n, data: { ...n.data, enabled } } : n
      ));
    };

    const handleToggleMinimizeContainer = (e) => {
      const { nodeId, minimized } = e.detail;
      
      setNodes(nds => {
        let newNodes = [...nds];
        
        // Find container
        const containerIndex = newNodes.findIndex(n => n.id === nodeId);
        if (containerIndex === -1) return newNodes;
        
        const container = newNodes[containerIndex];
        let newContainerStyle = { ...container.style };
        let newData = { ...container.data, minimized };
        
        if (minimized) {
          // Save previous size
          newData.previousWidth = container.style?.width || container.width || 300;
          newData.previousHeight = container.style?.height || container.height || 200;
          
          // Shrink container dynamically based on label length
          const label = container.data?.parameters?.label || container.data?.label || 'Tool Container';
          const calculatedWidth = Math.max(250, label.length * 8 + 80);
          
          newContainerStyle.width = calculatedWidth;
          newContainerStyle.height = 60;
          
          // Hide all children
          newNodes = newNodes.map(n => {
            if (n.parentId === nodeId) {
              return { ...n, hidden: true };
            }
            return n;
          });
        } else {
          // Restore previous size
          newContainerStyle.width = newData.previousWidth || 300;
          newContainerStyle.height = newData.previousHeight || 200;
          
          // Show all children
          newNodes = newNodes.map(n => {
            if (n.parentId === nodeId) {
              return { ...n, hidden: false };
            }
            return n;
          });
        }
        
        newNodes[containerIndex] = {
          ...container,
          style: newContainerStyle,
          data: newData
        };
        
        return newNodes;
      });

      // Reroute edges to/from the container when minimized
      const childIds = nodes.filter(n => n.parentId === nodeId).map(n => n.id);
      if (childIds.length > 0) {
        setEdges(eds => eds.map(edge => {
          const sourceIsChild = childIds.includes(edge.source);
          const targetIsChild = childIds.includes(edge.target);
          
          if (minimized) {
            if (sourceIsChild && targetIsChild) {
              return { ...edge, hidden: true };
            }
            if (sourceIsChild && !targetIsChild) {
              return { ...edge, originalSource: edge.source, originalSourceHandle: edge.sourceHandle, source: nodeId, sourceHandle: 'output' };
            }
            if (targetIsChild && !sourceIsChild) {
              return { ...edge, originalTarget: edge.target, originalTargetHandle: edge.targetHandle, target: nodeId, targetHandle: 'input' };
            }
          } else {
            // Restore edges when expanded
            let newEdge = { ...edge };
            if (edge.source === nodeId && edge.originalSource) {
              newEdge.source = edge.originalSource;
              newEdge.sourceHandle = edge.originalSourceHandle;
              delete newEdge.originalSource;
              delete newEdge.originalSourceHandle;
            }
            if (edge.target === nodeId && edge.originalTarget) {
              newEdge.target = edge.originalTarget;
              newEdge.targetHandle = edge.originalTargetHandle;
              delete newEdge.originalTarget;
              delete newEdge.originalTargetHandle;
            }
            if (sourceIsChild && targetIsChild) {
              newEdge.hidden = false;
            }
            return newEdge;
          }
          return edge;
        }));
      }
    };

    const handleUngroupContainer = (e) => {
      const { nodeId } = e.detail;
      setNodes(nds => {
        const container = nds.find(n => n.id === nodeId);
        if (!container) return nds;
        
        const cx = container.positionAbsolute?.x || container.position.x;
        const cy = container.positionAbsolute?.y || container.position.y;
        
        let newNodes = [];
        
        nds.forEach(n => {
          if (n.id === nodeId) {
            // Drop the container
            return;
          }
          if (n.parentId === nodeId) {
            // Restore absolute positioning and remove parent
            newNodes.push({
              ...n,
              parentId: undefined,
              extent: undefined,
              position: {
                x: cx + n.position.x,
                y: cy + n.position.y
              },
              hidden: false // Ensure it's not hidden if container was minimized
            });
          } else {
            newNodes.push(n);
          }
        });
        
        return newNodes;
      });
      
      setEdges(eds => eds.map(edge => {
        let newEdge = { ...edge };
        if (edge.source === nodeId && edge.originalSource) {
          newEdge.source = edge.originalSource;
          newEdge.sourceHandle = edge.originalSourceHandle;
          delete newEdge.originalSource;
          delete newEdge.originalSourceHandle;
        }
        if (edge.target === nodeId && edge.originalTarget) {
          newEdge.target = edge.originalTarget;
          newEdge.targetHandle = edge.originalTargetHandle;
          delete newEdge.originalTarget;
          delete newEdge.originalTargetHandle;
        }
        if (newEdge.hidden) {
          newEdge.hidden = false;
        }
        return newEdge;
      }));
      
      setSelectedNodeId(null);
    };

    const handleNodeDragStop = (e) => {
      const { nodeId, containerId, positionAbsolute, width, height } = e.detail;
      
      setNodes(nds => {
        const node = nds.find(n => n.id === nodeId);
        if (!node) return nds;

        // If a CONTAINER was dropped, check if it absorbed any tools
        if (node.type === 'container') {
          const containerX = positionAbsolute.x;
          const containerY = positionAbsolute.y;
          const containerW = width;
          const containerH = height;

          const childrenToAbsorb = nds.filter(n => {
            if (n.type === 'container') return false; // Don't absorb other containers
            if (n.parentId === nodeId) return false; // Already a child
            
            const nX = n.positionAbsolute?.x || n.position.x;
            const nY = n.positionAbsolute?.y || n.position.y;
            const nW = n.measured?.width || n.width || n.style?.width || 150;
            const nH = n.measured?.height || n.height || n.style?.height || 60;
            
            // If the tool's center is inside the container, absorb it
            const nCenterX = nX + nW / 2;
            const nCenterY = nY + nH / 2;
            
            return nCenterX >= containerX && nCenterY >= containerY && 
                   nCenterX <= (containerX + containerW) && 
                   nCenterY <= (containerY + containerH);
          });

          if (childrenToAbsorb.length === 0) return nds;

          const childIds = childrenToAbsorb.map(n => n.id);
          
          let resultNodes = nds.map(n => {
            if (childIds.includes(n.id)) {
              const { positionAbsolute: pa, ...rest } = n;
              return {
                ...rest,
                parentId: nodeId,
                position: {
                  x: (n.positionAbsolute?.x || n.position.x) - containerX,
                  y: (n.positionAbsolute?.y || n.position.y) - containerY
                }
              };
            }
            return n;
          });
          
          // Reorder: container must be before children in array
          const containerObj = resultNodes.find(n => n.id === nodeId);
          resultNodes = resultNodes.filter(n => n.id !== nodeId);
          resultNodes.unshift(containerObj); // Put container at the very beginning
          
          return resultNodes;
        }

        // If a TOOL was dropped
        let targetContainerId = containerId;

        if (targetContainerId) {
          const container = nds.find(n => n.id === targetContainerId);
          if (container && node.parentId !== targetContainerId) {
            // New container! Make it relative to the container
            let resultNodes = nds.map(n => {
              if (n.id === nodeId) {
                const { positionAbsolute: pa, ...rest } = n;
                return {
                  ...rest,
                  parentId: targetContainerId,
                  position: { 
                    x: positionAbsolute.x - (container.positionAbsolute?.x || container.position.x), 
                    y: positionAbsolute.y - (container.positionAbsolute?.y || container.position.y) 
                  }
                };
              }
              return n;
            });

            // React Flow requires parent nodes to appear before their children in the array
            const containerIdx = resultNodes.findIndex(n => n.id === targetContainerId);
            const nodeIdx = resultNodes.findIndex(n => n.id === nodeId);
            
            if (nodeIdx < containerIdx) {
               const nodeObj = resultNodes[nodeIdx];
               resultNodes.splice(nodeIdx, 1);
               const newContainerIdx = resultNodes.findIndex(n => n.id === targetContainerId);
               resultNodes.splice(newContainerIdx + 1, 0, nodeObj);
            }
            return resultNodes;
          }
        } else {
          // If it was dropped outside, and previously had a parent, remove it
          if (node.parentId) {
            return nds.map(n => 
              n.id === nodeId ? {
                ...n,
                parentId: undefined,
                extent: undefined,
                position: positionAbsolute // Restore absolute coordinates
              } : n
            );
          }
        }
        return nds;
      });
    };

    const handleCreateComment = (e) => {
      const { x, y } = e.detail;
      const maxId = nodes.reduce((max, n) => {
        const match = n.id.match(/^node_(\d+)$/);
        return match && parseInt(match[1]) < 1000000 ? Math.max(max, parseInt(match[1])) : max;
      }, 0);
      
      const commentId = `node_${maxId + 1}`;
      const commentNode = {
        id: commentId,
        type: 'comment',
        position: { x, y },
        style: { width: 250, height: 150 },
        data: { label: 'Comment', parameters: {} },
        zIndex: -1
      };

      setNodes(nds => [...nds, commentNode]);
      setSelectedNodeId(commentId);
    };

    const handleUpdateComment = (e) => {
      const { nodeId, text } = e.detail;
      setNodes(nds => nds.map(n => 
        n.id === nodeId ? { ...n, data: { ...n.data, parameters: { ...(n.data.parameters || {}), text } } } : n
      ));
    };

    window.addEventListener('vibe-create-container', handleCreateContainer);
    window.addEventListener('vibe-toggle-container', handleToggleContainer);
    window.addEventListener('vibe-toggle-minimize-container', handleToggleMinimizeContainer);
    window.addEventListener('vibe-ungroup-container', handleUngroupContainer);
    window.addEventListener('vibe-node-drag-stop', handleNodeDragStop);
    window.addEventListener('vibe-create-comment', handleCreateComment);
    window.addEventListener('vibe-update-comment', handleUpdateComment);
    
    return () => {
      window.removeEventListener('vibe-create-container', handleCreateContainer);
      window.removeEventListener('vibe-toggle-container', handleToggleContainer);
      window.removeEventListener('vibe-toggle-minimize-container', handleToggleMinimizeContainer);
      window.removeEventListener('vibe-ungroup-container', handleUngroupContainer);
      window.removeEventListener('vibe-node-drag-stop', handleNodeDragStop);
      window.removeEventListener('vibe-create-comment', handleCreateComment);
      window.removeEventListener('vibe-update-comment', handleUpdateComment);
    };
  }, [nodes, setNodes]);

  // Pipeline execution state moved above sync hook

  const handleTabChange = useCallback((newTabId) => {
    if (newTabId === activeTabId) return;
    setTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        return { ...t, nodes, edges, results, globalLogs, isDirty };
      }
      return t;
    }));
    setActiveTabId(newTabId);
  }, [activeTabId, nodes, edges, results, globalLogs, isDirty]);

  const handleAddTab = useCallback(() => {
    setTabs(prev => {
      const currentSaved = prev.map(t => t.id === activeTabId ? { ...t, nodes, edges, results, globalLogs, isDirty } : t);
      const newTabId = `tab-${Date.now()}`;
      const newTab = { id: newTabId, name: `Workflow ${currentSaved.length + 1}`, nodes: [], edges: [], results: {}, globalLogs: [], isDirty: false };
      setActiveTabId(newTabId);
      return [...currentSaved, newTab];
    });
  }, [activeTabId, nodes, edges, results, globalLogs, isDirty]);

  const handleCloseTab = useCallback((idToClose) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== idToClose);
      if (newTabs.length === 0) return prev; // Don't close the last tab
      if (idToClose === activeTabId) {
        const incoming = newTabs[newTabs.length - 1];
        setActiveTabId(incoming.id);
      }
      return newTabs;
    });
  }, [activeTabId]);

  // Global keydown event listener to handle Delete and Copy/Paste
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'SELECT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedNodeId) {
          e.preventDefault();
          setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
          setEdges((eds) => eds.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
          setSelectedNodeId(null);
        } else if (selectedEdgeId) {
          e.preventDefault();
          setEdges((eds) => eds.filter((edge) => edge.id !== selectedEdgeId));
          setSelectedEdgeId(null);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const selectedNodes = nodes.filter(n => n.selected || n.id === selectedNodeId);
        
        // Include children if a container is selected
        const children = nodes.filter(n => selectedNodes.some(sn => sn.id === n.parentId && !selectedNodes.includes(n)));
        const nodesToCopy = [...selectedNodes, ...children];
        
        const selectedNodeIds = nodesToCopy.map(n => n.id);
        const edgesToCopy = edges.filter(e => selectedNodeIds.includes(e.source) && selectedNodeIds.includes(e.target));
        
        if (nodesToCopy.length > 0) {
          localStorage.setItem('vibeetl_clipboard', JSON.stringify({ nodes: nodesToCopy, edges: edgesToCopy }));
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        const clipboard = localStorage.getItem('vibeetl_clipboard');
        if (clipboard) {
          try {
            const parsed = JSON.parse(clipboard);
            const pastedNodes = parsed.nodes || [];
            const pastedEdges = parsed.edges || [];
            
            const idMap = {};
            const currentMaxId = nodes.reduce((max, n) => {
              const match = n.id.match(/^node_(\d+)$/);
              return match && parseInt(match[1]) < 1000000 ? Math.max(max, parseInt(match[1])) : max;
            }, 0);
            
            let idCounter = currentMaxId + 1;
            
            const newNodes = pastedNodes.map(n => {
              const newId = `node_${idCounter++}`;
              idMap[n.id] = newId;
              return {
                ...n,
                id: newId,
                position: { x: n.position.x + 50, y: n.position.y + 50 },
                selected: true
              };
            });
            
            newNodes.forEach(n => {
              if (n.parentId && idMap[n.parentId]) {
                n.parentId = idMap[n.parentId];
              }
            });
            
            const newEdges = pastedEdges.map(e => ({
              ...e,
              id: `edge_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              source: idMap[e.source] || e.source,
              target: idMap[e.target] || e.target,
              selected: true
            }));
            
            setNodes(nds => nds.map(n => ({...n, selected: false})).concat(newNodes));
            setEdges(eds => eds.map(e => ({...e, selected: false})).concat(newEdges));
          } catch (err) {
            console.error("Paste failed", err);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, selectedNodeId, selectedEdgeId, setNodes, setEdges]);
  const isFirstRender = React.useRef(true);

  // Auto-save & Dirty Tracking
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    
    // Decouple node drag coordinate noise from deep state cloning
    if (isDraggingNode.current) {
      return;
    }

    setIsDirty(true);
    
    // Save the active workflow (legacy fallback)
    localStorage.setItem('vibeetl_autosave_workflow', JSON.stringify({ nodes, edges }));
    
    // Critcal Fix: Synchronize the active canvas state into the tabs array before saving!
    const syncedTabs = tabs.map(t => {
      if (t.id === activeTabId) {
        return { ...t, nodes, edges, isDirty: true };
      }
      return t;
    });
    localStorage.setItem('vibeetl_autosave_workflow_tabs', JSON.stringify(syncedTabs));

    const timer = setTimeout(() => {
      fetch(`${API_BASE}/api/autosave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges })
      }).catch(err => console.error("Autosave backend failed:", err));
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [nodes, edges, tabs, activeTabId]);

  // Unsaved changes protection
  React.useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);
  const [autoRun, setAutoRun] = useState(true);
  const [availableTools, setAvailableTools] = useState([]);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizing = React.useRef(false);

  const startResizing = useCallback((mouseDownEvent) => {
    isResizing.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handleMouseMove = (mouseMoveEvent) => {
      if (!isResizing.current) return;
      const newWidth = mouseMoveEvent.clientX;
      if (newWidth > 220 && newWidth < 700) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  const [resultsHeight, setResultsHeight] = useState(280);
  const isResizingResults = React.useRef(false);

  const startResizingResults = useCallback((mouseDownEvent) => {
    isResizingResults.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    const handleMouseMove = (mouseMoveEvent) => {
      if (!isResizingResults.current) return;
      const newHeight = window.innerHeight - mouseMoveEvent.clientY;
      if (newHeight > 120 && newHeight < 600) {
        setResultsHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      isResizingResults.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  // Fetch dynamic tools from backend
  useEffect(() => {
    fetch(`${API_BASE}/api/tools`)
      .then(res => res.json())
      .then(data => {
        if (data.tools) setAvailableTools(data.tools);
      })
      .catch(err => console.error("Failed to fetch tools:", err));
  }, []);

  // Handles adding wire connections between nodes
  const onConnect = useCallback(
    (params) => {
      const sourceNode = nodes.find(n => n.id === params.source);
      if (sourceNode?.type === 'visualization') {
        alert("Visualization tools generate interactive reports, not tabular data. They cannot be connected downstream to other tools.");
        return;
      }

      const edge = {
        ...params,
        id: `e-${params.source}-${params.target}`,
        style: { stroke: '#9ca3af', strokeWidth: 2 }
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [nodes, setEdges]
  );

  // Handles selection of a node on the canvas
  const handleNodeSelect = useCallback((node) => {
    setSelectedNodeId(node ? node.id : null);
  }, []);

  // Update parameters for a specific node when form controls change
  const handleUpdateParams = useCallback((nodeId, newParams) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          // If params changed, we reset status to idle
          return {
            ...node,
            data: {
              ...node.data,
              status: 'idle',
              parameters: newParams
            }
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Add a new node dropped from the tool palette
  const handleAddNode = useCallback((type, position) => {
    let label = 'Node';
    let category = 'inout';
    let icon = 'Square';
    let defaultParams = {};

    const toolDef = availableTools.find(t => t.id === type);
    if (toolDef) {
      label = toolDef.name || label;
      category = toolDef.category || category;
      icon = toolDef.icon || icon;
      defaultParams = toolDef.defaultParams || {};
    } else {
      console.warn(`Tool definition not found for: ${type}. Using fallback defaults.`);
      if (type === 'fileInput') {
        label = 'File Input';
        category = 'inout';
        icon = 'Database';
        defaultParams = { filePath: '', fileType: 'auto' };
      } else if (type === 'fileOutput') {
        label = 'File Output';
        category = 'inout';
        icon = 'Save';
        defaultParams = { outputPath: 'output.csv', outputFormat: 'csv', saveFile: false };
      } else if (type === 'filter') {
        label = 'Filter';
        category = 'prep';
        icon = 'Filter';
        defaultParams = { column: '', operator: '==', value: '' };
      } else if (type === 'sort') {
        label = 'Sort';
        category = 'prep';
        icon = 'ArrowUpDown';
        defaultParams = { column: '', descending: false };
      } else if (type === 'select') {
        label = 'Select';
        category = 'transform';
        icon = 'Columns';
        defaultParams = { columns: [] };
      } else if (type === 'regex') {
        label = 'Regex';
        category = 'transform';
        icon = 'Brackets';
        defaultParams = { column: '', pattern: '', outputColumns: [] };
      } else if (type === 'datetime') {
        label = 'Date Time';
        category = 'transform';
        icon = 'CalendarClock';
        defaultParams = { column: '', action: 'String to Date/Time', format: 'Auto-Infer', custom_format: '', output_column: '' };
      } else if (type === 'browse') {
        label = 'Browse';
        category = 'inout';
        icon = 'Search';
        defaultParams = {};
      } else if (type === 'imageCaption') {
        label = 'Image Caption';
        category = 'inout';
        icon = 'Image';
        defaultParams = { imagePath: '' };
      } else if (type === 'pivot') {
        label = 'Pivot';
        category = 'transform';
        icon = 'ArrowLeftRight';
        defaultParams = { index: [], columns: '', values: '', aggregate_function: 'sum' };
      } else if (type === 'unpivot') {
        label = 'Unpivot';
        category = 'transform';
        icon = 'ArrowDownUp';
        defaultParams = { id_vars: [], value_vars: [], variable_name: 'name', value_name: 'value' };
      } else if (type === 'union') {
        label = 'Union';
        category = 'join';
        icon = 'Layers';
        defaultParams = { how: 'diagonal' };
      } else if (type === 'data_cleansing') {
        label = 'Cleanse';
        category = 'prep';
        icon = 'Sparkles';
        defaultParams = { columns: [], replace_nulls_string: false, replace_nulls_numeric: false, trim_whitespace: false, remove_punctuation: false };
      } else if (type === 'formula') {
        label = 'Formula';
        category = 'prep';
        icon = 'Calculator';
        defaultParams = { output_column: 'NewColumn', expression: '' };
      } else if (type === 'unique') {
        label = 'Unique';
        category = 'prep';
        icon = 'Fingerprint';
        defaultParams = { columns: [], keep: 'first' };
      } else if (type === 'visualization') {
        label = 'Visualization';
        category = 'analysis';
        icon = 'BarChart3';
        defaultParams = { chartType: 'scatter', xAxis: '', yAxis: '', title: '' };
      } else if (type === 'record_id') {
        label = 'Record ID';
        category = 'prep';
        icon = 'Hash';
        defaultParams = { column_name: 'RecordID', starting_value: 1 };
      } else if (type === 'gcs_in') {
        label = 'GCS Input';
        category = 'cloud';
        icon = 'Cloud';
        defaultParams = { bucket: '', path: '', file_format: 'csv', service_account_json: '' };
      } else if (type === 'gcs_out') {
        label = 'GCS Output';
        category = 'cloud';
        icon = 'CloudUpload';
        defaultParams = { bucket: '', path: '', file_format: 'csv', service_account_json: '' };
      }
    }

    const maxId = nodes.reduce((max, n) => {
      const match = n.id.match(/^node_(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num < 1000000) { // Ignore huge legacy timestamp IDs
          return Math.max(max, num);
        }
      }
      return max;
    }, 0);
    const newNodeId = `node_${maxId + 1}`;

    const newNode = {
      id: newNodeId,
      type,
      position,
      data: {
        label,
        category,
        icon,
        parameters: defaultParams,
        status: 'idle',
        error: null
      }
    };

    setNodes((nds) => nds.concat(newNode));
    setSelectedNodeId(newNodeId);
  }, [setNodes, availableTools, nodes]);

  // Clean state when nodes are deleted
  const onNodesDelete = useCallback((deleted) => {
    const deletedIds = deleted.map(n => n.id);
    if (deletedIds.includes(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId]);

  // Resolve the current selected node object
  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  // Resolves the schema of the selected node's upstream connection
  const upstreamSchema = useMemo(() => {
    if (!selectedNodeId) return [];
    
    // Find if the selected node is a FileInput (doesn't have upstream)
    const activeNode = nodes.find(n => n.id === selectedNodeId);
    if (!activeNode || activeNode.type === 'fileInput') return [];

    // Special case for Join Node: resolve schemas for both 'left' and 'right' inputs
    if (activeNode.type === 'join') {
      const leftEdge = edges.find(e => e.target === selectedNodeId && (e.targetHandle === 'left' || e.targetPort === 'left'));
      const rightEdge = edges.find(e => e.target === selectedNodeId && (e.targetHandle === 'right' || e.targetPort === 'right'));
      
      return {
        left: leftEdge ? resolveNodeSchema(leftEdge.source, nodes, edges, results) : [],
        right: rightEdge ? resolveNodeSchema(rightEdge.source, nodes, edges, results) : []
      };
    }

    // Default behavior for nodes with a single generic 'input' port
    const incomingEdge = edges.find(
      (e) => e.target === selectedNodeId && (e.targetPort === 'input' || e.targetHandle === 'input')
    );
    if (!incomingEdge) return [];

    return resolveNodeSchema(incomingEdge.source, nodes, edges, results);
  }, [nodes, edges, selectedNodeId, results]);

  // Executes the pipeline DAG by sending the graph schema JSON to the backend
  const handleClearGlobalCache = () => {
    setNodes((nds) => nds.map(node => ({
      ...node,
      data: {
        ...node.data,
        parameters: { ...node.data?.parameters, isCached: false },
        status: 'idle',
        resultSummary: null
      }
    })));
    setResults({});
    setGlobalLogs(["Global cache and all node locks cleared. Pipeline ready for fresh execution."]);
  };

  const handleRunPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setGlobalLogs(['Triggering pipeline execution...', 'Serializing DAG graph structure...']);

    // Set all nodes' status to waiting
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: { ...node.data, status: node.type === 'comment' ? 'idle' : 'waiting' }
      }))
    );

    // Build DAG JSON payload for FastAPI
    // We only need id, type, parameters for nodes, and connection ports for edges
    const dagPayload = {
      nodes: nodes.filter(n => n.type !== 'comment').map((n) => ({
        id: n.id,
        type: n.type,
        parentId: n.parentId,
        parameters: n.data.parameters || {},
        data: { label: n.data.label, enabled: n.data.enabled !== false }
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourcePort: e.sourceHandle || e.sourcePort || 'output',
        targetPort: e.targetHandle || e.targetPort || 'input'
      }))
    };

    try {
      const response = await fetch(`${API_BASE}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dagPayload)
      });

      if (!response.ok) {
        throw new Error(await response.text() || 'Pipeline execution failed on server.');
      }

      const data = await response.json();
      
      setGlobalLogs(data.global_logs || []);
      setResults(data.results || {});

      // Update individual nodes' statuses based on node outcomes
      setNodes((nds) =>
        nds.map((node) => {
          const nodeResult = data.results?.[node.id];
          const outcomeStatus = nodeResult?.status || 'idle';
          
          return {
            ...node,
            data: {
              ...node.data,
              status: outcomeStatus,
              resultSummary: nodeResult ? {
                row_count: nodeResult.row_count,
                ports: nodeResult.ports
              } : null,
              // If node is a FileInput and returned a schema, cache it in parameters
              parameters: {
                ...node.data.parameters,
                ...(node.type === 'fileInput' && nodeResult?.status === 'success'
                  ? { detectedSchema: nodeResult.schema }
                  : {})
              }
            }
          };
        })
      );
    } catch (err) {
      const errMsg = err.message || 'Network error communicating with pipeline solver.';
      setGlobalLogs((prev) => [...prev, `ERROR: ${errMsg}`]);
      
      // Set all nodes to error
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: { ...node.data, status: 'error' }
        }))
      );
    } finally {
      setIsRunning(false);
    }
  };

  // stable string representation of configuration to watch (ignoring UI statuses & execution results)
  const dagConfigStr = useMemo(() => {
    const minNodes = nodes.map(n => ({
      id: n.id,
      type: n.type,
      parameters: {
        ...n.data?.parameters,
        detectedSchema: undefined // ignore detected schema changes from solver
      }
    }));
    const minEdges = edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle
    }));
    return JSON.stringify({ nodes: minNodes, edges: minEdges });
  }, [nodes, edges]);

  // Keep a mutable ref to handleRunPipeline to avoid triggering useEffect recursion loops
  const runPipelineRef = React.useRef(handleRunPipeline);
  React.useEffect(() => {
    runPipelineRef.current = handleRunPipeline;
  }, [handleRunPipeline]);

  // Debounced auto-run compile action
  React.useEffect(() => {
    if (!autoRun) return;

    const delayDebounceFn = setTimeout(() => {
      runPipelineRef.current();
    }, 400); // 400ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [dagConfigStr, autoRun]);

  // Live polling of execution status
  React.useEffect(() => {
    if (!isRunning) return;

    const intervalId = setInterval(() => {
      fetch(`${API_BASE}/api/status`)
        .then(res => res.json())
        .then(data => {
          if (data.statuses) {
            setNodes((nds) => nds.map((node) => {
              const nodePayload = data.statuses[node.id];
              if (!nodePayload) return node;
              const currentStatus = nodePayload.status;

              // Only update if it exists and changed, and don't overwrite if node is already success/error 
              // (because /api/execute response might have beaten the polling!)
              if (currentStatus && node.data?.status !== currentStatus && node.data?.status !== 'success' && node.data?.status !== 'error') {
                return { 
                  ...node, 
                  data: { 
                    ...node.data, 
                    status: currentStatus,
                    resultSummary: currentStatus === 'success' ? {
                      row_count: nodePayload.row_count,
                      ports: nodePayload.ports
                    } : null
                  } 
                };
              }
              return node;
            }));
          }
          if (data.global_logs) {
            setGlobalLogs(data.global_logs);
          }
        })
        .catch(err => console.error("Polling error:", err));
    }, 250);

    return () => clearInterval(intervalId);
  }, [isRunning, setNodes]);

  // Synchronize edge styles with their source node's execution status
  React.useEffect(() => {
    setEdges((eds) => {
      let hasChanges = false;
      const newEdges = eds.map((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const status = sourceNode?.data?.status || 'idle';
        
        let stroke = '#9ca3af'; // idle grey
        let strokeWidth = 2;
        let animated = false;

        if (status === 'running') {
          stroke = '#3b82f6'; // blue
          animated = true;
        } else if (status === 'success') {
          stroke = '#10b981'; // green for all successful routes
          strokeWidth = 3;
          animated = false; 
        } else if (status === 'error') {
          stroke = '#ef4444'; // red
          strokeWidth = 3;
        }

        if (edge.style?.stroke !== stroke || edge.style?.strokeWidth !== strokeWidth || edge.animated !== animated) {
          hasChanges = true;
          return {
            ...edge,
            animated,
            style: { ...edge.style, stroke, strokeWidth }
          };
        }
        return edge;
      });

      return hasChanges ? newEdges : eds;
    });
  }, [nodes, setEdges]);

  const nodeTypes = useMemo(() => {
    const types = { custom: CustomNode, comment: CommentNode, container: ContainerNode };
    availableTools.forEach(tool => {
      types[tool.id] = CustomNode;
    });
    return types;
  }, [availableTools]);

  const handleSaveWorkflow = () => {
    setIsDirty(false);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ nodes, edges }));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    const activeTabName = tabs.find(t => t.id === activeTabId)?.name || 'workflow';
    downloadAnchorNode.setAttribute("download", `${activeTabName}.json`);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleExportYAML = () => {
    setIsDirty(false);
    // Build clean execution dag
    const cleanNodes = nodes.map(n => ({
      id: n.id,
      type: n.type,
      parameters: n.data?.parameters || {}
    }));
    const cleanEdges = edges.map(e => ({
      source: e.source,
      target: e.target,
      sourcePort: e.sourceHandle || e.sourcePort || 'output',
      targetPort: e.targetHandle || e.targetPort || 'input'
    }));

    let yamlStr = "nodes:\n";
    cleanNodes.forEach(n => {
      yamlStr += `  - id: ${n.id}\n`;
      yamlStr += `    type: ${n.type}\n`;
      if (Object.keys(n.parameters).length > 0) {
        yamlStr += `    parameters:\n`;
        Object.keys(n.parameters).forEach(k => {
          let val = n.parameters[k];
          if (typeof val === 'object') {
            yamlStr += `      ${k}: '${JSON.stringify(val).replace(/'/g, "''")}'\n`;
          } else if (typeof val === 'string') {
            yamlStr += `      ${k}: '${val.replace(/'/g, "''")}'\n`;
          } else {
            yamlStr += `      ${k}: ${val}\n`;
          }
        });
      }
    });
    yamlStr += "edges:\n";
    cleanEdges.forEach(e => {
      yamlStr += `  - source: ${e.source}\n`;
      yamlStr += `    target: ${e.target}\n`;
      if (e.sourcePort !== 'output') yamlStr += `    sourcePort: ${e.sourcePort}\n`;
      if (e.targetPort !== 'input') yamlStr += `    targetPort: ${e.targetPort}\n`;
    });

    const dataStr = "data:text/yaml;charset=utf-8," + encodeURIComponent(yamlStr);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "agent_workflow.yaml");
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleLoadWorkflow = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const loaded = JSON.parse(e.target.result);
        if (loaded.nodes && loaded.edges) {
          setTabs(prev => {
            const currentSaved = prev.map(t => t.id === activeTabId ? { ...t, nodes, edges, results, globalLogs, isDirty } : t);
            const newTabId = `tab-${Date.now()}`;
            const newTabName = file.name.replace('.json', '');
            const newTab = { id: newTabId, name: newTabName, nodes: loaded.nodes, edges: loaded.edges, results: {}, globalLogs: ['Workflow loaded successfully.'], isDirty: false };
            setActiveTabId(newTabId);
            return [...currentSaved, newTab];
          });
        } else {
          alert('Invalid workflow file format.');
        }
      } catch (err) {
        alert('Failed to parse workflow file.');
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // reset input
  };

  const getInspectedNode = () => {
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    if (!selectedNode) return null;
    if (selectedHandle?.nodeId === selectedNode.id && selectedHandle?.handleType === 'target') {
      const handleId = selectedHandle.handleId;
      const edge = edges.find((e) => e.target === selectedNode.id && (e.targetHandle === handleId || !e.targetHandle));
      if (edge) {
        return nodes.find((n) => n.id === edge.source) || selectedNode;
      }
    }
    return selectedNode;
  };

  const inspectedNode = getInspectedNode();

  return (
    <div className="app-container">
      {/* 1. Tool Palette (Top Panel) */}
      <ToolPalette 
        onRunPipeline={handleRunPipeline} 
        onClearGlobalCache={handleClearGlobalCache}
        onSaveWorkflow={handleSaveWorkflow}
        onLoadWorkflow={handleLoadWorkflow}
        onExportYAML={handleExportYAML}
        isRunning={isRunning} 
        autoRun={autoRun}
        setAutoRun={setAutoRun}
        availableTools={availableTools}
        selectedNode={selectedNode}
        onUpdateParams={handleUpdateParams}
      />

      {/* Workspace Area */}
      <div className="workspace-container">
        <ErrorBoundary>
          <ConfigWindow
            selectedNode={selectedNode}
            upstreamSchema={upstreamSchema}
            onUpdateParams={handleUpdateParams}
            availableTools={availableTools}
            results={results}
            nodes={nodes}
            edges={edges}
            style={{ width: `${sidebarWidth}px` }}
          />
        </ErrorBoundary>

        <div className="sidebar-resizer" onMouseDown={startResizing} />

        {/* Center Panel (Canvas + Results splitting vertically) */}
        <div className="main-content">
          {/* Tabs Bar */}
          <div className="tab-bar">
            {tabs.map(tab => (
              <div 
                key={tab.id} 
                className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
              >
                <span className="tab-title" onDoubleClick={(e) => {
                  const newName = prompt("Rename Tab:", tab.name);
                  if (newName) {
                    setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, name: newName } : t));
                  }
                }}>{tab.name}</span>
                {tabs.length > 1 && (
                  <button 
                    className="tab-close-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseTab(tab.id);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button className="tab-add-btn" onClick={handleAddTab}>
              +
            </button>
          </div>

          {/* 3. The Canvas Workspace */}
          <div style={{ flex: 1, position: 'relative' }}>
            <ErrorBoundary>
              <Canvas
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeSelect={(node) => {
                  setSelectedNodeId(node?.id || null);
                  setSelectedHandle(null);
                }}
                onEdgeSelect={setSelectedEdgeId}
                onAddNode={handleAddNode}
                onNodesDelete={onNodesDelete}
                onNodeDragStop={(e, node) => {
                  isDraggingNode.current = false;
                  // Force a tabs sync to capture the new coordinates
                  setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, nodes, edges, isDirty: true } : t));
                }}
              />
            </ErrorBoundary>
          </div>

          {/* 4. Results Window (Bottom Panel) */}
          <div className="results-resizer" onMouseDown={startResizingResults} />
          <ErrorBoundary>
            <ResultsWindow
              selectedNode={inspectedNode}
              originalNode={nodes.find(n => n.id === selectedNodeId)}
              results={results}
              globalLogs={globalLogs}
              style={{ height: `${resultsHeight}px` }}
            />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default App;
