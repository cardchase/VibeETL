import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { LayoutProvider } from './contexts/LayoutContext'

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
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) {
    reportError('GlobalErrorBoundary: ' + error?.stack + '\\n' + errorInfo?.componentStack);
  }
  render() {
    if (this.state.hasError) return <div style={{color:'red', padding:'20px'}}>Fatal Error. Check terminal logs.</div>;
    return this.props.children;
  }
}

const isSandbox = window.location.pathname === '/sandbox';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <LayoutProvider>
        <App isSandbox={isSandbox} />
      </LayoutProvider>
    </GlobalErrorBoundary>
  </React.StrictMode>
);
