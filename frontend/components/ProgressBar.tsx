'use client'

interface ProgressBarProps {
  progress: number
  status: string
}

const isActiveStatus = (status: string) =>
  ['downloading', 'transcribing', 'generating', 'rendering', 'uploading', 'queued'].includes(status)

export default function ProgressBar({ progress, status }: ProgressBarProps) {
  const active = isActiveStatus(status)
  const clamped = Math.min(100, Math.max(0, progress))

  // Always show at least a small sliver when queued/in-progress
  const displayWidth = active && clamped === 0 ? 4 : clamped

  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{
        height: '8px',
        background: '#2a2a2a',
      }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full progress-fill ${active ? 'animate-pulse-glow' : ''}`}
        style={{
          width: `${displayWidth}%`,
          background:
            status === 'done'
              ? '#22c55e'
              : status === 'error'
              ? '#ef4444'
              : '#FF6200',
          transition: 'width 0.6s ease-in-out',
        }}
      />
    </div>
  )
}
