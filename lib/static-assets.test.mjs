import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { staticAsset } from './static-assets.mjs'

test('static assets negotiate compressed variants and safely fall back for old builds', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'static-assets-'))
  try {
    const target = path.join(directory, 'app.js')
    await writeFile(target, 'original')
    await writeFile(`${target}.br`, 'br')
    await writeFile(`${target}.gz`, 'gzip')
    for (const [header, encoding] of [
      ['gzip, br', 'br'], ['gzip;q=1, br;q=0.5', 'gzip'],
      ['gzip;q=0, br;q=0', undefined], ['', undefined],
      ['*;q=0.5, br;q=0', 'gzip'], ['br;q=invalid', undefined],
    ]) {
      assert.equal((await staticAsset(target, header)).encoding, encoding)
    }
    await rm(`${target}.br`)
    assert.equal((await staticAsset(target, 'br, gzip')).encoding, 'gzip')
    await rm(`${target}.gz`)
    assert.deepEqual(await staticAsset(target, 'br, gzip'), { target, encoding: undefined, size: 8 })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
