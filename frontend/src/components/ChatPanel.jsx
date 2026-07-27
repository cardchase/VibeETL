import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Bot, User, Maximize2, Minimize2 } from 'lucide-react';
import { API_BASE } from '../config';

export default function ChatPanel({ isOpen, onClose, nodes, edges }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I am the VibeETL Assistant powered by Gemini. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsProcessing(true);

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          nodes: nodes,
          edges: edges
        })
      });

      const data = await response.json();
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.response || 'No response from the server.' 
      }]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error connecting to AI: ${error.message}` 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="chat-panel" style={{
      position: 'absolute',
      right: isOpen ? '0' : (isExpanded ? '-500px' : '-350px'),
      top: '0',
      width: isExpanded ? '500px' : '350px',
      height: '100%',
      backgroundColor: '#f8fafc',
      borderLeft: '1px solid #e2e8f0',
      boxShadow: '-4px 0 15px rgba(0,0,0,0.05)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.3s ease, right 0.3s ease',
      zIndex: 100
    }}>
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'white'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot size={20} color="#3b82f6" />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>AI Assistant</h3>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setIsExpanded(!isExpanded)} 
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button 
            onClick={onClose} 
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            gap: '8px',
            alignItems: 'flex-start'
          }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              backgroundColor: msg.role === 'user' ? '#3b82f6' : '#e2e8f0',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              color: msg.role === 'user' ? 'white' : '#475569',
              flexShrink: 0
            }}>
              {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div style={{
              backgroundColor: msg.role === 'user' ? '#3b82f6' : 'white',
              color: msg.role === 'user' ? 'white' : '#334155',
              padding: '12px',
              borderRadius: '12px',
              borderTopRightRadius: msg.role === 'user' ? '2px' : '12px',
              borderTopLeftRadius: msg.role === 'assistant' ? '2px' : '12px',
              maxWidth: '80%',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              fontSize: '14px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap'
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              backgroundColor: '#e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'center',
              color: '#475569', flexShrink: 0
            }}><Bot size={14} /></div>
            <div style={{ backgroundColor: 'white', padding: '12px', borderRadius: '12px', borderTopLeftRadius: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <div className="typing-indicator" style={{ display: 'flex', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', backgroundColor: '#94a3b8', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both' }}></span>
                <span style={{ width: '6px', height: '6px', backgroundColor: '#94a3b8', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}></span>
                <span style={{ width: '6px', height: '6px', backgroundColor: '#94a3b8', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{
        padding: '16px',
        backgroundColor: 'white',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        gap: '8px'
      }}>
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask AI to modify or explain the pipeline..."
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            outline: 'none',
            fontSize: '14px'
          }}
        />
        <button 
          onClick={handleSend}
          disabled={!input.trim() || isProcessing}
          style={{
            backgroundColor: !input.trim() || isProcessing ? '#94a3b8' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '0 16px',
            cursor: !input.trim() || isProcessing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s'
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
