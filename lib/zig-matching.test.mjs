import assert from 'node:assert/strict'
import test from 'node:test'
import { attributeToEvent, buildExistingEntities, buildZigPeople, compareNames, matchPeople, normalizeDocument, normalizePhone, parseInstant } from './zig-matching.mjs'
import { buildZigPreview } from './zig-preview.mjs'

const events = [{ id: 'E1', name: 'Noite', beginAt: '2026-10-23T22:00:00', beginMs: parseInstant('2026-10-23T22:00:00') }]
const CPF = '529.982.247-25'

function run({ checkins = [], buyers = [], customers = [], registrations = [] }) {
  const people = buildZigPeople(checkins, buyers, events)
  return matchPeople(people, buildExistingEntities(customers, registrations), { lojaId: 'L1' })
}
const checkin = (extra) => ({ id: 'z1', checkinTime: '2026-10-23T23:30:00', name: 'Maria Souza', document: '', phone: '+55 41 99999-1111', birthDate: null, ...extra })

test('normaliza telefone sem inventar dígitos', () => {
  assert.equal(normalizePhone('+55 (41) 99999-1111').key, '5541999991111')
  assert.equal(normalizePhone('41999991111').key, '5541999991111')
  assert.equal(normalizePhone('5541999991111').key, '5541999991111')
  assert.equal(normalizePhone('4133331111').key, '554133331111')
  assert.equal(normalizePhone('999991111').kind, 'local')
  assert.equal(normalizePhone('999991111').key, '')
  assert.equal(normalizePhone('+1 415 555 2671').kind, 'international')
  assert.equal(normalizePhone('12345').kind, 'invalid')
  assert.equal(normalizePhone('+55 41 99999-1111').raw, '+55 41 99999-1111')
  assert.equal(normalizePhone('').kind, 'empty')
})

test('compara nomes sem unificar por nome sozinho ou nomes curtos', () => {
  assert.equal(compareNames('Maria Souza', 'maria  SOUZA'), 'exact')
  assert.equal(compareNames('Maria da Souza', 'Maria Souza'), 'exact')
  assert.equal(compareNames('Maria Aparecida Souza', 'Maria Souza'), 'compatible')
  assert.equal(compareNames('Maria', 'Maria Souza'), 'none')
  assert.equal(compareNames('Maria Souza', 'Maria Santos'), 'none')
})

test('documento inválido é ignorado e CPF válido é reconhecido', () => {
  assert.equal(normalizeDocument(CPF).kind, 'cpf')
  assert.equal(normalizeDocument('000.000.000-00').value, '')
  assert.equal(normalizeDocument('111.111.111-11').value, '')
})

test('telefone + nome compatível vincula ao cliente e sugere campos vazios', () => {
  const result = run({
    checkins: [checkin({ document: CPF, birthDate: '1990-05-01T00:00:00' })],
    buyers: [{ userName: 'Maria Souza', userPhone: '41999991111', userDocument: CPF, userEmail: 'MARIA@x.com', date: '2026-10-23T23:40:00' }],
    customers: [{ id: 'c1', name: 'Maria Aparecida Souza', phone: '(41) 99999-1111', email: '', cpf: '', birthday: '' }],
  })
  assert.equal(result.linked.length, 1)
  const [entry] = result.linked
  assert.equal(entry.matches[0].id, 'c1')
  assert.deepEqual(entry.suggestedFills.map((fill) => fill.field).sort(), ['documento', 'email', 'nascimento'])
  assert.ok(entry.suggestedFills.every((fill) => fill.field !== 'documento' || !fill.value.includes('5299')))
  assert.deepEqual(entry.plannedLink, { system: 'zig', id: 'z1', lojaId: 'L1' })
  assert.deepEqual(entry.eventIds, ['E1'])
})

test('não sugere sobrescrever dados existentes', () => {
  const result = run({
    checkins: [checkin({ document: CPF, birthDate: '1990-05-01' })],
    customers: [{ id: 'c1', name: 'Maria Souza', phone: '41999991111', email: 'a@a.com', cpf: CPF, birthday: '1991-01-01' }],
  })
  assert.equal(result.linked.length, 1)
  assert.deepEqual(result.linked[0].suggestedFills, [])
})

test('nome sozinho nunca vincula', () => {
  const result = run({ checkins: [checkin()], customers: [{ id: 'c1', name: 'Maria Souza', phone: '41888880000' }] })
  assert.equal(result.linked.length, 0)
  assert.equal(result.divergent[0].reasons[0], 'name_only')
  const fresh = run({ checkins: [checkin()], customers: [{ id: 'c1', name: 'Outra Pessoa', phone: '41888880000' }] })
  assert.equal(fresh.created.length, 1)
})

test('telefone igual com nome diferente, telefone compartilhado e múltiplos clientes vão para conferência', () => {
  const mismatch = run({ checkins: [checkin()], customers: [{ id: 'c1', name: 'Joana Lima', phone: '41999991111' }] })
  assert.equal(mismatch.divergent[0].reasons[0], 'phone_name_mismatch')

  const sharedExisting = run({ checkins: [checkin()], customers: [{ id: 'c1', name: 'Maria Souza', phone: '41999991111' }, { id: 'c2', name: 'Pedro Souza', phone: '41999991111' }] })
  assert.equal(sharedExisting.divergent[0].reasons[0], 'shared_phone')
  assert.equal(sharedExisting.linked.length, 0)

  const sharedZig = run({ checkins: [checkin(), checkin({ id: 'z2', name: 'Pedro Souza' })], customers: [{ id: 'c1', name: 'Maria Souza', phone: '41999991111' }] })
  assert.equal(sharedZig.divergent.length, 2)
  assert.ok(sharedZig.divergent.every((entry) => entry.reasons[0] === 'shared_phone'))

  const multiple = run({ checkins: [checkin()], customers: [{ id: 'c1', name: 'Maria Souza', phone: '41999991111' }, { id: 'c2', name: 'Maria Souza', phone: '(41) 99999-1111' }] })
  assert.equal(multiple.divergent[0].reasons[0], 'multiple_matches')
})

test('documentos conflitantes e variante do 9º dígito ficam para conferência', () => {
  const conflict = run({ checkins: [checkin({ document: CPF })], customers: [{ id: 'c1', name: 'Maria Souza', phone: '41999991111', cpf: '111.444.777-35' }] })
  assert.equal(conflict.divergent[0].reasons[0], 'document_conflict')
  const variant = run({ checkins: [checkin({ phone: '41 99999-1111' })], customers: [{ id: 'c1', name: 'Maria Souza', phone: '4199991111' }] })
  assert.equal(variant.divergent[0].reasons[0], 'possible_phone_variant')
})

test('comandas de mesa e registros incertos são separados de pessoas', () => {
  const result = run({ checkins: [checkin({ id: 't1', name: 'Mesa 12', phone: '', document: '' }), checkin({ id: 'u1', name: 'X', phone: '', document: '' })] })
  assert.equal(result.tables.length, 1)
  assert.equal(result.divergent[0].reasons[0], 'uncertain_kind')
})

test('inscrições das listas também vinculam, sem campos preenchíveis', () => {
  const result = run({ checkins: [checkin()], registrations: [{ id: 'r1', name: 'Maria Souza', whatsapp: '41999991111', formKey: 'VIP', eventName: 'Noite' }, { id: 'r2', name: 'Maria Souza', whatsapp: '(41) 99999-1111', formKey: 'LISTA_LOVERS', eventName: 'Noite' }] })
  assert.equal(result.linked.length, 1)
  assert.equal(result.linked[0].matches.length, 1)
  assert.deepEqual(result.linked[0].suggestedFills, [])
})

test('associa check-in ao evento respeitando a meia-noite e marca fora da janela', () => {
  assert.equal(attributeToEvent(events, '2026-10-24T01:30:00').status, 'assigned')
  assert.equal(attributeToEvent(events, '2026-10-24T20:00:00').status, 'outside')
  const two = [...events, { id: 'E2', beginMs: parseInstant('2026-10-24T02:00:00') }]
  assert.equal(attributeToEvent(two, '2026-10-24T01:00:00').status, 'ambiguous')
})

function fakeClient({ eventRows, checkinRows = [], buyerRows = [], failBuyers = false }) {
  const calls = []
  return {
    calls,
    listEvents: async (...args) => { calls.push(['events', ...args]); return eventRows },
    listCheckins: async (...args) => { calls.push(['checkins', ...args]); return { items: checkinRows, pages: 1 } },
    listBuyers: async (...args) => { calls.push(['buyers', ...args]); if (failBuyers) throw Object.assign(new Error('falha'), { code: 'zig_unavailable' }); return buyerRows },
  }
}

test('prévia: monta grupos, valida limite de 5 eventos e não devolve sucesso parcial', async () => {
  const eventRows = [{ id: 'E1', name: 'Noite', beginAt: '2026-10-23T22:00:00' }]
  const client = fakeClient({ eventRows, checkinRows: [checkin(), checkin({ id: 'z9', name: 'Novo Cliente', phone: '41977770000' })] })
  const preview = await buildZigPreview({
    client, lojaId: 'L1', dtinicio: '2026-10-23', dtfim: '2026-10-23', now: Date.parse('2026-10-30T00:00:00Z'),
    customers: [{ id: 'c1', name: 'Maria Souza', phone: '41999991111' }], registrations: [],
  })
  assert.equal(preview.complete, true)
  assert.deepEqual([preview.summary.linked, preview.summary.created, preview.summary.divergent], [1, 1, 0])
  assert.deepEqual(preview.warnings, [])

  const many = Array.from({ length: 6 }, (_, index) => ({ id: `E${index}`, name: 'x', beginAt: `2026-10-2${index}T22:00:00` }))
  await assert.rejects(buildZigPreview({ client: fakeClient({ eventRows: many }), lojaId: 'L1', dtinicio: '2026-10-20', dtfim: '2026-10-25', customers: [], registrations: [] }), (error) => error.code === 'too_many_events')
  await assert.rejects(buildZigPreview({ client: fakeClient({ eventRows: [] }), lojaId: 'L1', dtinicio: '2026-10-20', dtfim: '2026-10-25', customers: [], registrations: [] }), (error) => error.code === 'no_events')
  await assert.rejects(buildZigPreview({ client: fakeClient({ eventRows, failBuyers: true }), lojaId: 'L1', dtinicio: '2026-10-23', dtfim: '2026-10-23', customers: [], registrations: [] }), (error) => error.code === 'zig_unavailable')
})

test('prévia: avisa quando o evento pode não ter encerrado', async () => {
  const client = fakeClient({ eventRows: [{ id: 'E1', name: 'Noite', beginAt: '2026-10-23T22:00:00' }] })
  const preview = await buildZigPreview({ client, lojaId: 'L1', dtinicio: '2026-10-23', dtfim: '2026-10-23', customers: [], registrations: [], now: Date.parse('2026-10-23T23:00:00Z') })
  assert.ok(preview.warnings.some((warning) => /em andamento/.test(warning)))
})
