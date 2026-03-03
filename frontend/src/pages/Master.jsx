import React, { useEffect, useState } from 'react'
import {
  deleteMaster,
  searchMaster,
  upsertMaster,
  absImageUrl,
  API_BASE,
} from '../lib/api.js'
import { useTheme } from '../lib/ThemeContext.jsx'
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Badge,
  Modal,
  EmptyState,
} from '../components/UIComponents.jsx'
import { Search, Database, X } from 'lucide-react'

export default function Master() {
  const { theme } = useTheme()
  const light = theme === 'light'
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerImage, setViewerImage] = useState('')

  async function load() {
    setErr('')
    setMsg('')
    try {
      const r = await searchMaster(q)
      const enriched = await Promise.all(
        r.map(async (row) => {
          try {
            const res = await fetch(
              `${API_BASE}/api/master/${row.id}/crops?limit=5`
            )
            if (res.ok) {
              const crops = await res.json()
              return { ...row, crops }
            }
          } catch {
            /* skip */
          }
          return { ...row, crops: [] }
        })
      )
      setRows(enriched)
    } catch (e) {
      setErr(String(e))
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function saveRow(row) {
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      await upsertMaster({
        plate_text_norm: row.plate_text_norm,
        display_text: row.display_text,
        province: row.province,
        confidence: row.confidence,
        editable: row.editable,
      })
      setMsg('Record saved successfully')
      await load()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function removeRow(row) {
    if (
      !window.confirm(`Delete plate ${row.plate_text_norm}?`)
    ) {
      return
    }
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      await deleteMaster(row.id)
      setMsg('Record deleted')
      await load()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  function openViewer(url) {
    setViewerImage(url)
    setViewerOpen(true)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    load()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Master Database</h1>
        <p className="page-subtitle">
          Verified license plate records with sample images
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardBody>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                className="input-dark pl-10"
                placeholder="Search plate number..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" size="sm">
              Search
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* Messages */}
      {err && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center justify-between">
          <span>{msg}</span>
          <button
            onClick={() => setMsg('')}
            className="text-emerald-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="table-enterprise">
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Plate (Norm)</th>
                  <th>Display Text</th>
                  <th>Province</th>
                  <th>Confidence</th>
                  <th>Seen</th>
                  <th>Editable</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row
                    key={r.id}
                    r={r}
                    busy={busy}
                    onSave={saveRow}
                    onDelete={removeRow}
                    onViewImage={openViewer}
                  />
                ))}
                {!rows.length && (
                  <tr>
                    <td
                      className="p-8 text-center text-slate-600"
                      colSpan="8"
                    >
                      <EmptyState
                        icon={<Database className="h-10 w-10" />}
                        title="No records found"
                        description="Try a different search term or add new plates via the Upload page."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Image Viewer */}
      <ImageViewer
        open={viewerOpen}
        src={viewerImage}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  )
}

function Row({ r, onSave, onDelete, busy, onViewImage }) {
  const [display, setDisplay] = useState(r.display_text || '')
  const [prov, setProv] = useState(r.province || '')
  const [conf, setConf] = useState(r.confidence ?? 1.0)
  const [editable, setEditable] = useState(!!r.editable)

  return (
    <tr>
      <td>
        {r.crops && r.crops.length > 0 ? (
          <div className="relative inline-block group">
            <img
              src={absImageUrl(r.crops[0].crop_url)}
              alt="crop"
              className="h-12 w-20 cursor-pointer rounded-md border border-white/[0.08] object-cover hover:border-white/[0.2] transition"
              onClick={() => onViewImage(absImageUrl(r.crops[0].crop_url))}
            />
            {r.crops.length > 1 && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white ring-2 ring-slate-900">
                +{r.crops.length - 1}
              </span>
            )}
          </div>
        ) : (
          <div className="flex h-12 w-20 items-center justify-center rounded-md border border-dashed border-white/[0.08] bg-slate-950/50">
            <span className="text-[10px] text-slate-600">No image</span>
          </div>
        )}
      </td>
      <td className="font-mono text-white text-sm">{r.plate_text_norm}</td>
      <td>
        <input
          className="input-dark w-full text-sm"
          value={display}
          onChange={(e) => setDisplay(e.target.value)}
        />
      </td>
      <td>
        <input
          className="input-dark w-full text-sm"
          value={prov}
          onChange={(e) => setProv(e.target.value)}
        />
      </td>
      <td>
        <input
          className="input-dark w-24 text-sm tabular-nums"
          type="number"
          step="0.001"
          value={conf}
          onChange={(e) => setConf(parseFloat(e.target.value))}
        />
      </td>
      <td>
        <span className="text-sm tabular-nums text-white">
          {r.count_seen}
        </span>
      </td>
      <td>
        <input
          type="checkbox"
          checked={editable}
          onChange={(e) => setEditable(e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-slate-950 accent-blue-600"
        />
      </td>
      <td>
        <div className="flex gap-1.5">
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() =>
              onSave({
                ...r,
                display_text: display,
                province: prov,
                confidence: conf,
                editable,
              })
            }
          >
            Save
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => onDelete(r)}
          >
            Delete
          </Button>
        </div>
      </td>
    </tr>
  )
}

function ImageViewer({ open, src, onClose }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt="full"
          className="max-h-[90vh] max-w-[90vw] rounded-lg border border-white/[0.1] shadow-2xl"
        />
        <button
          className="absolute right-3 top-3 rounded-md border border-white/[0.1] bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition backdrop-blur"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  )
}
