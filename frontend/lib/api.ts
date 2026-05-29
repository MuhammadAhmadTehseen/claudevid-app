const BASE_URL = process.env.NEXT_PUBLIC_RENDER_SERVER_URL || ''

export interface StatusResponse {
  jobId: string
  status: 'queued' | 'downloading' | 'transcribing' | 'generating' | 'rendering' | 'uploading' | 'done' | 'error'
  progress: number
  step?: string
  videoUrl?: string
  downloadUrl?: string
  error?: string
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
