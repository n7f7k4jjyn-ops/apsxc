const PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])

export function normalizeName(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function nameTokens(value) {
  return normalizeName(value).split(' ').filter((token) => token && !PARTICLES.has(token))
}

// 'exact' | 'compatible' | 'none'. Nomes de um só termo nunca são compatíveis.
export function compareNames(a, b) {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (ta.length < 2 || tb.length < 2) return 'none'
  if (ta.join(' ') === tb.join(' ')) return 'exact'
  if (ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1]) return 'compatible'
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  return short.every((token) => long.includes(token)) ? 'compatible' : 'none'
}

export function normalizePhone(raw) {
  const original = raw == null ? '' : String(raw)
  const trimmed = original.trim()
  const international = trimmed.startsWith('+') || trimmed.startsWith('00')
  let digits = original.replace(/\D/g, '')
  if (trimmed.startsWith('00')) digits = digits.slice(2)
  const base = { raw: original, digits, kind: 'invalid', ddi: '', ddd: '', number: '', key: '', weakKey: '' }
  if (!digits) return { ...base, kind: 'empty' }
  if (international && !digits.startsWith('55')) {
    return digits.length >= 8 && digits.length <= 15 ? { ...base, kind: 'international', key: `+${digits}` } : base
  }
  let national = digits
  let ddi = ''
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    ddi = '55'
    national = digits.slice(2)
  } else if (international) {
    return base
  }
  if (national.length === 8 || national.length === 9) return { ...base, kind: 'local', number: national }
  const ddd = national.slice(0, 2)
  const validDdd = Number(ddd) >= 11 && Number(ddd) <= 99
  const validLength = national.length === 10 || (national.length === 11 && national[2] === '9')
  if (!validDdd || !validLength) return base
  return { ...base, kind: 'br', ddi, ddd, number: national.slice(2), key: `55${national}`, weakKey: `${ddd}${national.slice(-8)}` }
}

function cpfValid(digits) {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false
  for (const length of [9, 10]) {
    let sum = 0
    for (let index = 0; index < length; index++) sum += Number(digits[index]) * (length + 1 - index)
    const check = ((sum * 10) % 11) % 10
    if (check !== Number(digits[length])) return false
  }
  return true
}

// Documentos que não passam na validação (ex.: 000.000.000-00) são ignorados: não unem nem conflitam.
export function normalizeDocument(raw) {
  const value = String(raw ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (!value) return { raw: String(raw ?? ''), value: '', kind: 'empty' }
  if (/^\d{11}$/.test(value)) return cpfValid(value) ? { raw: String(raw), value, kind: 'cpf' } : { raw: String(raw), value: '', kind: 'invalid' }
  if (/^\d{14}$/.test(value) && !/^(\d)\1{13}$/.test(value)) return { raw: String(raw), value, kind: 'cnpj' }
  if (value.length >= 6 && value.length <= 20 && !/^(.)\1+$/.test(value)) return { raw: String(raw), value, kind: 'other' }
  return { raw: String(raw), value: '', kind: 'invalid' }
}

export function maskDocument(value) {
  if (!value) return ''
  return `${'•'.repeat(Math.max(0, value.length - 2))}${value.slice(-2)}`
}

export function normalizeBirthdate(raw) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw ?? ''))
  if (!match) return ''
  const year = Number(match[1])
  if (year < 1900 || year > new Date().getUTCFullYear() || match[1] + match[2] + match[3] === '19000101') return ''
  return `${match[1]}-${match[2]}-${match[3]}`
}

const TABLE_NAME = /^(mesa|comanda|table|mesas|camarote|bistro)\b|\b(mesa|comanda)\s*\d+\b/i

export function classifyKind({ name, phone, document }) {
  const tableLike = TABLE_NAME.test(String(name ?? '').trim()) || /^\d+$/.test(String(name ?? '').trim())
  const identified = phone.kind !== 'empty' && phone.kind !== 'invalid' || Boolean(document.value)
  if (tableLike) return identified && phone.kind !== 'invalid' && document.value ? 'uncertain' : 'table'
  if (identified && nameTokens(name).length >= 1) return 'person'
  return 'uncertain'
}

export function parseInstant(value) {
  if (typeof value !== 'string' || !value) return null
  const naive = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(value)
  if (naive) return Date.UTC(+naive[1], +naive[2] - 1, +naive[3], +naive[4], +naive[5], +(naive[6] || 0))
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

// Premissas não confirmadas pela documentação Zig (check-ins não trazem eventId).
export const EVENT_WINDOW = { earlyHours: 4, maxDurationHours: 16 }

export function attributeToEvent(events, instantValue) {
  const time = parseInstant(instantValue)
  if (time === null) return { status: 'invalid_time', eventIds: [] }
  const hour = 3_600_000
  const candidates = events.filter((event) => event.beginMs !== null && time >= event.beginMs - EVENT_WINDOW.earlyHours * hour && time < event.beginMs + EVENT_WINDOW.maxDurationHours * hour)
  if (candidates.length === 1) return { status: 'assigned', eventIds: [candidates[0].id] }
  if (candidates.length === 0) return { status: 'outside', eventIds: [] }
  return { status: 'ambiguous', eventIds: candidates.map((event) => event.id) }
}

function sameCompat(a, b) {
  return compareNames(a, b) !== 'none'
}

function personFromCheckin(row) {
  return {
    zigId: row.id == null ? '' : String(row.id),
    name: String(row.name ?? '').trim(),
    phone: normalizePhone(row.phone),
    document: normalizeDocument(row.document),
    documentType: String(row.documentType ?? ''),
    email: '',
    birthdate: normalizeBirthdate(row.birthDate),
    isForeign: row.isForeign === true,
    sources: new Set(['checkin']),
    eventIds: new Set(),
    checkins: 0,
    unassigned: 0,
    ambiguousEvents: 0,
  }
}

export function buildZigPeople(checkins, buyers, events) {
  const people = []
  const byId = new Map()
  for (const row of checkins) {
    const id = row.id == null ? '' : String(row.id)
    let person = id ? byId.get(id) : null
    if (!person) {
      person = personFromCheckin(row)
      people.push(person)
      if (id) byId.set(id, person)
    }
    if (!person.document.value) person.document = normalizeDocument(row.document)
    if (!person.birthdate) person.birthdate = normalizeBirthdate(row.birthDate)
    person.checkins++
    const attribution = attributeToEvent(events, row.checkinTime)
    if (attribution.status === 'assigned') attribution.eventIds.forEach((eventId) => person.eventIds.add(eventId))
    else if (attribution.status === 'ambiguous') person.ambiguousEvents++
    else person.unassigned++
  }
  for (const row of buyers) {
    const phone = normalizePhone(row.userPhone)
    const document = normalizeDocument(row.userDocument)
    const name = String(row.userName ?? '').trim()
    const matches = people.filter((person) =>
      (document.value && person.document.value === document.value && (!name || !person.name || sameCompat(name, person.name) || !nameTokens(name).length)) ||
      (phone.key && person.phone.key === phone.key && sameCompat(name, person.name)))
    let person = matches.length === 1 ? matches[0] : null
    if (!person) {
      person = {
        zigId: '', name, phone, document, documentType: String(row.userDocumentType ?? ''), email: '', birthdate: '', isForeign: false,
        sources: new Set(), eventIds: new Set(), checkins: 0, unassigned: 0, ambiguousEvents: 0,
      }
      people.push(person)
    }
    person.sources.add('buyer')
    if (!person.email && typeof row.userEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.userEmail.trim())) person.email = row.userEmail.trim().toLowerCase()
    if (!person.birthdate) person.birthdate = normalizeBirthdate(row.userBirthdate)
    if (!person.document.value) person.document = document
    const attribution = attributeToEvent(events, row.date)
    if (attribution.status === 'assigned') attribution.eventIds.forEach((eventId) => person.eventIds.add(eventId))
  }
  return people
}

function addTo(map, key, value) {
  if (!key) return
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

// Entidades existentes: um cliente = uma entidade; inscrições das listas são agrupadas por telefone e nome.
export function buildExistingEntities(customers, registrations) {
  const entities = []
  for (const customer of customers) {
    if (!customer || typeof customer !== 'object') continue
    const phones = [customer.phone, customer.whatsapp, ...(Array.isArray(customer.phoneAlternates) ? customer.phoneAlternates : [])].filter(Boolean).map(normalizePhone)
    entities.push({
      source: 'customer',
      id: String(customer.id ?? ''),
      names: [customer.name, ...(Array.isArray(customer.nameVariants) ? customer.nameVariants : [])].filter((name) => typeof name === 'string' && name.trim()),
      phones,
      document: normalizeDocument(customer.cpf ?? customer.document),
      emails: [customer.email, ...(Array.isArray(customer.emailAlternates) ? customer.emailAlternates : [])].filter((email) => typeof email === 'string' && email.trim()),
      birthdate: String(customer.birthday ?? customer.birthDate ?? '').trim(),
      hasDocument: Boolean(String(customer.cpf ?? customer.document ?? '').trim()),
      lists: [],
    })
  }
  const groups = new Map()
  for (const row of registrations) {
    if (!row || typeof row !== 'object') continue
    const phone = normalizePhone(row.whatsapp || row.phone)
    const key = `${phone.key || phone.digits || String(row.email || '').toLowerCase() || `id:${row.id}`}|${normalizeName(row.name)}`
    let entity = groups.get(key)
    if (!entity) {
      entity = { source: 'registration', id: String(row.id ?? ''), names: [], phones: phone.kind === 'empty' ? [] : [phone], document: { value: '', kind: 'empty' }, emails: [], birthdate: '', hasDocument: false, lists: [], ids: [] }
      groups.set(key, entity)
      entities.push(entity)
    }
    if (row.name && !entity.names.includes(row.name)) entity.names.push(row.name)
    if (row.email && !entity.emails.includes(row.email)) entity.emails.push(row.email)
    const list = [row.formKey, row.eventName].filter(Boolean).join(' · ')
    if (list && !entity.lists.includes(list)) entity.lists.push(list)
    entity.ids.push(String(row.id ?? ''))
  }
  return entities
}

function entityCompat(person, entity) {
  return entity.names.some((name) => sameCompat(person.name, name))
}

function entitiesConflict(a, b) {
  return !a.names.some((x) => b.names.some((y) => sameCompat(x, y)))
}

export function matchPeople(zigPeople, existing, { lojaId = '' } = {}) {
  const byPhone = new Map()
  const byWeak = new Map()
  const byDocument = new Map()
  const byName = new Map()
  for (const entity of existing) {
    for (const phone of entity.phones) {
      addTo(byPhone, phone.key, entity)
      addTo(byWeak, phone.weakKey, entity)
    }
    addTo(byDocument, entity.document.value, entity)
    for (const name of entity.names) {
      const joined = nameTokens(name).join(' ')
      if (nameTokens(name).length >= 2) addTo(byName, joined, entity)
    }
  }
  const unique = (list) => [...new Set(list)]
  const zigPhoneUsers = new Map()
  const zigDocumentUsers = new Map()
  for (const person of zigPeople) {
    addTo(zigPhoneUsers, person.phone.key, person)
    addTo(zigDocumentUsers, person.document.value, person)
  }

  const result = { linked: [], created: [], divergent: [], tables: [] }
  for (const person of zigPeople) {
    const entry = {
      zigId: person.zigId || null,
      name: person.name,
      phone: { raw: person.phone.raw, kind: person.phone.kind, normalized: person.phone.key || null, ddd: person.phone.ddd || null },
      document: person.document.value ? { kind: person.document.kind, masked: maskDocument(person.document.value) } : null,
      email: person.email || null,
      birthdate: person.birthdate || null,
      sources: [...person.sources],
      eventIds: [...person.eventIds],
      checkins: person.checkins,
      kind: classifyKind(person),
      matches: [],
      suggestedFills: [],
      reasons: [],
      notes: [],
      plannedLink: person.zigId ? { system: 'zig', id: person.zigId, lojaId: lojaId || null } : null,
      provenance: { system: 'zig', endpoints: person.sources.has('checkin') ? (person.sources.has('buyer') ? ['checkins', 'compradores'] : ['checkins']) : ['compradores'] },
    }
    if (person.unassigned) entry.notes.push(`${person.unassigned} check-in(s) fora da janela dos eventos consultados.`)
    if (person.ambiguousEvents) entry.notes.push(`${person.ambiguousEvents} check-in(s) com evento ambíguo.`)
    if (person.phone.kind === 'local') entry.notes.push('Telefone sem DDD: não foi usado para vínculo.')
    if (person.phone.kind === 'invalid') entry.notes.push('Telefone inválido: não foi usado para vínculo.')
    if (person.document.kind === 'invalid') entry.notes.push('Documento inválido: ignorado.')

    if (entry.kind === 'table') {
      entry.reasons.push('table_tab')
      result.tables.push(entry)
      continue
    }
    const diverge = (reason, entities = []) => {
      entry.reasons.push(reason)
      entry.matches = entities.map(describeEntity)
      result.divergent.push(entry)
    }
    if (entry.kind === 'uncertain') {
      diverge('uncertain_kind')
      continue
    }

    const phoneEntities = unique(person.phone.key ? byPhone.get(person.phone.key) || [] : [])
    const documentEntities = unique(person.document.value ? byDocument.get(person.document.value) || [] : [])
    const sharedOnZig = person.phone.key && (zigPhoneUsers.get(person.phone.key) || []).some((other) => other !== person && entityNameConflict(person, other))
    const duplicatedDocument = person.document.value && (zigDocumentUsers.get(person.document.value) || []).some((other) => other !== person && other.zigId && person.zigId && other.zigId !== person.zigId)
    const candidates = unique([...phoneEntities, ...documentEntities])
    const compatible = candidates.filter((entity) => entityCompat(person, entity))
    const sharedExisting = phoneEntities.some((a) => phoneEntities.some((b) => a !== b && entitiesConflict(a, b)))

    if (sharedOnZig || sharedExisting) { diverge('shared_phone', phoneEntities); continue }
    if (duplicatedDocument) { diverge('zig_duplicate_document', candidates); continue }
    const conflicting = compatible.filter((entity) => entity.document.value && person.document.value && entity.document.value !== person.document.value)
    if (conflicting.length) { diverge('document_conflict', conflicting); continue }
    const customers = compatible.filter((entity) => entity.source === 'customer')
    if (customers.length > 1) { diverge('multiple_matches', compatible); continue }
    if (compatible.length) {
      entry.matches = compatible.map((entity) => ({ ...describeEntity(entity), basis: documentEntities.includes(entity) && !phoneEntities.includes(entity) ? 'document+name' : 'phone+name', nameMatch: bestMatch(person.name, entity.names) }))
      const customer = customers[0]
      if (customer) entry.suggestedFills = suggestFills(person, customer)
      else entry.notes.push('Vínculo apenas com inscrições das listas; sem campos de documento/nascimento para preencher.')
      result.linked.push(entry)
      continue
    }
    if (candidates.length) { diverge(phoneEntities.length ? 'phone_name_mismatch' : 'document_name_mismatch', candidates); continue }
    const weak = unique(person.phone.weakKey ? byWeak.get(person.phone.weakKey) || [] : []).filter((entity) => entityCompat(person, entity))
    if (weak.length) { diverge('possible_phone_variant', weak); continue }
    const sameName = unique(byName.get(nameTokens(person.name).join(' ')) || [])
    if (sameName.length) { diverge('name_only', sameName); continue }
    result.created.push(entry)
  }
  return result
}

function entityNameConflict(a, b) {
  return compareNames(a.name, b.name) === 'none'
}

function bestMatch(name, names) {
  return names.some((candidate) => compareNames(name, candidate) === 'exact') ? 'exact' : 'compatible'
}

function describeEntity(entity) {
  return { source: entity.source, id: entity.id, name: entity.names[0] || '', lists: entity.lists.slice(0, 5) }
}

function suggestFills(person, customer) {
  const fills = []
  if (person.document.value && !customer.hasDocument) fills.push({ field: 'documento', value: maskDocument(person.document.value), existing: null })
  if (person.email && !customer.emails.length) fills.push({ field: 'email', value: person.email, existing: null })
  if (person.birthdate && !customer.birthdate) fills.push({ field: 'nascimento', value: person.birthdate, existing: null })
  return fills
}

export function summarize(groups) {
  const countBy = (list, pick) => list.reduce((acc, item) => { for (const key of pick(item)) acc[key] = (acc[key] || 0) + 1; return acc }, {})
  const fills = countBy(groups.linked, (entry) => entry.suggestedFills.map((fill) => fill.field))
  return {
    linked: groups.linked.length,
    created: groups.created.length,
    divergent: groups.divergent.length,
    tables: groups.tables.length,
    divergenceReasons: countBy(groups.divergent, (entry) => entry.reasons),
    fillableFields: fills,
  }
}
