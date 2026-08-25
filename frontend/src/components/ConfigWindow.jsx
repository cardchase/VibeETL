import React, { useState, useEffect, useRef } from 'react';
import { Settings, Upload, Check, AlertCircle, Database, Link, X, Plus, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import FormulaEditor from './FormulaEditor';
import { API_BASE } from '../config';


const SafeInput = React.forwardRef(({ value, checked, onChange, onBlur, type, ...props }, ref) => {
  const isCheck = type === 'checkbox' || type === 'radio' || type === 'file';
  const [localValue, setLocalValue] = React.useState(isCheck ? checked : (value ?? ''));
  
  React.useEffect(() => { 
    setLocalValue(isCheck ? checked : (value ?? ''));
  }, [value, checked, isCheck]);
  
  const handleBlur = (e) => {
    if (onChange && localValue !== (isCheck ? checked : value)) {
      onChange({ target: { value: localValue, checked: localValue } });
    }
    if (onBlur) onBlur(e);
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Escape') {
      e.stopPropagation();
    }
    if (e.key === 'Enter') {
      if (onChange && localValue !== (isCheck ? checked : value)) {
        onChange({ target: { value: localValue, checked: localValue } });
      }
    }
    if (props.onKeyDown) props.onKeyDown(e);
  };

  const handleChange = (e) => {
    const v = isCheck ? (type === 'file' ? e.target.files : e.target.checked) : e.target.value;
    setLocalValue(v);
    if (isCheck && onChange) {
      if (type === 'file') {
        onChange(e); // Pass the original event for files
      } else {
        onChange({ target: { value: v, checked: v } });
      }
    }
  };

  if (type === 'file') {
     return <input ref={ref} type={type} onChange={handleChange} onBlur={handleBlur} onKeyDown={handleKeyDown} {...props} />;
  }

  return <input ref={ref} type={type} value={isCheck ? undefined : localValue} checked={isCheck ? localValue : undefined} onChange={handleChange} onBlur={handleBlur} onKeyDown={handleKeyDown} {...props} />;
});

const SafeTextarea = ({ value, onChange, onBlur, ...props }) => {
  const [localValue, setLocalValue] = React.useState(value ?? '');
  React.useEffect(() => { setLocalValue(value ?? '') }, [value]);
  
  const handleBlur = (e) => {
    if (onChange && localValue !== value) onChange({ target: { value: localValue } });
    if (onBlur) onBlur(e);
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Escape') {
      e.stopPropagation();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const target = e.target;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = localValue.substring(0, start) + '    ' + localValue.substring(end);
      setLocalValue(newValue);
      
      // Update cursor position after React re-renders
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      }, 0);
      
      // We also need to fire onChange so the graph node updates
      if (onChange) {
        onChange({ target: { value: newValue } });
      }
    }
    if (props.onKeyDown) props.onKeyDown(e);
  };

  return <textarea value={localValue} onChange={e => setLocalValue(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown} {...props} />;
};

const SafeSelect = ({ onKeyDown, ...props }) => {
  const handleKeyDown = (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Escape') {
      e.stopPropagation();
    }
    if (onKeyDown) onKeyDown(e);
  };
  return <select onKeyDown={handleKeyDown} {...props} />;
};


const getOperatorsForType = (type = '') => {
  const lowerType = type.toLowerCase();
  
  if (
    lowerType.includes('int') || 
    lowerType.includes('float') || 
    lowerType.includes('double') || 
    lowerType.includes('decimal') || 
    lowerType.includes('numeric') ||
    lowerType === 'number'
  ) {
    return [
      { value: '==', label: 'Equals (=)' },
      { value: '!=', label: 'Does Not Equal (≠)' },
      { value: '>', label: 'Greater Than (>)' },
      { value: '>=', label: 'Greater Than or Equal (≥)' },
      { value: '<', label: 'Less Than (<)' },
      { value: '<=', label: 'Less Than or Equal (≤)' },
      { value: 'is_null', label: 'Is Null' },
      { value: 'is_not_null', label: 'Is Not Null' }
    ];
  }
  
  if (lowerType.includes('date') || lowerType.includes('time')) {
    return [
      { value: '==', label: 'Equals (=)' },
      { value: '!=', label: 'Does Not Equal (≠)' },
      { value: '>', label: 'After (>)' },
      { value: '>=', label: 'On or After (≥)' },
      { value: '<', label: 'Before (<)' },
      { value: '<=', label: 'On or Before (≤)' },
      { value: 'is_null', label: 'Is Null' },
      { value: 'is_not_null', label: 'Is Not Null' }
    ];
  }
  
  if (lowerType.includes('bool')) {
    return [
      { value: '==', label: 'Equals (=)' },
      { value: '!=', label: 'Does Not Equal (≠)' },
      { value: 'is_null', label: 'Is Null' },
      { value: 'is_not_null', label: 'Is Not Null' }
    ];
  }
  
  return [
    { value: '==', label: 'Equals (=)' },
    { value: '!=', label: 'Does Not Equal (≠)' },
    { value: 'contains', label: 'Contains (text)' },
    { value: 'not_contains', label: 'Does Not Contain (text)' },
    { value: 'starts_with', label: 'Starts With (text)' },
    { value: 'ends_with', label: 'Ends With (text)' },
    { value: 'is_null', label: 'Is Null' },
    { value: 'is_not_null', label: 'Is Not Null' },
    { value: 'is_empty', label: 'Is Empty String ("")' },
    { value: 'is_not_empty', label: 'Is Not Empty String' },
    { value: 'is_blank', label: 'Is Blank (Null or Whitespace)' },
    { value: 'is_not_blank', label: 'Is Not Blank' }
  ];
};

const OPERATOR_LABELS = {
  '==': '==', '!=': '!=', '>': '>', '>=': '>=', '<': '<', '<=': '<=',
  'contains': 'CONTAINS', 'not_contains': 'NOT CONTAINS', 'starts_with': 'STARTS WITH', 'ends_with': 'ENDS WITH',
  'is_null': 'IS NULL', 'is_not_null': 'IS NOT NULL',
  'is_empty': 'IS EMPTY', 'is_not_empty': 'IS NOT EMPTY',
  'is_blank': 'IS BLANK', 'is_not_blank': 'IS NOT BLANK'
};

const ConfigWindow = ({ selectedNode, upstreamSchema, onUpdateParams, availableTools = [], results = {}, nodes = [], edges = [], setNodes, style = {}, onCacheAndRun, onClearGlobalCache }) => {
  const [uploading, setUploading] = useState(false);
  const [nodeToAdd, setNodeToAdd] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [excelSheets, setExcelSheets] = useState([]);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Summarize rule state
  const [sumColumn, setSumColumn] = useState('');
  const [sumAction, setSumAction] = useState('group_by');
  const [sumOutput, setSumOutput] = useState('');
  const dragSumItemRef = useRef(null);
  const dragSumOverItemRef = useRef(null);
  
  // Sort rule state
  const [sortColumn, setSortColumn] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');

  // Formula expansion state
  const [expandedFormulas, setExpandedFormulas] = useState({});
  const toggleFormulaExpand = (idx) => {
    setExpandedFormulas(prev => ({
      ...prev,
      [idx]: prev[idx] === false ? true : false
    }));
  };

  // Universal Drag & Drop Handlers for rule arrays
  const dragItemRef = useRef(null);
  const dragOverItemRef = useRef(null);

  const handleDragStart = (e, position) => {
    dragItemRef.current = position;
  };

  const handleDragEnter = (e, position) => {
    dragOverItemRef.current = position;
  };

  const handleDropArray = (e, array, paramKey) => {
    e.preventDefault();
    if (dragItemRef.current === null || dragOverItemRef.current === null) return;
    const newItems = [...array];
    const dragItemContent = newItems[dragItemRef.current];
    newItems.splice(dragItemRef.current, 1);
    newItems.splice(dragOverItemRef.current, 0, dragItemContent);
    dragItemRef.current = null;
    dragOverItemRef.current = null;
    onUpdateParams(id, { ...parameters, [paramKey]: newItems });
  };

  const isValidNode = selectedNode && typeof selectedNode === 'object' && selectedNode.id;
  const id = isValidNode ? selectedNode.id : null;
  const type = isValidNode ? selectedNode.type : null;
  const data = isValidNode ? selectedNode.data : null;
  const parameters = data?.parameters || {};
  const toolDef = availableTools.find(t => t.id === type);

  // Dynamic file scan for schema and excel sheets
  useEffect(() => {
    if (isValidNode && type === 'fileInput' && parameters.filePath) {
      fetch('http://127.0.0.1:8000/api/tools/file-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: parameters.filePath })
      })
      .then(res => {
        if (!res.ok) throw new Error('Scan failed');
        return res.json();
      })
      .then(data => {
        if (data.excel_sheets && Array.isArray(data.excel_sheets)) {
          setExcelSheets(data.excel_sheets);
        } else {
          setExcelSheets([]);
        }
        // Update node schema blueprint if changed
        if (data.schema_blueprint) {
           onUpdateParams(id, {
             ...parameters,
             detectedSchema: data.schema_blueprint
           });
        }
      })
      .catch((err) => {
        console.warn('File scan warning:', err);
        setExcelSheets([]);
      });
    } else {
      setExcelSheets([]);
    }
  }, [isValidNode, type, parameters.filePath]);

  // Helper: check if we have upstream columns
  const hasUpstreamColumns = Array.isArray(upstreamSchema) && upstreamSchema.length > 0;

  // Initialize and sync SelectNode columns with upstream schema robustly
  useEffect(() => {
    if (isValidNode && type === 'select' && hasUpstreamColumns) {
      const currentCols = Array.isArray(parameters.columns) ? parameters.columns.filter(Boolean) : [];
      const currentNames = currentCols.filter(c => c && typeof c.name === 'string').map((c) => c.name);
      
      const validUpstreamSchema = Array.isArray(upstreamSchema) ? upstreamSchema.filter(Boolean) : [];
      const upstreamNames = validUpstreamSchema.filter(col => col && typeof col.name === 'string').map((col) => col.name);

      // Check if they are different (e.g. lengths differ, or some columns are missing)
      const isDifferent =
        currentCols.length === 0 ||
        currentCols.length !== validUpstreamSchema.length ||
        upstreamNames.some((name) => !currentNames.includes(name));

      if (isDifferent) {
        const initialCols = validUpstreamSchema.map((col) => {
          const existing = currentCols.find((c) => c && c.name === col.name);
          return {
            name: col.name,
            originalType: col.type || 'Unknown',
            keep: existing ? existing.keep : true,
            rename: existing ? existing.rename : col.name,
            type: existing ? existing.type : '',
          };
        });

        // Only update parameters if there is an actual structural or value change
        if (JSON.stringify(currentCols) !== JSON.stringify(initialCols)) {
          onUpdateParams(id, {
            ...parameters,
            columns: initialCols,
          });
        }
      }
    }
  }, [isValidNode, type, id, upstreamSchema, parameters.columns, onUpdateParams, hasUpstreamColumns]);

  if (!isValidNode) {
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length > 1) {
      return (
        <div className="config-sidebar" style={{ ...style, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div className="sidebar-header">
              <span className="sidebar-title">
                <Settings size={16} />
                Multiple Tools Selected ({selectedNodes.length})
              </span>
            </div>
            <div className="sidebar-content" style={{ padding: '15px' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                The following tools are currently selected:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedNodes.map(n => (
                  <div key={n.id} style={{ 
                    padding: '10px', 
                    background: 'var(--bg-secondary)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    <span style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      width: '28px', 
                      height: '28px', 
                      background: 'var(--bg-tertiary)', 
                      borderRadius: '4px',
                      color: 'var(--color-accent)'
                    }}>
                      <Settings size={14} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {n.data?.parameters?.label || n.data?.label || n.type}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        ID: {n.id}
                      </div>
                    </div>
                    <button 
                      onClick={() => setNodes && setNodes(nds => nds.map(node => node.id === n.id ? { ...node, selected: false } : node))}
                      title="Deselect"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '4px' }}
                      onMouseOver={(e) => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              
              <div style={{ marginTop: '25px', padding: '15px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
                  Add to Selection
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    value={nodeToAdd} 
                    onChange={(e) => setNodeToAdd(e.target.value)}
                    style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.75rem' }}
                  >
                    <option value="">-- Find a tool --</option>
                    {nodes.filter(n => !n.selected).map(n => (
                      <option key={n.id} value={n.id}>
                        {n.data?.parameters?.label || n.data?.label || n.type} ({n.id})
                      </option>
                    ))}
                  </select>
                  <button 
                    onClick={() => {
                      if (nodeToAdd && setNodes) {
                        setNodes(nds => nds.map(n => n.id === nodeToAdd ? { ...n, selected: true } : n));
                        setNodeToAdd('');
                      }
                    }}
                    disabled={!nodeToAdd}
                    style={{ padding: '6px 12px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: '4px', cursor: nodeToAdd ? 'pointer' : 'not-allowed', opacity: nodeToAdd ? 1 : 0.5, fontWeight: 500, fontSize: '0.75rem' }}
                  >
                    Add
                  </button>
                </div>
              </div>

            </div>
          </div>
          
        </div>
      );
    }

    return (
      <div className="config-sidebar" style={{ ...style, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="no-node-selected">
            <Settings />
            <p>Select a node on the canvas to configure its settings.</p>
          </div>
        </div>
        
      </div>
    );
  }

  // Standard change handler for simple fields
  const handleParamChange = (key, val) => {
    onUpdateParams(id, {
      ...parameters,
      [key]: val,
    });
  };

  const handleMultipleParamsChange = (updates) => {
    onUpdateParams(id, {
      ...parameters,
      ...updates,
    });
  };

  // Handle file upload
  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text() || 'Failed to upload file');
      }

      const resData = await response.json();
      
      // Update node parameters with file details
      onUpdateParams(id, {
        ...parameters,
        filePath: resData.filename,
        fileType: 'auto',
        csvDelimiter: ',',
        csvHeader: true,
        detectedSchema: resData.schema,
      });
    } catch (err) {
      setUploadError(err.message || 'Error uploading file');
    } finally {
      setUploading(false);
    }
  };

  // Drag and drop handlers for upload zone
  const onDragOver = (e) => {
    e.preventDefault();
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };



  const renderFileInputConfig = () => {
    const filePath = parameters.filePath || '';
    const fileType = parameters.fileType || 'auto';
    const csvDelimiter = parameters.csvDelimiter || ',';
    const csvHeader = parameters.csvHeader !== false;
    const excelSheet = parameters.excelSheet || '';
    const detectedSchema = parameters.detectedSchema || [];
    const schemaOverrides = parameters.schemaOverrides || {};

    const handleSchemaOverride = (colName, newType) => {
      onUpdateParams(id, {
        ...parameters,
        schemaOverrides: {
          ...schemaOverrides,
          [colName]: newType
        }
      });
    };

    const isCsv = fileType === 'csv' || (fileType === 'auto' && filePath.endsWith('.csv'));
    const isExcel = fileType === 'excel' || (fileType === 'auto' && (filePath.endsWith('.xlsx') || filePath.endsWith('.xls') || filePath.endsWith('.ods')));
    const isParquet = fileType === 'parquet' || (fileType === 'auto' && (filePath.endsWith('.parquet') || filePath.endsWith('.arrow')));
    const isPdf = fileType === 'pdf' || (fileType === 'auto' && filePath.endsWith('.pdf'));

    return (
      <>
        <div className="form-group">
          <label className="form-label">Local File Path / Select File</label>
          <div
            className="file-upload-zone"
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload />
            <div className="file-upload-text">
              {uploading ? (
                'Processing file...'
              ) : filePath ? (
                <div style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                  <Check size={14} style={{ display: 'inline', marginRight: 4 }} />
                  {filePath.split(/[/\\]/).pop()}
                </div>
              ) : (
                'Click to select or drag a file here'
              )}
            </div>
            <SafeInput
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />
          </div>
          {uploadError && (
            <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: 4 }}>
              {uploadError}
            </div>
          )}
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', gap: '8px' }}>
            <SafeInput
              type="text"
              placeholder="C:/data/file.csv"
              value={filePath}
              onChange={(e) => handleParamChange('filePath', e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.75rem', height: '32px' }}
              onClick={async () => {
                try {
                  const res = await fetch('http://127.0.0.1:8000/api/pick_open_file');
                  const data = await res.json();
                  if (data.file_path) {
                    handleParamChange('filePath', data.file_path);
                  }
                } catch (e) {
                  console.error("Failed to pick file", e);
                }
              }}
            >
              Browse...
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">File Type</label>
          <SafeSelect value={fileType} onChange={(e) => handleParamChange('fileType', e.target.value)}>
            <option value="auto">Auto-detect</option>
            <option value="csv">CSV (Comma-Separated)</option>
            <option value="excel">Excel Spreadsheet</option>
            <option value="parquet">Parquet / Arrow</option>
            <option value="pdf">PDF Document (Tables)</option>
            <option value="text">Text File (.txt)</option>
            <option value="word">Word Document (.docx)</option>
          </SafeSelect>
        </div>

        {isCsv ? (
          <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">CSV Delimiter</label>
              <SafeSelect
                value={csvDelimiter}
                onChange={(e) => handleParamChange('csvDelimiter', e.target.value)}
              >
                <option value=",">Comma (,)</option>
                <option value="&#9;">Tab (\t)</option>
                <option value=";">Semicolon (;)</option>
                <option value="|">Pipe (|)</option>
              </SafeSelect>
            </div>
            <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <SafeInput
                id="csvHeaderCheck"
                type="checkbox"
                checked={csvHeader}
                onChange={(e) => handleParamChange('csvHeader', e.target.checked)}
              />
              <label htmlFor="csvHeaderCheck" className="form-label" style={{ cursor: 'pointer', marginBottom: 0 }}>
                First row contains headers
              </label>
            </div>
          </div>
        ) : null}

        {isExcel ? (
          <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Sheet Name</label>
              {excelSheets.length > 0 ? (
                <SafeSelect
                  value={excelSheet}
                  onChange={(e) => handleParamChange('excelSheet', e.target.value)}
                >
                  <option value="">-- First Sheet (Default) --</option>
                  {excelSheets.map((sheet) => (
                    <option key={sheet} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </SafeSelect>
              ) : (
                <SafeInput
                  type="text"
                  placeholder="Leave empty for first sheet"
                  value={excelSheet}
                  onChange={(e) => handleParamChange('excelSheet', e.target.value)}
                />
              )}
            </div>
          </div>
        ) : null}

        {isParquet ? (
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '16px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={16} />
            <span style={{ fontWeight: 600 }}>Native Arrow Format - Optimization Locked</span>
          </div>
        ) : null}

        {isPdf ? (
          <div className="form-group">
            <label className="form-label">PDF Extraction Mode</label>
            <SafeSelect
              value={parameters.pdfExtractionMode || 'text'}
              onChange={(e) => handleParamChange('pdfExtractionMode', e.target.value)}
            >
              <option value="text">Text Mode</option>
              <option value="ocr">OCR (Image to Text)</option>
            </SafeSelect>
          </div>
        ) : null}

        {detectedSchema.length > 0 && (
          <div style={{ marginTop: '10px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Schema Blueprint Matrix</span>
              {Object.keys(schemaOverrides || {}).length > 0 && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onUpdateParams(id, { ...parameters, schemaOverrides: {} });
                  }}
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '0.65rem',
                    cursor: 'pointer',
                    color: 'var(--text-muted)'
                  }}
                  title="Revert all columns to their auto-detected original types"
                >
                  Revert to Original
                </button>
              )}
            </div>
            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 1, borderBottom: '1px solid var(--border-color)' }}>
                  <tr>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-muted)' }}>Column Name</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-muted)' }}>Data Type</th>
                  </tr>
                </thead>
                <tbody>
                  {detectedSchema.map((col, idx) => {
                    const currentType = schemaOverrides[col.name] || col.type;
                    return (
                      <tr key={`${col.name}-${idx}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>{col.name}</td>
                        <td style={{ padding: '4px 12px' }}>
                          <SafeSelect
                            value={currentType}
                            onChange={(e) => handleSchemaOverride(col.name, e.target.value)}
                            style={{ padding: '4px', fontSize: '0.7rem', width: '100%', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-secondary)' }}
                          >
                            <option value={col.type}>{col.type} (Auto)</option>
                            <option value="String">String / Text</option>
                            <option value="Int64">Integer</option>
                            <option value="Float64">Float / Decimal</option>
                            <option value="Boolean">Boolean</option>
                            <option value="Datetime">Datetime</option>
                            <option value="Date">Date</option>
                            <option value="Time">Time</option>
                            <option value="Currency">Currency (USD)</option>
                            <option value="Percentage">Percentage</option>
                          </SafeSelect>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderFilterConfig = () => {
    const filterType = parameters.filterType || 'basic';
    let conditions = parameters.conditions;
    
    // Legacy migration
    if (!conditions && parameters.column) {
      conditions = [{ column: parameters.column, operator: parameters.operator || '==', value: parameters.value || '', logic: 'AND' }];
      setTimeout(() => onUpdateParams(id, { ...parameters, conditions, column: undefined, operator: undefined, value: undefined }), 0);
    }
    
    const currentConditions = conditions || [{ column: '', operator: '==', value: '', logic: 'AND' }];
    const customExpression = parameters.customExpression || '';

    let expressionPreview = 'No condition configured';
    if (filterType === 'custom') {
      expressionPreview = customExpression || 'No custom expression';
    } else if (currentConditions.length > 0 && currentConditions[0].column) {
      expressionPreview = currentConditions.map((cond, i) => {
        const opLabel = OPERATOR_LABELS[cond.operator] || cond.operator;
        let str = `[${cond.column}] ${opLabel}`;
        if (cond.operator !== 'is_null' && cond.operator !== 'is_not_null') {
          str += ` "${cond.value}"`;
        }
        return i > 0 ? ` ${cond.logic} ${str}` : str;
      }).join('');
    }

    const handleConditionChange = (idx, field, val) => {
      const newConditions = [...currentConditions];
      newConditions[idx] = { ...newConditions[idx], [field]: val };
      if (field === 'column') {
        const colObj = hasUpstreamColumns ? upstreamSchema.find(col => col.name === val) : null;
        const targetType = colObj?.type || 'String';
        const targetOperators = getOperatorsForType(targetType);
        const currentOp = newConditions[idx].operator;
        if (!targetOperators.some(op => op.value === currentOp)) {
          newConditions[idx].operator = '==';
        }
        newConditions[idx].value = '';
      }
      onUpdateParams(id, { ...parameters, conditions: newConditions });
    };

    const addCondition = () => {
      onUpdateParams(id, { ...parameters, conditions: [...currentConditions, { column: '', operator: '==', value: '', logic: 'AND' }] });
    };

    const removeCondition = (idx) => {
      const newConditions = currentConditions.filter((_, i) => i !== idx);
      if (newConditions.length === 0) newConditions.push({ column: '', operator: '==', value: '', logic: 'AND' });
      onUpdateParams(id, { ...parameters, conditions: newConditions });
    };

    const applyQuickFilter = (e) => {
      const type = e.target.value;
      if (!type) return;
      e.target.value = ""; // Reset dropdown
      
      const newConditions = [];
      const schema = upstreamSchema || [];
      
      if (type === 'drop_any_null') {
        schema.forEach((col, i) => {
          newConditions.push({ column: col.name, operator: 'is_not_null', value: '', logic: 'AND' });
        });
      } else if (type === 'drop_all_null') {
        schema.forEach((col, i) => {
          newConditions.push({ column: col.name, operator: 'is_not_null', value: '', logic: i === 0 ? 'AND' : 'OR' });
        });
      } else if (type === 'drop_any_blank') {
        schema.forEach((col, i) => {
          const isStr = (col.type || '').toLowerCase() === 'string';
          newConditions.push({ column: col.name, operator: isStr ? 'is_not_blank' : 'is_not_null', value: '', logic: 'AND' });
        });
      } else if (type === 'drop_all_blank') {
        schema.forEach((col, i) => {
          const isStr = (col.type || '').toLowerCase() === 'string';
          newConditions.push({ column: col.name, operator: isStr ? 'is_not_blank' : 'is_not_null', value: '', logic: i === 0 ? 'AND' : 'OR' });
        });
      } else if (type === 'drop_negatives') {
        const numCols = schema.filter(c => c.type === 'Int64' || c.type === 'Float64');
        numCols.forEach((col, i) => {
          newConditions.push({ column: col.name, operator: '>=', value: '0', logic: 'AND' });
        });
      } else if (type === 'clear') {
        newConditions.push({ column: '', operator: '==', value: '', logic: 'AND' });
      }

      if (newConditions.length > 0) {
        onUpdateParams(id, { ...parameters, conditions: newConditions, filterType: 'basic' });
      }
    };

    let examples = [];
    if (hasUpstreamColumns) {
      const stringCols = upstreamSchema.filter(c => c.type === 'String').map(c => c.name);
      const numCols = upstreamSchema.filter(c => c.type === 'Int64' || c.type === 'Float64').map(c => c.name);
      
      if (stringCols.length > 0) {
        examples.push(`[${stringCols[0]}] == "Active"`);
        examples.push(`CONTAINS([${stringCols[0]}], "Test")`);
      }
      if (numCols.length > 0) {
        examples.push(`[${numCols[0]}] > 100`);
      }
    }
    if (examples.length === 0) {
      examples = ['[Age] > 30', '[Department] == "Engineering"', '[Status] IS NOT NULL'];
    }

    return (
      <>
        <div className="filter-expression-bar" style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px',
          padding: '8px 12px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
          display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px'
        }}>
          <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontSize: '0.65rem', textTransform: 'uppercase', background: 'var(--border-color)', padding: '2px 6px', borderRadius: '3px', flexShrink: 0 }}>EXP</span>
          <input 
            type="text" 
            readOnly 
            value={expressionPreview} 
            style={{ 
              background: 'transparent', border: 'none', color: (filterType === 'custom' && customExpression) || (filterType === 'basic' && currentConditions[0]?.column) ? 'var(--color-prep)' : 'var(--text-muted)',
              width: '100%', outline: 'none', fontFamily: 'inherit', fontSize: 'inherit',
              textOverflow: 'ellipsis'
            }} 
            onClick={(e) => e.target.select()}
            title="Click to select expression"
          />
        </div>

        {!hasUpstreamColumns && (
          <div className="glass-panel" style={{ padding: 10, borderRadius: 6, display: 'flex', gap: 8, background: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.2)', marginBottom: 10 }}>
            <AlertCircle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              Connect this node's input and execute the workflow to automatically load column fields.
            </span>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Filter Type</label>
          <SafeSelect value={filterType} onChange={(e) => {
            const newType = e.target.value;
            if (newType === 'custom' && !customExpression && currentConditions.length > 0 && currentConditions[0].column) {
              // Automatically port basic condition to custom expression if custom is empty
              let autoPopulated = currentConditions.filter(c => c.column).map((cond, i) => {
                let str = `[${cond.column}]`;
                if (cond.operator === 'is_null') {
                  str += ' IS NULL';
                } else if (cond.operator === 'is_not_null') {
                  str += ' IS NOT NULL';
                } else if (cond.operator === 'is_empty') {
                  str += " = ''";
                } else if (cond.operator === 'is_not_empty') {
                  str += " != ''";
                } else if (cond.operator === 'is_blank') {
                  str = `(TRIM(${str}) = '' OR ${str} IS NULL)`;
                } else if (cond.operator === 'is_not_blank') {
                  str = `TRIM(${str}) != '' AND ${str} IS NOT NULL`;
                } else {
                  const colObj = hasUpstreamColumns ? upstreamSchema.find(col => col.name === cond.column) : null;
                  const colType = colObj?.type || 'String';
                  const needsQuotes = colType === 'String' || colType.includes('Date');
                  const val = needsQuotes ? `'${cond.value.replace(/'/g, "''")}'` : cond.value;
                  
                  if (cond.operator === '==') str += ` = ${val}`;
                  else if (cond.operator === '!=') str += ` != ${val}`;
                  else if (cond.operator === '>') str += ` > ${val}`;
                  else if (cond.operator === '>=') str += ` >= ${val}`;
                  else if (cond.operator === '<') str += ` < ${val}`;
                  else if (cond.operator === '<=') str += ` <= ${val}`;
                  else if (cond.operator === 'contains') {
                    str += ` LIKE '%${cond.value.replace(/'/g, "''")}%'`;
                  }
                  else if (cond.operator === 'not_contains') {
                    str += ` NOT LIKE '%${cond.value.replace(/'/g, "''")}%'`;
                  }
                  else if (cond.operator === 'starts_with') {
                    str += ` LIKE '${cond.value.replace(/'/g, "''")}%'`;
                  }
                  else if (cond.operator === 'ends_with') {
                    str += ` LIKE '%${cond.value.replace(/'/g, "''")}'`;
                  }
                }
                return i > 0 ? `\n${cond.logic} ${str}` : str;
              }).join('');
              onUpdateParams(id, { ...parameters, filterType: newType, customExpression: autoPopulated });
            } else {
              handleParamChange('filterType', newType);
            }
          }}>
            <option value="basic">Basic Condition</option>
            <option value="custom">Custom Expression</option>
          </SafeSelect>
        </div>

        {filterType === 'custom' ? (
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Custom Expression</label>
            <FormulaEditor
              value={customExpression}
              onChange={(e) => handleParamChange('customExpression', e.target.value)}
              columns={upstreamSchema || []}
              placeholder="e.g. [Department] == 'HR' AND [Age] > 30"
              height="80px"
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Basic Conditions</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select 
                  onChange={applyQuickFilter}
                  defaultValue=""
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '0.65rem', padding: '3px 8px', cursor: 'pointer', fontWeight: 600, outline: 'none' }}
                >
                  <option value="" disabled>Quick Filters</option>
                  <option value="drop_any_null">Drop Any Nulls</option>
                  <option value="drop_all_null">Drop All Nulls</option>
                  <option value="drop_any_blank">Drop Any Blanks</option>
                  <option value="drop_all_blank">Drop All Blanks</option>
                  <option value="drop_negatives">Drop Negatives</option>
                  <option value="clear">Clear All</option>
                </select>
                <button 
                  onClick={addCondition}
                  style={{ background: 'var(--color-prep)', border: 'none', borderRadius: '4px', color: 'white', fontSize: '0.65rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600, height: '100%' }}
                >
                  <Plus size={12} /> Add
                </button>
                <button 
                  onClick={() => {
                    onUpdateParams(id, { ...parameters, conditions: [{ column: '', operator: '==', value: '', logic: 'AND' }] }); 
                  }}
                  title="Clear All Conditions"
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '0.65rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600, height: '100%' }}
                >
                  <Trash2 size={12} /> Clear All
                </button>
              </div>
            </div>
            
            <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                <thead style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <tr>
                    <th style={{ padding: '6px', width: '60px' }}>Logic</th>
                    <th style={{ padding: '6px' }}>Column</th>
                    <th style={{ padding: '6px', width: '100px' }}>Operator</th>
                    <th style={{ padding: '6px' }}>Value</th>
                    <th style={{ padding: '6px', width: '30px', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {currentConditions.map((cond, idx) => {
                    const colObj = hasUpstreamColumns ? upstreamSchema.find(col => col.name === cond.column) : null;
                    const colType = colObj?.type || 'String';
                    const lowerType = colType.toLowerCase();
                    const validOperators = getOperatorsForType(colType);

                    return (
                      <tr 
                        key={idx} 
                        draggable 
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragEnter={(e) => handleDragEnter(e, idx)}
                        onDragEnd={(e) => handleDropArray(e, currentConditions, 'conditions')}
                        onDragOver={(e) => e.preventDefault()}
                        style={{ borderBottom: idx < currentConditions.length - 1 ? '1px solid var(--border-color)' : 'none', cursor: 'grab' }}
                      >
                        <td style={{ padding: '4px 6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ color: 'var(--text-muted)', cursor: 'grab' }}>⋮⋮</span>
                          {idx > 0 ? (
                            <select 
                              value={cond.logic} 
                              onChange={e => handleConditionChange(idx, 'logic', e.target.value)}
                              style={{ width: '100%', background: 'transparent', border: '1px solid transparent', color: 'var(--color-prep)', outline: 'none', fontWeight: 600, cursor: 'pointer', padding: '2px' }}
                            >
                              <option value="AND">AND</option>
                              <option value="OR">OR</option>
                            </select>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', padding: '2px 4px', display: 'block', textAlign: 'center' }}>WHERE</span>
                          )}
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          {hasUpstreamColumns ? (
                            <SafeSelect value={cond.column} onChange={e => handleConditionChange(idx, 'column', e.target.value)} style={{ padding: '4px', width: '100%', boxSizing: 'border-box' }}>
                              <option value="">-- Select --</option>
                              {upstreamSchema.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                            </SafeSelect>
                          ) : (
                            <SafeInput type="text" value={cond.column} onChange={e => handleConditionChange(idx, 'column', e.target.value)} placeholder="Column" style={{ padding: '4px', width: '100%', boxSizing: 'border-box' }} />
                          )}
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <SafeSelect value={cond.operator} onChange={(e) => handleConditionChange(idx, 'operator', e.target.value)} style={{ padding: '4px', width: '100%', boxSizing: 'border-box' }}>
                            {validOperators?.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                          </SafeSelect>
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          {cond.operator === 'is_null' || cond.operator === 'is_not_null' ? (
                            <div style={{ padding: '4px', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: '4px', textAlign: 'center' }}>N/A</div>
                          ) : colType === 'Boolean' ? (
                            <SafeSelect value={cond.value} onChange={(e) => handleConditionChange(idx, 'value', e.target.value)} style={{ padding: '4px', width: '100%', boxSizing: 'border-box' }}>
                              <option value="true">True</option>
                              <option value="false">False</option>
                            </SafeSelect>
                          ) : (
                            <SafeInput
                              type={lowerType.includes('date') ? 'date' : 'text'}
                              placeholder="Enter value"
                              value={cond.value}
                              onChange={(e) => handleConditionChange(idx, 'value', e.target.value)}
                              style={{ padding: '4px', width: '100%', boxSizing: 'border-box' }}
                            />
                          )}
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          {currentConditions.length > 1 && (
                            <button 
                              onClick={() => removeCondition(idx)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Remove condition"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderSortConfig = () => {
    let rules = parameters.rules;
    
    // Legacy migration
    if (!rules && parameters.column) {
      rules = [{ column: parameters.column, order: parameters.descending ? 'desc' : 'asc' }];
      setTimeout(() => onUpdateParams(id, { ...parameters, rules, column: undefined, descending: undefined }), 0);
    }
    
    const currentRules = rules || [];
    const schema = Array.isArray(upstreamSchema) ? upstreamSchema : [];

    const handleAddRule = () => {
      if (!sortColumn) return;
      onUpdateParams(id, { ...parameters, rules: [...currentRules, { column: sortColumn, order: sortOrder }] });
      setSortColumn('');
      setSortOrder('asc');
    };

    return (
      <div className="sort-config">
        <div style={{ marginBottom: '16px' }}>
          <label className="form-label">Sorting Rules (Order Matters)</label>
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
            {currentRules.length === 0 ? (
              <div style={{ padding: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>No rules configured.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '8px', width: '30px' }}>#</th>
                    <th style={{ padding: '8px' }}>Column</th>
                    <th style={{ padding: '8px' }}>Order</th>
                    <th style={{ padding: '8px', width: '30px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {currentRules.map((rule, idx) => (
                    <tr 
                      key={idx} 
                      draggable 
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragEnter={(e) => handleDragEnter(e, idx)}
                      onDragEnd={(e) => handleDropArray(e, currentRules, 'rules')}
                      onDragOver={(e) => e.preventDefault()}
                      style={{ borderBottom: idx < currentRules.length - 1 ? '1px solid var(--border-color)' : 'none', cursor: 'grab' }}
                    >
                      <td style={{ padding: '8px', color: 'var(--text-muted)' }}>
                        <span style={{ color: 'var(--text-muted)', cursor: 'grab', marginRight: '4px' }}>⋮⋮</span>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '8px', color: 'var(--text-primary)' }}>{rule.column}</td>
                      <td style={{ padding: '8px', color: 'var(--color-accent)', fontWeight: 600 }}>
                        {rule.order === 'desc' ? 'Descending' : 'Ascending'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button 
                          onClick={() => {
                            const newRules = [...currentRules];
                            newRules.splice(idx, 1);
                            onUpdateParams(id, { ...parameters, rules: newRules });
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}
                          title="Remove Rule"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
          <label className="form-label" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Add Sort Rule
          </label>
          <div className="form-group">
            <SafeSelect value={sortColumn} onChange={(e) => setSortColumn(e.target.value)} style={{ width: '100%', marginBottom: '8px' }}>
              <option value="">-- Select Column --</option>
              {schema.map(c => (
                <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
              ))}
            </SafeSelect>
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <SafeSelect value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={{ width: '100%' }} disabled={!sortColumn}>
              <option value="asc">Ascending (A-Z, 0-9)</option>
              <option value="desc">Descending (Z-A, 9-0)</option>
            </SafeSelect>
          </div>
          <button 
            onClick={handleAddRule}
            disabled={!sortColumn}
            style={{
              width: '100%', padding: '8px', background: !sortColumn ? 'var(--bg-primary)' : 'var(--color-accent)',
              color: !sortColumn ? 'var(--text-muted)' : 'white', border: '1px solid var(--border-color)',
              borderRadius: '4px', cursor: !sortColumn ? 'not-allowed' : 'pointer', fontWeight: 600
            }}
          >
            Add Rule
          </button>
        </div>
      </div>
    );
  };

  const renderSelectConfig = () => {
    const columns = Array.isArray(parameters.columns) ? parameters.columns.filter(Boolean) : [];

    const handleColumnToggle = (index, field, value) => {
      const updatedCols = [...columns];
      updatedCols[index] = {
        ...updatedCols[index],
        [field]: value,
      };
      handleParamChange('columns', updatedCols);
    };

    const handleColumnMove = (idx, direction) => {
      const newColumns = [...columns];
      if (direction === 'up' && idx > 0) {
        const temp = newColumns[idx];
        newColumns[idx] = newColumns[idx - 1];
        newColumns[idx - 1] = temp;
        handleParamChange('columns', newColumns);
      } else if (direction === 'down' && idx < columns.length - 1) {
        const temp = newColumns[idx];
        newColumns[idx] = newColumns[idx + 1];
        newColumns[idx + 1] = temp;
        handleParamChange('columns', newColumns);
      }
    };

    return (
      <>
        {!hasUpstreamColumns && (
          <div className="glass-panel" style={{ padding: 10, borderRadius: 6, display: 'flex', gap: 8, background: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.2)', marginBottom: 10 }}>
            <AlertCircle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              Connect this node's input and execute the workflow to automatically load column fields.
            </span>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Select / Rename Columns</label>
          {columns.length > 0 ? (
            <div style={{ background: 'var(--bg-secondary)', padding: '0', borderRadius: '6px', border: '1px solid var(--border-color)', overflowX: 'auto', overflowY: 'hidden' }}>
              <div style={{ minWidth: '400px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '30px 30px 1.2fr 1.8fr 1.2fr', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)', padding: '6px 8px', fontWeight: 600, fontSize: '0.65rem' }}>
                  <div style={{ textAlign: 'center' }}>Move</div>
                  <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                     <SafeInput 
                       type="checkbox" 
                       title="Select/Deselect All"
                       checked={columns.length > 0 && columns.every(c => c.keep)}
                       onChange={(e) => {
                         const updatedCols = columns.map(c => ({ ...c, keep: e.target.checked }));
                         handleParamChange('columns', updatedCols);
                       }}
                       style={{ accentColor: 'var(--color-accent)' }}
                     />
                  </div>
                  <div>Field</div>
                  <div>Type Lineage</div>
                  <div>Rename</div>
                </div>
                <div>
                  {columns.map((col, idx) => {
                    const isMutated = col.keep && (col.rename !== col.name || col.type);
                    const rowBackground = col.keep ? (isMutated ? 'rgba(245, 158, 11, 0.08)' : 'transparent') : 'rgba(0,0,0,0.02)';
                    
                    return (
                      <div 
                        key={col.name} 
                        draggable 
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragEnter={(e) => handleDragEnter(e, idx)}
                        onDragEnd={(e) => handleDropArray(e, columns, 'columns')}
                        onDragOver={(e) => e.preventDefault()}
                        style={{ display: 'grid', gridTemplateColumns: '30px 30px 1.2fr 1.8fr 1.2fr', borderBottom: '1px dotted var(--border-color)', opacity: col.keep ? 1 : 0.5, transition: 'opacity 0.2s, background 0.2s', background: rowBackground, alignItems: 'center', padding: '4px 8px', fontSize: '0.65rem', cursor: 'grab' }}
                      >
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          ⋮⋮
                        </div>
                        <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <SafeInput
                            type="checkbox"
                            checked={col.keep}
                            onChange={(e) => handleColumnToggle(idx, 'keep', e.target.checked)}
                            style={{ accentColor: 'var(--color-accent)' }}
                          />
                        </div>
                        <div style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '8px', display: 'flex', alignItems: 'center', gap: '4px' }} title={col.name}>
                          {isMutated && <span style={{display:'inline-block', width:6, height:6, borderRadius:'50%', background:'var(--color-warning)', flexShrink: 0}}/>}
                          <span style={{overflow: 'hidden', textOverflow: 'ellipsis'}}>{col.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-color)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {col.originalType || 'Unknown'}
                          </span>
                          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>➔</span>
                          <SafeSelect
                            style={{ flex: 1, minWidth: '85px', fontSize: '0.65rem', padding: '2px 4px', background: 'transparent', border: '1px solid transparent', borderRadius: '4px', color: 'var(--text-secondary)', outline: 'none', cursor: col.keep ? 'pointer' : 'not-allowed' }}
                            value={col.type || ''}
                            onChange={(e) => handleColumnToggle(idx, 'type', e.target.value)}
                            disabled={!col.keep}
                          >
                            <option value="">Keep Original</option>
                            <option value="String">String</option>
                            <option value="Int64">Int64</option>
                            <option value="Float64">Float64</option>
                            <option value="Boolean">Boolean</option>
                            <option value="Datetime">Datetime</option>
                            <option value="Date">Date</option>
                            <option value="Time">Time</option>
                            <option value="Currency">Currency (USD)</option>
                            <option value="Percentage">Percentage</option>
                          </SafeSelect>
                        </div>
                        <div>
                          <SafeInput
                            type="text"
                            style={{ width: '100%', fontSize: '0.65rem', padding: '4px 6px', background: 'transparent', border: '1px solid transparent', borderBottom: col.rename !== col.name ? '1px solid var(--color-warning)' : '1px solid transparent', borderRadius: '2px', color: 'var(--text-primary)', outline: 'none', transition: 'all 0.2s' }}
                            placeholder="Rename..."
                            value={col.rename || ''}
                            onChange={(e) => handleColumnToggle(idx, 'rename', e.target.value)}
                            disabled={!col.keep}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              No columns to select. Connect to an upstream node and run the workflow first.
            </span>
          )}
        </div>
      </>
    );
  };

  const renderBrowseConfig = () => {
    return (
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.5' }}>
        <p>The <strong>Browse</strong> tool displays the complete dataframe records and schema profile of the connected stream.</p>
        <p style={{ marginTop: 10 }}>Connect it to the output of any node (e.g. the True or False branch of a Filter node) and click <strong>Run Workflow</strong> to inspect data in the Results pane below.</p>
      </div>
    );
  };

  const renderImageCaptionConfig = () => {
    const imagePath = parameters.imagePath || '';
    const executionMode = parameters.executionMode || 'onnx';

    // Handle visual image uploading
    const handleImageUpload = async (file) => {
      if (!file) return;
      setUploading(true);
      setUploadError('');

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch('http://127.0.0.1:8000/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(await response.text() || 'Failed to upload image file');
        }

        const resData = await response.json();
        
        onUpdateParams(id, {
          ...parameters,
          imagePath: resData.filename
        });
      } catch (err) {
        setUploadError(err.message || 'Error uploading image');
      } finally {
        setUploading(false);
      }
    };

    return (
      <>
        <div className="form-group">
          <label className="form-label">Upload Image Source</label>
          <div
            className="file-upload-zone"
            onDragOver={onDragOver}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleImageUpload(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={18} style={{ color: 'var(--text-muted)', marginBottom: 6 }} />
            <div className="file-upload-text">
              {uploading ? (
                'Uploading image...'
              ) : imagePath ? (
                <div style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                  <Check size={14} style={{ display: 'inline', marginRight: 4 }} />
                  {imagePath}
                </div>
              ) : (
                'Click or drag photo here (PNG, JPG, JPEG)'
              )}
            </div>
            <SafeInput
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
            />
          </div>
          {uploadError && (
            <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: 4 }}>
              {uploadError}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Or Local Absolute Path</label>
          <SafeInput
            type="text"
            placeholder="C:/data/photo.jpg"
            value={imagePath}
            onChange={(e) => handleParamChange('imagePath', e.target.value)}
          />
        </div>

        {/* Dynamic GPU Configurations from Schema - Elegant Dense Layout */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '12px', 
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: '1px solid var(--border-color)'
        }}>
          {toolDef && toolDef.ui_schema && toolDef.ui_schema.filter(f => f.field !== 'imagePath').map((fieldDef) => {
            if (fieldDef.type === 'select') {
              return (
                <div className="form-group" key={fieldDef.field} style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {fieldDef.field === 'execution_mode' && <span style={{ color: '#8b5cf6' }}>⚙️</span>}
                    {fieldDef.field === 'gpu_vram' && <span style={{ color: '#10b981' }}>💾</span>}
                    {fieldDef.field === 'model_size' && <span style={{ color: '#f59e0b' }}>🧠</span>}
                    {fieldDef.label}
                  </label>
                  <select
                    className="form-select"
                    style={{ fontSize: '0.75rem', padding: '6px 8px' }}
                    value={parameters[fieldDef.field] !== undefined ? parameters[fieldDef.field] : fieldDef.default}
                    onChange={(e) => handleParamChange(fieldDef.field, e.target.value)}
                  >
                    {fieldDef.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              );
            } else if (fieldDef.type === 'string') {
              return (
                <div className="form-group" key={fieldDef.field} style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#ec4899' }}>✍️</span>
                    {fieldDef.label}
                  </label>
                  <SafeTextarea
                    style={{ fontSize: '0.75rem', padding: '6px 8px', minHeight: '60px', width: '100%', resize: 'vertical', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}
                    value={parameters[fieldDef.field] !== undefined ? parameters[fieldDef.field] : fieldDef.default}
                    onChange={(e) => handleParamChange(fieldDef.field, e.target.value)}
                  />
                </div>
              );
            }
            return null;
          })}
        </div>

        <div style={{ 
          color: 'var(--text-secondary)', 
          fontSize: '0.72rem', 
          lineHeight: '1.4', 
          marginTop: 16, 
          background: 'linear-gradient(to right, rgba(139, 92, 246, 0.05), rgba(59, 130, 246, 0.05))', 
          border: '1px solid rgba(139, 92, 246, 0.2)', 
          borderRadius: '8px', 
          padding: '12px' 
        }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#4f46e5', marginBottom: '6px' }}>
            <span style={{ fontSize: '1rem' }}>✨</span> VLM Extraction Engine
          </p>
          <p>Analyzes visual characteristics, extracts tabular data, and reads inline text using <strong>Qwen2-VL</strong>.</p>
          <p style={{ marginTop: 6, fontSize: '0.65rem', color: '#64748b' }}>Models are cached in VRAM after first execution for 0ms latency on subsequent runs. Adjust VRAM limits to prevent OutOfMemory errors on 6GB/8GB cards.</p>
        </div>
      </>
    );
  };

  const renderFileOutputConfig = () => {
    const outputPath = parameters.outputPath || '';
    const outputFormat = parameters.outputFormat || 'csv';
    const saveFile = parameters.saveFile || false;

    return (
      <>
        {!hasUpstreamColumns && (
          <div className="glass-panel" style={{ padding: 10, borderRadius: 6, display: 'flex', gap: 8, background: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.2)', marginBottom: 10 }}>
            <AlertCircle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              No incoming data stream detected. Connect an upstream node.
            </span>
          </div>
        )}

        <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
          <SafeInput
            id="saveFileCheck"
            type="checkbox"
            checked={saveFile}
            onChange={(e) => handleParamChange('saveFile', e.target.checked)}
            style={{ accentColor: 'var(--color-accent)', width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <label htmlFor="saveFileCheck" className="form-label" style={{ cursor: 'pointer', marginBottom: 0, fontWeight: 700 }}>
            Write to Disk
          </label>
        </div>

        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Check "Write to Disk" to explicitly permit writing to the filesystem. This prevents accidental overwrites while Auto-Run is enabled.
        </div>

        <div className="form-group">
          <label className="form-label">Output Path / File Name</label>
          <div
            className="file-upload-zone"
            onClick={async () => {
              try {
                const currentMode = parameters.writeMode || 'overwrite';
                const res = await fetch(`${API_BASE}/api/pick_save_file?mode=${currentMode}`);
                const data = await res.json();
                if (data.file_path) {
                  handleParamChange('outputPath', data.file_path);
                }
              } catch (e) {
                console.error("Failed to pick file", e);
              }
            }}
          >
            <Upload />
            <div className="file-upload-text">
              {outputPath ? (
                <div style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                  <Check size={14} style={{ display: 'inline', marginRight: 4 }} />
                  {outputPath.split(/[/\\]/).pop()}
                </div>
              ) : (
                'Click to choose save location...'
              )}
            </div>
          </div>
          {outputPath && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', wordBreak: 'break-all' }}>
              {outputPath}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Output Format</label>
          <SafeSelect value={outputFormat} onChange={(e) => handleParamChange('outputFormat', e.target.value)}>
            <option value="csv">CSV (Comma-Separated)</option>
            <option value="excel">Excel (.xlsx)</option>
            <option value="parquet">Parquet (.parquet)</option>
            <option value="json">JSON (.json)</option>
            <option value="jsonl">JSON Lines (.jsonl)</option>
            <option value="avro">Avro (.avro)</option>
            <option value="html">HTML (Interactive)</option>
          </SafeSelect>
        </div>

        {(outputFormat === 'csv' || outputFormat === 'jsonl') && (
          <div className="form-group">
            <label className="form-label">Write Mode</label>
            <SafeSelect value={parameters.writeMode || 'overwrite'} onChange={(e) => handleParamChange('writeMode', e.target.value)}>
              <option value="overwrite">Overwrite existing file</option>
              <option value="append">Append to existing file</option>
            </SafeSelect>
          </div>
        )}
      </>
    );
  };

  const renderDataCleansingConfig = () => {
    const columns = parameters.columns || [];
    const replaceString = parameters.replace_nulls_string || false;
    const replaceNumeric = parameters.replace_nulls_numeric || false;
    const trimWhite = parameters.trim_whitespace || false;
    const removePunct = parameters.remove_punctuation || false;
    const removeNumbers = parameters.remove_numbers || false;
    const removeLetters = parameters.remove_letters || false;
    const stringCase = parameters.string_case || 'None';

    const toggleColumn = (colName) => {
      if (columns.includes(colName)) {
        handleParamChange('columns', columns.filter(c => c !== colName));
      } else {
        handleParamChange('columns', [...columns, colName]);
      }
    };

    const getCleanPreview = (val, colType) => {
      if (val === null || val === undefined) {
        if (colType === 'String' && replaceString) return '""';
        if (colType !== 'String' && replaceNumeric) return '0';
        return 'null';
      }
      let s = String(val);
      if (colType === 'String') {
        if (removePunct) s = s.replace(/[^\w\s]/g, "");
        if (removeNumbers) s = s.replace(/\d+/g, "");
        if (removeLetters) s = s.replace(/[a-zA-Z]+/g, "");
        if (trimWhite) s = s.trim();
        
        if (stringCase === 'Uppercase') s = s.toUpperCase();
        else if (stringCase === 'Lowercase') s = s.toLowerCase();
        else if (stringCase === 'Titlecase') s = s.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
      }
      return s;
    };

    const getPreviewRows = () => {
      const incomingEdge = edges?.find(
        (e) => e.target === selectedNode.id && (e.targetPort === 'input' || e.targetHandle === 'input')
      );
      const upstreamNodeId = incomingEdge ? incomingEdge.source : null;
      const resultObj = upstreamNodeId ? results?.[upstreamNodeId] : results?.[selectedNode.id];
      return resultObj?.preview || [];
    };
    
    const previewRows = getPreviewRows();

    return (
      <>
        <div className="form-group">
          <label className="form-label">Columns to Cleanse</label>
          {hasUpstreamColumns ? (
            <div style={{ minHeight: '100px', maxHeight: '500px', resize: 'vertical', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-primary)', padding: '4px' }}>
              {upstreamSchema.map((col) => (
                <label key={col.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <SafeInput
                    type="checkbox"
                    checked={columns.includes(col.name)}
                    onChange={() => toggleColumn(col.name)}
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  {col.name}
                </label>
              ))}
            </div>
          ) : (
             <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Connect an upstream node to see columns.</span>
          )}
        </div>

        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <SafeInput type="checkbox" checked={replaceString} onChange={(e) => handleParamChange('replace_nulls_string', e.target.checked)} />
            Replace Nulls with Blank String
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <SafeInput type="checkbox" checked={replaceNumeric} onChange={(e) => handleParamChange('replace_nulls_numeric', e.target.checked)} />
            Replace Nulls with 0 (Numeric cols)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <SafeInput type="checkbox" checked={trimWhite} onChange={(e) => handleParamChange('trim_whitespace', e.target.checked)} />
            Trim Leading/Trailing Whitespace
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <SafeInput type="checkbox" checked={removePunct} onChange={(e) => handleParamChange('remove_punctuation', e.target.checked)} />
            Remove Punctuation
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <SafeInput type="checkbox" checked={removeNumbers} onChange={(e) => handleParamChange('remove_numbers', e.target.checked)} />
            Remove Numbers
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <SafeInput type="checkbox" checked={removeLetters} onChange={(e) => handleParamChange('remove_letters', e.target.checked)} />
            Remove Letters
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            <span>Modify Case:</span>
            <SafeSelect value={stringCase} onChange={(e) => handleParamChange('string_case', e.target.value)} style={{ padding: '2px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              <option value="None">None</option>
              <option value="Titlecase">Title Case</option>
              <option value="Uppercase">UPPERCASE</option>
              <option value="Lowercase">lowercase</option>
            </SafeSelect>
          </div>
        </div>

        {columns.length > 0 && previewRows.length > 0 && (
          <div className="form-group" style={{ marginTop: '16px' }}>
            <label className="form-label">Cleansing Preview</label>
            <div style={{ background: 'var(--bg-secondary)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.65rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '4px' }}>Column</th>
                    <th style={{ padding: '4px' }}>Before</th>
                    <th style={{ padding: '4px' }}>After Cleansing</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map(colName => {
                    const colType = upstreamSchema.find(c => c.name === colName)?.type || 'String';
                    let rawVal = previewRows[0]?.[colName];
                    for(let r of previewRows) {
                       if (r[colName] !== null && r[colName] !== undefined && String(r[colName]).trim() !== '') {
                          rawVal = r[colName];
                          break;
                       }
                    }
                    const cleanVal = getCleanPreview(rawVal, colType);
                    return (
                      <tr key={colName} style={{ borderBottom: '1px dotted var(--border-color)' }}>
                        <td style={{ padding: '4px', fontWeight: 600, color: 'var(--text-primary)' }}>{colName}</td>
                        <td style={{ padding: '4px', color: 'var(--text-muted)' }}>{rawVal === null || rawVal === undefined ? 'null' : String(rawVal)}</td>
                        <td style={{ padding: '4px', color: 'var(--color-success)' }}>{cleanVal}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderFormulaConfig = () => {
    let formulas = parameters.formulas;
    
    // Legacy migration
    if (!formulas && parameters.output_column && parameters.expression) {
      formulas = [{ output_column: parameters.output_column, expression: parameters.expression }];
      setTimeout(() => onUpdateParams(id, { ...parameters, formulas, output_column: undefined, expression: undefined }), 0);
    }
    
    const currentFormulas = formulas || [];

    // Generate smart examples based on schema
    let examples = [];
    if (hasUpstreamColumns) {
      const stringCols = upstreamSchema.filter(c => c.type === 'String').map(c => c.name);
      const numCols = upstreamSchema.filter(c => c.type === 'Int64' || c.type === 'Float64').map(c => c.name);
      
      if (stringCols.length >= 2) {
        examples.push(`[${stringCols[0]}] + " " + [${stringCols[1]}]`);
      } else if (stringCols.length === 1) {
        examples.push(`[${stringCols[0]}].str.to_uppercase()`);
      }
      
      if (numCols.length >= 2) {
        examples.push(`[${numCols[0]}] + [${numCols[1]}]`);
      } else if (numCols.length === 1) {
        examples.push(`[${numCols[0]}] * 1.5`);
      }
    }
    
    if (examples.length === 0) {
      examples = ['[Column1] + [Column2]', '[Name] + " " + [Surname]', '[Salary] * 1.1'];
    }

    const handleAddFormula = () => {
      onUpdateParams(id, { ...parameters, formulas: [...currentFormulas, { output_column: '', expression: '' }] });
    };
    
    const handleFormulaChange = (index, field, value) => {
      const newFormulas = [...currentFormulas];
      newFormulas[index] = { ...newFormulas[index], [field]: value };
      onUpdateParams(id, { ...parameters, formulas: newFormulas });
    };

    const handleRemoveFormula = (index) => {
      const newFormulas = [...currentFormulas];
      newFormulas.splice(index, 1);
      onUpdateParams(id, { ...parameters, formulas: newFormulas });
    };

    return (
      <>
        {!hasUpstreamColumns && (
          <div className="glass-panel" style={{ padding: 10, borderRadius: 6, display: 'flex', gap: 8, background: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.2)', marginBottom: 10 }}>
            <AlertCircle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              No incoming data stream detected. Connect an upstream node.
            </span>
          </div>
        )}

        <div className="formulas-container">
          <label className="form-label">Formula Operations (Executed Sequentially)</label>
          
          {currentFormulas.length === 0 ? (
             <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '6px', fontSize: '0.75rem', marginBottom: '16px' }}>
               No formulas configured.
             </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
              {currentFormulas.map((f, idx) => (
                <div 
                  key={idx}
                  draggable 
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragEnter={(e) => handleDragEnter(e, idx)}
                  onDragEnd={(e) => handleDropArray(e, currentFormulas, 'formulas')}
                  onDragOver={(e) => e.preventDefault()}
                  style={{ 
                    background: 'var(--bg-secondary)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '6px', 
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    cursor: 'grab'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--text-muted)', cursor: 'grab' }}>⋮⋮</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        {f.output_column ? `Formula: ${f.output_column}` : `Operation ${idx + 1}`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => toggleFormulaExpand(idx)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title={expandedFormulas[idx] === false ? "Expand" : "Collapse"}
                      >
                        {expandedFormulas[idx] === false ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                      </button>
                      <button 
                        onClick={() => handleRemoveFormula(idx)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title="Remove Formula"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  
                  {expandedFormulas[idx] !== false && (
                    <>
                  
                  <div className="form-group" style={{ marginBottom: 0, cursor: 'default' }}>
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Target Column (Existing or New)</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {hasUpstreamColumns && (
                        <SafeSelect 
                          value={upstreamSchema.find(c => c.name === f.output_column) ? f.output_column : ''} 
                          onChange={(e) => {
                            if (e.target.value) handleFormulaChange(idx, 'output_column', e.target.value);
                          }}
                          style={{ flex: 1, boxSizing: 'border-box', cursor: 'pointer' }}
                        >
                          <option value="">-- Select Existing Column --</option>
                          {upstreamSchema.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </SafeSelect>
                      )}
                      <SafeInput
                        type="text"
                        placeholder="Or type column name..."
                        value={f.output_column || ''}
                        onChange={(e) => handleFormulaChange(idx, 'output_column', e.target.value)}
                        style={{ flex: 1, boxSizing: 'border-box' }}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0, cursor: 'default', marginTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label className="form-label" style={{ fontSize: '0.7rem' }}>Data Type</label>
                        <SafeSelect 
                          value={f.data_type || 'V_WString'} 
                          onChange={(e) => handleFormulaChange(idx, 'data_type', e.target.value)}
                          style={{ width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}
                        >
                          <option value="V_WString">V_WString</option>
                          <option value="String">String</option>
                          <option value="Int32">Int32</option>
                          <option value="Int64">Int64</option>
                          <option value="Float32">Float32</option>
                          <option value="Float64">Float64</option>
                          <option value="Bool">Bool</option>
                        </SafeSelect>
                      </div>
                      <div style={{ width: '80px' }}>
                        <label className="form-label" style={{ fontSize: '0.7rem' }}>Size</label>
                        <SafeInput
                          type="text"
                          value={f.size || ''}
                          onChange={(e) => handleFormulaChange(idx, 'size', e.target.value)}
                          style={{ width: '100%', boxSizing: 'border-box' }}
                          onMouseDown={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-group" style={{ position: 'relative', marginBottom: 0, cursor: 'default', marginTop: '12px' }} onMouseDown={(e) => e.stopPropagation()}>
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Formula Expression</label>
                    <FormulaEditor
                      value={f.expression || ''}
                      onChange={(e) => handleFormulaChange(idx, 'expression', e.target.value)}
                      columns={upstreamSchema || []}
                      height="120px"
                    />
                  </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          
          <button 
            onClick={handleAddFormula}
            style={{ width: '100%', padding: '8px', background: 'var(--color-accent)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Plus size={14} /> Add Formula
          </button>
        </div>

        <div className="form-group" style={{ marginTop: '24px' }}>
          <label className="form-label">Contextual Examples</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {examples.map((ex, i) => (
              <div 
                key={i} 
                onClick={() => {
                   if (currentFormulas.length === 0) {
                      onUpdateParams(id, { ...parameters, formulas: [{ output_column: '', expression: ex }] });
                   } else {
                      handleFormulaChange(currentFormulas.length - 1, 'expression', ex);
                   }
                }}
                style={{ background: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: '4px', border: '1px dashed var(--border-color)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', cursor: 'pointer' }}
                title="Click to apply this formula to the last operation"
              >
                {ex}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  const renderRegexConfig = () => {
    const column = parameters.column || '';
    const pattern = parameters.pattern || '';
    const outputColumns = Array.isArray(parameters.outputColumns) ? parameters.outputColumns : [];

    const handleOutputColumnChange = (index, field, value) => {
      const newOutputs = [...outputColumns];
      newOutputs[index] = { ...newOutputs[index], [field]: value };
      handleParamChange('outputColumns', newOutputs);
    };

    const addOutputColumn = () => {
      handleParamChange('outputColumns', [...outputColumns, { name: `ExtractedGroup_${outputColumns.length + 1}`, type: 'String' }]);
    };

    const removeOutputColumn = (index) => {
      const newOutputs = outputColumns.filter((_, i) => i !== index);
      handleParamChange('outputColumns', newOutputs);
    };

    const getPreviewValues = (colName) => {
      if (!colName) return [];
      const incomingEdge = edges?.find(
        (e) => e.target === selectedNode.id && (e.targetPort === 'input' || e.targetHandle === 'input')
      );
      const upstreamNodeId = incomingEdge ? incomingEdge.source : null;
      const resultObj = upstreamNodeId ? results?.[upstreamNodeId] : results?.[selectedNode.id];
      const rows = resultObj?.preview || [];
      const values = rows
        .map(r => r[colName])
        .filter(val => val !== undefined && val !== null);
      return [...new Set(values)].slice(0, 5);
    };

    const previewValues = getPreviewValues(column);

    return (
      <>
        {!hasUpstreamColumns && (
          <div className="glass-panel" style={{ padding: 10, borderRadius: 6, display: 'flex', gap: 8, background: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.2)', marginBottom: 10 }}>
            <AlertCircle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              No incoming data stream detected. Connect an upstream node to see columns.
            </span>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Column to Parse</label>
          {hasUpstreamColumns ? (
            <SafeSelect value={column} onChange={(e) => handleParamChange('column', e.target.value)}>
              <option value="">-- Select Target Column --</option>
              {upstreamSchema.map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name} ({col.type && typeof col.type === 'string' ? col.type.split('.').pop() : 'Unknown'})
                </option>
              ))}
            </SafeSelect>
          ) : (
            <SafeInput
              type="text"
              placeholder="Target column name"
              value={column}
              onChange={(e) => handleParamChange('column', e.target.value)}
            />
          )}
          {column && previewValues.length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '0.7rem', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Input Data Preview (up to 5 values):</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {previewValues.map((val, idx) => (
                  <span key={idx} style={{ padding: '2px 6px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '3px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-primary)' }}>
                    {String(val)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Regular Expression Pattern</label>
          <SafeInput
            type="text"
            placeholder="e.g. (?P<area>\d{3})-(?P<num>\d{4})"
            value={pattern}
            onChange={(e) => handleParamChange('pattern', e.target.value)}
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Use parentheses (...) to define capture groups. Each group corresponds to an output column.
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">Extracted Output Columns</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {outputColumns.map((outCol, idx) => (
              <div 
                key={idx} 
                draggable 
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragEnter={(e) => handleDragEnter(e, idx)}
                onDragEnd={(e) => handleDropArray(e, outputColumns, 'outputColumns')}
                onDragOver={(e) => e.preventDefault()}
                style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'grab' }}
              >
                <span style={{ color: 'var(--text-muted)', cursor: 'grab' }}>⋮⋮</span>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-accent)', width: '20px' }}>${idx+1}</span>
                <SafeInput
                  type="text"
                  placeholder="Column Name"
                  value={outCol.name}
                  onChange={(e) => handleOutputColumnChange(idx, 'name', e.target.value)}
                  style={{ flex: 1, padding: '4px 6px', fontSize: '0.75rem' }}
                />
                <SafeSelect
                  value={outCol.type || 'String'}
                  onChange={(e) => handleOutputColumnChange(idx, 'type', e.target.value)}
                  style={{ width: '85px', padding: '4px', fontSize: '0.75rem', background: 'var(--bg-secondary)' }}
                >
                  <option value="String">String</option>
                  <option value="Int64">Int64</option>
                  <option value="Float64">Float64</option>
                  <option value="Boolean">Boolean</option>
                </SafeSelect>
                <button
                  onClick={() => removeOutputColumn(idx)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', padding: '4px' }}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addOutputColumn}
            style={{ width: '100%', padding: '6px', fontSize: '0.75rem', background: 'var(--bg-secondary)', border: '1px dashed var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: '4px' }}
          >
            + Add Capture Group Column
          </button>
        </div>
      </>
    );
  };

  const renderChartPreview = (type) => {
    const accent = "var(--color-accent, #3b82f6)";
    const secondary = "var(--color-prep, #8b5cf6)";
    const muted = "var(--border-color, #334155)";

    const svgs = {
      scatter: (
        <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          <line x1="10" y1="50" x2="90" y2="50" stroke={muted} strokeWidth="2" />
          <line x1="10" y1="50" x2="10" y2="10" stroke={muted} strokeWidth="2" />
          <circle cx="30" cy="40" r="3" fill={accent} />
          <circle cx="45" cy="20" r="3" fill={secondary} />
          <circle cx="60" cy="35" r="3" fill={accent} />
          <circle cx="75" cy="15" r="3" fill={secondary} />
          <circle cx="80" cy="40" r="3" fill={accent} />
          <circle cx="20" cy="25" r="3" fill={secondary} />
        </svg>
      ),
      line: (
        <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          <line x1="10" y1="50" x2="90" y2="50" stroke={muted} strokeWidth="2" />
          <line x1="10" y1="50" x2="10" y2="10" stroke={muted} strokeWidth="2" />
          <path d="M 10 40 L 30 25 L 50 35 L 70 15 L 90 20" stroke={accent} strokeWidth="2" />
          <circle cx="30" cy="25" r="2.5" fill={secondary} />
          <circle cx="50" cy="35" r="2.5" fill={secondary} />
          <circle cx="70" cy="15" r="2.5" fill={secondary} />
        </svg>
      ),
      bar: (
        <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          <line x1="10" y1="50" x2="90" y2="50" stroke={muted} strokeWidth="2" />
          <line x1="10" y1="50" x2="10" y2="10" stroke={muted} strokeWidth="2" />
          <rect x="20" y="20" width="12" height="30" fill={accent} rx="1" />
          <rect x="40" y="10" width="12" height="40" fill={secondary} rx="1" />
          <rect x="60" y="30" width="12" height="20" fill={accent} rx="1" />
        </svg>
      ),
      pie: (
        <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          <circle cx="50" cy="30" r="20" fill={muted} />
          <path d="M 50 30 L 50 10 A 20 20 0 0 1 70 30 Z" fill={accent} />
          <path d="M 50 30 L 70 30 A 20 20 0 0 1 35.8 44.1 Z" fill={secondary} />
        </svg>
      ),
      histogram: (
        <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          <line x1="10" y1="50" x2="90" y2="50" stroke={muted} strokeWidth="2" />
          <line x1="10" y1="50" x2="10" y2="10" stroke={muted} strokeWidth="2" />
          <rect x="15" y="35" width="10" height="15" fill={accent} />
          <rect x="26" y="20" width="10" height="30" fill={secondary} />
          <rect x="37" y="10" width="10" height="40" fill={accent} />
          <rect x="48" y="25" width="10" height="25" fill={secondary} />
          <rect x="59" y="35" width="10" height="15" fill={accent} />
          <rect x="70" y="42" width="10" height="8" fill={secondary} />
        </svg>
      ),
      box: (
        <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          <line x1="10" y1="50" x2="90" y2="50" stroke={muted} strokeWidth="2" />
          <line x1="10" y1="50" x2="10" y2="10" stroke={muted} strokeWidth="2" />
          <line x1="30" y1="15" x2="30" y2="45" stroke={accent} strokeWidth="1.5" />
          <line x1="25" y1="15" x2="35" y2="15" stroke={accent} strokeWidth="1.5" />
          <line x1="25" y1="45" x2="35" y2="45" stroke={accent} strokeWidth="1.5" />
          <rect x="22" y="25" width="16" height="12" fill={secondary} />
          <line x1="22" y1="31" x2="38" y2="31" stroke={accent} strokeWidth="1.5" />
          
          <line x1="60" y1="10" x2="60" y2="40" stroke={accent} strokeWidth="1.5" />
          <line x1="55" y1="10" x2="65" y2="10" stroke={accent} strokeWidth="1.5" />
          <line x1="55" y1="40" x2="65" y2="40" stroke={accent} strokeWidth="1.5" />
          <rect x="52" y="18" width="16" height="15" fill={accent} />
          <line x1="52" y1="26" x2="68" y2="26" stroke={secondary} strokeWidth="1.5" />
        </svg>
      ),
      violin: (
        <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          <line x1="10" y1="50" x2="90" y2="50" stroke={muted} strokeWidth="2" />
          <line x1="10" y1="50" x2="10" y2="10" stroke={muted} strokeWidth="2" />
          <path d="M 35 15 C 45 25, 45 35, 35 45 C 25 35, 25 25, 35 15 Z" fill={secondary} opacity="0.8" />
          <line x1="35" y1="15" x2="35" y2="45" stroke={accent} strokeWidth="2" />
          <path d="M 65 10 C 75 25, 75 35, 65 40 C 55 35, 55 25, 65 10 Z" fill={accent} opacity="0.8" />
          <line x1="65" y1="10" x2="65" y2="40" stroke={secondary} strokeWidth="2" />
        </svg>
      ),
      heatmap: (
        <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          <rect x="25" y="10" width="12" height="12" fill={accent} opacity="0.4" />
          <rect x="39" y="10" width="12" height="12" fill={accent} opacity="0.9" />
          <rect x="53" y="10" width="12" height="12" fill={secondary} opacity="0.6" />
          <rect x="25" y="24" width="12" height="12" fill={secondary} opacity="0.8" />
          <rect x="39" y="24" width="12" height="12" fill={accent} opacity="0.3" />
          <rect x="53" y="24" width="12" height="12" fill={accent} opacity="1.0" />
          <rect x="25" y="38" width="12" height="12" fill={accent} opacity="0.7" />
          <rect x="39" y="38" width="12" height="12" fill={secondary} opacity="0.5" />
          <rect x="53" y="38" width="12" height="12" fill={secondary} opacity="0.9" />
        </svg>
      ),
      waterfall: (
        <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          <line x1="10" y1="50" x2="90" y2="50" stroke={muted} strokeWidth="2" />
          <line x1="10" y1="50" x2="10" y2="10" stroke={muted} strokeWidth="2" />
          <rect x="15" y="30" width="10" height="20" fill={accent} rx="1" />
          <rect x="28" y="15" width="10" height="15" fill={secondary} rx="1" />
          <line x1="25" y1="30" x2="28" y2="30" stroke={muted} strokeWidth="1" strokeDasharray="2 2" />
          <rect x="41" y="20" width="10" height="10" fill={secondary} rx="1" />
          <line x1="38" y1="15" x2="41" y2="15" stroke={muted} strokeWidth="1" strokeDasharray="2 2" />
          <rect x="54" y="20" width="10" height="30" fill={accent} rx="1" />
        </svg>
      ),
      funnel: (
        <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          <polygon points="20,10 80,10 70,25 30,25" fill={accent} opacity="0.9" />
          <polygon points="30.5,27 69.5,27 60,40 40,40" fill={secondary} opacity="0.9" />
          <polygon points="40.5,42 59.5,42 55,50 45,50" fill={accent} opacity="0.7" />
        </svg>
      ),
      sankey: (
        <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          <rect x="15" y="15" width="8" height="30" fill={accent} rx="2" />
          <rect x="75" y="10" width="8" height="18" fill={secondary} rx="2" />
          <rect x="75" y="35" width="8" height="15" fill={accent} rx="2" />
          <path d="M 23 20 C 45 20, 55 15, 75 15" stroke={accent} strokeWidth="6" opacity="0.3" fill="none" />
          <path d="M 23 35 C 45 35, 55 42, 75 42" stroke={secondary} strokeWidth="8" opacity="0.3" fill="none" />
        </svg>
      ),
      scatter_3d: (
        <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
          <line x1="45" y1="45" x2="20" y2="55" stroke={muted} strokeWidth="2" />
          <line x1="45" y1="45" x2="80" y2="45" stroke={muted} strokeWidth="2" />
          <line x1="45" y1="45" x2="45" y2="10" stroke={muted} strokeWidth="2" />
          <circle cx="35" cy="40" r="3" fill={accent} />
          <circle cx="55" cy="30" r="4" fill={secondary} />
          <circle cx="65" cy="20" r="2.5" fill={accent} />
          <circle cx="50" cy="15" r="3.5" fill={secondary} />
          <circle cx="70" cy="35" r="2" fill={accent} />
        </svg>
      )
    };
    
    return svgs[type] || svgs['scatter'];
  };

  const renderVisualizationConfig = () => {
    const chartType = parameters.chartType || 'scatter';
    const xAxis = parameters.xAxis || '';
    const yAxis = parameters.yAxis || '';
    const title = parameters.title || '';

    const handleAxisChange = (axis, colName) => {
      handleParamChange(axis, colName);
    };

    const getCompatibilityWarning = (colName, axis) => {
      if (!colName || !hasUpstreamColumns) return null;
      const colDef = upstreamSchema.find(c => c.name === colName);
      if (!colDef) return null;
      const type = colDef.type.toLowerCase();
      
      const isNumeric = type.includes('int') || type.includes('float');
      if (axis === 'yAxis' && chartType !== 'bar' && chartType !== 'pie' && chartType !== 'sankey') {
        if (!isNumeric) {
          return "Warning: Y-Axis typically requires a numeric column for this chart type.";
        }
      }
      return null;
    };

    const xWarning = getCompatibilityWarning(xAxis, 'xAxis');
    const yWarning = getCompatibilityWarning(yAxis, 'yAxis');

    // Intelligent Recommendations
    const numCols = hasUpstreamColumns ? upstreamSchema.filter(c => c.type.toLowerCase().includes('int') || c.type.toLowerCase().includes('float')).map(c => c.name) : [];
    const strCols = hasUpstreamColumns ? upstreamSchema.filter(c => !c.type.toLowerCase().includes('int') && !c.type.toLowerCase().includes('float')).map(c => c.name) : [];
    
    let recommendation = "";
    let suggestedX = "";
    let suggestedY = "";

    if (hasUpstreamColumns) {
      if (chartType === 'scatter' || chartType === 'line') {
        if (numCols.length >= 2) {
           suggestedX = numCols[0]; suggestedY = numCols[1];
           recommendation = `Try X-Axis: ${numCols[0]}, Y-Axis: ${numCols[1]}`;
        } else recommendation = 'Needs at least two numeric columns for best results.';
      } else if (chartType === 'bar' || chartType === 'pie' || chartType === 'funnel' || chartType === 'violin') {
        if (strCols.length > 0 && numCols.length > 0) {
           suggestedX = strCols[0]; suggestedY = numCols[0];
           recommendation = `Try X-Axis (Categories): ${strCols[0]}, Y-Axis (Values): ${numCols[0]}`;
        } else recommendation = 'Needs a categorical and a numeric column.';
      } else if (chartType === 'histogram') {
        if (numCols.length > 0) {
           suggestedX = numCols[0];
           recommendation = `Try X-Axis: ${numCols[0]}. Y-Axis is automatically calculated as count.`;
        } else recommendation = 'Needs a numeric column.';
      } else if (chartType === 'heatmap' || chartType === 'sankey') {
        if (strCols.length >= 2) {
           suggestedX = strCols[0]; suggestedY = strCols[1];
           recommendation = `Try X-Axis (Source): ${strCols[0]}, Y-Axis (Target): ${strCols[1]}`;
        } else recommendation = 'Needs two categorical columns.';
      } else if (chartType === 'scatter_3d') {
        if (numCols.length >= 2) {
           suggestedX = numCols[0]; suggestedY = numCols[1];
           recommendation = `Try X-Axis: ${numCols[0]}, Y-Axis: ${numCols[1]}`;
        } else recommendation = 'Needs numeric columns.';
      }
    }

    const applySuggestion = () => {
      const updates = {};
      if (suggestedX) updates.xAxis = suggestedX;
      if (suggestedY) updates.yAxis = suggestedY;
      if (Object.keys(updates).length > 0) {
        handleMultipleParamsChange(updates);
      }
    };

    return (
      <>
        {!hasUpstreamColumns && (
          <div className="glass-panel" style={{ padding: 10, borderRadius: 6, display: 'flex', gap: 8, background: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.2)', marginBottom: 10 }}>
            <AlertCircle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              Connect this node's input to automatically load columns.
            </span>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Chart Type</label>
          <SafeSelect value={chartType} onChange={(e) => handleParamChange('chartType', e.target.value)}>
            <option value="scatter">Scatter Plot</option>
            <option value="line">Line Chart</option>
            <option value="bar">Bar Chart</option>
            <option value="pie">Pie Chart</option>
            <option value="histogram">Histogram</option>
            <option value="box">Box Plot</option>
            <option value="violin">Violin Plot</option>
            <option value="heatmap">Density Heatmap</option>
            <option value="waterfall">Waterfall Chart</option>
            <option value="funnel">Funnel Chart</option>
            <option value="sankey">Sankey Diagram</option>
            <option value="scatter_3d">3D Scatter</option>
          </SafeSelect>
        </div>
        <div style={{ marginBottom: 16, fontSize: '0.7rem', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '90px', height: '54px', background: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '4px' }}>
            {renderChartPreview(chartType)}
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '2px', fontSize: '0.75rem' }}>
              {chartType.charAt(0).toUpperCase() + chartType.slice(1).replace('_', ' ')} Preview
            </span>
            {hasUpstreamColumns && recommendation ? (
              <>
                <span 
                  onClick={suggestedX || suggestedY ? applySuggestion : undefined}
                  style={{ 
                    fontWeight: 700, 
                    color: 'var(--color-accent)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    marginTop: '6px', 
                    marginBottom: '2px',
                    cursor: (suggestedX || suggestedY) ? 'pointer' : 'default'
                  }}
                  title={(suggestedX || suggestedY) ? "Click to auto-apply suggestion" : ""}
                >
                  <span style={{ fontSize: '12px' }}>💡</span> AI Suggestion
                </span>
                <span 
                  onClick={suggestedX || suggestedY ? applySuggestion : undefined}
                  style={{ 
                    color: 'var(--text-secondary)', 
                    lineHeight: '1.4',
                    cursor: (suggestedX || suggestedY) ? 'pointer' : 'default',
                    display: 'block'
                  }}
                  title={(suggestedX || suggestedY) ? "Click to auto-apply suggestion" : ""}
                >
                  {recommendation}
                </span>
              </>
            ) : (
              <span style={{ color: 'var(--text-muted)', lineHeight: '1.3', display: 'block', marginTop: '6px' }}>
                Connect upstream data to get AI axis recommendations.
              </span>
            )}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">X-Axis Column</label>
          {hasUpstreamColumns ? (
            <SafeSelect value={xAxis} onChange={(e) => handleAxisChange('xAxis', e.target.value)}>
              <option value="">-- Select X-Axis --</option>
              {upstreamSchema.map((col) => {
                const isNumeric = col.type.toLowerCase().includes('int') || col.type.toLowerCase().includes('float');
                return (
                  <option key={col.name} value={col.name} style={{ color: !isNumeric && chartType === 'scatter' ? 'var(--text-muted)' : 'inherit' }}>
                    {col.name} ({col.type}) {!isNumeric && chartType === 'scatter' ? ' - Might be incompatible' : ''}
                  </option>
                );
              })}
            </SafeSelect>
          ) : (
            <SafeInput type="text" placeholder="Type X-Axis column" value={xAxis} onChange={(e) => handleAxisChange('xAxis', e.target.value)} />
          )}
          {xWarning && <div style={{ fontSize: '0.65rem', color: 'var(--color-warning)', marginTop: '4px' }}>{xWarning}</div>}
        </div>

        <div className="form-group">
          <label className="form-label">Y-Axis Column</label>
          {hasUpstreamColumns ? (
            <SafeSelect value={yAxis} onChange={(e) => handleAxisChange('yAxis', e.target.value)}>
              <option value="">-- Select Y-Axis --</option>
              {upstreamSchema.map((col) => {
                const isNumeric = col.type.toLowerCase().includes('int') || col.type.toLowerCase().includes('float');
                const showWarning = !isNumeric && chartType !== 'bar';
                return (
                  <option key={col.name} value={col.name} style={{ color: showWarning ? 'var(--text-muted)' : 'inherit' }}>
                    {col.name} ({col.type}) {showWarning ? ' - Usually incompatible' : ''}
                  </option>
                );
              })}
            </SafeSelect>
          ) : (
            <SafeInput type="text" placeholder="Type Y-Axis column" value={yAxis} onChange={(e) => handleAxisChange('yAxis', e.target.value)} />
          )}
          {yWarning && <div style={{ fontSize: '0.65rem', color: 'var(--color-warning)', marginTop: '4px' }}>{yWarning}</div>}
        </div>

        <div className="form-group">
          <label className="form-label">Chart Title (Optional)</label>
          <SafeInput type="text" placeholder="Enter title" value={title} onChange={(e) => handleParamChange('title', e.target.value)} />
        </div>
      </>
    );
  };

  const getTitle = () => {
    if (toolDef && toolDef.name) return toolDef.name;

    switch (type) {
      case 'fileInput': return 'File Input Node';
      case 'filter': return 'Filter Node';
      case 'sort': return 'Sort Node';
      case 'select': return 'Select / Rename Node';
      case 'browse': return 'Browse Node';
      case 'imageCaption': return 'Image Captioning Node';
      case 'fileOutput': return 'File Output Node';
      case 'regex': return 'Regex Parser Node';
      case 'visualization': return 'Data Visualization Node';
      default: return 'Node Configuration';
    }
  };

  const renderJoinConfig = () => {
    const leftOn = parameters.left_on || '';
    const rightOn = parameters.right_on || '';
    const how = parameters.how || 'inner';

    const leftSchema = upstreamSchema?.left || [];
    const rightSchema = upstreamSchema?.right || [];

    const handleJoinTypeClick = (type) => {
      handleParamChange('how', type);
    };

    return (
      <div className="join-config-container">
        <div className="join-schemas-split">
          {/* Left Input */}
          <div className="schema-panel left-panel">
            <div className="panel-header">Left Input (L)</div>
            <div className="form-group">
              <SafeSelect value={leftOn} onChange={(e) => handleParamChange('left_on', e.target.value)} className="key-select">
                <option value="">-- Select Key --</option>
                {leftSchema.map((col) => (
                  <option key={col.name} value={col.name}>{col.name}</option>
                ))}
              </SafeSelect>
            </div>
            <div className="schema-list">
              {leftSchema.length === 0 ? (
                <div className="empty-schema">Connect Left Node</div>
              ) : (
                leftSchema.map((col) => (
                  <div 
                    key={col.name} 
                    className={`schema-item ${col.name === leftOn ? 'active-key' : ''}`}
                    onClick={() => handleParamChange('left_on', col.name)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="col-name">
                      {col.name}
                      {col.semantic_type === 'currency_usd' && <span title="Currency" style={{ marginLeft: '4px', color: 'var(--color-success)', fontWeight: 800 }}>$</span>}
                      {col.semantic_type === 'percentage' && <span title="Percentage" style={{ marginLeft: '4px', color: 'var(--color-accent)', fontWeight: 800 }}>%</span>}
                    </span>
                    <span className="col-type">{col.type && typeof col.type === 'string' ? col.type.split('.').pop() : 'Unknown'}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="join-link-icon">
            <Link size={16} color="var(--text-muted)" />
          </div>

          {/* Right Input */}
          <div className="schema-panel right-panel">
            <div className="panel-header">Right Input (R)</div>
            <div className="form-group">
              <SafeSelect value={rightOn} onChange={(e) => handleParamChange('right_on', e.target.value)} className="key-select">
                <option value="">-- Select Key --</option>
                {rightSchema.map((col) => (
                  <option key={col.name} value={col.name}>{col.name}</option>
                ))}
              </SafeSelect>
            </div>
            <div className="schema-list">
              {rightSchema.length === 0 ? (
                <div className="empty-schema">Connect Right Node</div>
              ) : (
                rightSchema.map((col) => (
                  <div 
                    key={col.name} 
                    className={`schema-item ${col.name === rightOn ? 'active-key' : ''}`}
                    onClick={() => handleParamChange('right_on', col.name)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="col-name">
                      {col.name}
                      {col.semantic_type === 'currency_usd' && <span title="Currency" style={{ marginLeft: '4px', color: 'var(--color-success)', fontWeight: 800 }}>$</span>}
                      {col.semantic_type === 'percentage' && <span title="Percentage" style={{ marginLeft: '4px', color: 'var(--color-accent)', fontWeight: 800 }}>%</span>}
                    </span>
                    <span className="col-type">{col.type && typeof col.type === 'string' ? col.type.split('.').pop() : 'Unknown'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSamplingConfig = () => {
    const sampleType = parameters.sample_type || 'first_n';
    const nRecords = parameters.n_records !== undefined ? parameters.n_records : 100;
    const groupBy = parameters.group_by || [];

    const options = [
      { label: "First N rows", value: "first_n" },
      { label: "Last N rows", value: "last_n" },
      { label: "Skip 1st N rows", value: "skip_n" },
      { label: "1 of every N rows", value: "every_n" },
      { label: "1 in N chance to include each row", value: "chance_n" },
      { label: "First N% of rows", value: "first_percent" },
      { label: "Random N rows", value: "random_n" }
    ];

    return (
      <div className="sampling-config" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="radio-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {options.map(opt => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
              <input 
                type="radio" 
                name="sample_type"
                value={opt.value}
                checked={sampleType === opt.value}
                onChange={(e) => handleParamChange('sample_type', e.target.value)}
                style={{ accentColor: 'var(--color-accent)' }}
              />
              {opt.label}
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600 }}>N =</label>
          <SafeInput 
            type="number"
            value={nRecords}
            onChange={(e) => {
              const val = e.target.value;
              handleParamChange('n_records', val === '' ? '' : Number(val));
            }}
            style={{ width: '100px' }}
          />
        </div>

        <div className="group-by-section">
          <label className="form-label">Grouping (Optional):</label>
          <div className="column-list" style={{ border: '1px solid var(--border-color)', borderRadius: '4px', maxHeight: '150px', overflowY: 'auto', padding: '8px', background: 'var(--bg-secondary)' }}>
            {upstreamSchema.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>No input schema available</div>
            ) : (
              upstreamSchema.map(col => {
                const colName = col.name || col; // fallback in case it's a string
                return (
                  <label key={colName} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer', fontSize: '12px' }}>
                    <input
                      type="checkbox"
                      checked={groupBy.includes(colName)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleParamChange('group_by', [...groupBy, colName]);
                        } else {
                          handleParamChange('group_by', groupBy.filter(c => c !== colName));
                        }
                      }}
                      style={{ accentColor: 'var(--color-accent)' }}
                    />
                    {colName}
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSummarizeConfig = () => {
    let actions = parameters.actions;
    
    // Legacy migration
    if (!actions) {
      actions = [];
      if (parameters.group_by) {
        const gbs = Array.isArray(parameters.group_by) ? parameters.group_by : parameters.group_by.split(',');
        gbs.forEach(g => {
          if (typeof g === 'string' && g.trim()) {
            actions.push({ column: g.trim(), action: 'group_by', output: g.trim() });
          }
        });
      }
      if (parameters.agg_column) {
        actions.push({ column: parameters.agg_column, action: parameters.agg_function || 'sum', output: parameters.output_name || `Agg_${parameters.agg_column}` });
      }
      if (actions.length > 0) {
        // Auto-migrate in background
        setTimeout(() => onUpdateParams(id, { ...parameters, actions, group_by: undefined, agg_column: undefined, agg_function: undefined, output_name: undefined }), 0);
      }
    }

    const currentActions = actions || [];
    const schema = Array.isArray(upstreamSchema) ? upstreamSchema : [];

    const getAvailableActions = (colName) => {
      const colDef = schema.find(c => c.name === colName);
      if (!colDef) return ['group_by', 'sum', 'mean', 'min', 'max', 'count', 'count_unique', 'concat', 'first', 'last'];
      
      const typeStr = (colDef.type || '').toLowerCase();
      const isNum = typeStr.includes('int') || typeStr.includes('float') || typeStr.includes('double');
      const isDate = typeStr.includes('date') || typeStr.includes('time');

      if (isNum) return ['group_by', 'sum', 'mean', 'median', 'min', 'max', 'count', 'count_unique', 'std', 'var', 'first', 'last'];
      if (isDate) return ['group_by', 'min', 'max', 'count', 'count_unique', 'first', 'last'];
      return ['group_by', 'count', 'count_unique', 'min', 'max', 'first', 'last', 'concat'];
    };

    const handleColChange = (val) => {
      setSumColumn(val);
      const avail = getAvailableActions(val);
      if (!avail.includes(sumAction)) {
        setSumAction(avail[0]);
      }
      if (sumAction === 'group_by') setSumOutput(val);
      else setSumOutput(`${sumAction}_${val}`);
    };

    const handleActionChange = (val) => {
      setSumAction(val);
      if (val === 'group_by') setSumOutput(sumColumn);
      else setSumOutput(`${val}_${sumColumn}`);
    };

    const handleAddRule = () => {
      if (!sumColumn) return;
      const newAction = { column: sumColumn, action: sumAction, output: sumOutput || sumColumn };
      onUpdateParams(id, { ...parameters, actions: [...currentActions, newAction] });
      setSumColumn('');
      setSumOutput('');
    };

    const handleSumDragStart = (e, position) => {
      dragSumItemRef.current = position;
    };
  
    const handleSumDragEnter = (e, position) => {
      dragSumOverItemRef.current = position;
    };
  
    const handleSumDrop = (e) => {
      if (dragSumItemRef.current === null || dragSumOverItemRef.current === null) return;
      const dragItemContent = currentActions[dragSumItemRef.current];
      const newActions = [...currentActions];
      newActions.splice(dragSumItemRef.current, 1);
      newActions.splice(dragSumOverItemRef.current, 0, dragItemContent);
      dragSumItemRef.current = null;
      dragSumOverItemRef.current = null;
      onUpdateParams(id, { ...parameters, actions: newActions });
    };

    return (
      <div className="summarize-config">
        <div style={{ marginBottom: '16px' }}>
          <label className="form-label">Configured Rules</label>
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
            {currentActions.length === 0 ? (
              <div style={{ padding: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>No rules configured.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Column</th>
                    <th style={{ padding: '8px' }}>Action</th>
                    <th style={{ padding: '8px' }}>Output</th>
                    <th style={{ padding: '8px', width: '30px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {currentActions.map((act, idx) => (
                    <tr 
                      key={idx} 
                      draggable 
                      onDragStart={(e) => handleSumDragStart(e, idx)}
                      onDragEnter={(e) => handleSumDragEnter(e, idx)}
                      onDragEnd={handleSumDrop}
                      onDragOver={(e) => e.preventDefault()}
                      style={{ borderBottom: idx < currentActions.length - 1 ? '1px solid var(--border-color)' : 'none', cursor: 'grab' }}
                    >
                      <td style={{ padding: '8px', color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--text-muted)', cursor: 'grab' }}>⋮⋮</span>
                          {act.column}
                        </div>
                      </td>
                      <td style={{ padding: '8px', color: 'var(--color-accent)', fontWeight: 600 }}>{act.action}</td>
                      <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{act.output}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button 
                          onClick={() => {
                            const newActs = [...currentActions];
                            newActs.splice(idx, 1);
                            onUpdateParams(id, { ...parameters, actions: newActs });
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}
                          title="Remove Rule"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
          <label className="form-label" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Add Summarize Rule
          </label>
          <div className="form-group">
            <SafeSelect value={sumColumn} onChange={(e) => handleColChange(e.target.value)} style={{ width: '100%', marginBottom: '8px' }}>
              <option value="">-- Select Column --</option>
              {schema.map(c => (
                <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
              ))}
            </SafeSelect>
          </div>
          <div className="form-group" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <SafeSelect value={sumAction} onChange={(e) => handleActionChange(e.target.value)} style={{ flex: 1 }} disabled={!sumColumn}>
              {getAvailableActions(sumColumn).map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </SafeSelect>
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <SafeInput 
              type="text" 
              placeholder="Output Name" 
              value={sumOutput} 
              onChange={(e) => setSumOutput(e.target.value)} 
              style={{ width: '100%' }}
              disabled={!sumColumn}
            />
          </div>
          <button 
            onClick={handleAddRule}
            disabled={!sumColumn || !sumOutput}
            style={{
              width: '100%', padding: '8px', background: (!sumColumn || !sumOutput) ? 'var(--bg-primary)' : 'var(--color-accent)',
              color: (!sumColumn || !sumOutput) ? 'var(--text-muted)' : 'white', border: '1px solid var(--border-color)',
              borderRadius: '4px', cursor: (!sumColumn || !sumOutput) ? 'not-allowed' : 'pointer', fontWeight: 600
            }}
          >
            Add Rule
          </button>
        </div>
      </div>
    );
  };

  const renderOddsPortalScraperConfig = () => {
    const isUpcoming = parameters.scrapeMode === 'upcoming';
    const isSingleMatch = parameters.scrapeMode === 'single_match';

    const handleUrlBlur = (e) => {
      const val = e.target.value;
      if (!val) return;
      const updates = { targetUrl: val };
      if (val.includes('/results/')) {
        updates.scrapeMode = 'historical';
      } else if (val.split('/').filter(Boolean).length > 4 && !val.includes('/results/')) {
        updates.scrapeMode = 'single_match';
      }
      handleMultipleParamsChange(updates);
    };

    return (
      <div className="config-panel">
        <div className="form-group">
          <label className="form-label">{type === 'odds_portal_upcoming' ? 'Upcoming Matches Target League URL' : 'OddsPortal URL'}</label>
          <SafeInput
            type="text"
            value={parameters.targetUrl || ''}
            onChange={(e) => handleParamChange('targetUrl', e.target.value)}
            onBlur={handleUrlBlur}
            placeholder="Paste OddsPortal link here..."
          />
        </div>
        
        {type !== 'odds_portal_upcoming' && (
          <div style={{ marginTop: '16px' }}>
            <label className="form-label checkbox-label" style={{ fontWeight: 600, color: 'var(--color-accent)' }}>
              <SafeInput
                type="checkbox"
                checked={!!parameters.scrapeAllSeasons}
                onChange={(e) => handleParamChange('scrapeAllSeasons', e.target.checked)}
              />
              Scrape All Historical Seasons
            </label>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '24px', marginTop: '4px' }}>
              If checked, the scraper will automatically navigate backwards through all available seasons for this league.
            </div>
          </div>
        )}

        <div className="form-group" style={{ marginTop: '16px' }}>
          <label className="form-label">Emergency Backup CSV (For long scrapes)</label>
          <div
            className="file-upload-zone"
            onClick={async () => {
              try {
                const res = await fetch(`${API_BASE}/api/pick_save_file`);
                const data = await res.json();
                if (data.file_path) {
                  handleParamChange('autoSaveCsvPath', data.file_path);
                }
              } catch (e) {
                console.error("Failed to pick file", e);
              }
            }}
          >
            <Upload />
            <div className="file-upload-text">
              {parameters.autoSaveCsvPath ? (
                <div style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                  <Check size={14} style={{ display: 'inline', marginRight: 4 }} />
                  {parameters.autoSaveCsvPath.split(/[/\\]/).pop()}
                </div>
              ) : (
                <>Click to select CSV destination (Optional)</>
              )}
            </div>
          </div>
          {parameters.autoSaveCsvPath && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px', wordBreak: 'break-all' }}>
                {parameters.autoSaveCsvPath}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <label className="form-label" style={{ margin: 0, fontSize: '0.7rem' }}>Batch Size (Rows)</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={parameters.autoSaveBatchSize || 10}
                  onChange={(e) => handleParamChange('autoSaveBatchSize', Number(e.target.value))}
                  style={{ width: '80px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="form-group" style={{ marginTop: '16px' }}>
          <label className="form-label checkbox-label" style={{ fontWeight: 600, color: 'var(--color-accent)' }}>
            <SafeInput
              type="checkbox"
              checked={parameters.headless !== false}
              onChange={(e) => handleParamChange('headless', e.target.checked)}
            />
            Run in Headless Mode
          </label>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <div style={{ flex: 1 }}>
            <label className="form-label">Max Concurrent Tabs</label>
            <SafeInput
              type="number"
              min="1"
              max="20"
              value={parameters.maxWorkers || 2}
              onChange={(e) => handleParamChange('maxWorkers', Number(e.target.value))}
              style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '16px' }}>
          <label className="form-label checkbox-label" style={{ fontWeight: 600, color: 'var(--color-accent)' }}>
            <SafeInput
              type="checkbox"
              checked={!!parameters.use_llm_parsing}
              onChange={(e) => handleParamChange('use_llm_parsing', e.target.checked)}
            />
            Use AI Parsing (Uses Gemini API Tokens for 60+ markets)
          </label>
        </div>

        <div className="form-group" style={{ marginTop: '16px' }}>
          <div style={{ 
            background: 'rgba(10, 132, 255, 0.1)', border: '1px solid rgba(10, 132, 255, 0.3)', 
            borderRadius: '6px', padding: '10px', color: 'var(--text-primary)', 
            fontSize: '0.75rem', textAlign: 'center', fontWeight: 500 
          }}>
            ⚙️ Bet365 Master Schema Matrix: Engaged<br/>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 'normal', marginTop: '4px', display: 'block' }}>
              (Scraping All 1X2, DNB, DC, HT/FT, OU & BTTS Splits)
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderDynamicForm = (uiSchema) => {
    return uiSchema.map((fieldDef, idx) => {
      const val = parameters[fieldDef.field] !== undefined ? parameters[fieldDef.field] : fieldDef.default;

      if (fieldDef.type === 'boolean') {
        return (
          <div key={fieldDef.field} className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <SafeInput
                type="checkbox"
                checked={val === true || val === 'true'}
                onChange={(e) => handleParamChange(fieldDef.field, e.target.checked)}
                style={{ accentColor: 'var(--color-accent)' }}
              />
              {fieldDef.label}
            </label>
            {fieldDef.description && <small className="form-text">{fieldDef.description}</small>}
          </div>
        );
      }

      if (fieldDef.type === 'string' || fieldDef.type === 'text') {
        return (
          <div key={idx} className="form-group">
            <label className="form-label">{fieldDef.label}</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <SafeInput
                type="text"
                value={val}
                onChange={(e) => handleParamChange(fieldDef.field, e.target.value)}
                style={{ flex: 1 }}
              />
              {fieldDef.field === 'outputPath' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.75rem', height: '32px' }}
                  onClick={async () => {
                    try {
                      const res = await fetch(`${API_BASE}/api/pick_save_file`);
                      const data = await res.json();
                      if (data.file_path) {
                        handleParamChange(fieldDef.field, data.file_path);
                      }
                    } catch (e) {
                      console.error("Failed to pick file", e);
                    }
                  }}
                >
                  Browse...
                </button>
              )}
            </div>
          </div>
        );
      }

      if (type === 'number') {
        return (
          <div key={idx} className="form-group">
            <label className="form-label">{label}</label>
            <SafeInput
              type="number"
              value={val}
              onChange={(e) => handleParamChange(fieldDef.field, Number(e.target.value))}
            />
          </div>
        );
      }

      if (fieldDef.type === 'column_creatable') {
        const listId = `datalist-${id}-${fieldDef.field}`;
        return (
          <div key={idx} className="form-group">
            <label className="form-label">{fieldDef.label}</label>
            <SafeInput
              type="text"
              list={listId}
              value={val}
              placeholder="Select existing or type new column"
              onChange={(e) => handleParamChange(fieldDef.field, e.target.value)}
            />
            {hasUpstreamColumns && (
              <datalist id={listId}>
                {upstreamSchema.map((col) => (
                  <option key={col.name} value={col.name} />
                ))}
              </datalist>
            )}
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Tip: Select an existing column to overwrite it, or type a new name to append.
            </div>
          </div>
        );
      }

      if (fieldDef.type === 'code' || fieldDef.type === 'textarea') {
        const handleTextareaChange = (e) => {
          const newVal = e.target.value;
          const cursor = e.target.selectionStart;
          handleParamChange(fieldDef.field, newVal);

          // Check for column autocomplete trigger (Alteryx style brackets: '[')
          const lastBracket = newVal.lastIndexOf('[', cursor - 1);
          let insideBracket = false;
          if (lastBracket !== -1) {
            const closedBracket = newVal.indexOf(']', lastBracket);
            if (closedBracket === -1 || closedBracket >= cursor) {
              insideBracket = true;
              const partial = newVal.substring(lastBracket + 1, cursor).toLowerCase();
              const options = (upstreamSchema || [])
                .map(c => c.name)
                .filter(name => name.toLowerCase().includes(partial))
                .map(name => ({ type: 'column', value: name }));
              
              if (options.length > 0) {
                setFormulaSuggestion({ field: fieldDef.field, partial, startIndex: lastBracket, cursorIndex: cursor, options });
                return;
              }
            }
          }

          // Check for function autocomplete trigger (Typing letters)
          if (!insideBracket) {
            const wordMatch = newVal.substring(0, cursor).match(/[a-zA-Z]+$/);
            if (wordMatch) {
              const partial = wordMatch[0].toLowerCase();
              const availableFunctions = ['ToString', 'ToNumber', 'IIF', 'IF', 'datetime'];
              const options = availableFunctions
                .filter(f => f.toLowerCase().startsWith(partial) && f.toLowerCase() !== partial)
                .map(f => ({ type: 'function', value: f }));
                
              if (options.length > 0) {
                const startIndex = cursor - wordMatch[0].length;
                setFormulaSuggestion({ field: fieldDef.field, partial, startIndex, cursorIndex: cursor, options });
                return;
              }
            }
          }

          setFormulaSuggestion(null);
        };

        const applySug = (suggestionObj) => {
          if (!formulaSuggestion) return;
          const exp = val;
          const before = exp.substring(0, formulaSuggestion.startIndex);
          const after = exp.substring(formulaSuggestion.cursorIndex);
          
          let newExp = '';
          let newCursor = 0;

          if (suggestionObj.type === 'column') {
            newExp = before + '[' + suggestionObj.value + ']' + after;
            newCursor = before.length + suggestionObj.value.length + 2;
          } else if (suggestionObj.type === 'function') {
            newExp = before + suggestionObj.value + '(' + after;
            newCursor = before.length + suggestionObj.value.length + 1;
          }
          
          handleParamChange(fieldDef.field, newExp);
          setFormulaSuggestion(null);
          
          if (textareaRef.current) {
             setTimeout(() => {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newCursor, newCursor);
             }, 0);
          }
        };

        return (
          <div key={idx} className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">{fieldDef.label}</label>
            <SafeTextarea
              ref={textareaRef}
              value={val}
              onChange={handleTextareaChange}
              onKeyDown={(e) => {
                 if (e.key === 'Tab') {
                   e.preventDefault();
                   const start = e.target.selectionStart;
                   const end = e.target.selectionEnd;
                   const newVal = val.substring(0, start) + "    " + val.substring(end);
                   handleParamChange(fieldDef.field, newVal);
                   setTimeout(() => {
                     textareaRef.current.setSelectionRange(start + 4, start + 4);
                   }, 0);
                 }
              }}
              style={{ 
                fontFamily: 'monospace', 
                whiteSpace: 'pre', 
                minHeight: fieldDef.type === 'code' ? '300px' : '80px',
                background: fieldDef.type === 'code' ? '#1e1e1e' : undefined,
                color: fieldDef.type === 'code' ? '#d4d4d4' : undefined,
                padding: '12px'
              }}
            />
            {formulaSuggestion && formulaSuggestion.field === fieldDef.field && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                zIndex: 100,
                maxHeight: '150px',
                overflowY: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}>
                <div style={{ padding: '4px 8px', fontSize: '0.65rem', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold' }}>
                  Suggestions
                </div>
                {formulaSuggestion.options.map(opt => (
                  <div 
                    key={opt.value}
                    onClick={() => applySug(opt)}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span>{opt.value}</span>
                    <span style={{color: 'var(--text-muted)', fontSize: '0.6rem'}}>{opt.type}</span>
                  </div>
                ))}
              </div>
            )}
            {fieldDef.type === 'code' && (
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                <div><strong>Tip:</strong> Type <code>df["</code> to see column autocompletions. Tab key inserts spaces.</div>
                <div style={{ marginTop: '2px' }}><strong>Advanced:</strong> Want to connect to an external API or custom LLM? See the commented template above for the syntax on how to <code>import requests</code> and run external AI models over your dataset!</div>
              </div>
            )}
          </div>
        );
      }
      
      if (fieldDef.type === 'number') {
        return (
          <div key={idx} className="form-group">
            <label className="form-label">{fieldDef.label}</label>
            <SafeInput
              type="number"
              value={val !== undefined ? val : (fieldDef.default || 0)}
              onChange={(e) => handleParamChange(fieldDef.field, parseFloat(e.target.value) || 0)}
            />
          </div>
        );
      }
      
      if (fieldDef.type === 'boolean') {
        return (
          <div key={idx} className="form-group">
            <label className="form-label checkbox-label">
              <SafeInput
                type="checkbox"
                checked={!!val}
                onChange={(e) => handleParamChange(fieldDef.field, e.target.checked)}
              />
              {fieldDef.label}
            </label>
          </div>
        );
      }
      
      if (fieldDef.type === 'select') {
        return (
          <div key={idx} className="form-group">
            <label className="form-label">{fieldDef.label}</label>
            <SafeSelect value={val} onChange={(e) => handleParamChange(fieldDef.field, e.target.value)}>
              {fieldDef.options?.map(opt => {
                if (typeof opt === 'object' && opt !== null) {
                  return <option key={opt.value} value={opt.value}>{opt.label}</option>;
                }
                return <option key={opt} value={opt}>{opt}</option>;
              })}
            </SafeSelect>
          </div>
        );
      }
      
      if (fieldDef.type === 'column_select') {
        return (
          <div key={idx} className="form-group">
            <label className="form-label">{fieldDef.label}</label>
            {hasUpstreamColumns ? (
              <SafeSelect value={val} onChange={(e) => handleParamChange(fieldDef.field, e.target.value)}>
                <option value="">-- Select Target Column --</option>
                {upstreamSchema.map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name}
                  </option>
                ))}
              </SafeSelect>
            ) : (
              <SafeInput
                type="text"
                placeholder="Target column name"
                value={val}
                onChange={(e) => handleParamChange(fieldDef.field, e.target.value)}
              />
            )}
          </div>
        );
      }

      if (fieldDef.type === 'column_multi_select') {
        const toggleColumn = (colName) => {
          const currentList = Array.isArray(val) ? val : [];
          if (currentList.includes(colName)) {
            handleParamChange(fieldDef.field, currentList.filter(c => c !== colName));
          } else {
            handleParamChange(fieldDef.field, [...currentList, colName]);
          }
        };
        const currentList = Array.isArray(val) ? val : [];

        return (
          <div key={idx} className="form-group">
            <label className="form-label">{fieldDef.label}</label>
            {hasUpstreamColumns ? (
              <div style={{ minHeight: '100px', maxHeight: '500px', resize: 'vertical', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-primary)', padding: '4px' }}>
                {upstreamSchema.map((col) => (
                  <label key={col.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <SafeInput
                      type="checkbox"
                      checked={currentList.includes(col.name)}
                      onChange={() => toggleColumn(col.name)}
                      style={{ accentColor: 'var(--color-accent)' }}
                    />
                    {col.name}
                  </label>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Connect an upstream node to see columns.</span>
            )}
          </div>
        );
      }

      if (fieldDef.type === 'help_text') {
        return (
          <div key={idx} className="form-group" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '10px', borderRadius: '4px', borderLeft: '3px solid var(--color-accent)', lineHeight: '1.4' }}>
            <div dangerouslySetInnerHTML={{ __html: fieldDef.content }} />
          </div>
        );
      }

      return null;
    });
  };

  const renderEmptyState = () => {
    return (
      <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ marginBottom: '15px', color: 'var(--color-accent)', opacity: 0.8 }}>
          <Settings size={48} />
        </div>
        <h4 style={{ color: 'var(--text-primary)', marginBottom: '10px', fontWeight: 600 }}>No Configuration Required</h4>
        <p style={{ fontSize: '0.85rem', lineHeight: '1.6', marginBottom: '15px' }}>
          This node is fully automated and operates dynamically on the incoming data stream.
        </p>
        {toolDef && (toolDef.description || toolDef.tooltip || toolDef.extended_description) && (
          <div style={{ background: 'var(--bg-tertiary)', padding: '15px', borderRadius: '6px', borderLeft: '3px solid var(--color-accent)', textAlign: 'left' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '5px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Protocol Info</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
              {toolDef.extended_description || toolDef.description || toolDef.tooltip}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="config-sidebar" style={{ ...style, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div className="sidebar-header">
          <span className="sidebar-title">
            <Settings size={16} />
            {getTitle()}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              onClick={(e) => { e.stopPropagation(); if (onCacheAndRun) onCacheAndRun(id, parameters.isCached); }}
              title={parameters.isCached ? "Uncache Node Output & Run" : "Cache Node Output & Run"}
              style={{ 
                background: 'none', border: 'none', cursor: 'pointer', 
                color: parameters.isCached ? 'var(--color-accent)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', padding: '2px', borderRadius: '4px'
              }}
            >
              <Database size={14} />
            </button>
            {parameters.isCached && (
              <button
                onClick={(e) => { e.stopPropagation(); if (onClearGlobalCache) onClearGlobalCache(); }}
                title="Clear Global Cache"
                style={{ 
                  background: 'none', border: 'none', cursor: 'pointer', 
                  color: '#ef4444',
                  display: 'flex', alignItems: 'center', padding: '2px', borderRadius: '4px'
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ID: {id}</span>
          </div>
        </div>
        <div className="sidebar-content" style={{ flex: 1 }}>
          {type === 'fileInput' ? renderFileInputConfig() :
           type === 'filter' ? renderFilterConfig() :
           type === 'sort' ? renderSortConfig() :
           type === 'select' ? renderSelectConfig() :
           type === 'browse' ? renderBrowseConfig() :
           type === 'imageCaption' ? renderImageCaptionConfig() :
           type === 'fileOutput' ? renderFileOutputConfig() :
           type === 'regex' ? renderRegexConfig() :
           type === 'data_cleansing' ? renderDataCleansingConfig() :
           type === 'formula' ? renderFormulaConfig() :
           type === 'visualization' ? renderVisualizationConfig() :
           type === 'join' ? renderJoinConfig() :
           type === 'sampling' ? renderSamplingConfig() :
           type === 'summarize' ? renderSummarizeConfig() :
           (type === 'odds_portal_scraper' || type === 'odds_portal_upcoming') ? renderOddsPortalScraperConfig() :
           (toolDef && toolDef.ui_schema && toolDef.ui_schema.length > 0) ? renderDynamicForm(toolDef.ui_schema) : renderEmptyState()}
        </div>
      </div>
      
    </div>
  );
};

export default ConfigWindow;
