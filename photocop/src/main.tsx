import { StrictMode, Component, type ReactNode, type ErrorInfo } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Error boundary to catch and display render errors instead of blank screen
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('PhotoCop render error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, background: '#1a1a1a', color: '#ff6b6b', fontFamily: 'monospace', minHeight: '100vh' }}>
          <h2 style={{ color: '#ff6b6b' }}>⚡ PhotoCop — Startup Error</h2>
          <pre style={{ color: '#ff9999', whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 16, padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
