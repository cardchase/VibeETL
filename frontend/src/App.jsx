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
import ChatPanel from './components/ChatPanel';
import './App.css';

// Ensure a unique session ID exists for this specific browser tab.
// This isolates the execution cache on the backend.
if (!window.sessionId) {
  window.sessionId = crypto.randomUUID();
}

// Dynamic API Base URL from environment variables
import { API_BASE } from './config';

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
    style: { stroke: '#9ca3af', strokeWidth: 1 }
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

const getUniqueTabName = (baseName, existingNames) => {
  let name = baseName;
  let counter = 2;
  while (existingNames.includes(name)) {
    name = `${baseName} (${counter})`;
    counter++;
  }
  return name;
};

const getInitialTabs = () => {
  const sanitizeNodes = (nodes) => (nodes || []).map(n => ({
    ...n,
    data: { ...(n.data || {}), status: n.type === 'comment' ? 'idle' : 'idle' }
  }));

  try {
    const savedTabs = localStorage.getItem('vibeetl_autosave_workflow_tabs');
    if (savedTabs) {
      const parsed = JSON.parse(savedTabs);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const existingNames = [];
        return parsed.map(tab => {
          const uniqueName = getUniqueTabName(tab.name || 'Untitled Workflow', existingNames);
          existingNames.push(uniqueName);
          return {
            ...tab,
            name: uniqueName,
            nodes: sanitizeNodes(tab.nodes)
          };
        });
      }
    }
    const savedSingle = localStorage.getItem('vibeetl_autosave_workflow');
    if (savedSingle) {
      const parsed = JSON.parse(savedSingle);
      return [{
        id: 'tab-1',
        name: 'Untitled Workflow',
        nodes: sanitizeNodes(parsed.nodes || initialNodes),
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
    nodes: sanitizeNodes(initialNodes),
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
  const [isRunningMap, setIsRunningMap] = useState({});
  const isRunning = isRunningMap[activeTabId] || false;
  const setIsRunning = useCallback((val, tabId = activeTabId) => {
    setIsRunningMap(prev => ({ ...prev, [tabId]: typeof val === 'function' ? val(prev[tabId]) : val }));
  }, [activeTabId]);
  const [results, setResults] = useState(activeTab.results || {});
  const [globalLogs, setGlobalLogs] = useState(activeTab.globalLogs || []);
  const [isDirty, setIsDirty] = useState(activeTab.isDirty || false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectedHandle, setSelectedHandle] = useState(null);
  const [isBackendConnected, setIsBackendConnected] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);

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
  const activeTabIdRef = React.useRef(activeTabId);
  React.useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const onNodesChange = useCallback((changes) => {
    onNodesChangeCore(changes);
    const isDrag = changes.some(c => c.type === 'position' || c.type === 'dimensions');
    if (isDrag) {
      isDraggingNode.current = true;
    }
  }, [onNodesChangeCore]);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);

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

  // Topological Sort for UI Node Numbering
  useEffect(() => {
    if (!nodes || nodes.length === 0) return;
    
    const inDegree = {};
    const adj = {};
    nodes.forEach(n => { inDegree[n.id] = 0; adj[n.id] = []; });
    edges.forEach(e => {
      if (inDegree[e.target] !== undefined && adj[e.source]) {
        inDegree[e.target]++;
        adj[e.source].push(e.target);
      }
    });
    
    const queue = [];
    nodes.forEach(n => { if (inDegree[n.id] === 0) queue.push(n.id); });
    
    const order = [];
    while (queue.length > 0) {
      const u = queue.shift();
      order.push(u);
      adj[u]?.forEach(v => {
        inDegree[v]--;
        if (inDegree[v] === 0) queue.push(v);
      });
    }
    
    let execIdx = 1;
    const newExecIndexes = {};
    order.forEach(id => {
      const node = nodes.find(n => n.id === id);
      if (node && node.type !== 'container') {
        newExecIndexes[id] = execIdx++;
      }
    });
    
    let hasChanges = false;
    nodes.forEach(n => {
       if (n.type !== 'container' && n.data?.executionIndex !== newExecIndexes[n.id]) {
           hasChanges = true;
       }
    });
    
    if (hasChanges) {
      setNodes(nds => nds.map(n => {
        if (n.type !== 'container' && n.data?.executionIndex !== newExecIndexes[n.id]) {
           return { ...n, data: { ...n.data, executionIndex: newExecIndexes[n.id] } };
        }
        return n;
      }));
    }
  }, [edges, nodes.length, setNodes]);


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
      const existingNames = currentSaved.map(t => t.name);
      const uniqueName = getUniqueTabName(`Workflow ${currentSaved.length + 1}`, existingNames);
      const newTab = { id: newTabId, name: uniqueName, nodes: [], edges: [], results: {}, globalLogs: [], isDirty: false };
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
        const selectedNodes = nodes.filter(n => n.selected || n.id === selectedNodeId);
        const selectedEdges = edges.filter(edge => edge.selected || edge.id === selectedEdgeId);
        
        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          e.preventDefault();
          const selectedNodeIds = selectedNodes.map(n => n.id);
          
          if (selectedNodes.length > 0) {
            setNodes(nds => nds.filter(n => !selectedNodeIds.includes(n.id)));
            setSelectedNodeId(null);
          }
          
          if (selectedNodeIds.length > 0 || selectedEdges.length > 0) {
            setEdges(eds => eds.filter(edge => 
              !selectedEdges.some(e => e.id === edge.id) &&
              !selectedNodeIds.includes(edge.source) && 
              !selectedNodeIds.includes(edge.target)
            ));
            setSelectedEdgeId(null);
          }
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
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
        setEdges(eds => eds.map(edge => ({ ...edge, selected: true })));
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
      const activeTabTitle = tabs.find(t => t.id === activeTabId)?.name || 'Untitled_Workflow';
      fetch(`${API_BASE}/api/autosave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, workflow_name: activeTabTitle })
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
  const [autoRun, setAutoRun] = useState(false);
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

  // Fetch dynamic tools and check backend connection status
  useEffect(() => {
    const fetchToolsAndStatus = () => {
      fetch(`${API_BASE}/api/tools`)
        .then(res => {
          if (!res.ok) throw new Error("Backend not OK");
          setIsBackendConnected(true);
          return res.json();
        })
        .then(data => {
          if (data.tools) setAvailableTools(data.tools);
        })
        .catch(err => {
          setIsBackendConnected(false);
        });
    };
    
    // Initial fetch
    fetchToolsAndStatus();
    
    // Poll every 5 seconds to keep connection status alive
    const interval = setInterval(fetchToolsAndStatus, 5000);
    return () => clearInterval(interval);
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
  const handleAddNode = useCallback((type, position, anchorNodeId = null) => {
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

    if (anchorNodeId) {
      setEdges((eds) => eds.concat({
        id: `edge_e${anchorNodeId}-${newNodeId}`,
        source: anchorNodeId,
        target: newNodeId,
        sourceHandle: 'output',
        targetHandle: 'input',
        style: { stroke: '#9ca3af', strokeWidth: 2 }
      }));
    }
  }, [setNodes, setEdges, availableTools, nodes]);

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
    const currentTabId = activeTabId;
    if (isRunningMap[currentTabId]) return;
    setIsRunning(true, currentTabId);
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
      session_id: currentTabId,
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
      
      const applyNodeUpdates = (node) => {
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
            parameters: {
              ...node.data.parameters,
              ...(node.type === 'fileInput' && nodeResult?.status === 'success'
                ? { detectedSchema: nodeResult.schema }
                : {})
            }
          }
        };
      };

      if (currentTabId === activeTabIdRef.current) {
        setGlobalLogs(data.global_logs || []);
        setResults(data.results || {});
        setNodes((nds) => nds.map(applyNodeUpdates));
      } else {
        setTabs(prev => prev.map(t => {
          if (t.id === currentTabId) {
            return {
              ...t,
              nodes: t.nodes.map(applyNodeUpdates),
              results: data.results || {},
              globalLogs: data.global_logs || []
            };
          }
          return t;
        }));
      }

    } catch (err) {
      const errMsg = err.message || 'Network error communicating with pipeline solver.';
      
      const errorMsg = `ERROR: ${errMsg}`;
      const applyErrorNodes = (node) => ({
        ...node,
        data: { ...node.data, status: 'error' }
      });

      if (currentTabId === activeTabIdRef.current) {
        setGlobalLogs((prev) => [...prev, errorMsg]);
        setNodes((nds) => nds.map(applyErrorNodes));
      } else {
        setTabs(prev => prev.map(t => {
          if (t.id === currentTabId) {
            return {
              ...t,
              nodes: t.nodes.map(applyErrorNodes),
              globalLogs: [...t.globalLogs, errorMsg]
            };
          }
          return t;
        }));
      }
    } finally {
      setIsRunning(false, currentTabId);
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
    let intervalId;
    if (isRunning) {
      intervalId = setInterval(() => {
        fetch(`${API_BASE}/api/status?session_id=${activeTabId}`)
          .then(res => res.json())
        .then(data => {
          if (data.statuses) {
            // Stream partial results for nodes that are running
            setResults(prevResults => {
              let updated = false;
              const nextResults = { ...prevResults };
              
              for (const [nodeId, payload] of Object.entries(data.statuses)) {
                if (payload.status === 'running' && payload.preview) {
                  // Update if row count changed OR logs length changed to ensure real-time log streaming
                  const currentLogsCount = nextResults[nodeId] && nextResults[nodeId].logs ? nextResults[nodeId].logs.length : 0;
                  const newLogsCount = payload.logs ? payload.logs.length : 0;
                  
                  if (!nextResults[nodeId] || nextResults[nodeId].row_count !== payload.row_count || currentLogsCount !== newLogsCount) {
                    nextResults[nodeId] = {
                      schema: payload.schema,
                      preview: payload.preview,
                      row_count: payload.row_count,
                      column_count: payload.column_count,
                      logs: payload.logs || [],
                      ports: payload.ports
                    };
                    updated = true;
                  }
                }
              }
              return updated ? nextResults : prevResults;
            });

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
    }

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
        let strokeWidth = 1;
        let animated = false;

        if (status === 'running') {
          stroke = '#3b82f6'; // blue
          animated = true;
        } else if (status === 'success') {
          stroke = '#10b981'; // green for all successful routes
          strokeWidth = 1.5;
          animated = false; 
        } else if (status === 'error') {
          stroke = '#ef4444'; // red
          strokeWidth = 1.5;
        }

        if (edge.style?.stroke !== stroke || edge.style?.strokeWidth !== strokeWidth || edge.animated !== animated || edge.type) {
          hasChanges = true;
          const { type, ...edgeWithoutType } = edge; // Remove any saved type (straight/smoothstep)
          return {
            ...edgeWithoutType,
            type: 'default', // Explicitly use default bezier curves
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
            const existingNames = currentSaved.map(t => t.name);
            const newTabName = getUniqueTabName(file.name.replace('.json', ''), existingNames);
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
        isChatOpen={isChatOpen}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
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
            setNodes={setNodes}
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
                  let newName = prompt("Rename Tab:", tab.name);
                  if (newName) {
                    newName = newName.trim();
                    setTabs(prev => {
                      const existingNames = prev.filter(t => t.id !== tab.id).map(t => t.name);
                      const uniqueName = getUniqueTabName(newName, existingNames);
                      return prev.map(t => t.id === tab.id ? { ...t, name: uniqueName } : t);
                    });
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
                key={activeTabId}
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
              activeTabId={activeTabId}
              style={{ height: `${resultsHeight}px` }}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* Backend Disconnected Elegant Overlay */}
      {!isBackendConnected && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#1e293b',
          fontFamily: 'Inter, sans-serif',
          animation: 'fadeIn 0.3s ease-out'
        }}>
          <div style={{
            background: 'white',
            padding: '48px',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.05)',
            textAlign: 'center',
            maxWidth: '440px',
            transform: 'translateY(-20px)'
          }}>
            <div style={{
              width: '80px', height: '80px',
              background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)', 
              color: '#ef4444',
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              margin: '0 auto 24px auto',
              boxShadow: '0 10px 15px -3px rgba(239, 68, 68, 0.3)'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '28px', fontWeight: '800', letterSpacing: '-0.02em', color: '#0f172a' }}>
              Backend Disconnected
            </h2>
            <p style={{ margin: '0 0 32px 0', color: '#64748b', fontSize: '16px', lineHeight: '1.6' }}>
              VibeETL has lost connection to the Python engine. Please ensure that <code style={{background: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', color: '#334155', fontWeight: 600}}>python run.py</code> is actively running in your terminal.
            </p>
            <div style={{
              display: 'inline-flex', alignItems: 'center', padding: '10px 20px',
              background: '#f8fafc', borderRadius: '999px', fontSize: '14px', fontWeight: 600, color: '#475569',
              border: '1px solid #e2e8f0'
            }}>
              <span style={{ 
                width: '10px', height: '10px', borderRadius: '50%', 
                background: '#ef4444', marginRight: '10px', 
                boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.2)'
              }}></span>
              Waiting for connection...
            </div>
          </div>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; backdrop-filter: blur(0px); }
              to { opacity: 1; backdrop-filter: blur(12px); }
            }
          `}</style>
        </div>
      )}
      
      <ChatPanel 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
        nodes={nodes} 
        edges={edges} 
      />
    </div>
  );
}

export default App;
