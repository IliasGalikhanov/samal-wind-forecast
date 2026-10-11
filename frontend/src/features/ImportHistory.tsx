import { FileText } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Imported, Turbine } from '../types'
import { Card, Empty, Filters, Pager, Pill, useList } from '../ui'

export function ImportHistory({ items, turbines }: { items: Imported[]; turbines: Turbine[] }) {
  const { t, num, created } = useI18n()
  const list = useList(
    items,
    (x) => `${x.name} ${x.id}`,
    (x) => x.created,
    (x, k) => k === 'all' || String(x.turbine_id) === k,
    (x) => x.added,
  )
  return (
    <Card
      title={t('uploadHistory')}
      action={<Pill tone="neutral">{t('countFiles', { n: items.length })}</Pill>}
    >
      <Filters
        state={list}
        options={turbines.map((x) => ({ value: String(x.id), label: x.name }))}
        extraSort
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('file')}</th>
              <th>{t('turbineLabel')}</th>
              <th>{t('added')}</th>
              <th>{t('duplicate')}</th>
              <th>{t('uploaded')}</th>
            </tr>
          </thead>
          <tbody>
            {list.visible.map((i) => (
              <tr key={i.id}>
                <td>
                  <span className="file-name" title={i.name}>
                    <FileText size={16} />
                    {i.name}
                  </span>
                </td>
                <td>
                  {turbines.find((x) => x.id === i.turbine_id)?.name ||
                    t('turbine', { n: i.turbine_id })}
                </td>
                <td>{num(i.added)}</td>
                <td>{num(i.duplicates)}</td>
                <td>{created(i.created)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.total && <Empty>{t('noMatches')}</Empty>}
      <Pager total={list.total} page={list.page} setPage={list.setPage} />
    </Card>
  )
}
