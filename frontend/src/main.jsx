import React from 'react'
import ReactDOM from 'react-dom/client'
import ProductDashboard from './ProductDashboard.jsx'
import DiscoveryStatusBar from './DiscoveryStatusBar.jsx'
import ProfileQuickEdit from './ProfileQuickEdit.jsx'
import './index.css'
import './product-dashboard.css'
import './discovery-status.css'
import './profile-quick-edit.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DiscoveryStatusBar />
    <ProductDashboard />
    <ProfileQuickEdit />
  </React.StrictMode>
)
