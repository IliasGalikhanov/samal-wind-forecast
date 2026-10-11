import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('..')
const cache = resolve(root, '.cache/e2e')
mkdirSync(cache, { recursive: true })
const executable = resolve(cache, process.platform === 'win32' ? 'samal.exe' : 'samal')
const result = spawnSync('go', ['build', '-buildvcs=false', '-o', executable, './cmd/server'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    GOMODCACHE: resolve(root, '.cache/gomod'),
    GOCACHE: resolve(root, '.cache/gobuild'),
  },
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
