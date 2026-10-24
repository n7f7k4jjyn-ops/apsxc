import type { VerdantState, Person } from './data'
import type { FinanceData, FinanceDraft } from './finance-data'

type Source = { file: string; sheet: string; row: number }
type ImportedPerson = {
  id: string
  name: string
  phone: string
  pixKey: string
  beneficiary: string
  conflicts?: string[]
}
type Gig = {
  id: string
  personId: string
  name: string
  date: string
  event: string
  track: string
  order: number
  time: string
  financialReview: string[]
  sources: Source[]
}
export type ImportedTeam = {
  name: string
  whatsapp: string
  roles: string[]
  availability: string[]
  experience: string
  createdAt: string
}
export type ProductionBundle = {
  schemaVersion: 1
  people: ImportedPerson[]
  team: ImportedTeam[]
  engagements: Gig[]
  finance: (Omit<FinanceDraft, 'beneficiaryId' | 'eventId' | 'counterparty'> & {
    personId: string
    eventKey: string
  })[]
}
export const normalizedName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
const phone = (s: string) =>
  s.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
const eventKey = (date: string, name: string) =>
  `${date}|${normalizedName(name)}`

// Remove display-only weekday/date prefixes; never match two different dates.
export function productionEventName(name: string) {
  const plain = normalizedName(name)
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '')
    .replace(
      /^(domingo|segunda|terca|quarta|quinta|sexta|sabado)(-feira)?\s*[·:—-]?\s*/,
      ''
    )
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const aliases: Record<string, string> = {
    'festa do pijama': 'pijama',
    skyland: 'ascension',
    'skyland ascension': 'ascension',
    'terashima ascension': 'ascension',
  }
  return aliases[plain] || plain
}
export type ProductionEventBindings = Record<string, string>

export function readProductionBundle(input: unknown): ProductionBundle {
  const b = input as ProductionBundle
  const string = (v: unknown, max = 500) =>
    typeof v === 'string' &&
    v.length <= max &&
    ![...v].some(
      (c) => c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0))
    )
  const day = (v: unknown) =>
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  if (
    !b ||
    b.schemaVersion !== 1 ||
    !['people', 'team', 'engagements', 'finance'].every(
      (k) =>
        Array.isArray(b[k as keyof ProductionBundle]) &&
        (b[k as keyof ProductionBundle] as unknown[]).length <= 20000
    )
  )
    throw new Error('Pacote de produção inválido ou muito grande.')
  if (
    !b.people.every(
      (p) =>
        p &&
        ['id', 'name', 'phone', 'pixKey', 'beneficiary'].every((k) =>
          string(p[k as keyof ImportedPerson])
        ) &&
        p.id &&
        p.name.trim()
    )
  )
    throw new Error('Cadastro de DJ inválido.')
  if (
    new Set(b.people.map((p) => p.id)).size !== b.people.length ||
    new Set(b.people.map((p) => normalizedName(p.name))).size !==
      b.people.length
  )
    throw new Error('DJs repetidos no pacote.')
  const people = new Set(b.people.map((p) => p.id))
  if (
    !b.engagements.every(
      (g) =>
        g &&
        string(g.id) &&
        people.has(g.personId) &&
        day(g.date) &&
        string(g.event) &&
        string(g.track, 100) &&
        string(g.time) &&
        Number.isSafeInteger(g.order) &&
        Array.isArray(g.financialReview)
    )
  )
    throw new Error('Apresentação inválida.')
  if (new Set(b.engagements.map((g) => g.id)).size !== b.engagements.length)
    throw new Error('Apresentações repetidas.')
  if (
    !b.team.every(
      (t) =>
        t &&
        string(t.name, 160) &&
        string(t.whatsapp, 50) &&
        /^\d{10,11}$/.test(phone(t.whatsapp)) &&
        Array.isArray(t.roles) &&
        t.roles.length &&
        t.roles.every((r) =>
          [
            'Caixa',
            'Bar',
            'Limpeza',
            'Segurança',
            'Cozinha',
            'Bombeiro',
          ].includes(r)
        ) &&
        Array.isArray(t.availability) &&
        t.availability.length &&
        t.availability.every((d) =>
          ['Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'].includes(d)
        ) &&
        string(t.experience, 4000)
    )
  )
    throw new Error(
      'Equipe com telefone, função ou disponibilidade inválida; revise o pacote.'
    )
  if (
    !b.finance.every(
      (f) =>
        f &&
        string(f.externalId, 160) &&
        people.has(f.personId) &&
        string(f.eventKey) &&
        f.category === 'dj' &&
        f.type === 'payable' &&
        Number.isSafeInteger(f.amountCents) &&
        f.amountCents > 0 &&
        day(f.dueDate) &&
        string(f.description) &&
        string(f.notes, 5000) &&
        ((f.status === 'pending' &&
          f.settledDate === '' &&
          f.paymentMethod === '') ||
          (f.status === 'settled' &&
            day(f.settledDate) &&
            f.paymentMethod === 'other'))
    )
  )
    throw new Error('Lançamento inválido.')
  const gigs = new Map(b.engagements.map((g) => [g.id, g]))
  if (
    new Set(b.finance.map((f) => f.externalId)).size !== b.finance.length ||
    b.finance.some((f) => {
      const g = gigs.get(f.externalId)
      return (
        !g ||
        g.financialReview.length ||
        g.personId !== f.personId ||
        eventKey(g.date, g.event) !== f.eventKey
      )
    })
  )
    throw new Error('Lançamento sem apresentação conciliada.')
  return b
}

export function planProductionImport(
  bundle: ProductionBundle,
  state: VerdantState,
  team: ImportedTeam[],
  finance: FinanceData,
  bindings: ProductionEventBindings = {},
  createHistoricalEvents = false
) {
  const next = structuredClone(state)
  const issues: string[] = []
  const mapped = new Map<string, Person>()
  const eventIds = new Map<string, string>()
  let newPeople = 0,
    newEvents = 0
  for (const source of bundle.people) {
    if (source.conflicts?.length) {
      issues.push(
        `Dados divergentes nas fontes para ${source.name}; cadastro separado para revisão.`
      )
      continue
    }
    const matches = next.people.filter(
      (p) =>
        p.kind === 'DJ' &&
        normalizedName(p.name) === normalizedName(source.name)
    )
    if (
      matches.length > 1 ||
      (matches.length === 1 &&
        matches[0].phone &&
        source.phone &&
        phone(matches[0].phone) !== phone(source.phone))
    ) {
      issues.push(`DJ ambíguo ou telefone divergente: ${source.name}`)
      continue
    }
    const p: Person = matches[0] || {
      id: source.id,
      kind: 'DJ',
      name: source.name,
      phone: source.phone,
      email: '',
      instagram: '',
      notes: 'Cadastro histórico importado de planilhas.',
      active: false,
      eventIds: [],
      eventDetails: {},
    }
    if (!matches.length) {
      next.people.push(p)
      newPeople++
    }
    if (!p.phone) p.phone = source.phone
    if (p.pixKey && source.pixKey && p.pixKey !== source.pixKey) {
      issues.push(`Pix divergente: ${source.name}`)
      continue
    }
    if (!p.pixKey) p.pixKey = source.pixKey
    if (!p.beneficiaryName) p.beneficiaryName = source.beneficiary
    mapped.set(source.id, p)
  }
  const eventBindings: {
    key: string
    date: string
    name: string
    candidates: { id: string; name: string }[]
  }[] = []
  const gigMap = new Map<string, Gig>()
  for (const gig of bundle.engagements) {
    gigMap.set(gig.id, gig)
    const key = eventKey(gig.date, gig.event)
    if (!eventIds.has(key)) {
      const lookup = eventKey(gig.date, gig.event || 'Programação histórica')
      const sameDay = next.events.filter((e) => e.date === gig.date)
      const selected = bindings[key]
      if (selected && !sameDay.some((event) => event.id === selected))
        throw new Error(
          `Vínculo de evento inválido: ${gig.date} — ${gig.event}`
        )
      const matches = selected
        ? sameDay.filter((event) => event.id === selected)
        : sameDay.filter(
            (e) =>
              eventKey(e.date, e.name) === lookup ||
              (productionEventName(gig.event) &&
                productionEventName(e.name) === productionEventName(gig.event))
          )
      if (
        matches.length > 1 ||
        (!matches.length &&
          !createHistoricalEvents &&
          state.events.some((e) => e.date === gig.date))
      ) {
        if (!eventBindings.some((row) => row.key === key))
          eventBindings.push({
            key,
            date: gig.date,
            name: gig.event || 'Sem nome',
            candidates: sameDay.map(({ id, name }) => ({ id, name })),
          })
        issues.push(
          `Evento precisa de vínculo manual: ${gig.date} — ${gig.event || 'sem nome'}`
        )
        continue
      }
      const event = matches[0] || {
        id: `sheet-event-${gig.id.slice('sheet-gig-'.length)}`,
        date: gig.date,
        name: gig.event || 'Programação histórica',
        eventTime: '',
        entryValue: '',
        active: false,
      }
      if (!matches.length) {
        next.events.push(event)
        newEvents++
      }
      eventIds.set(key, event.id)
    }
    const p = mapped.get(gig.personId),
      eventId = eventIds.get(key)
    if (!p || !eventId) continue
    if (!p.eventIds.includes(eventId)) p.eventIds.push(eventId)
    if (!p.eventDetails[eventId])
      p.eventDetails[eventId] = {
        track: gig.track,
        time: gig.time,
        order: gig.order,
      }
    else {
      const detail = p.eventDetails[eventId]
      const key = (track: string) => normalizedName(track)
      if (
        key(detail.track) !== key(gig.track) &&
        !(detail.additionalSets || []).some(
          (set) => key(set.track) === key(gig.track)
        )
      ) {
        detail.additionalSets = [
          ...(detail.additionalSets || []),
          { track: gig.track, time: gig.time, order: gig.order },
        ]
      }
    }
  }
  const existing = new Set(finance.entries.map((e) => e.externalId))
  const entries: FinanceDraft[] = []
  let skipped = 0
  for (const source of bundle.finance) {
    const p = mapped.get(source.personId),
      eventId = eventIds.get(source.eventKey)
    if (existing.has(source.externalId)) {
      skipped++
      continue
    }
    // Also protect against earlier manually entered accounts without an import ID.
    const g = gigMap.get(source.externalId)!
    const similar = finance.entries.some(
      (e) =>
        e.type === 'payable' &&
        e.status !== 'cancelled' &&
        (e.beneficiaryId === `dj:${p?.id}` ||
          normalizedName(e.counterparty) ===
            normalizedName(p?.name || g.name)) &&
        (e.eventId === eventId || e.dueDate === g.date)
    )
    if (!p || !eventId || similar) {
      issues.push(`Pagamento exige conferência: ${g.date} — ${g.name}`)
      continue
    }
    const { personId: _personId, eventKey: _key, ...draft } = source
    entries.push({
      ...draft,
      counterparty: p.name,
      beneficiaryId: `dj:${p.id}`,
      eventId,
    })
  }
  const teamToCreate = bundle.team.filter((t) => {
    if (
      bundle.team.some(
        (other) =>
          other !== t &&
          (normalizedName(other.name) === normalizedName(t.name) ||
            phone(other.whatsapp) === phone(t.whatsapp))
      )
    ) {
      issues.push(`Equipe duplicada ou ambígua no pacote: ${t.name}`)
      return false
    }
    const same = team.filter(
      (e) =>
        normalizedName(e.name) === normalizedName(t.name) ||
        phone(e.whatsapp) === phone(t.whatsapp)
    )
    if (
      same.length &&
      !same.some(
        (e) =>
          normalizedName(e.name) === normalizedName(t.name) &&
          phone(e.whatsapp) === phone(t.whatsapp)
      )
    )
      issues.push(`Equipe exige conferência: ${t.name}`)
    return !same.length
  })
  return {
    eventBindings,
    state: next,
    teamToCreate,
    entries,
    issues: [...new Set(issues)],
    newPeople,
    newEvents,
    skipped,
    sourceReview: bundle.engagements.filter((g) => g.financialReview.length)
      .length,
  }
}
