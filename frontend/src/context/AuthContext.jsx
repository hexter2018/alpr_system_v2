/**
 * AuthContext.jsx
 * Provides authentication state across the app.
 * - Stores JWT token in localStorage under key 'alpr_token'
 * - Stores user info (username, role) in localStorage under 'alpr_user'
 * - Injects Authorization: Bearer <token> header on every axios request
 * - Redirects to /login automatically on 401 responses
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import axios from 'axios'

const TOKEN_KEY = 'alpr_token'
const USER_KEY  = 'alpr_user'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null)
  const [user, setUser]   = useState(() => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  /* ── Axios request interceptor — attach Bearer token ─────────────────── */
  useEffect(() => {
    const reqId = axios.interceptors.request.use((config) => {
      const t = localStorage.getItem(TOKEN_KEY)
      if (t) config.headers['Authorization'] = `Bearer ${t}`
      return config
    })
    return () => axios.interceptors.request.eject(reqId)
  }, [])

  /* ── Axios response interceptor — handle 401 ─────────────────────────── */
  useEffect(() => {
    const resId = axios.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401) {
          // Clear auth state and bounce to login
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
          setToken(null)
          setUser(null)
          // Use replace so the back button doesn't loop
          window.location.replace('/login')
        }
        return Promise.reject(err)
      }
    )
    return () => axios.interceptors.response.eject(resId)
  }, [])

  /* ── login ────────────────────────────────────────────────────────────── */
  const login = useCallback(async (username, password) => {
    const { data } = await axios.post('/api/auth/login', { username, password })
    const { access_token, user: userInfo } = data
    localStorage.setItem(TOKEN_KEY, access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(userInfo))
    setToken(access_token)
    setUser(userInfo)
    return userInfo
  }, [])

  /* ── logout ───────────────────────────────────────────────────────────── */
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
    window.location.replace('/login')
  }, [])

  /* ── role helpers ─────────────────────────────────────────────────────── */
  const hasRole = useCallback(
    (requiredRole) => {
      if (!user) return false
      const hierarchy = { ADMIN: 3, GUARD: 2, AUDITOR: 1 }
      return (hierarchy[user.role] ?? 0) >= (hierarchy[requiredRole] ?? 0)
    },
    [user]
  )

  const value = useMemo(
    () => ({ token, user, login, logout, hasRole, isAuthenticated: !!token }),
    [token, user, login, logout, hasRole]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
