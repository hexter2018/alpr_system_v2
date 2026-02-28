import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadBatch, uploadSingle } from '../lib/api.js'
import {
  Card, CardBody, CardHeader, Button, Badge, Spinner, PageHeader,
} from '../components/UIComponents.jsx'
import { Upload as UploadIcon, Image, Layers, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react'

export default function Upload() {
  const [single, setSingle] = useState(null)
  const [multi, setMulti] = useState([])
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('info')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function onUploadSingle() {
    if (!single) return
    setBusy(true); setMsg('')
    try {
      const r = await uploadSingle(single)
      setMsg(`Uploaded capture_id=${r.capture_id}`)
      setMsgType('success')
      navigate('/queue')
    } catch (e) {
      setMsg(String(e))
      setMsgType('error')
    } finally {
      setBusy(false)
    }
  }

  async function onUploadBatch() {
    if (!multi.length) return
    setBusy(true); setMsg('')
    try {
      const r = await uploadBatch(multi)
      setMsg(`Uploaded batch: count=${r.count}`)
      setMsgType('success')
      navigate('/queue')
    } catch (e) {
      setMsg(String(e))
      setMsgType('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload"
        description="Upload images for processing. Results will appear in the Verification Queue."
      />

      {msg && (
        <Card className={msgType === 'error' ? 'bg-danger-muted border-danger/30' : msgType === 'success' ? 'bg-success-muted border-success/30' : 'bg-accent-muted border-accent/30'}>
          <CardBody>
            <p className={`text-sm flex items-center gap-2 ${msgType === 'error' ? 'text-danger-content' : msgType === 'success' ? 'text-success-content' : 'text-accent'}`}>
              {msgType === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
              {msg}
            </p>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Single Upload */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center text-accent">
                <Image className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-content">Single Image</h2>
                <p className="text-xs text-content-tertiary">Quick test with a single photo</p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="flex-1 flex flex-col">
            <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-accent/50 hover:bg-accent-muted/30 transition-colors group">
              <UploadIcon className="w-10 h-10 text-content-tertiary group-hover:text-accent mb-3 transition-colors" />
              <p className="text-sm font-medium text-content mb-1">
                {single ? single.name : 'Click to select an image'}
              </p>
              <p className="text-xs text-content-tertiary">
                {single ? `${(single.size / 1024).toFixed(0)} KB` : 'JPG, PNG, WEBP supported'}
              </p>
              <input type="file" accept="image/*" onChange={(e) => setSingle(e.target.files?.[0] || null)} className="hidden" />
            </label>
            <Button
              className="mt-4 w-full"
              disabled={busy || !single}
              onClick={onUploadSingle}
              loading={busy}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Upload Single
            </Button>
          </CardBody>
        </Card>

        {/* Batch Upload */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center text-accent">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-content">Multiple Images</h2>
                <p className="text-xs text-content-tertiary">Batch upload for processing queue</p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="flex-1 flex flex-col">
            <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-accent/50 hover:bg-accent-muted/30 transition-colors group">
              <Layers className="w-10 h-10 text-content-tertiary group-hover:text-accent mb-3 transition-colors" />
              <p className="text-sm font-medium text-content mb-1">
                {multi.length > 0 ? `${multi.length} file(s) selected` : 'Click to select images'}
              </p>
              <p className="text-xs text-content-tertiary">
                {multi.length > 0
                  ? `Total: ${(multi.reduce((a, f) => a + f.size, 0) / 1024).toFixed(0)} KB`
                  : 'Select multiple files at once'}
              </p>
              <input type="file" accept="image/*" multiple onChange={(e) => setMulti(Array.from(e.target.files || []))} className="hidden" />
            </label>
            <Button
              className="mt-4 w-full"
              disabled={busy || !multi.length}
              onClick={onUploadBatch}
              loading={busy}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Upload Batch ({multi.length})
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
