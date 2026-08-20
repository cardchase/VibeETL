import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-panel" style={{
          padding: '24px',
          margin: '16px',
          borderRadius: '8px',
          border: '1px solid var(--color-error)',
          background: 'rgba(239, 68, 68, 0.05)',
          overflow: 'auto',
          maxHeight: '100%'
        }}>
          <h3 style={{ color: 'var(--color-error)', marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠️</span> Component Rendering Error
          </h3>
          <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: '8px 0' }}>{this.state.error?.toString()}</p>
          <pre style={{
            background: 'var(--bg-canvas)',
            padding: '12px',
            borderRadius: '6px',
            overflowX: 'auto',
            fontSize: '0.75rem',
            lineHeight: '1.4',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-color)',
            whiteSpace: 'pre-wrap'
          }}>
            {this.state.errorInfo?.componentStack || this.state.error?.stack}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{
              background: 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.8rem',
              marginTop: '12px'
            }}
          >
            Reset View
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
