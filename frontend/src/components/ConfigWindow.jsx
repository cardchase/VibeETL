import React, { useState, useEffect, useRef } from 'react';
import { Settings, Upload, Check, AlertCircle } from 'lucide-react';

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
    { value: 'starts_with', label: 'Starts With (text)' },
    { value: 'ends_with', label: 'Ends With (text)' },
    { value: 'is_null', label: 'Is Empty / Null' },
    { value: 'is_not_null', label: 'Is Not Empty' }
  ];
};

const ConfigWindow = ({ selectedNode, upstreamSchema, onUpdateParams, availableTools = [], results = {}, nodes = [], edges = [], style = {} }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [excelSheets, setExcelSheets] = useState([]);
  const fileInputRef = useRef(null);

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
              <option value="text">Raw Text (Line-by-Line) - Most Reliable</option>
              <option value="tables">Structured Tables</option>
            </select>
          </div>
        ) : null}
      </>
    );
  };

  const renderFilterConfig = () => {
    const column = parameters.column || '';
    const operator = parameters.operator || '==';
    const value = parameters.value || '';

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

    const operatorLabels = {
      '==': '=',
      '!=': '≠',
      '>': '>',
      '>=': '≥',
      '<': '<',
      '<=': '≤',
      'contains': 'contains',
      'starts_with': 'starts with',
      'ends_with': 'ends with',
      'is_null': 'is empty',
      'is_not_null': 'is not empty'
    };
    const opLabel = operatorLabels[operator] || operator;
    const expressionPreview = column 
      ? `[${column}] ${opLabel} ${operator === 'is_null' || operator === 'is_not_null' ? '' : `"${value}"`}`.trim()
      : 'No condition configured';

    return (
      <>
        <div className="filter-expression-bar" style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          color: column ? 'var(--color-prep)' : 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px'
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
          <label className="form-label">Filter Column</label>
          {hasUpstreamColumns ? (
            <select value={column} onChange={(e) => handleColumnChange(e.target.value)}>
              <option value="">-- Select Column --</option>
              {upstreamSchema.map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name} ({col.type && typeof col.type === 'string' ? col.type.split('.').pop() : 'Unknown'})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="Type column name"
              value={column}
              onChange={(e) => handleColumnChange(e.target.value)}
            />
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Operator</label>
          <select value={operator} onChange={(e) => handleParamChange('operator', e.target.value)}>
            {validOperators.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>

        {operator !== 'is_null' && operator !== 'is_not_null' && (
          <div className="form-group">
            <label className="form-label">Comparison Value</label>
            {lowerType.includes('bool') ? (
              <select value={value} onChange={(e) => handleParamChange('value', e.target.value)}>
                <option value="">-- Select Value --</option>
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
        )}
      </>
    );
  };

  const renderSortConfig = () => {
    const column = parameters.column || '';
    const descending = parameters.descending === true;

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
          <label className="form-label">Sort By Column</label>
          {hasUpstreamColumns ? (
            <select value={column} onChange={(e) => handleParamChange('column', e.target.value)}>
              <option value="">-- Select Column --</option>
              {upstreamSchema.map((col) => (
                <option key={col.name} value={col.name}>
                  {col.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="Type column name"
              value={column}
              onChange={(e) => handleParamChange('column', e.target.value)}
            />
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Sort Direction</label>
          <select
            value={descending ? 'desc' : 'asc'}
            onChange={(e) => handleParamChange('descending', e.target.value === 'desc')}
          >
            <option value="asc">Ascending (A to Z, 0 to 9)</option>
            <option value="desc">Descending (Z to A, 9 to 0)</option>
          </select>
        </div>
      </>
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
            <div className="select-columns-list">
              {columns.map((col, idx) => (
                <div key={col.name} className="column-row">
                  <label className="column-name-checkbox">
                    <input
                      type="checkbox"
                      checked={col.keep}
                      onChange={(e) => handleColumnToggle(idx, 'keep', e.target.checked)}
                    />
                    <span title={col.name}>{col.name}</span>
                  </label>
                  {col.keep && (
                    <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                      <input
                        type="text"
                        className="column-rename-input"
                        style={{ flex: 1 }}
                        placeholder="Rename to..."
                        value={col.rename || ''}
                        onChange={(e) => handleColumnToggle(idx, 'rename', e.target.value)}
                      />
                      <select
                        className="column-type-select"
                        style={{ width: '85px', fontSize: '0.65rem', padding: '2px 4px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-secondary)' }}
                        value={col.type || ''}
                        onChange={(e) => handleColumnToggle(idx, 'type', e.target.value)}
                      >
                        <option value="">Keep Type</option>
                        <option value="String">String</option>
                        <option value="Int64">Int64</option>
                        <option value="Float64">Float64</option>
                        <option value="Boolean">Boolean</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}
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
          </select>
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
      default: return 'Node Configuration';
    }
  };

  const renderDynamicForm = (uiSchema) => {
    return uiSchema.map((fieldDef, idx) => {
      const val = parameters[fieldDef.field] !== undefined ? parameters[fieldDef.field] : fieldDef.default;

      if (fieldDef.type === 'string') {
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
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ID: {id}</span>
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
         (toolDef && toolDef.ui_schema) ? renderDynamicForm(toolDef.ui_schema) : null}
      </div>
    </div>
  );
};

export default ConfigWindow;
