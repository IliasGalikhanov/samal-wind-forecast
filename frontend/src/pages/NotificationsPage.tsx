import { Bell } from 'lucide-react'
import { useI18n } from '../i18n'
import { Card, Empty, Filters, Pager, useList } from '../ui'

import type { Notification } from '../hooks/useNotifications'
export function Notifications({
  items,
  setItems,
  onOpen,
}: {
  items: Notification[]
  setItems: (v: Notification[]) => void
  onOpen: (n: Notification) => void
}) {
  const { t, created, error } = useI18n()
  const list = useList(
    items,
    (n) => `${t(n.key, n.values)} ${n.detail || ''}`,
    (n) => n.at,
    (n, k) => k === 'all' || (k === 'read' ? n.read : !n.read),
  )
  return (
    <Card
      title={t('notifications')}
      sub={t('notificationHint')}
      action={
        <div className="button-row">
          <button
            className="button secondary compact"
            onClick={() => setItems(items.map((n) => ({ ...n, read: true })))}
          >
            {t('markRead')}
          </button>
          <button
            className="button secondary compact"
            disabled={!items.length}
            onClick={() => setItems([])}
          >
            {t('clearNotifications')}
          </button>
        </div>
      }
    >
      <Filters
        state={list}
        options={[
          { value: 'unread', label: t('unread') },
          { value: 'read', label: t('read') },
        ]}
        dates={false}
      />
      {list.visible.map((n) => (
        <div className={`notification-row ${n.read ? '' : 'unread'}`} key={n.id}>
          <Bell size={19} />
          <div>
            <b>{t(n.key, n.values)}</b>
            <small>{created(n.at)}</small>
            {n.detail && (
              <details>
                <summary>{error(n.detail)}</summary>
                <code>{n.detail}</code>
              </details>
            )}
          </div>
          <button className="text-button" onClick={() => onOpen(n)}>
            {t(n.runID ? 'open' : n.read ? 'read' : 'markOne')}
          </button>
        </div>
      ))}
      {!list.total && <Empty>{t('noMatches')}</Empty>}
      <Pager total={list.total} page={list.page} setPage={list.setPage} />
    </Card>
  )
}
