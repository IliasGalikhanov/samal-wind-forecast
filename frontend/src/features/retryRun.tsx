import { api, post } from '../types'
import type { Run } from '../types'

export async function retryRun(run: Run) {
  const original = await api<Run>(`/runs/${run.id}`)
  return api<Run>(
    '/runs',
    post(
      original.request?.mode === 'live'
        ? { ...original.request, origin: undefined }
        : original.request || {
            horizon: run.horizon,
            origin: run.origin.replace(' ', 'T').slice(0, 16),
          },
    ),
  )
}
