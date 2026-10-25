import { stat } from 'node:fs/promises'

export async function staticAsset(target, acceptEncoding = '') {
  const qualities = new Map(String(acceptEncoding).toLowerCase().split(',').map(part => {
    const [name, ...parameters] = part.trim().split(';')
    const quality = parameters.map(value => value.trim()).find(value => value.startsWith('q='))
    const value = quality ? Number(quality.slice(2)) : 1
    return [name, Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0]
  }))
  const candidates = [['br', '.br'], ['gzip', '.gz']]
    .map(([encoding, suffix]) => ({ encoding, suffix, quality: qualities.get(encoding) ?? qualities.get('*') ?? 0 }))
    .filter(candidate => candidate.quality > 0)
    .sort((a, b) => b.quality - a.quality)
  for (const { encoding, suffix } of candidates) {
    try {
      const info = await stat(`${target}${suffix}`)
      if (info.isFile()) return { target: `${target}${suffix}`, encoding, size: info.size }
    } catch { /* Older builds still serve uncompressed files. */ }
  }
  return { target, encoding: undefined, size: (await stat(target)).size }
}
