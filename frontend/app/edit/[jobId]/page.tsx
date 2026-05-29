'use client'

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { getStatus, submitEdit, retryJob, StatusResponse } from '@/lib/api'
import ProgressBar from '@/components/ProgressBar'
import StatusBadge from '@/components/StatusBadge'

const STEP_LABELS: Record<string, string> = {
  queued: 'Queued — waiting to start...',
  downloading: 'Downloading video from Google Drive...',
  transcribing: 'Transcribing audio...',
  generating: 'Generating motion graphics code...',
  rendering: 'Rendering video...',
  uploading: 'Uploading finished video...',
  done: 'Done!',
  error: 'An error occurred.',
}

export default function EditPage({ params }: { params: { jobId: string } }) {
  const router = useRouter()
  const { jobId } = params

  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [editPrompt, setEditPrompt] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [resumeLoading, setResumeLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getStatus(jobId)
      setStatus(data)
      if (data.status !== 'done' && data.status !== 'error') {
        pollRef.current = setTimeout(fetchStatus, 3000)
      }
    } catch {
      // Retry silently on network hiccup
      pollRef.current = setTimeout(fetchStatus, 5000)
    }
  }, [jobId])

  useEffect(() => {
    fetchStatus()
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [fetchStatus])

  // Auto-focus textarea when done
  useEffect(() => {
    if (status?.status === 'done' && editTextareaRef.current) {
      setTimeout(() => editTextareaRef.current?.focus(), 100)
    }
  }, [status?.status])

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editPrompt.trim() || editLoading) return
    setEditLoading(true)
    try {
      const { jobId: newJobId } = await submitEdit(jobId, editPrompt.trim())
      router.push(`/edit/${newJobId}`)
    } catch (err) {
      console.error('Edit failed:', err)
      setEditLoading(false)
    }
  }

  const handleResume = async () => {
    if (resumeLoading) return
    setResumeLoading(true)
    try {
      const { jobId: resumedJobId } = await retryJob(jobId)
      // Redirect to the same (or new) job page to watch the resumed pipeline
      router.push(`/edit/${resumedJobId}`)
    } catch (err) {
      console.error('Resume failed:', err)
      setResumeLoading(false)
    }
  }

  const handleShare = async () => {
    const url = status?.videoUrl || window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      window.prompt('Copy this link:', url)
    }
  }

  const isDone = status?.status === 'done'
  const isError = status?.status === 'error'
  const isInProgress = status && !isDone && !isError

  const stepLabel = status ? (STEP_LABELS[status.status] || status.step || status.status) : 'Loading...'
  const progress = status?.progress ?? 0

  return (
    <main className="min-h-screen bg-dark px-4 py-8">
      <div className="max-w-[600px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/')}
            className="text-[#CCCCCC] hover:text-white transition-colors text-lg leading-none"
            aria-label="Go back"
          >
            ←
          </button>
          <span
            className="text-xl font-bold"
            style={{ color: '#FF6200', fontFamily: 'Space Grotesk, sans-serif' }}
          >
            ClaudeVid
          </span>
        </div>

        {/* Status card */}
        <div
          className="rounded-[8px] p-6 mb-4"
          style={{
            background: 'rgba(26, 26, 26, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 98, 0, 0.3)',
          }}
        >
          {/* Job ID + badge */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-[#555] font-mono">
              Job: {jobId.slice(0, 16)}...
            </span>
            {status && <StatusBadge status={status.status} />}
          </div>

          {/* Step label */}
          <p className="text-sm text-[#CCCCCC] mb-4">{stepLabel}</p>

          {/* Progress bar */}
          <ProgressBar
            progress={progress}
            status={status?.status || 'queued'}
          />

          {/* Percentage */}
          {isInProgress && (
            <p className="text-right text-xs text-[#555] mt-2">
              {Math.round(progress)}%
            </p>
          )}
        </div>

        {/* Error state */}
        {isError && (
          <div
            className="rounded-[8px] p-6 mb-4"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
            }}
          >
            <p className="text-sm font-semibold text-red-400 mb-2">
              Something went wrong
            </p>
            <p className="text-sm text-[#CCCCCC] mb-4">
              {status?.error || 'An unknown error occurred.'}
            </p>
            <div className="flex gap-3">
              {/* Primary: resume from where it failed */}
              <button
                onClick={handleResume}
                disabled={resumeLoading}
                className="flex-1 px-4 py-2 rounded-[6px] text-sm font-bold text-black flex items-center justify-center gap-2 transition-opacity"
                style={{
                  background: '#FF6200',
                  opacity: resumeLoading ? 0.6 : 1,
                  cursor: resumeLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {resumeLoading ? (
                  <>
                    <svg
                      className="spinner"
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        stroke="black"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeDasharray="28"
                        strokeDashoffset="10"
                      />
                    </svg>
                    Resuming...
                  </>
                ) : (
                  `Resume from ${status?.resumeFrom ?? 'last stage'}`
                )}
              </button>

              {/* Secondary: start completely fresh */}
              <button
                onClick={() => router.push('/')}
                className="flex-1 px-4 py-2 rounded-[6px] text-sm font-bold transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#CCCCCC',
                }}
              >
                Start Over
              </button>
            </div>
          </div>
        )}

        {/* Done state — video + edit */}
        {isDone && status?.videoUrl && (
          <div className="flex flex-col gap-4">
            {/* Video player */}
            <div
              className="rounded-[8px] overflow-hidden"
              style={{ border: '1px solid rgba(255, 98, 0, 0.3)' }}
            >
              <video
                src={status.videoUrl}
                controls
                playsInline
                className="w-full"
                style={{ background: '#000', display: 'block' }}
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              {status.downloadUrl && (
                <a
                  href={status.downloadUrl}
                  download
                  className="flex-1 py-3 rounded-[6px] font-bold text-sm text-black text-center transition-opacity hover:opacity-90"
                  style={{ background: '#FF6200' }}
                >
                  Download Video
                </a>
              )}
              <button
                onClick={handleShare}
                className="flex-1 py-3 rounded-[6px] font-bold text-sm transition-all"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 98, 0, 0.5)',
                  color: copied ? '#22c55e' : '#FF6200',
                }}
              >
                {copied ? 'Copied!' : 'Share on LinkedIn'}
              </button>
            </div>

            {/* Edit section */}
            <div
              className="rounded-[8px] p-6"
              style={{
                background: 'rgba(26, 26, 26, 0.85)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 98, 0, 0.3)',
              }}
            >
              {/* Divider */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px" style={{ background: 'rgba(255, 98, 0, 0.2)' }} />
                <span className="text-xs text-[#555]">Make edits</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255, 98, 0, 0.2)' }} />
              </div>

              <form onSubmit={handleEdit} className="flex flex-col gap-3">
                <textarea
                  ref={editTextareaRef}
                  rows={3}
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder='Describe what to change... e.g. "Make the title text bigger and use blue instead of orange"'
                  className="w-full px-4 py-3 rounded-[6px] text-sm text-white placeholder-[#555] outline-none resize-none transition-all"
                  style={{
                    background: '#111111',
                    border: '1px solid rgba(255, 98, 0, 0.2)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = '1px solid #FF6200'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = '1px solid rgba(255, 98, 0, 0.2)'
                  }}
                  disabled={editLoading}
                />
                <button
                  type="submit"
                  disabled={editLoading || !editPrompt.trim()}
                  className="w-full py-3 rounded-[6px] font-bold text-sm text-black flex items-center justify-center gap-2 transition-opacity"
                  style={{
                    background: '#FF6200',
                    opacity: editLoading || !editPrompt.trim() ? 0.5 : 1,
                    cursor: editLoading || !editPrompt.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {editLoading ? (
                    <>
                      <svg
                        className="spinner"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <circle
                          cx="8"
                          cy="8"
                          r="6"
                          stroke="black"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeDasharray="28"
                          strokeDashoffset="10"
                        />
                      </svg>
                      Applying...
                    </>
                  ) : (
                    'Apply Edits →'
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
