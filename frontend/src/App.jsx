import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Upload from './pages/Upload.jsx'
import Queue from './pages/Queue.jsx'
import Master from './pages/Master.jsx'
import Reports from './pages/Reports.jsx'
import CameraSettings from './pages/CameraSettings.jsx'
import HealthDashboard from './pages/HealthDashboard.jsx'
import WatchlistManagement from './pages/WatchlistManagement.jsx'
import AdvancedSearch from './pages/AdvancedSearch.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/master" element={<Master />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/cameras" element={<CameraSettings />} />
        <Route path="/health" element={<HealthDashboard />} />
        <Route path="/watchlist" element={<WatchlistManagement />} />
        <Route path="/search" element={<AdvancedSearch />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}