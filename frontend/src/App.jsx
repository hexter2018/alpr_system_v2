import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Upload from './pages/Upload.jsx'
import Queue from './pages/Queue.jsx'
import Master from './pages/Master.jsx'
import Watchlist from './pages/Watchlist.jsx'
import Reports from './pages/Reports.jsx'
import AdvancedSearch from './pages/AdvancedSearch.jsx'
import SystemMonitor from './pages/SystemMonitor.jsx'
import Login from './pages/Login.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/"          element={<Dashboard />} />
          <Route path="/upload"    element={<ProtectedRoute requiredRole="ADMIN"><Upload /></ProtectedRoute>} />
          <Route path="/queue"     element={<ProtectedRoute requiredRole="GUARD"><Queue /></ProtectedRoute>} />
          <Route path="/master"    element={<ProtectedRoute requiredRole="ADMIN"><Master /></ProtectedRoute>} />
          <Route path="/watchlist" element={<ProtectedRoute requiredRole="GUARD"><Watchlist /></ProtectedRoute>} />
          <Route path="/reports"   element={<ProtectedRoute requiredRole="AUDITOR"><Reports /></ProtectedRoute>} />
          <Route path="/search"    element={<AdvancedSearch />} />
          <Route path="/monitor"   element={<ProtectedRoute requiredRole="ADMIN"><SystemMonitor /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
