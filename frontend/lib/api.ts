const BASE_URL = process.env.NEXT_PUBLIC_RENDER_SERVER_URL || ''

export interface StatusResponse {
  jobId: string
  status: 'queued' | 'downloading' | 'transcribing' | 'generating' | 'rendering' | 'uploading' | 'done' | 'error'
  progress: number
  step?: string
  videoUrl?: string
  downloadUrl?: string
  error?: string
  /** Present when status is 'error' — the pipeline stage to resume from */
  resumeFrom?: string
}

export interface SubmitResponse {
  jobId: string
  status: string
}

export interface EditResponse {
  jobId: string
  parentJobId: string
  status: string
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  })

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      message = body?.error || body?.message || message
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(message)
  }

  return res.json() as Promise<T>
}

/**
 * Submit a new video job.
 */
export async function submitVideo(
  driveUrl: string,
  prompt?: string
): Promise<{ jobId: string }> {
  const data = await apiFetch<SubmitResponse>('/render', {
    method: 'POST',
    body: JSON.stringify({ driveUrl, prompt: prompt || undefined }),
  })
  return { jobId: data.jobId }
}

/**
 * Poll job status.
 */
export async function getStatus(jobId: string): Promise<StatusResponse> {
  return apiFetch<StatusResponse>(`/status/${jobId}`)
}

export interface RetryResponse {
  jobId: string
  resumeFrom: string
  status: string
}

/**
 * Retry a failed job, resuming from the last successful stage.
 * Returns the jobId and the stage it will resume from.
 */
export async function retryJob(jobId: string): Promise<{ jobId: string; resumeFrom: string }> {
  const data = await apiFetch<RetryResponse>(`/retry/${jobId}`, {
    method: 'POST',
  })
  return { jobId: data.jobId, resumeFrom: data.resumeFrom }
}

/**
 * Submit an edit to an existing job.
 */
export async function submitEdit(
  jobId: string,
  prompt: string
): Promise<{ jobId: string }> {
  const data = await apiFetch<EditResponse>(`/edit/${jobId}`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })
  return { jobId: data.jobId }
}

/**
 * Upload a video file directly and start the pipeline.
 * Uses XMLHttpRequest so we can track upload progress.
 */
export async function uploadVideo(
  file: File,
  prompt: string,
  onProgress?: (pct: number) => void
): Promise<{ jobId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const url = `${BASE_URL}/upload`

    xhr.open('POST', url)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const pct = Math.round((e.loaded / e.total) * 100)
        onProgress(pct)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          resolve({ jobId: data.jobId })
        } catch {
          reject(new Error('Invalid response from server'))
        }
      } else {
        let message = `Upload failed with status ${xhr.status}`
        try {
          const body = JSON.parse(xhr.responseText)
          message = body?.error || body?.message || message
        } catch {
          // Ignore
        }
        reject(new Error(message))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

    const formData = new FormData()
    formData.append('video', file)
    if (prompt) formData.append('prompt', prompt)

    xhr.send(formData)
  })
}
