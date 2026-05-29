'use client'

interface StatusBadgeProps {
  status: string
}

interface BadgeConfig {
  label: string
  bg: string
  text: string
  pulse: boolean
}

const STATUS_MAP: Record<string, BadgeConfig> = {
  queued: {
    label: 'Queued',
    bg: 'rgba(100, 100, 100, 0.2)',
    text: '#888888',
    pulse: false,
  },
  downloading: {
    label: 'Downloading',
    bg: 'rgba(255, 98, 0, 0.15)',
    text: '#FF6200',
    pulse: true,
  },
  transcribing: {
    label: 'Transcribing',
    bg: 'rgba(255, 98, 0, 0.15)',
    text: '#FF6200',
    pulse: true,
  },
  generating: {
    label: 'Generating',
    bg: 'rgba(255, 98, 0, 0.15)',
    text: '#FF6200',
    pulse: true,
  },
  rendering: {
    label: 'Rendering',
    bg: 'rgba(255, 98, 0, 0.15)',
    text: '#FF6200',
    pulse: true,
  },
  uploading: {
    label: 'Uploading',
    bg: 'rgba(255, 98, 0, 0.15)',
    text: '#FF6200',
    pulse: true,
  },
  done: {
    label: 'Done',
    bg: 'rgba(34, 197, 94, 0.15)',
    text: '#22c55e',
    pulse: false,
  },
  error: {
    label: 'Error',
    bg: 'rgba(239, 68, 68, 0.15)',
    text: '#ef4444',
    pulse: false,
  },
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? {
    label: status,
    bg: 'rgba(100, 100, 100, 0.2)',
    text: '#888888',
    pulse: false,
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
        config.pulse ? 'animate-pulse-glow' : ''
      }`}
      style={{
        background: config.bg,
        color: config.text,
      }}
    >
      {/* Status dot */}
      <span
        className="inline-block rounded-full"
        style={{
          width: '6px',
          height: '6px',
          background: config.text,
          flexShrink: 0,
        }}
      />
      {config.label}
    </span>
  )
}
