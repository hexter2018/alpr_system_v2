import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../lib/ThemeContext.jsx'
import { ShieldCheck, Sun, Moon, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const from = location.state?.from?.pathname ?? '/'

  const isDark = theme === 'dark'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน')
      return
    }
    setLoading(true)
    try {
      await login(username.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      const msg =
        err.response?.data?.detail ??
        err.response?.data?.message ??
        'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`flex min-h-screen items-center justify-center p-4 ${
        isDark ? 'bg-slate-950' : 'bg-gray-50'
      }`}
    >
      {/* Theme toggle — top-right */}
      <button
        onClick={toggleTheme}
        className={`absolute right-4 top-4 rounded-lg p-2 transition-colors ${
          isDark
            ? 'text-slate-400 hover:bg-white/10 hover:text-white'
            : 'text-slate-500 hover:bg-black/5 hover:text-slate-800'
        }`}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div
        className={`w-full max-w-sm rounded-2xl border p-8 shadow-xl ${
          isDark
            ? 'border-white/[0.06] bg-slate-900'
            : 'border-slate-200 bg-white'
        }`}
      >
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 shadow-lg">
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1
              className={`text-xl font-bold ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              Thai ALPR
            </h1>
            <p
              className={`text-sm ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              License Plate Recognition System
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Username */}
          <div>
            <label
              htmlFor="username"
              className={`mb-1.5 block text-sm font-medium ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              ชื่อผู้ใช้
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              placeholder="admin"
              className={`w-full rounded-lg border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 ${
                isDark
                  ? 'border-white/10 bg-slate-800 text-white placeholder:text-slate-500'
                  : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
              }`}
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className={`mb-1.5 block text-sm font-medium ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              รหัสผ่าน
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                placeholder="••••••••"
                className={`w-full rounded-lg border px-3 py-2.5 pr-10 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 ${
                  isDark
                    ? 'border-white/10 bg-slate-800 text-white placeholder:text-slate-500'
                    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                tabIndex={-1}
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 ${
                  isDark
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                aria-label={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPw ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        {/* Footer */}
        <p
          className={`mt-6 text-center text-xs ${
            isDark ? 'text-slate-600' : 'text-slate-400'
          }`}
        >
          Thai ALPR · License Plate System
        </p>
      </div>
    </div>
  )
}
