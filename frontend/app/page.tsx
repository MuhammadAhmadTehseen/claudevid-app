'use client'

import { useState, useRef, DragEvent, FormEvent, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { submitVideo, uploadVideo } from '@/lib/api'

type Tab = 'drive' | 'upload'

function isGoogleDriveUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.hostname === 'drive.google.com' ||
      u.hostname === 'docs.google.com' ||
      u.hostname.endsWith('.drive.google.com')
    )
  } catch {
    return false
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function HomePage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('drive')

  // Drive tab state
  const [driveUrl, setDriveUrl] = useState('')
  const [drivePrompt, setDrivePrompt] = useState('')
  const [driveLoading, setDriveLoading] = useState(false)
  const [urlError, setUrlError] = useState('')

  // Upload tab state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadPrompt, setUploadPrompt] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Drive submit ──────────────────────────────────────────────────────────
  const handleDriveSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setUrlError('')

    const trimmed = driveUrl.trim()
    if (!trimmed) {
      setUrlError('Please paste a Google Drive link.')
      return
    }
    if (!isGoogleDriveUrl(trimmed)) {
      setUrlError("That doesn't look like a Google Drive URL. Please paste a drive.google.com link.")
      return
    }

    setDriveLoading(true)
    try {
      const { jobId } = await submitVideo(trimmed, drivePrompt.trim())
      router.push(`/edit/${jobId}`)
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Failed to start job. Try again.')
      setDriveLoading(false)
    }
  }

  // ── File selection helpers ────────────────────────────────────────────────
  const acceptFile = (file: File) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/avi', 'video/x-msvideo', 'video/webm']
    if (!allowed.includes(file.type)) {
      setUploadError('Unsupported file type. Please use MP4, MOV, or AVI.')
      return
    }
    setUploadError('')
    setSelectedFile(file)
    setUploadProgress(0)
  }

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) acceptFile(file)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) acceptFile(file)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  // ── Upload submit ─────────────────────────────────────────────────────────
  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setUploadError('')

    if (!selectedFile) {
      setUploadError('Please select a video file.')
      return
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      const { jobId } = await uploadVideo(selectedFile, uploadPrompt.trim(), (pct) => {
        setUploadProgress(pct)
      })
      router.push(`/edit/${jobId}`)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Try again.')
      setUploading(false)
      setUploadProgress(0)
    }
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
  const inputStyle = (hasError = false): React.CSSProperties => ({
    background: '#111111',
    border: hasError ? '1px solid #ef4444' : '1px solid rgba(255, 98, 0, 0.2)',
  })

  const inputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.border = '1px solid #FF6200'
  }

  const inputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>, hasError = false) => {
    e.currentTarget.style.border = hasError
      ? '1px solid #ef4444'
      : '1px solid rgba(255, 98, 0, 0.2)'
  }

  return (
    <main className="min-h-screen bg-dark flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-[600px]">
        {/* Wordmark */}
        <div className="text-center mb-8">
          <h1
            className="text-[32px] font-bold leading-tight"
            style={{ color: '#FF6200', fontFamily: 'Space Grotesk, sans-serif' }}
          >
            ClaudeVid
          </h1>
          <p className="mt-2 text-[#CCCCCC] text-base">
            Drop a video. Get it back edited.
          </p>
        </div>

        {/* Glass card */}
        <div
          className="rounded-[8px] p-6 md:p-8"
          style={{
            background: 'rgba(26, 26, 26, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 98, 0, 0.3)',
          }}
        >
          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {(['drive', 'upload'] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="px-4 py-2 rounded-[6px] text-sm font-semibold transition-all"
                style={{
                  background: activeTab === tab ? '#FF6200' : '#1A1A1A',
                  color: activeTab === tab ? '#000000' : '#CCCCCC',
                  border: activeTab === tab
                    ? '1px solid #FF6200'
                    : '1px solid rgba(255, 98, 0, 0.3)',
                  cursor: 'pointer',
                }}
              >
                {tab === 'drive' ? 'Google Drive Link' : 'Upload Video'}
              </button>
            ))}
          </div>

          {/* ── Tab 1: Google Drive ── */}
          {activeTab === 'drive' && (
            <form onSubmit={handleDriveSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="driveUrl" className="text-sm text-[#CCCCCC] font-semibold">
                  Google Drive Video Link
                </label>
                <input
                  id="driveUrl"
                  type="text"
                  value={driveUrl}
                  onChange={(e) => {
                    setDriveUrl(e.target.value)
                    if (urlError) setUrlError('')
                  }}
                  placeholder="https://drive.google.com/file/d/..."
                  className="w-full px-4 py-3 rounded-[6px] text-sm text-white placeholder-[#555] outline-none transition-all"
                  style={inputStyle(!!urlError)}
                  onFocus={inputFocus}
                  onBlur={(e) => inputBlur(e, !!urlError)}
                  disabled={driveLoading}
                  autoComplete="off"
                />
                {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="drivePrompt" className="text-sm text-[#CCCCCC] font-semibold">
                  Creative Direction{' '}
                  <span className="text-[#555] font-normal">(optional)</span>
                </label>
                <textarea
                  id="drivePrompt"
                  rows={3}
                  value={drivePrompt}
                  onChange={(e) => setDrivePrompt(e.target.value)}
                  placeholder='e.g. "Highlight the word OVERPAYING in orange. Zoom in on the speaker at 0:12."'
                  className="w-full px-4 py-3 rounded-[6px] text-sm text-white placeholder-[#555] outline-none resize-none transition-all"
                  style={{ background: '#111111', border: '1px solid rgba(255, 98, 0, 0.2)' }}
                  onFocus={inputFocus}
                  onBlur={(e) => inputBlur(e)}
                  disabled={driveLoading}
                />
              </div>

              <button
                type="submit"
                disabled={driveLoading}
                className="w-full py-3 rounded-[6px] font-bold text-sm text-black transition-opacity flex items-center justify-center gap-2"
                style={{
                  background: '#FF6200',
                  opacity: driveLoading ? 0.7 : 1,
                  cursor: driveLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {driveLoading ? (
                  <>
                    <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="black" strokeWidth="2" strokeLinecap="round" strokeDasharray="28" strokeDashoffset="10" />
                    </svg>
                    Starting...
                  </>
                ) : (
                  'Edit Video →'
                )}
              </button>
            </form>
          )}

          {/* ── Tab 2: Upload Video ── */}
          {activeTab === 'upload' && (
            <form onSubmit={handleUploadSubmit} className="flex flex-col gap-4">
              {/* Drop zone */}
              <div
                onClick={() => !uploading && fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className="flex flex-col items-center justify-center rounded-[6px] py-10 px-6 text-center transition-all"
                style={{
                  background: '#111111',
                  border: dragOver
                    ? '2px solid #FF6200'
                    : '2px dashed rgba(255, 98, 0, 0.4)',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  boxShadow: dragOver ? '0 0 12px rgba(255, 98, 0, 0.3)' : 'none',
                }}
              >
                {/* Upload icon */}
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ color: '#FF6200', marginBottom: '12px' }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="#FF6200" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="17 8 12 3 7 8" stroke="#FF6200" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="12" y1="3" x2="12" y2="15" stroke="#FF6200" strokeWidth="1.8" strokeLinecap="round" />
                </svg>

                {selectedFile ? (
                  <div>
                    <p className="text-sm text-white font-semibold truncate max-w-[320px]">{selectedFile.name}</p>
                    <p className="text-xs text-[#888] mt-1">{formatBytes(selectedFile.size)}</p>
                    {!uploading && (
                      <p className="text-xs text-[#FF6200] mt-2 underline">Click to change file</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-[#CCCCCC] font-semibold">
                      Drag & drop your video here
                    </p>
                    <p className="text-xs text-[#555] mt-1">or click to browse</p>
                    <p className="text-xs text-[#444] mt-2">MP4, MOV, AVI · up to 2 GB</p>
                  </div>
                )}
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp4,.mov,.avi,video/mp4,video/quicktime,video/avi,video/x-msvideo"
                className="hidden"
                onChange={handleFileInputChange}
                disabled={uploading}
              />

              {/* Upload progress bar */}
              {uploading && (
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-[#888]">
                    <span>Uploading…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full rounded-full h-2" style={{ background: '#1A1A1A', border: '1px solid rgba(255,98,0,0.2)' }}>
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${uploadProgress}%`, background: '#FF6200' }}
                    />
                  </div>
                </div>
              )}

              {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}

              {/* Prompt */}
              <div className="flex flex-col gap-1">
                <label htmlFor="uploadPrompt" className="text-sm text-[#CCCCCC] font-semibold">
                  Creative Direction{' '}
                  <span className="text-[#555] font-normal">(optional)</span>
                </label>
                <textarea
                  id="uploadPrompt"
                  rows={3}
                  value={uploadPrompt}
                  onChange={(e) => setUploadPrompt(e.target.value)}
                  placeholder='e.g. "Add captions. Zoom in on key moments."'
                  className="w-full px-4 py-3 rounded-[6px] text-sm text-white placeholder-[#555] outline-none resize-none transition-all"
                  style={{ background: '#111111', border: '1px solid rgba(255, 98, 0, 0.2)' }}
                  onFocus={inputFocus}
                  onBlur={(e) => inputBlur(e)}
                  disabled={uploading}
                />
              </div>

              <button
                type="submit"
                disabled={uploading || !selectedFile}
                className="w-full py-3 rounded-[6px] font-bold text-sm text-black transition-opacity flex items-center justify-center gap-2"
                style={{
                  background: '#FF6200',
                  opacity: uploading || !selectedFile ? 0.7 : 1,
                  cursor: uploading || !selectedFile ? 'not-allowed' : 'pointer',
                }}
              >
                {uploading ? (
                  <>
                    <svg className="spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="black" strokeWidth="2" strokeLinecap="round" strokeDasharray="28" strokeDashoffset="10" />
                    </svg>
                    Uploading {uploadProgress}%…
                  </>
                ) : (
                  'Upload & Edit →'
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-[#444] text-xs mt-6">
          Powered by Claude AI · Remotion · FFmpeg
        </p>
      </div>
    </main>
  )
}
