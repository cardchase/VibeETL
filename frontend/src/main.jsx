import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { LayoutProvider } from './contexts/LayoutContext'
import { SettingsProvider } from './contexts/SettingsContext'

const reportError = (msg) => {
  fetch('http://127.0.0.1:8001/api/log_error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: msg })
  }).catch(e => console.log('Failed to report error', e));
};

window.onerror = function(message, source, lineno, colno, error) {
  reportError('window.onerror: ' + message + ' ' + (error?.stack || ''));
};
window.addEventListener('unhandledrejection', function(event) {
  reportError('unhandledrejection: ' + event.reason?.stack || event.reason);
});

class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    reportError('GlobalErrorBoundary: ' + error.stack + '\n' + errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: '#dc2626', fontFamily: 'system-ui' }}>
          <h2>Something went horribly wrong.</h2>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#fef2f2', padding: '1rem', borderRadius: '4px' }}>
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }
    return this.props.children; 
  }
}

// Extract the Sandbox mode query parameter if present
const urlParams = new URLSearchParams(window.location.search);
const isSandbox = urlParams.has('sandbox');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <SettingsProvider>
        <LayoutProvider>
          <App isSandbox={isSandbox} />
        </LayoutProvider>
      </SettingsProvider>
    </GlobalErrorBoundary>
  </React.StrictMode>
);
