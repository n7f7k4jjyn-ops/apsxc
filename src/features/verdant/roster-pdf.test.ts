import { PDFDocument } from 'pdf-lib'
import { describe, it, expect } from 'vitest'
import { createRosterPdf } from './roster-pdf'
import { rosterGroups, moveRosterEntry, type Roster } from './roster-types'

const roster: Roster = {
  date: '2026-10-18',
  eventId: '',
  eventName: 'Verdant CWB',
  kind: 'staff',
  status: 'finalized',
  template: 4,
  entries: Array.from({ length: 18 }, (_, i) => ({
    memberId: String(i),
    name: `Profissional ${i + 1} çãé`,
    role: [
      'Caixa',
      'Caixa-Bar',
      'Chapelaria',
      'Encarregado Bar',
      'Bar',
      'Cozinha',
      'Limpeza',
    ][Math.floor(i / 3) % 7],
    posts: i % 7 === 3 ? ['Terraço', 'VIP'] : [],
    availability: ['Domingo'],
    entry: '18:00',
    exit: '04:00',
  })),
}
describe('roster PDFs', () => {
  it('generates the four one-page staff layouts with original brands', async () => {
    for (const template of [1, 2, 3, 4]) {
      const pdf = await PDFDocument.load(
        await createRosterPdf({ ...roster, template })
      )
      expect(pdf.getPageCount()).toBe(1)
      expect(pdf.getTitle()).toContain('STAFF')
      expect(pdf.getPages()[0].getWidth()).toBeCloseTo(595.28)
    }
  })
  it('paginates many professionals, long posts and unsupported characters', async () => {
    const pdf = await PDFDocument.load(
      await createRosterPdf({
        ...roster,
        kind: 'security',
        eventName: 'Evento muito longo '.repeat(10),
        entries: Array.from({ length: 160 }, (_, i) => ({
          ...roster.entries[i % 18],
          memberId: String(i),
          name: `Nome ${i} ${'muito extenso '.repeat(5)} 🎧`,
          role: 'Segurança',
          posts: ['Porta', 'Apoio', 'SKY - Escada', 'Saída de emergência'],
        })),
      })
    )
    expect(pdf.getPageCount()).toBeGreaterThan(2)
  })
})

it('keeps manual order and repeated functions in separate consecutive blocks', () => {
  const entries = [
    { ...roster.entries[0], memberId: 'a', role: 'Caixa' },
    { ...roster.entries[0], memberId: 'b', role: 'Bar' },
    { ...roster.entries[0], memberId: 'c', role: 'Caixa' },
  ]
  const moved = moveRosterEntry(entries, 2, -1)
  expect(moved.map((row) => row.memberId)).toEqual(['a', 'c', 'b'])
  expect(entries.map((row) => row.memberId)).toEqual(['a', 'b', 'c'])
  expect(
    rosterGroups({ ...roster, entries }).map(([label, rows]) => [
      label,
      rows.map((row) => row.memberId),
    ])
  ).toEqual([
    ['Caixa', ['a']],
    ['Bar', ['b']],
    ['Caixa', ['c']],
  ])
  expect(
    rosterGroups({ ...roster, entries: moved }).map(([label, rows]) => [
      label,
      rows.map((row) => row.memberId),
    ])
  ).toEqual([
    ['Caixa', ['a', 'c']],
    ['Bar', ['b']],
  ])
})
