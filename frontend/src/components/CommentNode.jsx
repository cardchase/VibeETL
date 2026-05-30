import React, { memo, useState, useEffect } from 'react';
import { NodeResizer } from '@xyflow/react';

const CommentNode = ({ id, data, selected }) => {
  const params = data.parameters || {};
  const initialText = params.text !== undefined ? params.text : 'Double-click or use the config panel to edit this comment.';
  const bgColor = params.bgColor || 'rgba(253, 224, 71, 0.4)'; // Default yellow sticky note
  const textColor = params.textColor || '#1f2937';
  const isBold = params.isBold || false;
  const isItalic = params.isItalic || false;
  const fontSize = params.fontSize || 14;

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(initialText);

  useEffect(() => {
    if (!isEditing) {
      setEditText(initialText);
    }
  }, [initialText, isEditing]);

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editText !== initialText) {
      window.dispatchEvent(new CustomEvent('vibe-update-comment', {
        detail: { nodeId: id, text: editText }
      }));
    }
  };

  return (
    <>
      <NodeResizer 
        color="#2563eb" 
        isVisible={selected} 
        minWidth={150} 
        minHeight={50} 
      />
      <div 
        style={{ 
          width: '100%', 
          height: '100%', 
          backgroundColor: bgColor,
          color: textColor,
          fontWeight: isBold ? '600' : '400',
          fontStyle: isItalic ? 'italic' : 'normal',
          fontSize: `${fontSize}px`,
          padding: '16px 20px',
          borderRadius: '8px',
          boxShadow: selected 
            ? '0 0 0 2px #2563eb, 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
            : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          border: '1px solid rgba(255,255,255,0.2)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: '1.6',
          fontFamily: 'inherit',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: -1,
          transition: 'box-shadow 0.2s ease-in-out',
          cursor: isEditing ? 'text' : 'pointer'
        }}
        onDoubleClick={handleDoubleClick}
      >
        {isEditing ? (
          <textarea
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditText(initialText);
                setIsEditing(false);
              }
            }}
            style={{
              width: '100%',
              height: '100%',
              minHeight: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'inherit',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              fontWeight: 'inherit',
              fontStyle: 'inherit',
              lineHeight: 'inherit',
              padding: 0,
              margin: 0
            }}
          />
        ) : (
          editText
        )}
      </div>
    </>
  );
};

export default memo(CommentNode);
