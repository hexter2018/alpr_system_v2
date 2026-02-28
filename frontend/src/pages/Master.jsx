import React, { useEffect, useState } from 'react'
import { deleteMaster, searchMaster, upsertMaster, absImageUrl, API_BASE, apiFetch } from '../lib/api.js'
import {
  Card, CardBody, CardHeader, Badge, Button, Input, Spinner, Modal,
  EmptyState, PageHeader,
} from '../components/UIComponents.jsx'
import { Search, Save, Trash2, Database, Eye, X, Image as ImageIcon } from 'lucide-react'

export default function Master() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerImage, setViewerImage] = useState('')

  async function load() {
    setErr(''); setMsg('')
    try {
      const r = await searchMaster(q)
      const enriched = await Promise.all(
        r.map(async (row) => {
          try {
            const res = await apiFetch(`${API_BASE}/api/master/${row.id}/crops?limit=5`)
            if (res.ok) {
              const crops = await res.json()
              return { ...row, crops }
            }
          } catch (e) {
            console.warn('Failed to fetch crops for', row.id)
          }
          return { ...row, crops: [] }
        })
      )
      setRows(enriched)
    } catch (e) {
      setErr(String(e))
    }
  }

  useEffect(() => { load() }, [])

  async function saveRow(row) {
    setBusy(true); setErr(''); setMsg('')
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
    if (!window.confirm(`Delete plate ${row.plate_text_norm}?`)) return
    setBusy(true); setErr(''); setMsg('')
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Database"
        description="Verified plate records with sample images"
        actions={
          <Badge variant="primary" size="lg" dot>{rows.length} records</Badge>
        }
      />

      {/* Search */}
      <Card>
        <CardBody>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search plate text..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                icon={<Search className="w-4 h-4" />}
                onKeyDown={(e) => e.key === 'Enter' && load()}
              />
            </div>
            <Button onClick={load} icon={<Search className="w-4 h-4" />}>Search</Button>
          </div>
        </CardBody>
      </Card>

      {err && (
        <Card className="bg-danger-muted border-danger/30">
          <CardBody><p className="text-sm text-danger-content">{err}</p></CardBody>
        </Card>
      )}
      {msg && (
        <Card className="bg-success-muted border-success/30">
          <CardBody><p className="text-sm text-success-content">{msg}</p></CardBody>
        </Card>
      )}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Sample', 'Plate (Norm)', 'Display', 'Province', 'Confidence', 'Seen', 'Editable', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold text-content-tertiary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <Row key={r.id} r={r} busy={busy} onSave={saveRow} onDelete={removeRow}
                  onViewImage={(url) => { setViewerImage(url); setViewerOpen(true) }} />
              ))}
              {!rows.length && (
                <tr>
                  <td className="px-4 py-16 text-center text-content-tertiary" colSpan="8">
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Image Viewer */}
      <Modal open={viewerOpen} onClose={() => setViewerOpen(false)} title="Plate Image" size="lg">
        {viewerImage && (
          <img src={viewerImage} alt="Full plate" className="w-full rounded-lg" crossOrigin="anonymous" />
        )}
      </Modal>
    </div>
  )
}

function Row({ r, onSave, onDelete, busy, onViewImage }) {
  const [display, setDisplay] = useState(r.display_text || '')
  const [prov, setProv] = useState(r.province || '')
  const [conf, setConf] = useState(r.confidence ?? 1.0)
  const [editable, setEditable] = useState(!!r.editable)

  return (
    <tr className="hover:bg-surface-overlay/50 transition-colors">
      <td className="px-4 py-3">
        {r.crops && r.crops.length > 0 ? (
          <div className="relative inline-block group">
            <button
              onClick={() => onViewImage(absImageUrl(r.crops[0].crop_url))}
              className="block rounded-xl overflow-hidden border border-border hover:border-accent/50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/50 hover:shadow-md hover:scale-105"
            >
              <img src={absImageUrl(r.crops[0].crop_url)} alt="crop" className="h-16 w-24 object-cover" crossOrigin="anonymous" />
            </button>
            {r.crops.length > 1 && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white shadow ring-2 ring-surface-raised">
                +{r.crops.length - 1}
              </span>
            )}
          </div>
        ) : (
          <div className="flex h-16 w-24 items-center justify-center rounded-xl border border-dashed border-border bg-surface-inset pattern-dots">
            <ImageIcon className="w-5 h-5 text-content-tertiary opacity-60" />
          </div>
        )}
      </td>
      <td className="px-4 py-3 font-mono font-bold text-content text-base">{r.plate_text_norm}</td>
      <td className="px-4 py-3">
        <input
          className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-content focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={display} onChange={(e) => setDisplay(e.target.value)}
        />
      </td>
      <td className="px-4 py-3">
        <input
          className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-content focus:border-accent focus:ring-2 focus:ring-accent/20"
          value={prov} onChange={(e) => setProv(e.target.value)}
        />
      </td>
      <td className="px-4 py-3">
        <input
          className="w-28 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-content focus:border-accent focus:ring-2 focus:ring-accent/20"
          type="number" step="0.001" value={conf} onChange={(e) => setConf(parseFloat(e.target.value))}
        />
      </td>
      <td className="px-4 py-3">
        <span className="text-content tabular-nums">{r.count_seen}</span>
        <span className="text-xs text-content-tertiary ml-1">times</span>
      </td>
      <td className="px-4 py-3">
        <input
          type="checkbox" checked={editable} onChange={(e) => setEditable(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-accent"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <Button variant="primary" size="xs" disabled={busy} icon={<Save className="w-3.5 h-3.5" />}
            onClick={() => onSave({ ...r, display_text: display, province: prov, confidence: conf, editable })}>
            Save
          </Button>
          <Button variant="danger" size="xs" disabled={busy} icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={() => onDelete(r)}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  )
}
