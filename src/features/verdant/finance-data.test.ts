import { describe, expect, it } from 'vitest'
import {
  financeCsv,
  financeReport,
  financeTemplate,
  parseFinanceAmount,
  parseFinanceCsv,
  parseFinanceDate,
  type FinanceEntry,
} from './finance-data'

const entry = (patch: Partial<FinanceEntry> = {}): FinanceEntry => ({
  id: 'test-1',
  externalId: '',
  type: 'payable',
  category: 'general',
  description: 'Serviço',
  counterparty: 'Fornecedor',
  beneficiaryId: '',
  eventId: '',
  amountCents: 12345,
  dueDate: '2026-10-25',
  status: 'pending',
  settledDate: '',
  paymentMethod: '',
  notes: '',
  history: [],
  createdAt: '',
  updatedAt: '',
  ...patch,
})

describe('financial spreadsheet values', () => {
  it('parses Brazilian and decimal amounts into exact integer cents', () => {
    expect(parseFinanceAmount('R$ 1.234,56')).toBe(123456)
    expect(parseFinanceAmount('1234.56')).toBe(123456)
    expect(parseFinanceAmount('0,01')).toBe(1)
    expect(parseFinanceAmount('1.234')).toBe(123400)
    expect(parseFinanceAmount('150')).toBe(15000)
    expect(parseFinanceAmount('1,2')).toBe(120)
  })

  it('never rounds, invents zero, or accepts malformed money', () => {
    for (const value of [
      '',
      '-1',
      '0',
      '0,00',
      '1,234',
      'NaN',
      'Infinity',
      '1e3',
      '1 23',
      '1.23,45',
      '1000000000,01',
    ])
      expect(() => parseFinanceAmount(value), value).toThrow()
  })

  it('validates calendar dates and does not accept rolled-over dates', () => {
    expect(parseFinanceDate('29/02/2024')).toBe('2024-02-29')
    expect(parseFinanceDate('2026-10-25')).toBe('2026-10-25')
    for (const value of [
      '29/02/2026',
      '31/04/2026',
      '2026-13-01',
      '2026-02-30',
      '25/10/26',
      '2026-01-01T00:00',
      '0000-01-01',
      '',
    ])
      expect(() => parseFinanceDate(value), value).toThrow()
  })
})

describe('financial CSV import', () => {
  it('imports the downloadable template with stable external identifiers', () => {
    const [draft] = parseFinanceCsv(financeTemplate())
    expect(draft).toMatchObject({
      externalId: 'planilha-001',
      type: 'payable',
      category: 'general',
      amountCents: 15000,
      dueDate: '2026-10-25',
      status: 'pending',
    })
  })

  it('handles BOM, commas, quotes and line breaks without losing cells', () => {
    const csv =
      '\uFEFFid_externo,tipo,descricao,favorecido,valor,vencimento,observacoes\r\n' +
      'r1,receber,"Venda, ""evento""",Cliente,"10,50",25/10/2026,"linha 1\nlinha 2"'
    const [draft] = parseFinanceCsv(csv)
    expect(draft.description).toBe('Venda, "evento"')
    expect(draft.notes).toBe('linha 1\nlinha 2')
    expect(draft.amountCents).toBe(1050)
  })

  it('resolves team and DJ names only against existing unambiguous records', () => {
    const csv =
      'id;tipo;categoria;descricao;favorecido;valor;vencimento\nr1;pagar;DJ;Cachê;João;150;2026-10-25'
    const people = [{ id: 'dj:1', name: 'João', kind: 'dj' as const }]
    expect(parseFinanceCsv(csv, people)[0].beneficiaryId).toBe('dj:1')
    expect(() => parseFinanceCsv(csv, [])).toThrow(/Linha 2: Profissional/)
    expect(() =>
      parseFinanceCsv(csv, [...people, { ...people[0], id: 'dj:2' }])
    ).toThrow(/ambíguo/)
    const explicit = csv
      .replace('favorecido;valor', 'favorecido;beneficiario_id;valor')
      .replace('João;150', 'João;dj:2;150')
    expect(
      parseFinanceCsv(explicit, [...people, { ...people[0], id: 'dj:2' }])[0]
        .beneficiaryId
    ).toBe('dj:2')
  })

  it('requires complete settlement data for paid or received rows', () => {
    const headers = [
      'id',
      'tipo',
      'descricao',
      'favorecido',
      'valor',
      'vencimento',
      'status',
      'data_baixa',
      'forma_pagamento',
    ]
    const csv = (status: string, date: string, method: string) =>
      financeCsv(headers, [
        [
          'r1',
          'receber',
          'Venda',
          'Cliente',
          '15,30',
          '25/10/2026',
          status,
          date,
          method,
        ],
      ])
    expect(
      parseFinanceCsv(csv('recebido', '26/10/2026', 'pix'))[0]
    ).toMatchObject({
      status: 'settled',
      settledDate: '2026-10-26',
      paymentMethod: 'pix',
    })
    expect(() => parseFinanceCsv(csv('recebido', '', 'pix'))).toThrow(
      /exige data/
    )
    expect(() => parseFinanceCsv(csv('pendente', '26/10/2026', 'pix'))).toThrow(
      /Somente/
    )
    expect(() => parseFinanceCsv(csv('incorreto', '', ''))).toThrow(
      /Status inválido/
    )
  })

  it('rejects duplicate IDs, duplicate headers and malformed rows before upload', () => {
    const headers = 'id;tipo;descricao;favorecido;valor;vencimento\n'
    const row = 'r1;pagar;Serviço;Fornecedor;100;2026-10-25'
    expect(() => parseFinanceCsv(headers + row + '\n' + row)).toThrow(
      /Linha 3: ID externo repetido/
    )
    expect(() => parseFinanceCsv(headers + row.replace('r1;', ';'))).toThrow(
      /ID externo obrigatório/
    )
    expect(() => parseFinanceCsv(headers + row + ';extra')).toThrow(
      /Quantidade/
    )
    expect(() => parseFinanceCsv(headers + row + '"')).toThrow(/aspas/)
    expect(() => parseFinanceCsv(headers + '"não fechado')).toThrow(/aspas/)
    expect(() =>
      parseFinanceCsv(headers.replace('tipo;', 'tipo;type;') + row)
    ).toThrow(/Coluna repetida/)
    expect(() => parseFinanceCsv(headers.replace('valor;', '') + row)).toThrow(
      /Coluna obrigatória/
    )
    expect(() => parseFinanceCsv(headers)).toThrow(/não contém/)
  })

  it('limits import batches to 1000 and rejects invalid rows as one batch', () => {
    const headers = 'id;tipo;descricao;favorecido;valor;vencimento\n'
    const rows = Array.from(
      { length: 1001 },
      (_, i) => `${i};pagar;Serviço;Fornecedor;100;2026-10-25`
    )
    expect(() => parseFinanceCsv(headers + rows.join('\n'))).toThrow(/1.000/)
    expect(() =>
      parseFinanceCsv(
        headers + rows[0] + '\n' + rows[1].replace(';100;', ';inválido;')
      )
    ).toThrow(/Linha 3: Valor/)
  })
})

describe('financial reports', () => {
  it('separates due dates from cash settlement dates and includes opening balance', () => {
    const entries = [
      entry({
        type: 'receivable',
        amountCents: 10000,
        status: 'settled',
        settledDate: '2026-09-30',
      }),
      entry({
        amountCents: 2000,
        status: 'settled',
        settledDate: '2026-09-30',
      }),
      entry({
        type: 'receivable',
        amountCents: 10,
        status: 'settled',
        settledDate: '2026-10-01',
        dueDate: '2026-09-01',
      }),
      entry({
        type: 'receivable',
        amountCents: 20,
        status: 'settled',
        settledDate: '2026-10-31',
      }),
      entry({
        category: 'team',
        amountCents: 1000,
        status: 'settled',
        settledDate: '2026-10-15',
      }),
      entry({
        category: 'dj',
        amountCents: 500,
        status: 'settled',
        settledDate: '2026-10-31',
      }),
      entry({ amountCents: 200, dueDate: '2026-10-01' }),
      entry({ type: 'receivable', amountCents: 300, dueDate: '2026-10-31' }),
      entry({ amountCents: 99999, status: 'cancelled' }),
      entry({
        amountCents: 99999,
        status: 'settled',
        settledDate: '2026-11-01',
      }),
    ]
    expect(
      financeReport(entries, { from: '2026-10-01', to: '2026-10-31' })
    ).toMatchObject({
      opening: 8000,
      incoming: 30,
      outgoing: 1500,
      balance: 6530,
      payable: 200,
      receivable: 300,
      team: 1000,
      dj: 500,
    })
  })

  it('filters events for opening, settlement and pending totals consistently', () => {
    const entries = [
      entry({
        eventId: 'e1',
        amountCents: 10,
        status: 'settled',
        settledDate: '2026-10-01',
      }),
      entry({ eventId: 'e1', amountCents: 20 }),
      entry({ eventId: 'e2', amountCents: 99999 }),
    ]
    expect(financeReport(entries, { eventId: 'e1' })).toMatchObject({
      opening: 0,
      incoming: 0,
      outgoing: 10,
      balance: -10,
      payable: 20,
    })
    expect(() =>
      financeReport(entries, { from: '2026-11-01', to: '2026-10-01' })
    ).toThrow(/inicial/)
    expect(financeReport([])).toMatchObject({
      balance: 0,
      payable: 0,
      receivable: 0,
    })
  })

  it('escapes spreadsheet formulas and quoted text during exports', () => {
    const csv = financeCsv(
      ['Descrição', 'Valor'],
      [
        ['=HYPERLINK("https://example.invalid")', '10,00'],
        [' \t+cmd', '@formula'],
        ['Cliente "A"; evento', 15],
      ]
    )
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""https://example.invalid"")"`)
    expect(csv).toContain(`"' \t+cmd"`)
    expect(csv).toContain(`"'@formula"`)
    expect(csv).toContain('"Cliente ""A""; evento";"15"')
  })

  it('refuses aggregate values that would lose integer precision', () => {
    const max = Number.MAX_SAFE_INTEGER
    expect(() =>
      financeReport(
        [
          entry({
            type: 'receivable',
            amountCents: max,
            status: 'settled',
            settledDate: '2026-09-01',
          }),
          entry({
            type: 'receivable',
            amountCents: 1,
            status: 'settled',
            settledDate: '2026-10-01',
          }),
        ],
        { from: '2026-10-01' }
      )
    ).toThrow(/limite seguro/)
    expect(() =>
      financeReport([entry({ amountCents: max }), entry({ amountCents: 1 })])
    ).toThrow(/limite seguro/)
  })
})
