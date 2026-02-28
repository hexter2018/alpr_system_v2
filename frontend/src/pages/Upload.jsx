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
        <Card className="flex flex-col group" hover>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-accent-muted flex items-center justify-center text-accent transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md">
                <Image className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-content">Single Image</h2>
                <p className="text-xs text-content-tertiary mt-0.5">Quick test with a single photo</p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="flex-1 flex flex-col">
            <label className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all duration-300 group/drop ${
              single ? 'border-success/50 bg-success-muted/20' : 'border-border hover:border-accent/50 hover:bg-accent-muted/20'
            }`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 ${
                single ? 'bg-success-muted text-success scale-110' : 'bg-surface-overlay text-content-tertiary group-hover/drop:text-accent group-hover/drop:bg-accent-muted'
              }`}>
                {single ? <CheckCircle className="w-7 h-7" /> : <UploadIcon className="w-7 h-7" />}
              </div>
              <p className="text-sm font-semibold text-content mb-1">
                {single ? single.name : 'Click to select an image'}
              </p>
              <p className="text-xs text-content-tertiary">
                {single ? `${(single.size / 1024).toFixed(0)} KB` : 'JPG, PNG, WEBP supported'}
              </p>
              <input type="file" accept="image/*" onChange={(e) => setSingle(e.target.files?.[0] || null)} className="hidden" />
            </label>
            <Button
              className="mt-4 w-full shadow-sm shadow-accent/20"
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
        <Card className="flex flex-col group" hover>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-accent-muted flex items-center justify-center text-accent transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-content">Multiple Images</h2>
                <p className="text-xs text-content-tertiary mt-0.5">Batch upload for processing queue</p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="flex-1 flex flex-col">
            <label className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all duration-300 group/drop ${
              multi.length > 0 ? 'border-success/50 bg-success-muted/20' : 'border-border hover:border-accent/50 hover:bg-accent-muted/20'
            }`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 ${
                multi.length > 0 ? 'bg-success-muted text-success scale-110' : 'bg-surface-overlay text-content-tertiary group-hover/drop:text-accent group-hover/drop:bg-accent-muted'
              }`}>
                {multi.length > 0 ? <CheckCircle className="w-7 h-7" /> : <Layers className="w-7 h-7" />}
              </div>
              <p className="text-sm font-semibold text-content mb-1">
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
              className="mt-4 w-full shadow-sm shadow-accent/20"
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
