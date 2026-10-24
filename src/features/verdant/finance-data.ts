export type FinanceDraft = {
  externalId: string
  type: 'payable' | 'receivable'
  category: 'general' | 'team' | 'dj' | 'influencer' | 'sales'
  description: string
  counterparty: string
  beneficiaryId: string
  eventId: string
  amountCents: number
  dueDate: string
  status: 'pending' | 'settled' | 'cancelled'
  settledDate: string
  paymentMethod: '' | 'cash' | 'pix' | 'transfer' | 'card' | 'other'
  notes: string
}

export type FinanceEntry = FinanceDraft & {
  id: string
  createdAt: string
  updatedAt: string
  history: { action: string; actor: string; at: string }[]
}

export type FinanceBeneficiary = {
  id: string
  name: string
  kind: 'team' | 'dj' | 'influencer'
  pixKey?: string
}

export type FinanceData = {
  revision: number
  entries: FinanceEntry[]
  beneficiaries: FinanceBeneficiary[]
  events: { id: string; name: string; date: string; active?: boolean }[]
}

export const financeTypes = { payable: 'A pagar', receivable: 'A receber' }
export const financeCategories = {
  general: 'Geral',
  team: 'Equipe',
  dj: 'DJ',
  influencer: 'Influencer',
  sales: 'Vendas Zig',
}
export const financeStatuses = {
  pending: 'Pendente',
  settled: 'Baixado',
  cancelled: 'Cancelado',
}
export const financeMethods = {
  cash: 'Dinheiro',
  pix: 'Pix',
  transfer: 'Transferência',
  card: 'Cartão',
  other: 'Outro',
}
export const formatCents = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100
  )

export function parseFinanceAmount(value: string) {
  const input = value.trim().replace(/^R\$\s*/, '')
  let normalized: string
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(input)) {
    normalized = input.replace(/\./g, '').replace(',', '.')
  } else if (/^\d+(?:[.,]\d{1,2})?$/.test(input)) {
    normalized = input.replace(',', '.')
  } else {
    throw new Error(
      'Valor inválido. Use, por exemplo, 1.234,56, sem arredondamento.'
    )
  }
  const [whole, decimal = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_000_000)
    throw new Error('O valor deve ser positivo e de até R$ 1 bilhão.')
  return cents
}

export function parseFinanceDate(value: string) {
  const input = value.trim()
  const local = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const iso = local ? `${local[3]}-${local[2]}-${local[1]}` : input
  const date = new Date(`${iso}T12:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    iso.startsWith('0000-') ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== iso
  )
    throw new Error('Data inválida. Use DD/MM/AAAA ou AAAA-MM-DD.')
  return iso
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
const headerKey = (value: string) => normalize(value).replace(/[^a-z0-9]/g, '')

function csvRows(text: string) {
  const source = text.replace(/^\uFEFF/, '')
  const header = source.split(/\r?\n/, 1)[0]
  const delimiter = header.includes(';') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let closed = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') {
        quoted = false
        closed = true
      } else cell += char
    } else if (char === '"' && !cell && !closed) {
      quoted = true
    } else if (char === delimiter || char === '\r' || char === '\n') {
      row.push(cell)
      cell = ''
      closed = false
      if (char !== delimiter) {
        if (char === '\r' && source[i + 1] === '\n') i++
        rows.push(row)
        row = []
      }
    } else if (closed || char === '"') {
      throw new Error('CSV inválido: confira as aspas e o separador.')
    } else cell += char
  }
  if (quoted) throw new Error('CSV inválido: aspas não fechadas.')
  if (cell || row.length || closed) rows.push([...row, cell])
  return rows.filter((cells) => cells.some((value) => value.trim()))
}

const columns: Record<string, string[]> = {
  externalId: ['idexterno', 'externalid', 'id'],
  type: ['tipo', 'type'],
  category: ['categoria', 'category'],
  description: ['descricao', 'description'],
  counterparty: ['favorecido', 'contraparte', 'counterparty'],
  amount: ['valor', 'amount'],
  dueDate: ['vencimento', 'duedate'],
  status: ['status', 'situacao'],
  settledDate: ['databaixa', 'settleddate'],
  paymentMethod: ['formapagamento', 'paymentmethod'],
  eventId: ['eventoid', 'eventid'],
  beneficiaryId: ['beneficiarioid', 'beneficiaryid'],
  notes: ['observacoes', 'notes'],
}

function csvEnum<T extends string>(
  value: string,
  choices: Record<string, T>,
  label: string
): T {
  const key = normalize(value)
  const result = Object.prototype.hasOwnProperty.call(choices, key)
    ? choices[key]
    : undefined
  if (!result) throw new Error(`${label} inválido: "${value}".`)
  return result
}

export function parseFinanceCsv(
  text: string,
  beneficiaries: FinanceBeneficiary[] = [],
  existingEntries: FinanceEntry[] = []
): FinanceDraft[] {
  const [header, ...rows] = csvRows(text)
  if (!header || !rows.length)
    throw new Error('A planilha não contém lançamentos.')
  if (rows.length > 1000)
    throw new Error('Importe no máximo 1.000 linhas por vez.')
  const normalized = header.map(headerKey)
  const indexes = Object.fromEntries(
    Object.entries(columns).map(([key, aliases]) => {
      const matches = normalized.flatMap((name, index) =>
        aliases.includes(name) ? [index] : []
      )
      if (matches.length > 1) throw new Error(`Coluna repetida: ${key}.`)
      return [key, matches[0] ?? -1]
    })
  )
  for (const key of [
    'externalId',
    'type',
    'description',
    'amount',
    'dueDate',
  ]) {
    if (indexes[key] === -1)
      throw new Error(
        `Coluna obrigatória ausente: ${columns[key][0]}. Baixe o modelo CSV.`
      )
  }
  const seen = new Set<string>()
  const existing = new Map(
    existingEntries
      .filter((entry) => entry.externalId)
      .map((entry) => [entry.externalId, entry])
  )
  return rows.map((row, index) => {
    try {
      if (row.length !== header.length)
        throw new Error('Quantidade de colunas diferente do cabeçalho.')
      const get = (key: string) => (row[indexes[key]] ?? '').trim()
      const externalId = get('externalId')
      if (!externalId)
        throw new Error('ID externo obrigatório para evitar duplicados.')
      if (seen.has(externalId))
        throw new Error(`ID externo repetido: ${externalId}.`)
      seen.add(externalId)
      const previous = existing.get(externalId)
      if (previous) {
        const {
          id: _id,
          history: _history,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...recorded
        } = previous
        return recorded
      }
      const type = csvEnum(
        get('type'),
        {
          pagar: 'payable',
          'a pagar': 'payable',
          payable: 'payable',
          receber: 'receivable',
          'a receber': 'receivable',
          receivable: 'receivable',
        },
        'Tipo'
      )
      const category = csvEnum(
        get('category') || 'geral',
        {
          geral: 'general',
          general: 'general',
          equipe: 'team',
          team: 'team',
          dj: 'dj',
          influencer: 'influencer',
          influenciador: 'influencer',
          vendas: 'sales',
          'vendas zig': 'sales',
          sales: 'sales',
        },
        'Categoria'
      )
      const status = csvEnum(
        get('status') || 'pendente',
        {
          pendente: 'pending',
          pending: 'pending',
          pago: 'settled',
          recebido: 'settled',
          baixado: 'settled',
          settled: 'settled',
          cancelado: 'cancelled',
          cancelled: 'cancelled',
        },
        'Status'
      )
      const paymentMethod = get('paymentMethod')
        ? csvEnum(
            get('paymentMethod'),
            {
              dinheiro: 'cash',
              cash: 'cash',
              pix: 'pix',
              transferencia: 'transfer',
              transfer: 'transfer',
              cartao: 'card',
              card: 'card',
              outro: 'other',
              other: 'other',
            },
            'Forma de pagamento'
          )
        : ''
      const settledDate = get('settledDate')
        ? parseFinanceDate(get('settledDate'))
        : ''
      if (status === 'settled' && (!settledDate || !paymentMethod))
        throw new Error(
          'Lançamento baixado exige data da baixa e forma de pagamento.'
        )
      if (status !== 'settled' && (settledDate || paymentMethod))
        throw new Error(
          'Somente lançamentos baixados podem ter dados de pagamento.'
        )
      const description = get('description')
      if (!description) throw new Error('Descrição obrigatória.')
      let beneficiaryId = get('beneficiaryId')
      let counterparty = get('counterparty')
      if (category === 'sales' && type !== 'receivable')
        throw new Error('Vendas Zig devem ser contas a receber.')
      if (
        category === 'team' ||
        category === 'dj' ||
        category === 'influencer'
      ) {
        if (type !== 'payable')
          throw new Error('Equipe e DJs devem ser contas a pagar.')
        const matches = beneficiaries.filter(
          (person) =>
            person.kind === category &&
            (beneficiaryId
              ? person.id === beneficiaryId
              : normalize(person.name) === normalize(counterparty))
        )
        if (matches.length !== 1)
          throw new Error(
            'Profissional não encontrado ou nome ambíguo. Use o beneficiario_id exibido no painel.'
          )
        beneficiaryId = matches[0].id
        counterparty = matches[0].name
      } else if (beneficiaryId) {
        throw new Error('Esta categoria não deve ter beneficiario_id.')
      }
      if (!counterparty) throw new Error('Favorecido obrigatório.')
      return {
        externalId,
        type,
        category,
        description,
        counterparty,
        beneficiaryId,
        eventId: get('eventId'),
        amountCents: parseFinanceAmount(get('amount')),
        dueDate: parseFinanceDate(get('dueDate')),
        status,
        settledDate,
        paymentMethod,
        notes: get('notes'),
      }
    } catch (cause) {
      throw Object.assign(
        new Error(`Linha ${index + 2}: ${(cause as Error).message}`),
        { cause }
      )
    }
  })
}

export function financeReport(
  entries: FinanceEntry[],
  { from = '', to = '', eventId = '' } = {}
) {
  if (from) parseFinanceDate(from)
  if (to) parseFinanceDate(to)
  if (from && to && from > to)
    throw new Error('A data inicial deve preceder a final.')
  const inPeriod = (date: string) =>
    (!from || date >= from) && (!to || date <= to)
  const relevant = entries.filter(
    (entry) => !eventId || entry.eventId === eventId
  )
  const cash = relevant.filter(
    (entry) => entry.status === 'settled' && inPeriod(entry.settledDate)
  )
  const pending = relevant.filter(
    (entry) => entry.status === 'pending' && inPeriod(entry.dueDate)
  )
  const sum = (rows: FinanceEntry[], type: FinanceEntry['type']) =>
    rows.reduce((total, entry) => {
      const next = total + (entry.type === type ? entry.amountCents : 0)
      if (!Number.isSafeInteger(next))
        throw new Error('Total financeiro excede o limite seguro.')
      return next
    }, 0)
  const past = relevant.filter(
    (entry) => entry.status === 'settled' && from && entry.settledDate < from
  )
  const opening = sum(past, 'receivable') - sum(past, 'payable')
  const incoming = sum(cash, 'receivable')
  const outgoing = sum(cash, 'payable')
  const balance = BigInt(opening) + BigInt(incoming) - BigInt(outgoing)
  if (
    balance > BigInt(Number.MAX_SAFE_INTEGER) ||
    balance < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error('Saldo financeiro excede o limite seguro.')
  return {
    opening,
    incoming,
    outgoing,
    balance: Number(balance),
    payable: sum(pending, 'payable'),
    receivable: sum(pending, 'receivable'),
    team: sum(
      cash.filter((entry) => entry.category === 'team'),
      'payable'
    ),
    dj: sum(
      cash.filter((entry) => entry.category === 'dj'),
      'payable'
    ),
    cash,
  }
}

export function financeCsv(headers: string[], rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    let text = String(value)
    if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }
  return (
    '\uFEFF' +
    [headers, ...rows].map((row) => row.map(cell).join(';')).join('\r\n')
  )
}

export function financeTemplate() {
  return financeCsv(
    [
      'id_externo',
      'tipo',
      'categoria',
      'descricao',
      'favorecido',
      'valor',
      'vencimento',
      'status',
      'data_baixa',
      'forma_pagamento',
      'evento_id',
      'beneficiario_id',
      'observacoes',
    ],
    [
      [
        'planilha-001',
        'pagar',
        'geral',
        'Exemplo — substitua pelos seus dados',
        'Fornecedor',
        '150,00',
        '2026-10-25',
        'pendente',
        '',
        '',
        '',
        '',
        '',
      ],
    ]
  )
}
