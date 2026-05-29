'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { submitVideo } from '@/lib/api'

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

export default function HomePage() {
  const router = useRouter()
  const [driveUrl, setDriveUrl] = useState('')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [urlError, setUrlError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setUrlError('')

    const trimmed = driveUrl.trim()
    if (!trimmed) {
      setUrlError('Please paste a Google Drive link.')
      return
    }
    if (!isGoogleDriveUrl(trimmed)) {
      setUrlError('That doesn\'t look like a Google Drive URL. Please paste a drive.google.com link.')
      return
    }

    setLoading(true)
    try {
      const { jobId } = await submitVideo(trimmed, prompt.trim())
      router.push(`/edit/${jobId}`)
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Failed to start job. Try again.')
      setLoading(false)
    }
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
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Drive URL input */}
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
                style={{
                  background: '#111111',
                  border: urlError
                    ? '1px solid #ef4444'
                    : '1px solid rgba(255, 98, 0, 0.2)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid #FF6200'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = urlError
                    ? '1px solid #ef4444'
                    : '1px solid rgba(255, 98, 0, 0.2)'
                }}
                disabled={loading}
                autoComplete="off"
              />
              {urlError && (
                <p className="text-xs text-red-400 mt-1">{urlError}</p>
              )}
            </div>

            {/* Prompt textarea */}
            <div className="flex flex-col gap-1">
              <label htmlFor="prompt" className="text-sm text-[#CCCCCC] font-semibold">
                Creative Direction{' '}
                <span className="text-[#555] font-normal">(optional)</span>
              </label>
              <textarea
                id="prompt"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g. "Highlight the word OVERPAYING in orange. Zoom in on the speaker at 0:12."'
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
                disabled={loading}
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-[6px] font-bold text-sm text-black transition-opacity flex items-center justify-center gap-2"
              style={{
                background: '#FF6200',
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
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
                  Starting...
                </>
              ) : (
                'Edit Video →'
              )}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p className="text-center text-[#444] text-xs mt-6">
          Powered by Claude AI · Remotion · FFmpeg
        </p>
      </div>
    </main>
  )
}
