import React, { useState, useEffect, useRef } from 'react';
import { Settings, Upload, Check, AlertCircle, Database, Link, X, Plus } from 'lucide-react';

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
      { value: 'is_null', label: 'Is Empty / Null' },
      { value: 'is_not_null', label: 'Is Not Empty' }
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
      { value: 'is_null', label: 'Is Empty / Null' },
      { value: 'is_not_null', label: 'Is Not Empty' }
    ];
  }
  
  if (lowerType.includes('bool')) {
    return [
      { value: '==', label: 'Equals (=)' },
      { value: '!=', label: 'Does Not Equal (≠)' },
      { value: 'is_null', label: 'Is Empty / Null' },
      { value: 'is_not_null', label: 'Is Not Empty' }
    ];
  }
  
  return [
    { value: '==', label: 'Equals (=)' },
    { value: '!=', label: 'Does Not Equal (≠)' },
    { value: 'contains', label: 'Contains (text)' },
    { value: 'not_contains', label: 'Does Not Contain (text)' },
    { value: 'starts_with', label: 'Starts With (text)' },
    { value: 'ends_with', label: 'Ends With (text)' },
    { value: 'is_null', label: 'Is Empty / Null' },
    { value: 'is_not_null', label: 'Is Not Empty' }
  ];
};

const OPERATOR_LABELS = {
  '==': '=', '!=': '≠', '>': '>', '>=': '≥', '<': '<', '<=': '≤',
  'contains': 'contains', 'not_contains': 'does not contain', 'starts_with': 'starts with', 'ends_with': 'ends with',
  'is_null': 'is empty', 'is_not_null': 'is not empty'
};

const ConfigWindow = ({ selectedNode, upstreamSchema, onUpdateParams, availableTools = [], results = {}, nodes = [], edges = [], style = {} }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [excelSheets, setExcelSheets] = useState([]);
  const [formulaSuggestion, setFormulaSuggestion] = useState(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Summarize rule state
  const [sumColumn, setSumColumn] = useState('');
  const [sumAction, setSumAction] = useState('group_by');
  const [sumOutput, setSumOutput] = useState('');
  
  // Sort rule state
  const [sortColumn, setSortColumn] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');

  const isValidNode = selectedNode && typeof selectedNode === 'object' && selectedNode.id;
  const id = isValidNode ? selectedNode.id : null;
  const type = isValidNode ? selectedNode.type : null;
  const data = isValidNode ? selectedNode.data : null;
  const parameters = data?.parameters || {};
  const toolDef = availableTools.find(t => t.id === type);

  // Fetch excel sheets list dynamically when file changes
  useEffect(() => {
    if (isValidNode && type === 'fileInput' && parameters.filePath) {
      const isExcel = parameters.fileType === 'excel' || 
                      (parameters.fileType === 'auto' && (parameters.filePath.endsWith('.xlsx') || parameters.filePath.endsWith('.xls') || parameters.filePath.endsWith('.ods')));
      if (isExcel) {
        fetch(`http://127.0.0.1:8000/api/excel/sheets?filePath=${encodeURIComponent(parameters.filePath)}`)
          .then(res => res.json())
          .then(data => {
            if (data && Array.isArray(data.sheets)) {
              setExcelSheets(data.sheets);
            } else {
              setExcelSheets([]);
            }
          })
          .catch(() => {
            setExcelSheets([]);
          });
      } else {
        setExcelSheets([]);
      }
    } else {
      setExcelSheets([]);
    }
  }, [isValidNode, type, parameters.filePath, parameters.fileType]);

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
            keep: existing ? existing.keep : true,
            rename: existing ? existing.rename : col.name,
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
    return (
      <div className="config-sidebar" style={style}>
        <div className="no-node-selected">
          <Settings />
          <p>Select a node on the canvas to configure its settings.</p>
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

    return (
      <>
        <div className="form-group">
          <label className="form-label">Source File</label>
          <div
            className="file-upload-zone"
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload />
            <div className="file-upload-text">
              {uploading ? (
                'Uploading file...'
              ) : filePath ? (
                <div style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                  <Check size={14} style={{ display: 'inline', marginRight: 4 }} />
                  {filePath}
                </div>
              ) : (
                'Click or drag file here (CSV, XLSX, PDF)'
              )}
            </div>
            <input
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
          <label className="form-label">Or Local Absolute Path</label>
          <input
            type="text"
            placeholder="C:/data/file.csv"
            value={filePath}
            onChange={(e) => handleParamChange('filePath', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">File Type</label>
          <select value={fileType} onChange={(e) => handleParamChange('fileType', e.target.value)}>
            <option value="auto">Auto-detect</option>
            <option value="csv">CSV (Comma-Separated)</option>
            <option value="excel">Excel Spreadsheet</option>
            <option value="pdf">PDF Document (Tables)</option>
            <option value="image">Image (OCR Text)</option>
          </select>
        </div>

        {fileType === 'csv' || (fileType === 'auto' && filePath.endsWith('.csv')) ? (
          <>
            <div className="form-group">
              <label className="form-label">CSV Delimiter</label>
              <select
                value={csvDelimiter}
                onChange={(e) => handleParamChange('csvDelimiter', e.target.value)}
              >
                <option value=",">Comma (,)</option>
                <option value="&#9;">Tab (\t)</option>
                <option value=";">Semicolon (;)</option>
                <option value="|">Pipe (|)</option>
              </select>
            </div>
            <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <input
                id="csvHeaderCheck"
                type="checkbox"
                checked={csvHeader}
                onChange={(e) => handleParamChange('csvHeader', e.target.checked)}
              />
              <label htmlFor="csvHeaderCheck" className="form-label" style={{ cursor: 'pointer', marginBottom: 0 }}>
                First row contains headers
              </label>
            </div>
          </>
        ) : null}

        {fileType === 'excel' || (fileType === 'auto' && (filePath.endsWith('.xlsx') || filePath.endsWith('.xls') || filePath.endsWith('.ods'))) ? (
          <div className="form-group">
            <label className="form-label">Sheet Name</label>
            {excelSheets.length > 0 ? (
              <select
                value={excelSheet}
                onChange={(e) => handleParamChange('excelSheet', e.target.value)}
              >
                <option value="">-- First Sheet (Default) --</option>
                {excelSheets.map((sheet) => (
                  <option key={sheet} value={sheet}>
                    {sheet}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Leave empty for first sheet"
                value={excelSheet}
                onChange={(e) => handleParamChange('excelSheet', e.target.value)}
              />
            )}
          </div>
        ) : null}

        {fileType === 'pdf' || (fileType === 'auto' && filePath.endsWith('.pdf')) ? (
          <div className="form-group">
            <label className="form-label">PDF Extraction Mode</label>
            <select
              value={parameters.pdfExtractionMode || 'text'}
              onChange={(e) => handleParamChange('pdfExtractionMode', e.target.value)}
            >
              <option value="text">Text Mode</option>
              <option value="ocr">OCR (Image to Text)</option>
            </select>
          </div>
        ) : null}
      </>
    );
  };

  const renderFilterConfig = () => {
    const filterType = parameters.filterType || 'basic';
    const column = parameters.column || '';
    const operator = parameters.operator || '==';
    const value = parameters.value || '';
    const customExpression = parameters.customExpression || '';

    const selectedColObj = hasUpstreamColumns ? upstreamSchema.find(col => col.name === column) : null;
    const colType = selectedColObj?.type || 'String';
    const lowerType = colType.toLowerCase();
    const validOperators = getOperatorsForType(colType);

    const handleColumnChange = (newCol) => {
      const colObj = hasUpstreamColumns ? upstreamSchema.find(col => col.name === newCol) : null;
      const targetType = colObj?.type || 'String';
      const targetOperators = getOperatorsForType(targetType);
      const currentOp = parameters.operator || '==';
      const isOpValid = targetOperators.some(op => op.value === currentOp);

      onUpdateParams(id, {
        ...parameters,
        column: newCol,
        operator: isOpValid ? currentOp : '==',
        value: ''
      });
    };

    const opLabel = OPERATOR_LABELS[operator] || operator;
    const expressionPreview = filterType === 'custom' 
      ? customExpression || 'No custom expression'
      : column 
        ? `[${column}] ${opLabel} ${operator === 'is_null' || operator === 'is_not_null' ? '' : `"${value}"`}`.trim()
        : 'No condition configured';

    // Autocomplete logic for custom expression
    const handleExpressionChange = (e) => {
      const val = e.target.value;
      const cursor = e.target.selectionStart;
      handleParamChange('customExpression', val);

      const lastOpen = val.lastIndexOf('[', cursor - 1);
      const lastClose = val.lastIndexOf(']', cursor - 1);

      if (lastOpen !== -1 && lastOpen > lastClose) {
        const partial = val.substring(lastOpen + 1, cursor).toLowerCase();
        const options = upstreamSchema
          .map(c => c.name)
          .filter(name => name.toLowerCase().includes(partial));
        
        if (options.length > 0) {
          setFormulaSuggestion({ partial, startIndex: lastOpen, cursorIndex: cursor, options });
        } else {
          setFormulaSuggestion(null);
        }
      } else {
        setFormulaSuggestion(null);
      }
    };

    const applySuggestion = (colName) => {
      if (!formulaSuggestion) return;
      const exp = customExpression;
      const before = exp.substring(0, formulaSuggestion.startIndex);
      const after = exp.substring(formulaSuggestion.cursorIndex);
      
      const newExp = before + '[' + colName + ']' + after;
      handleParamChange('customExpression', newExp);
      setFormulaSuggestion(null);
      
      if (textareaRef.current) {
         setTimeout(() => {
            textareaRef.current.focus();
            const newCursor = before.length + colName.length + 2;
            textareaRef.current.setSelectionRange(newCursor, newCursor);
         }, 0);
      }
    };

    const handleExpressionKeyDown = (e) => {
      if (formulaSuggestion && formulaSuggestion.options.length > 0) {
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          applySuggestion(formulaSuggestion.options[0]);
        } else if (e.key === 'Escape') {
          setFormulaSuggestion(null);
        }
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
          color: (filterType === 'custom' && customExpression) || (filterType === 'basic' && column) ? 'var(--color-prep)' : 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px'
        }}>
          <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontSize: '0.65rem', textTransform: 'uppercase', background: 'var(--border-color)', padding: '2px 6px', borderRadius: '3px' }}>EXP</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{expressionPreview}</span>
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
          <select value={filterType} onChange={(e) => handleParamChange('filterType', e.target.value)}>
            <option value="basic">Basic Condition</option>
            <option value="custom">Custom Expression</option>
          </select>
        </div>

        {filterType === 'custom' ? (
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Custom Expression</label>
            <textarea
              ref={textareaRef}
              className="custom-expression-input"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', resize: 'vertical' }}
              value={customExpression}
              onChange={handleExpressionChange}
              onKeyDown={handleExpressionKeyDown}
              placeholder="e.g. [Department] == 'HR' AND [Age] > 30"
              rows={3}
            />
            {formulaSuggestion && (
              <div className="autocomplete-suggestions" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', zIndex: 10, maxHeight: '150px', overflowY: 'auto' }}>
                {formulaSuggestion.options.map((opt, i) => (
                  <div 
                    key={opt} 
                    style={{ padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer', background: i === 0 ? 'var(--color-primary-alpha)' : 'transparent', color: 'var(--text-primary)' }}
                    onClick={() => applySuggestion(opt)}
                  >
                    {opt}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 8 }}>
              Suggestions: type '[' to see available columns.
            </div>
          </div>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">Column</label>
              {hasUpstreamColumns ? (
                <select value={column} onChange={e => handleColumnChange(e.target.value)}>
                  <option value="">-- Select Column --</option>
                  {upstreamSchema.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              ) : (
                <input type="text" value={column} onChange={e => handleColumnChange(e.target.value)} placeholder="Column name" />
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Operator</label>
              <select value={operator} onChange={(e) => handleParamChange('operator', e.target.value)}>
                {validOperators?.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Value</label>
              {operator === 'is_null' || operator === 'is_not_null' ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not applicable</span>
              ) : colType === 'Boolean' ? (
                <select value={value} onChange={(e) => handleParamChange('value', e.target.value)}>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              ) : (
                <input
                  type={lowerType.includes('date') ? 'date' : 'text'}
                  placeholder="Enter value"
                  value={value}
                  onChange={(e) => handleParamChange('value', e.target.value)}
                />
              )}
            </div>
          </>
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
                    <tr key={idx} style={{ borderBottom: idx < currentRules.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                      <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{idx + 1}</td>
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
            <select value={sortColumn} onChange={(e) => setSortColumn(e.target.value)} style={{ width: '100%', marginBottom: '8px' }}>
              <option value="">-- Select Column --</option>
              {schema.map(c => (
                <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={{ width: '100%' }} disabled={!sortColumn}>
              <option value="asc">Ascending (A-Z, 0-9)</option>
              <option value="desc">Descending (Z-A, 9-0)</option>
            </select>
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
            <div style={{ background: 'var(--bg-secondary)', padding: '0', borderRadius: '6px', border: '1px solid var(--border-color)', overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.65rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
                    <th style={{ padding: '6px 8px', width: '30px', textAlign: 'center' }}>
                       <input 
                         type="checkbox" 
                         title="Select/Deselect All"
                         checked={columns.length > 0 && columns.every(c => c.keep)}
                         onChange={(e) => {
                           const updatedCols = columns.map(c => ({ ...c, keep: e.target.checked }));
                           handleParamChange('columns', updatedCols);
                         }}
                         style={{ accentColor: 'var(--color-accent)' }}
                       />
                    </th>
                    <th style={{ padding: '6px 8px', fontWeight: 600 }}>Field</th>
                    <th style={{ padding: '6px 8px', fontWeight: 600 }}>Type</th>
                    <th style={{ padding: '6px 8px', fontWeight: 600 }}>Rename</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, idx) => (
                    <tr key={col.name} style={{ borderBottom: '1px dotted var(--border-color)', opacity: col.keep ? 1 : 0.5, transition: 'opacity 0.2s', background: col.keep ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={col.keep}
                          onChange={(e) => handleColumnToggle(idx, 'keep', e.target.checked)}
                          style={{ accentColor: 'var(--color-accent)' }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }} title={col.name}>{col.name}</td>
                      <td style={{ padding: '4px 8px' }}>
                        <select
                          style={{ width: '85px', fontSize: '0.65rem', padding: '2px 4px', background: 'transparent', border: '1px solid transparent', borderRadius: '4px', color: 'var(--text-secondary)', outline: 'none', cursor: col.keep ? 'pointer' : 'not-allowed' }}
                          value={col.type || ''}
                          onChange={(e) => handleColumnToggle(idx, 'type', e.target.value)}
                          disabled={!col.keep}
                        >
                          <option value="">Keep Type</option>
                          <option value="String">String</option>
                          <option value="Int64">Int64</option>
                          <option value="Float64">Float64</option>
                          <option value="Boolean">Boolean</option>
                        </select>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input
                          type="text"
                          style={{ width: '100%', fontSize: '0.65rem', padding: '4px 6px', background: col.keep ? 'var(--bg-primary)' : 'transparent', border: col.keep ? '1px solid var(--border-color)' : '1px solid transparent', borderRadius: '4px', color: 'var(--text-primary)', outline: 'none' }}
                          placeholder="Rename..."
                          value={col.rename || ''}
                          onChange={(e) => handleColumnToggle(idx, 'rename', e.target.value)}
                          disabled={!col.keep}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <input
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
          <input
            type="text"
            placeholder="C:/data/photo.jpg"
            value={imagePath}
            onChange={(e) => handleParamChange('imagePath', e.target.value)}
          />
        </div>

        <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', lineHeight: '1.4', marginTop: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px' }}>
          <p><strong>Image Ingest & Description Model</strong> compiles visual characteristics of the picture locally using standard CPU instruction pipelines.</p>
          <p style={{ marginTop: 5 }}>On its first execution, a lightweight <strong>ViT-GPT2 Visual Network ONNX model</strong> is cached. It automatically outputs descriptive semantic tags (e.g. format, sizes, generated caption description) directly into your downstream data stream using a pure CPU <strong>ONNX Runtime</strong> session (no GPU or PyTorch required!).</p>
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
          <input
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
          <input
            type="text"
            placeholder="output.csv or C:/data/output.csv"
            value={outputPath}
            onChange={(e) => handleParamChange('outputPath', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Output Format</label>
          <select value={outputFormat} onChange={(e) => handleParamChange('outputFormat', e.target.value)}>
            <option value="csv">CSV (Comma-Separated)</option>
            <option value="html">HTML (Interactive)</option>
          </select>
        </div>
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
            <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-primary)', padding: '4px' }}>
              {upstreamSchema.map((col) => (
                <label key={col.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <input
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
            <input type="checkbox" checked={replaceString} onChange={(e) => handleParamChange('replace_nulls_string', e.target.checked)} />
            Replace Nulls with Blank String
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={replaceNumeric} onChange={(e) => handleParamChange('replace_nulls_numeric', e.target.checked)} />
            Replace Nulls with 0 (Numeric cols)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={trimWhite} onChange={(e) => handleParamChange('trim_whitespace', e.target.checked)} />
            Trim Leading/Trailing Whitespace
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={removePunct} onChange={(e) => handleParamChange('remove_punctuation', e.target.checked)} />
            Remove Punctuation
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={removeNumbers} onChange={(e) => handleParamChange('remove_numbers', e.target.checked)} />
            Remove Numbers
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={removeLetters} onChange={(e) => handleParamChange('remove_letters', e.target.checked)} />
            Remove Letters
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            <span>Modify Case:</span>
            <select value={stringCase} onChange={(e) => handleParamChange('string_case', e.target.value)} style={{ padding: '2px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              <option value="None">None</option>
              <option value="Titlecase">Title Case</option>
              <option value="Uppercase">UPPERCASE</option>
              <option value="Lowercase">lowercase</option>
            </select>
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
    // Keep existing formula rendering...
    const output_column = parameters.output_column || 'NewColumn';
    const expression = parameters.expression || '';

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

    const handleExpressionChange = (e) => {
      const val = e.target.value;
      const cursor = e.target.selectionStart;
      handleParamChange('expression', val);

      // Check if cursor is inside a bracket
      const lastOpen = val.lastIndexOf('[', cursor - 1);
      const lastClose = val.lastIndexOf(']', cursor - 1);

      if (lastOpen !== -1 && lastOpen > lastClose) {
        const partial = val.substring(lastOpen + 1, cursor).toLowerCase();
        const options = upstreamSchema
          .map(c => c.name)
          .filter(name => name.toLowerCase().includes(partial));
        
        if (options.length > 0) {
          setFormulaSuggestion({ partial, startIndex: lastOpen, cursorIndex: cursor, options });
        } else {
          setFormulaSuggestion(null);
        }
      } else {
        setFormulaSuggestion(null);
      }
    };

    const applySuggestion = (colName) => {
      if (!formulaSuggestion) return;
      const exp = parameters.expression || '';
      const before = exp.substring(0, formulaSuggestion.startIndex);
      const after = exp.substring(formulaSuggestion.cursorIndex);
      
      const newExp = before + '[' + colName + ']' + after;
      handleParamChange('expression', newExp);
      setFormulaSuggestion(null);
      
      if (textareaRef.current) {
         setTimeout(() => {
            textareaRef.current.focus();
            const newCursor = before.length + colName.length + 2;
            textareaRef.current.setSelectionRange(newCursor, newCursor);
         }, 0);
      }
    };

    const handleExpressionKeyDown = (e) => {
      if (formulaSuggestion && formulaSuggestion.options.length > 0) {
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          applySuggestion(formulaSuggestion.options[0]);
        } else if (e.key === 'Escape') {
          setFormulaSuggestion(null);
        }
      }
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

        <div className="form-group">
          <label className="form-label">Output Column Name</label>
          <input
            type="text"
            placeholder="E.g., FullName or TotalCost"
            value={output_column}
            onChange={(e) => handleParamChange('output_column', e.target.value)}
          />
        </div>

        <div className="form-group" style={{ position: 'relative' }}>
          <label className="form-label">Formula Expression</label>
          <textarea
            ref={textareaRef}
            placeholder="Type formula here..."
            value={expression}
            onChange={handleExpressionChange}
            onKeyDown={handleExpressionKeyDown}
            style={{ fontFamily: 'var(--font-mono)', minHeight: '100px', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: '0.75rem', width: '100%', resize: 'vertical' }}
          />
          {formulaSuggestion && formulaSuggestion.options.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--bg-secondary)', border: '1px solid var(--color-accent)', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '120px', overflowY: 'auto', marginTop: '-2px' }}>
              {formulaSuggestion.options.map((opt, i) => (
                <div 
                  key={opt}
                  onClick={() => applySuggestion(opt)}
                  style={{ padding: '6px 10px', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', cursor: 'pointer', background: i === 0 ? 'rgba(59, 130, 246, 0.1)' : 'transparent', borderBottom: '1px solid var(--border-color)' }}
                >
                  <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>[</span>{opt}<span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>]</span>
                  {i === 0 && <span style={{ float: 'right', fontSize: '0.6rem', color: 'var(--text-muted)' }}>Press Tab/Enter</span>}
                </div>
              ))}
            </div>
          )}
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            Type "[" to autocomplete columns. Supports standard Polars expression math.
          </span>
        </div>

        <div className="form-group" style={{ marginTop: '16px' }}>
          <label className="form-label">Contextual Examples</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {examples.map((ex, i) => (
              <div 
                key={i} 
                onClick={() => handleParamChange('expression', ex)}
                style={{ background: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: '4px', border: '1px dashed var(--border-color)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', cursor: 'pointer' }}
                title="Click to use this formula"
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
            <select value={column} onChange={(e) => handleParamChange('column', e.target.value)}>
              <option value="">-- Select Target Column --</option>
              {upstreamSchema.map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name} ({col.type && typeof col.type === 'string' ? col.type.split('.').pop() : 'Unknown'})
                </option>
              ))}
            </select>
          ) : (
            <input
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
          <input
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
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-accent)', width: '20px' }}>${idx+1}</span>
                <input
                  type="text"
                  placeholder="Column Name"
                  value={outCol.name}
                  onChange={(e) => handleOutputColumnChange(idx, 'name', e.target.value)}
                  style={{ flex: 1, padding: '4px 6px', fontSize: '0.75rem' }}
                />
                <select
                  value={outCol.type || 'String'}
                  onChange={(e) => handleOutputColumnChange(idx, 'type', e.target.value)}
                  style={{ width: '85px', padding: '4px', fontSize: '0.75rem', background: 'var(--bg-secondary)' }}
                >
                  <option value="String">String</option>
                  <option value="Int64">Int64</option>
                  <option value="Float64">Float64</option>
                  <option value="Boolean">Boolean</option>
                </select>
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
          <select value={chartType} onChange={(e) => handleParamChange('chartType', e.target.value)}>
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
          </select>
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
            <select value={xAxis} onChange={(e) => handleAxisChange('xAxis', e.target.value)}>
              <option value="">-- Select X-Axis --</option>
              {upstreamSchema.map((col) => {
                const isNumeric = col.type.toLowerCase().includes('int') || col.type.toLowerCase().includes('float');
                return (
                  <option key={col.name} value={col.name} style={{ color: !isNumeric && chartType === 'scatter' ? 'var(--text-muted)' : 'inherit' }}>
                    {col.name} ({col.type}) {!isNumeric && chartType === 'scatter' ? ' - Might be incompatible' : ''}
                  </option>
                );
              })}
            </select>
          ) : (
            <input type="text" placeholder="Type X-Axis column" value={xAxis} onChange={(e) => handleAxisChange('xAxis', e.target.value)} />
          )}
          {xWarning && <div style={{ fontSize: '0.65rem', color: 'var(--color-warning)', marginTop: '4px' }}>{xWarning}</div>}
        </div>

        <div className="form-group">
          <label className="form-label">Y-Axis Column</label>
          {hasUpstreamColumns ? (
            <select value={yAxis} onChange={(e) => handleAxisChange('yAxis', e.target.value)}>
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
            </select>
          ) : (
            <input type="text" placeholder="Type Y-Axis column" value={yAxis} onChange={(e) => handleAxisChange('yAxis', e.target.value)} />
          )}
          {yWarning && <div style={{ fontSize: '0.65rem', color: 'var(--color-warning)', marginTop: '4px' }}>{yWarning}</div>}
        </div>

        <div className="form-group">
          <label className="form-label">Chart Title (Optional)</label>
          <input type="text" placeholder="Enter title" value={title} onChange={(e) => handleParamChange('title', e.target.value)} />
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
        <div className="form-group">
          <label className="form-label">Join Type</label>
          <div className="venn-diagram-selector">
            {['inner', 'left', 'right', 'outer'].map(type => (
              <div 
                key={type} 
                className={`venn-item ${how === type ? 'active' : ''}`}
                onClick={() => handleJoinTypeClick(type)}
                title={`${type.charAt(0).toUpperCase() + type.slice(1)} Join`}
              >
                <div className={`venn-icon venn-${type}`}>
                  <div className="venn-circle left-circle"></div>
                  <div className="venn-circle right-circle"></div>
                </div>
                <span className="venn-label">{type}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="join-schemas-split">
          {/* Left Input */}
          <div className="schema-panel left-panel">
            <div className="panel-header">Left Input (L)</div>
            <div className="form-group">
              <select value={leftOn} onChange={(e) => handleParamChange('left_on', e.target.value)} className="key-select">
                <option value="">-- Select Key --</option>
                {leftSchema.map((col) => (
                  <option key={col.name} value={col.name}>{col.name}</option>
                ))}
              </select>
            </div>
            <div className="schema-list">
              {leftSchema.length === 0 ? (
                <div className="empty-schema">Connect Left Node</div>
              ) : (
                leftSchema.map((col) => (
                  <div key={col.name} className={`schema-item ${col.name === leftOn ? 'active-key' : ''}`}>
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
              <select value={rightOn} onChange={(e) => handleParamChange('right_on', e.target.value)} className="key-select">
                <option value="">-- Select Key --</option>
                {rightSchema.map((col) => (
                  <option key={col.name} value={col.name}>{col.name}</option>
                ))}
              </select>
            </div>
            <div className="schema-list">
              {rightSchema.length === 0 ? (
                <div className="empty-schema">Connect Right Node</div>
              ) : (
                rightSchema.map((col) => (
                  <div key={col.name} className={`schema-item ${col.name === rightOn ? 'active-key' : ''}`}>
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
                    <tr key={idx} style={{ borderBottom: idx < currentActions.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                      <td style={{ padding: '8px', color: 'var(--text-primary)' }}>{act.column}</td>
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
            <select value={sumColumn} onChange={(e) => handleColChange(e.target.value)} style={{ width: '100%', marginBottom: '8px' }}>
              <option value="">-- Select Column --</option>
              {schema.map(c => (
                <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select value={sumAction} onChange={(e) => handleActionChange(e.target.value)} style={{ flex: 1 }} disabled={!sumColumn}>
              {getAvailableActions(sumColumn).map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <input 
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

  const renderDynamicForm = (uiSchema) => {
    return uiSchema.map((fieldDef, idx) => {
      const val = parameters[fieldDef.field] !== undefined ? parameters[fieldDef.field] : fieldDef.default;

      if (fieldDef.type === 'string' || fieldDef.type === 'text') {
        return (
          <div key={idx} className="form-group">
            <label className="form-label">{fieldDef.label}</label>
            <input
              type="text"
              value={val}
              onChange={(e) => handleParamChange(fieldDef.field, e.target.value)}
            />
          </div>
        );
      }

      if (fieldDef.type === 'number') {
        return (
          <div key={idx} className="form-group">
            <label className="form-label">{fieldDef.label}</label>
            <input
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
            <input
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

          // Check for autocomplete trigger (e.g. df[" or pl.col(")
          const lastOpen = Math.max(newVal.lastIndexOf('["', cursor - 1), newVal.lastIndexOf("['", cursor - 1));
          
          if (lastOpen !== -1 && cursor > lastOpen + 1) {
            const partial = newVal.substring(lastOpen + 2, cursor).toLowerCase();
            // Don't show if they already closed the bracket/quote
            const closedQuoteIndex = Math.max(newVal.indexOf('"]', lastOpen), newVal.indexOf("']", lastOpen));
            if (closedQuoteIndex !== -1 && closedQuoteIndex < cursor) {
                setFormulaSuggestion(null);
                return;
            }

            const options = (upstreamSchema || [])
              .map(c => c.name)
              .filter(name => name.toLowerCase().includes(partial));
            
            if (options.length > 0) {
              setFormulaSuggestion({ field: fieldDef.field, partial, startIndex: lastOpen, cursorIndex: cursor, options });
            } else {
              setFormulaSuggestion(null);
            }
          } else {
            setFormulaSuggestion(null);
          }
        };

        const applySug = (colName) => {
          if (!formulaSuggestion) return;
          const exp = val;
          const before = exp.substring(0, formulaSuggestion.startIndex);
          const after = exp.substring(formulaSuggestion.cursorIndex);
          const quote = exp.substring(formulaSuggestion.startIndex + 1, formulaSuggestion.startIndex + 2); // ' or "
          
          // Complete the syntax automatically
          const newExp = before + '[' + quote + colName + quote + ']' + after;
          handleParamChange(fieldDef.field, newExp);
          setFormulaSuggestion(null);
          
          if (textareaRef.current) {
             setTimeout(() => {
                textareaRef.current.focus();
                // move cursor after the closing bracket
                const newCursor = before.length + colName.length + 5;
                textareaRef.current.setSelectionRange(newCursor, newCursor);
             }, 0);
          }
        };

        return (
          <div key={idx} className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">{fieldDef.label}</label>
            <textarea
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
                  Select Column
                </div>
                {formulaSuggestion.options.map(opt => (
                  <div 
                    key={opt}
                    onClick={() => applySug(opt)}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'var(--color-primary)'}
                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                  >
                    {opt}
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
      
      if (fieldDef.type === 'boolean') {
        return (
          <div key={idx} className="form-group">
            <label className="form-label checkbox-label">
              <input
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
            <select value={val} onChange={(e) => handleParamChange(fieldDef.field, e.target.value)}>
              {fieldDef.options?.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        );
      }
      
      if (fieldDef.type === 'column_select') {
        return (
          <div key={idx} className="form-group">
            <label className="form-label">{fieldDef.label}</label>
            {hasUpstreamColumns ? (
              <select value={val} onChange={(e) => handleParamChange(fieldDef.field, e.target.value)}>
                <option value="">-- Select Target Column --</option>
                {upstreamSchema.map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
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
              <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-primary)', padding: '4px' }}>
                {upstreamSchema.map((col) => (
                  <label key={col.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <input
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

      return null;
    });
  };

  return (
    <div className="config-sidebar" style={style}>
      <div className="sidebar-header">
        <span className="sidebar-title">
          <Settings size={16} />
          {getTitle()}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={() => onUpdateParams(id, { ...parameters, isCached: !parameters.isCached })}
            title={parameters.isCached ? "Uncache Node Output" : "Cache Node Output"}
            style={{ 
              background: 'none', border: 'none', cursor: 'pointer', 
              color: parameters.isCached ? 'var(--color-accent)' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', padding: '2px', borderRadius: '4px'
            }}
          >
            <Database size={14} />
          </button>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ID: {id}</span>
        </div>
      </div>
      <div className="sidebar-content">
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
         type === 'summarize' ? renderSummarizeConfig() :
         (toolDef && toolDef.ui_schema) ? renderDynamicForm(toolDef.ui_schema) : null}
      </div>
    </div>
  );
};

export default ConfigWindow;
