import React from 'react'
import ReactDOM from 'react-dom/client'
import ProductDashboard from './ProductDashboard.jsx'
import DiscoveryStatusBar from './DiscoveryStatusBar.jsx'
import './index.css'
import './product-dashboard.css'
import './discovery-status.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DiscoveryStatusBar />
    <ProductDashboard />
  </React.StrictMode>
)
