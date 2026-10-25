import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

// Compress once at build time so slow devices transfer fewer bytes without
// spending server CPU recompressing the same immutable assets per request.
async function compress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) await compress(file)
    else if (/\.(js|css|svg|json|html)$/.test(entry.name)) {
      const source = await readFile(file)
      if (source.length < 1024) continue
      await Promise.all([
        writeFile(`${file}.br`, brotliCompressSync(source)),
        writeFile(`${file}.gz`, gzipSync(source, { level: 9 })),
      ])
    }
  }
}
await compress(path.resolve('dist'))
