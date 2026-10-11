import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n, useStored } from '../i18n'
import type { Key } from '../i18n'
import type { Notify } from '../panels'

export type Notification = {
  id: string
  key: Key
  values?: Record<string, string | number>
  runID?: string
  detail?: string
  at: string
  read: boolean
}

export function useNotifications() {
  const { prefs } = useI18n()
  const [notifications, setNotifications] = useStored<Notification[]>('samal.notifications', [])
  const [toast, setToast] = useState<Notification | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const notify = useCallback<Notify>(
    (key, values, runID, detail, id) => {
      const notification: Notification = {
        id: id || crypto.randomUUID(),
        key,
        values,
        runID,
        detail,
        at: new Date().toISOString(),
        read: false,
      }
      setNotifications((old) =>
        old.some((item) => item.id === notification.id)
          ? old
          : [notification, ...old].slice(0, 200),
      )
      if (prefsRef.current.toasts) {
        setToast(notification)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setToast(null), 6500)
      }
    },
    [setNotifications],
  )

  return { notifications, setNotifications, toast, setToast, notify }
}
