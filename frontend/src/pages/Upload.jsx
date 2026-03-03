import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadBatch, uploadSingle } from '../lib/api.js'
import { Card, CardBody, Button, Badge } from '../components/UIComponents.jsx'
import { Upload as UploadIcon, Image, Images, X } from 'lucide-react'

function DropZone({ onFiles, accept, multiple, children }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(multiple ? files : [files[0]])
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        dragOver
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.02]'
      }`}
      role="button"
      tabIndex={0}
      aria-label="Drop zone for file upload"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          if (files.length) onFiles(files)
          e.target.value = ''
        }}
      />
      {children}
    </div>
  )
}

function FilePreview({ files, onRemove }) {
  if (!files?.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {files.map((file, i) => (
        <div
          key={`${file.name}-${i}`}
          className="relative group rounded-md border border-white/[0.08] bg-slate-950 overflow-hidden"
        >
          <img
            src={URL.createObjectURL(file)}
            alt={file.name}
            className="h-16 w-24 object-cover"
          />
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(i)
            }}
            className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={`Remove ${file.name}`}
          >
            <X className="h-3 w-3 text-white" />
          </button>
          <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5">
            <span className="text-[9px] text-slate-300 truncate block">
              {file.name}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Upload() {
  const [single, setSingle] = useState(null)
  const [multi, setMulti] = useState([])
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('info')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function onUploadSingle() {
    if (!single) return
    setBusy(true)
    setMsg('')
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
    setBusy(true)
    setMsg('')
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

  const removeSingle = () => setSingle(null)
  const removeMulti = (idx) =>
    setMulti((prev) => prev.filter((_, i) => i !== idx))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Upload</h1>
        <p className="page-subtitle">
          Upload images for processing. Results will appear in the Verification
          Queue.
        </p>
      </div>

      {/* Status Message */}
      {msg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm flex items-center justify-between ${
            msgType === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
              : msgType === 'error'
                ? 'border-red-500/20 bg-red-500/10 text-red-300'
                : 'border-blue-500/20 bg-blue-500/10 text-blue-300'
          }`}
        >
          <span>{msg}</span>
          <button onClick={() => setMsg('')} className="hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Single Upload */}
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Image className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Single Image
                </h2>
                <p className="text-xs text-slate-500">
                  Quick test with one image
                </p>
              </div>
            </div>

            <DropZone
              accept="image/*"
              multiple={false}
              onFiles={(files) => setSingle(files[0])}
            >
              <UploadIcon className="h-8 w-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400 mb-1">
                Drop image here or click to browse
              </p>
              <p className="text-xs text-slate-600">
                Supports JPG, PNG, WEBP
              </p>
            </DropZone>

            {single && (
              <FilePreview files={[single]} onRemove={removeSingle} />
            )}

            <Button
              variant="primary"
              disabled={busy || !single}
              loading={busy}
              onClick={onUploadSingle}
              className="w-full"
              icon={<UploadIcon className="h-4 w-4" />}
            >
              Upload Single
            </Button>
          </CardBody>
        </Card>

        {/* Batch Upload */}
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Images className="h-5 w-5 text-blue-400" />
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Batch Upload
                  </h2>
                  <p className="text-xs text-slate-500">
                    Upload multiple images at once
                  </p>
                </div>
                {multi.length > 0 && (
                  <Badge variant="primary" size="sm">
                    {multi.length} files
                  </Badge>
                )}
              </div>
            </div>

            <DropZone
              accept="image/*"
              multiple={true}
              onFiles={(files) => setMulti((prev) => [...prev, ...files])}
            >
              <Images className="h-8 w-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400 mb-1">
                Drop images here or click to browse
              </p>
              <p className="text-xs text-slate-600">
                Select multiple files
              </p>
            </DropZone>

            <FilePreview files={multi} onRemove={removeMulti} />

            <Button
              variant="primary"
              disabled={busy || !multi.length}
              loading={busy}
              onClick={onUploadBatch}
              className="w-full"
              icon={<UploadIcon className="h-4 w-4" />}
            >
              Upload Batch ({multi.length})
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
