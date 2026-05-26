import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import ToolPalette from './components/ToolPalette';
import Canvas from './components/Canvas';
import ConfigWindow from './components/ConfigWindow';
import ResultsWindow from './components/ResultsWindow';
import ErrorBoundary from './components/ErrorBoundary';
import CustomNode from './components/CustomNode';
import './App.css';

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

  // Find incoming connection
  const incomingEdge = edges.find(
    (e) => e.target === nodeId && (e.targetPort === 'input' || e.targetHandle === 'input')
  );
  if (!incomingEdge) return [];

  // Resolve upstream node's schema recursively
  const upstreamSchema = resolveNodeSchema(incomingEdge.source, nodes, edges, results);

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

  // Filter, Sort, and File Output don't modify the schema, they just pass it through
  return upstreamSchema;
};

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);

  // Global keydown event listener to delete selected node or edge
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const activeTag = document.activeElement?.tagName;
        if (
          activeTag === 'INPUT' ||
          activeTag === 'SELECT' ||
          activeTag === 'TEXTAREA' ||
          document.activeElement?.isContentEditable
        ) {
          return;
        }

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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNodeId, selectedEdgeId, setNodes, setEdges]);
  
  // Pipeline execution state
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState({});
  const [globalLogs, setGlobalLogs] = useState([]);
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
    fetch('http://127.0.0.1:8000/api/tools')
      .then(res => res.json())
      .then(data => {
        if (data.tools) setAvailableTools(data.tools);
      })
      .catch(err => console.error("Failed to fetch tools:", err));
  }, []);

  // Handles adding wire connections between nodes
  const onConnect = useCallback(
    (params) => {
      const edge = {
        ...params,
        id: `e-${params.source}-${params.target}`,
        style: { stroke: '#9ca3af', strokeWidth: 2 }
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
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
        label = 'Regex Parser';
        category = 'transform';
        icon = 'Brackets';
        defaultParams = { column: '', pattern: '', outputColumns: [] };
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
      } else if (type === 'join') {
        label = 'Join';
        category = 'join';
        icon = 'GitMerge';
        defaultParams = { left_key: '', right_key: '', how: 'inner' };
      } else if (type === 'summarize') {
        label = 'Summarize';
        category = 'transform';
        icon = 'Sigma';
        defaultParams = { group_by: '', agg_column: '', agg_function: 'sum', output_name: 'Aggregated' };
      }
    }

    const newNodeId = `node_${Date.now()}`;
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
  }, [setNodes]);

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

    // Find connection entering the selected node's "input" port
    const incomingEdge = edges.find(
      (e) => e.target === selectedNodeId && (e.targetPort === 'input' || e.targetHandle === 'input')
    );
    if (!incomingEdge) return [];

    return resolveNodeSchema(incomingEdge.source, nodes, edges, results);
  }, [nodes, edges, selectedNodeId, results]);

  const handleClearCache = async () => {
    try {
      await fetch('http://127.0.0.1:8000/api/clear-cache', { method: 'POST' });
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: {
            ...node.data,
            parameters: {
              ...node.data.parameters,
              is_cached: false
            }
          }
        }))
      );
      setGlobalLogs((prev) => [...prev, 'System: Cache completely cleared and all nodes reset.']);
    } catch (err) {
      console.error("Failed to clear cache on backend:", err);
    }
  };

  // Executes the pipeline DAG by sending the graph schema JSON to the backend
  const handleRunPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setGlobalLogs(['Triggering pipeline execution...', 'Serializing DAG graph structure...']);

    // Set all nodes' status to running
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: { ...node.data, status: 'running' }
      }))
    );

    // Build DAG JSON payload for FastAPI
    // We only need id, type, parameters for nodes, and connection ports for edges
    const dagPayload = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        parameters: n.data.parameters || {},
        data: { label: n.data.label }
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
      const response = await fetch('http://127.0.0.1:8000/api/execute', {
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

  const nodeTypes = useMemo(() => {
    const types = { custom: CustomNode };
    availableTools.forEach(tool => {
      types[tool.id] = CustomNode;
    });
    return types;
  }, [availableTools]);

  return (
    <div className="app-container">
      {/* 1. Tool Palette (Top Panel) */}
      <ToolPalette 
        onRunPipeline={handleRunPipeline} 
        onClearCache={handleClearCache}
        isRunning={isRunning} 
        autoRun={autoRun}
        setAutoRun={setAutoRun}
        availableTools={availableTools}
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
                onNodeSelect={handleNodeSelect}
                onEdgeSelect={setSelectedEdgeId}
                onAddNode={handleAddNode}
                onNodesDelete={onNodesDelete}
              />
            </ErrorBoundary>
          </div>

          {/* 4. Results Window (Bottom Panel) */}
          <div className="results-resizer" onMouseDown={startResizingResults} />
          <ErrorBoundary>
            <ResultsWindow
              selectedNode={selectedNode}
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
