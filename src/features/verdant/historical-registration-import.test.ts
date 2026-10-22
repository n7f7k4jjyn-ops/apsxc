import { describe, expect, it } from 'vitest'
import { buildBuckets } from '@/features/dashboard/components/overview'
import { readHistoricalRegistrationImport } from './historical-registration-import'

const encoder = new TextEncoder()

function crc32(bytes: Uint8Array) {
  let crc = -1
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ -1) >>> 0
}

function zip(files: Record<string, string>) {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0
  for (const [name, text] of Object.entries(files)) {
    const filename = encoder.encode(name)
    const body = encoder.encode(text)
    const crc = crc32(body)
    const local = new Uint8Array(30 + filename.length + body.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(8, 0, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, body.length, true)
    localView.setUint32(22, body.length, true)
    localView.setUint16(26, filename.length, true)
    local.set(filename, 30)
    local.set(body, 30 + filename.length)
    localParts.push(local)
    const central = new Uint8Array(46 + filename.length)
    const view = new DataView(central.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 20, true)
    view.setUint16(10, 0, true)
    view.setUint32(16, crc, true)
    view.setUint32(20, body.length, true)
    view.setUint32(24, body.length, true)
    view.setUint16(28, filename.length, true)
    view.setUint32(42, localOffset, true)
    central.set(filename, 46)
    centralParts.push(central)
    localOffset += local.length
  }
  const centralSize = centralParts.reduce(
    (total, part) => total + part.length,
    0
  )
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, centralParts.length, true)
  endView.setUint16(10, centralParts.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, localOffset, true)
  const parts = [...localParts, ...centralParts, end]
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0)
  )
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function sharedSheet(rows: (string | number)[][], sharedStrings: string[]) {
  const xmlRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const column = String.fromCharCode(65 + columnIndex)
          if (typeof value === 'number')
            return `<c r="${column}${rowIndex + 1}"><v>${value}</v></c>`
          const index = sharedStrings.push(value) - 1
          return `<c r="${column}${rowIndex + 1}" t="s"><v>${index}</v></c>`
        })
        .join('')
      return `<row r="${rowIndex + 1}">${cells}</row>`
    })
    .join('')
  return `<worksheet><sheetData>${xmlRows}</sheetData></worksheet>`
}

function workbookFile(
  rows: (string | number)[][],
  schedule: (string | number)[][]
) {
  const sharedStrings: string[] = []
  const responses = sharedSheet(rows, sharedStrings)
  const events = sharedSheet(schedule, sharedStrings)
  const shared = `<sst>${sharedStrings.map((value) => `<si><t>${value}</t></si>`).join('')}</sst>`
  const workbook =
    '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Lista Única" sheetId="1" r:id="rId1"/><sheet name="Agenda de Eventos" sheetId="2" r:id="rId2"/></sheets></workbook>'
  const relationships =
    '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'
  return new File(
    [
      zip({
        'xl/workbook.xml': workbook,
        'xl/_rels/workbook.xml.rels': relationships,
        'xl/sharedStrings.xml': shared,
        'xl/worksheets/sheet1.xml': responses,
        'xl/worksheets/sheet2.xml': events,
      }),
    ],
    'historico.xlsx'
  )
}

const responseHeaders = [
  'Carimbo de data/hora',
  'Evento',
  'Categoria',
  'Nome completo',
  'Telefone/WhatsApp',
  'E-mail',
  'Aceite de novidades',
  'Detalhes específicos',
  'Formulário de origem',
  'ID da resposta',
]

describe('importação de inscrições históricas', () => {
  it('importa inscrições pelo ID de resposta, associa eventos somente por data única e é idempotente', async () => {
    const rows: (string | number)[][] = [
      responseHeaders,
      [
        46301.5,
        'Sexta-feira',
        'DJs — Sexta',
        'Pessoa Teste',
        '5541999999999',
        'teste@example.com',
        'Sim',
        'DJ selecionado',
        'Lista DJs',
        'response-001',
      ],
      [
        46302.5,
        'Domingo',
        'Influencers — Domingo',
        'Pessoa Exemplo',
        '5541888888888',
        'exemplo@example.com',
        'Não',
        '',
        'Lista Influencers',
        'response-002',
      ],
      [
        46301.5,
        'Sexta-feira',
        'DJs — Sexta',
        'Pessoa Teste',
        '5541999999999',
        'teste@example.com',
        'Sim',
        'DJ selecionado',
        'Lista DJs',
        'response-001',
      ],
      [
        46303.5,
        'Sexta-feira / Sábado',
        'Aniversário',
        'Pessoa Amostra',
        '',
        '',
        'Talvez',
        'Detalhes',
        'Aniversário',
        'response-003',
      ],
    ]
    const schedule = [
      ['Dia do evento', 'Data do evento', 'Nome do evento (opcional)'],
      ['Sexta-feira', 46304, 'FRENÉTIKA'],
      ['Domingo', '', 'GAYMER'],
      ['Sábado', 46305, 'FESTA DO PIJAMA'],
    ]
    const events = [
      {
        id: 'event-friday',
        date: '2026-10-09',
        name: 'Sexta · 09/10/2026',
        eventTime: '',
        entryValue: '',
        active: true,
      },
      {
        id: 'event-saturday',
        date: '2026-10-10',
        name: 'Sábado · 10/10/2026',
        eventTime: '',
        entryValue: '',
        active: true,
      },
    ]
    const result = await readHistoricalRegistrationImport(
      workbookFile(rows, schedule),
      events,
      []
    )

    expect(result).toMatchObject({
      sourceRows: 4,
      readyRows: 3,
      unlinkedCustomerRegistrations: 3,
      duplicateRows: 1,
      conflictingSourceIds: 0,
      matchedEvents: 1,
      unmatchedEvents: 2,
      ambiguousEvents: 1,
    })
    expect(result.registrations).toHaveLength(3)
    expect(result.registrations[0]).toMatchObject({
      id: 'import-lista-unica-response-001',
      sourceSystem: 'verdant-lista-unica',
      sourceId: 'response-001',
      eventId: 'event-friday',
      eventDate: '2026-10-09',
      formKey: 'DJS',
      createdAt: '2026-10-06T12:00:00-03:00',
      consent: true,
      consentAnswered: true,
    })
    expect(result.registrations[1]).toMatchObject({
      eventId: '',
      eventDate: '',
      formKey: 'INFLUENCIADORES',
      consent: false,
      consentAnswered: true,
    })
    expect(result.registrations[2]).toMatchObject({
      eventId: '',
      eventDate: '',
      formKey: 'ANIVERSARIO',
      consent: false,
      consentAnswered: false,
    })
    expect(
      buildBuckets(
        result.registrations,
        events,
        new Date('2026-10-08T12:00:00'),
        'week',
        'registrations'
      ).reduce((total, bucket) => total + bucket.total, 0)
    ).toBe(3)

    const secondImport = await readHistoricalRegistrationImport(
      workbookFile(rows, schedule),
      events,
      result.registrations
    )
    expect(secondImport.readyRows).toBe(0)
    expect(secondImport.alreadyImported).toBe(3)
  })

  it('excludes conflicting uses of the same response ID', async () => {
    const rows: (string | number)[][] = [
      responseHeaders,
      [
        46301.5,
        'Sexta-feira',
        'DJs — Sexta',
        'Pessoa Teste',
        '',
        '',
        '',
        '',
        'Lista DJs',
        'response-001',
      ],
      [
        46301.5,
        'Sexta-feira',
        'DJs — Sexta',
        'Pessoa Diferente',
        '',
        '',
        '',
        '',
        'Lista DJs',
        'response-001',
      ],
    ]
    const schedule = [
      ['Dia do evento', 'Data do evento', 'Nome do evento (opcional)'],
      ['Sexta-feira', 46304, 'FRENÉTIKA'],
    ]
    const result = await readHistoricalRegistrationImport(
      workbookFile(rows, schedule),
      [],
      []
    )

    expect(result.registrations).toHaveLength(0)
    expect(result.conflictingSourceIds).toBe(1)
    expect(result.readyRows).toBe(0)
  })
})
