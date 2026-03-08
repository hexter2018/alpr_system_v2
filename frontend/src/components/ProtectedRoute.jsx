/**
 * ProtectedRoute.jsx
 * Guards routes by authentication status and optional role requirement.
 *
 * Usage:
 *   <ProtectedRoute>                            — any authenticated user
 *   <ProtectedRoute requiredRole="ADMIN">       — ADMIN only
 *   <ProtectedRoute requiredRole="GUARD">       — GUARD or ADMIN
 *   <ProtectedRoute requiredRole="AUDITOR">     — AUDITOR, GUARD, or ADMIN
 *
 * Role hierarchy (higher includes lower):
 *   ADMIN (3) > GUARD (2) > AUDITOR (1)
 */
import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, hasRole } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    // Preserve the attempted URL so Login can redirect back after sign-in
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiredRole && !hasRole(requiredRole)) {
    // Authenticated but insufficient role → send to dashboard with a flag
    return <Navigate to="/" replace />
  }

  return children
}
