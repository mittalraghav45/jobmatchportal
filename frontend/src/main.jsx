import React from 'react'
import ReactDOM from 'react-dom/client'
import ProductDashboard from './ProductDashboard.jsx'
import DiscoveryStatusBar from './DiscoveryStatusBar.jsx'
import VerifiedJobsStatusBar from './VerifiedJobsStatusBar.jsx'
import ProfileQuickEdit from './ProfileQuickEdit.jsx'
import MatchResultsPanel from './MatchResultsPanel.jsx'
import './index.css'
import './product-dashboard.css'
import './discovery-status.css'
import './profile-quick-edit.css'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('JobMatch frontend render error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main style={{ minHeight: '100vh', padding: '32px', background: '#090b12', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ marginBottom: '12px' }}>JobMatch could not render this page</h1>
        <p style={{ opacity: 0.8, maxWidth: '760px' }}>
          The frontend encountered a runtime error. The application has been kept visible so the error can be diagnosed instead of showing a blank screen.
        </p>
        <pre style={{ marginTop: '20px', padding: '16px', overflow: 'auto', background: '#151925', borderRadius: '10px', whiteSpace: 'pre-wrap' }}>
          {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
        </pre>
        <button style={{ marginTop: '16px', padding: '10px 16px', cursor: 'pointer' }} onClick={() => window.location.reload()}>
          Reload application
        </button>
      </main>
    )
  }
}

const root = document.getElementById('root')

if (!root) {
  throw new Error('JobMatch frontend root element (#root) was not found')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <DiscoveryStatusBar />
      <VerifiedJobsStatusBar />
      <MatchResultsPanel />
      <ProductDashboard />
      <ProfileQuickEdit />
    </AppErrorBoundary>
  </React.StrictMode>
)
