export type ImportedCustomer = {
  sourceId: string
  name: string
  cpf: string
  email: string
  phone: string
  birthday: string
  presenceCount: number
  firstEntryAt: string
  lastVisitAt: string
  availableBalance: number
  consumption: number
  sourceEventId: string
  firstInteractionAt: string
  qualityFlags: string[]
  sourceSystems?: string
  sourceIdentifiers?: string
  nameVariants?: string
  emailAlternates?: string
  phoneAlternates?: string
  gender?: string
  appActive?: string
  firstUse?: string
  registrationLists?: string
  registrationCount?: number
  matchBasis?: string
}

const normHeader = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const digits = (value: string) => value.replace(/\D/g, '')

export function isValidCpf(value: string) {
  const cpf = digits(value)
  if (cpf.length !== 11 || /^([0-9])\1+$/.test(cpf)) return false
  const check = (length: number) => {
    const sum = [...cpf.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0)
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10])
}

export function parseExcelDate(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const millis = (Number(trimmed) - 25569) * 86400000
    const date = new Date(millis)
    if (!Number.isFinite(date.getTime())) return ''
    return date.toISOString().slice(0, trimmed.includes('.') ? 16 : 10)
  }
  const dmy = trimmed.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})(.*)$/)
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    const month = Number(dmy[2]); const day = Number(dmy[1]); const yearNumber = Number(year)
    const check = new Date(Date.UTC(yearNumber, month - 1, day))
    if (month < 1 || month > 12 || day < 1 || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return ''
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}${dmy[4] ? `T${dmy[4].trim()}` : ''}`
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?$/)
  if (!iso) return ''
  const check = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
  if (check.getUTCMonth() !== Number(iso[2]) - 1 || check.getUTCDate() !== Number(iso[3])) return ''
  return `${iso[1]}-${iso[2]}-${iso[3]}${iso[4] ? `T${iso[4].slice(0, 5)}` : ''}`
}

function numberValue(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseCsv(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++ }
    else if (char === '"') quoted = !quoted
    else if (char === delimiter && !quoted) { row.push(cell); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

function columnIndex(reference: string) {
  const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? 'A'
  return [...letters].reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1
}

function xmlDecode(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const point = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10)
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[code.toLowerCase()] ?? entity
  })
}

function xmlAttribute(attributes: string, name: string) {
  return attributes.match(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, 'i'))?.[1] ?? ''
}

function xmlTextElements(xml: string, tag: string) {
  const items: string[] = []
  const expression = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  for (const match of xml.matchAll(expression)) {
    const text = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((part) => xmlDecode(part[1])).join('')
    items.push(text)
  }
  return items
}

async function unzipText(bytes: Uint8Array, entryName: string, optional = false) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new Error('O arquivo não parece ser um Excel .xlsx válido.')
  const entries = view.getUint16(end + 10, true)
  let cursor = view.getUint32(end + 16, true)
  for (let index = 0; index < entries; index++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Estrutura do Excel inválida.')
    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    if (name === entryName) {
      const localNameLength = view.getUint16(localOffset + 26, true)
      const localExtraLength = view.getUint16(localOffset + 28, true)
      const start = localOffset + 30 + localNameLength + localExtraLength
      const compressed = bytes.slice(start, start + compressedSize)
      if (method === 0) return new TextDecoder().decode(compressed)
      if (method !== 8) throw new Error('Este formato de compactação do Excel não é compatível.')
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return new TextDecoder().decode(await new Response(stream).arrayBuffer())
    }
    cursor += 46 + nameLength + extraLength + commentLength
  }
  if (optional) return ''
  throw new Error(`A aba de dados do Excel não foi encontrada (${entryName}).`)
}

function worksheetRows(sheetXml: string, shared: string[]) {
  const rows: string[][] = []
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const cells: string[] = []
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi)) {
      const attributes = cellMatch[1]
      const content = cellMatch[2] ?? ''
      const ref = xmlAttribute(attributes, 'r') || 'A1'
      const index = columnIndex(ref)
      const type = xmlAttribute(attributes, 't')
      const value = xmlDecode(content.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? '')
      cells[index] = type === 's' ? shared[Number(value)] ?? '' : type === 'inlineStr' ? [...content.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((part) => xmlDecode(part[1])).join('') : value
    }
    rows.push(cells.map((value) => value ?? ''))
  }
  return rows
}

function normalizeZipPath(target: string) {
  const parts = target.startsWith('/') ? [] : ['xl']
  for (const segment of target.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return parts.join('/')
}

export async function readWorkbookSheets(file: File) {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Selecione um arquivo .xlsx.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sharedXml = await unzipText(bytes, 'xl/sharedStrings.xml', true)
  const shared = sharedXml ? xmlTextElements(sharedXml, 'si') : []
  const workbookXml = await unzipText(bytes, 'xl/workbook.xml', true)
  if (!workbookXml) {
    return { '': worksheetRows(await unzipText(bytes, 'xl/worksheets/sheet1.xml'), shared) }
  }
  const relationshipsXml = await unzipText(bytes, 'xl/_rels/workbook.xml.rels')
  const targets = new Map<string, string>()
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*?)\/?>/gi)) {
    targets.set(xmlAttribute(match[1], 'Id'), normalizeZipPath(xmlAttribute(match[1], 'Target')))
  }
  const sheets: Record<string, string[][]> = {}
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*?)\/?>/gi)) {
    const name = xmlDecode(xmlAttribute(match[1], 'name'))
    const target = targets.get(xmlAttribute(match[1], 'r:id'))
    if (!name || !target) continue
    sheets[name] = worksheetRows(await unzipText(bytes, target), shared)
  }
  if (!Object.keys(sheets).length) throw new Error('O arquivo Excel não contém abas de dados legíveis.')
  return sheets
}

async function parseXlsx(file: File) {
  const sheets = await readWorkbookSheets(file)
  return Object.values(sheets)[0] ?? []
}

const columnAliases: Record<string, string[]> = {
  identificador: ['identificador', 'customerkey', 'customerid', 'idcliente', 'id'],
  nome: ['nome', 'name', 'fullname', 'nomecompleto'],
  cpf: ['cpf', 'documento'],
  email: ['email', 'e-mail'],
  telefone: ['telefone', 'phone', 'whatsapp', 'celular'],
  aniversario: ['aniversario', 'birthday', 'nascimento', 'datadenascimento'],
  presencas: ['presencas', 'presencecount', 'visitas', 'visitcount'],
  primeiraentradanolocal: ['primeiraentradanolocal', 'firstentryat', 'firstentry', 'primeiraentrada'],
  ultimavisita: ['ultimavisita', 'lastvisitat', 'lastvisit'],
  saldodisponivel: ['saldodisponivel', 'availablebalance', 'saldo'],
  consumo: ['consumo', 'consumption'],
  idevento: ['idevento', 'iddoevento', 'sourceeventid', 'eventid'],
  primeirainteracao: ['primeirainteracao', 'firstinteractionat', 'firstinteraction'],
  qualityflags: ['qualityflags', 'sinalizadores', 'observacoes'],
  sourcesystems: ['sourcesystems'],
  sourceidentifiers: ['sourceidentifiers'],
  namevariants: ['namevariants'],
  emailalternates: ['emailalternates'],
  phonealternates: ['phonealternates'],
  gender: ['gender', 'genero'],
  appactive: ['appactive'],
  firstuse: ['firstuse'],
  registrationlists: ['registrationlists', 'listasdeinscricao'],
  registrationcount: ['registrationcount'],
  matchbasis: ['matchbasis'],
}
const fieldAny = (row: string[], headers: string[], name: string) => {
  const aliases = columnAliases[name] ?? [name]
  const index = headers.findIndex((value) => aliases.includes(normHeader(value)))
  return index < 0 ? '' : String(row[index] ?? '').trim()
}

export async function readCustomerImport(file: File) {
  const rows = file.name.toLowerCase().endsWith('.csv')
    ? parseCsv(await file.text())
    : file.name.toLowerCase().endsWith('.xlsx')
      ? await parseXlsx(file)
      : (() => { throw new Error('Selecione um arquivo .xlsx ou .csv.') })()
  const headers = (rows.shift() ?? []).map((value) => String(value).replace(/^\uFEFF/, '').trim())
  const missing = ['identificador', 'nome'].filter((name) => !headers.some((header) => (columnAliases[name] ?? [name]).includes(normHeader(header))))
  if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.map((name) => name === 'identificador' ? 'identificador/customer_key' : 'nome/name').join(', ')}.`)
  const customers: ImportedCustomer[] = []
  let skipped = 0
  for (const row of rows) {
    if (!row.some((cell) => String(cell ?? '').trim())) continue
    const sourceId = fieldAny(row, headers, 'identificador')
    const name = fieldAny(row, headers, 'nome')
    if (!sourceId || !name) { skipped++; continue }
    const cpf = fieldAny(row, headers, 'cpf')
    const email = fieldAny(row, headers, 'email').toLowerCase()
    const phone = fieldAny(row, headers, 'telefone')
    const birthdayRaw = fieldAny(row, headers, 'aniversario')
    const birthday = parseExcelDate(birthdayRaw)
    const digitsOnly = digits(phone)
    const phoneLengthValid = [10, 11].includes(digitsOnly.length) || (digitsOnly.startsWith('55') && [12, 13].includes(digitsOnly.length))
    const qualityFlags: string[] = fieldAny(row, headers, 'qualityflags').split(/[;|]/).map((flag) => flag.trim()).filter(Boolean)
    if (cpf && !isValidCpf(cpf)) qualityFlags.push('CPF para revisão')
    if (birthdayRaw && !birthday) qualityFlags.push('Aniversário para revisão')
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) qualityFlags.push('E-mail para revisão')
    if (phone && !phoneLengthValid) qualityFlags.push('WhatsApp para revisão')
    customers.push({
      sourceId, name, cpf, email, phone,
      birthday,
      presenceCount: Math.max(0, Math.trunc(numberValue(fieldAny(row, headers, 'presencas')))),
      firstEntryAt: parseExcelDate(fieldAny(row, headers, 'primeiraentradanolocal')),
      lastVisitAt: parseExcelDate(fieldAny(row, headers, 'ultimavisita')),
      availableBalance: Math.max(0, numberValue(fieldAny(row, headers, 'saldodisponivel'))),
      consumption: Math.max(0, numberValue(fieldAny(row, headers, 'consumo'))),
      sourceEventId: fieldAny(row, headers, 'idevento'),
      firstInteractionAt: parseExcelDate(fieldAny(row, headers, 'primeirainteracao')),
      qualityFlags,
      sourceSystems: fieldAny(row, headers, 'sourcesystems'),
      sourceIdentifiers: fieldAny(row, headers, 'sourceidentifiers'),
      nameVariants: fieldAny(row, headers, 'namevariants'),
      emailAlternates: fieldAny(row, headers, 'emailalternates'),
      phoneAlternates: fieldAny(row, headers, 'phonealternates'),
      gender: fieldAny(row, headers, 'gender'),
      appActive: fieldAny(row, headers, 'appactive'),
      firstUse: fieldAny(row, headers, 'firstuse'),
      registrationLists: fieldAny(row, headers, 'registrationlists'),
      registrationCount: Math.max(0, Math.trunc(numberValue(fieldAny(row, headers, 'registrationcount')))),
      matchBasis: fieldAny(row, headers, 'matchbasis'),
    })
  }
  const sourceIds = new Set<string>()
  const cpfs = new Set<string>()
  const contacts = new Map<string, number[]>()
  let duplicateRows = 0
  customers.forEach((customer, customerIndex) => {
    const cpfKey = isValidCpf(customer.cpf) ? digits(customer.cpf) : ''
    const nameKey = normHeader(customer.name)
    const emailKey = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email) ? customer.email : ''
    const rawPhoneDigits = digits(customer.phone)
    const phoneKey = [10, 11].includes(rawPhoneDigits.length) || (rawPhoneDigits.startsWith('55') && [12, 13].includes(rawPhoneDigits.length)) ? rawPhoneDigits : ''
    const contactKey = emailKey && phoneKey ? `${nameKey}|${emailKey}|${phoneKey}` : ''
    if (sourceIds.has(customer.sourceId) || (cpfKey && cpfs.has(cpfKey))) duplicateRows++
    sourceIds.add(customer.sourceId)
    if (cpfKey) cpfs.add(cpfKey)
    if (contactKey) contacts.set(contactKey, [...(contacts.get(contactKey) ?? []), customerIndex])
  })
  let possibleDuplicateRows = 0
  for (const indices of contacts.values()) {
    if (indices.length < 2) continue
    possibleDuplicateRows += indices.length - 1
    indices.forEach((index) => customers[index].qualityFlags.push('Possível duplicidade'))
  }
  return { customers, skipped, duplicateRows, possibleDuplicateRows, headers }
}
