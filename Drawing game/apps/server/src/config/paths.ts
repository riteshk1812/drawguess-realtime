import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function findRepoRoot(fromFile: string): string {
  let dir = path.dirname(fromFile)
  for (let hop = 0; hop < 8; hop += 1) {
    if (existsSync(path.join(dir, 'apps')) && existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

export function repoRootFromImport(metaUrl: string): string {
  return findRepoRoot(fileURLToPath(metaUrl))
}
