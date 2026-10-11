import type { Key } from './i18n'
export type Notify = (
  key: Key,
  values?: Record<string, string | number>,
  runID?: string,
  detail?: string,
  id?: string,
) => void
