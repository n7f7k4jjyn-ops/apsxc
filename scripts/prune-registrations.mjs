// Remove inscrições que não foram criadas na data escolhida (padrão: hoje, America/Sao_Paulo).
// Uso: node scripts/prune-registrations.mjs <arquivo verdant.json> [--date AAAA-MM-DD] [--apply]
// Sem --apply é apenas simulação. Com --apply, cria um backup ao lado do arquivo antes de gravar.
// Só altera a lista "registrations"; eventos, formulários e pessoas são preservados.
import { copyFile, readFile, writeFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const file = args.find((arg) => !arg.startsWith('--') && args[args.indexOf(arg) - 1] !== '--date')
const apply = args.includes('--apply')
const dateIndex = args.indexOf('--date')
const keepDate = dateIndex >= 0 ? args[dateIndex + 1] : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(keepDate)) {
  console.error('Uso: node scripts/prune-registrations.mjs <arquivo verdant.json> [--date AAAA-MM-DD] [--apply]')
  process.exit(1)
}

const dayOf = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date)
}

const state = JSON.parse(await readFile(file, 'utf8'))
if (!Array.isArray(state.registrations)) {
  console.error('Arquivo sem lista "registrations"; nada foi alterado.')
  process.exit(1)
}
const kept = state.registrations.filter((row) => dayOf(row.createdAt) === keepDate)
console.log(`Data mantida: ${keepDate} | total: ${state.registrations.length} | mantidas: ${kept.length} | removidas: ${state.registrations.length - kept.length}`)

if (!apply) {
  console.log('Simulação: nada foi gravado. Use --apply para aplicar.')
  process.exit(0)
}
const backup = `${file}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
await copyFile(file, backup)
await writeFile(file, `${JSON.stringify({ ...state, revision: Number(state.revision ?? 0) + 1, updatedAt: new Date().toISOString(), registrations: kept }, null, 2)}\n`)
console.log(`Gravado. Backup: ${backup}`)
