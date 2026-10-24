import assert from 'node:assert/strict'
import test from 'node:test'
import { buildExistingEntities, buildZigPeople, matchPeople, parseInstant } from './zig-matching.mjs'
import { ZigApplyError, mergePending, planZigWrites, publicPending, resolvePending } from './zig-apply.mjs'

const events = [{ id: 'E1', name: 'Noite', beginAt: '2026-10-23T22:00:00', beginMs: parseInstant('2026-10-23T22:00:00') }]
const CPF = '529.982.247-25'
const NOW = '2026-10-24T12:00:00.000Z'
const checkin = (extra) => ({ id: 'z1', checkinTime: '2026-10-23T23:30:00', name: 'Maria Souza', document: '', phone: '+55 41 99999-1111', birthDate: null, ...extra })

function plan({ checkins = [], buyers = [], customers = [] }) {
  const groups = matchPeople(buildZigPeople(checkins, buyers, events), buildExistingEntities(customers, []), { lojaId: 'L1' })
  return { groups, result: planZigWrites(groups, customers, { lojaId: 'L1', now: NOW }) }
}

test('vincula e preenche somente campos vazios, sem sobrescrever', () => {
  const customers = [
    { id: 'c1', name: 'Maria Souza', phone: '41999991111', email: '', cpf: '', birthday: '', city: 'Curitiba' },
    { id: 'c2', name: 'Ana Lima', phone: '41988887777', email: 'ana@x.com', cpf: '', birthday: '1990-01-01' },
  ]
  const { result } = plan({
    checkins: [
      checkin({ document: CPF, birthDate: '1990-05-01T00:00:00' }),
      checkin({ id: 'z2', name: 'Ana Lima', phone: '41988887777', document: '111.444.777-35', birthDate: '1999-09-09' }),
    ],
    buyers: [{ userName: 'Maria Souza', userPhone: '41999991111', userDocument: CPF, userEmail: 'MARIA@x.com', date: '2026-10-23T23:40:00' }],
    customers,
  })
  const maria = result.touchedCustomers.find((customer) => customer.id === 'c1')
  assert.equal(maria.cpf, '52998224725')
  assert.equal(maria.email, 'maria@x.com')
  assert.equal(maria.birthday, '1990-05-01')
  assert.equal(maria.city, 'Curitiba')
  assert.deepEqual(maria.zigRefs, [{ system: 'zig', id: 'z1', lojaId: 'L1', linkedAt: NOW }])
  assert.equal(maria.updatedAt, NOW)
  // Só campos vazios são preenchidos: e-mail e nascimento existentes permanecem.
  const ana = result.touchedCustomers.find((customer) => customer.id === 'c2')
  assert.equal(ana.cpf, '11144477735')
  assert.equal(ana.email, 'ana@x.com')
  assert.equal(ana.birthday, '1990-01-01')
  assert.equal(ana.zigRefs[0].id, 'z2')
  assert.equal(customers[0].zigRefs, undefined, 'o cliente original não é mutado')
})

test('é idempotente: cliente já vinculado e completo fica como mantido', () => {
  const customers = [{ id: 'c1', name: 'Maria Souza', phone: '41999991111', email: 'a@a.com', cpf: CPF, birthday: '1990-05-01', zigRefs: [{ system: 'zig', id: 'z1', lojaId: 'L1' }] }]
  const { result } = plan({ checkins: [checkin({ document: CPF })], customers })
  assert.equal(result.summary.updates, 0)
  assert.equal(result.summary.kept, 1)
  assert.equal(result.touchedCustomers.length, 0)
})

test('cliente com outro ID Zig na mesma loja não é alterado e vira ignorado no relatório', () => {
  const customers = [{ id: 'c1', name: 'Maria Souza', phone: '41999991111', zigRefs: [{ system: 'zig', id: 'zOUTRO', lojaId: 'L1' }] }]
  const { result } = plan({ checkins: [checkin()], customers })
  assert.equal(result.summary.updates, 0)
  assert.deepEqual(result.skipped.map((item) => item.reason), ['conflicting_zig_id'])
})

test('cria clientes novos sem duplicar, e nova execução não recria', () => {
  const checkins = [checkin({ id: 'z9', name: 'Pedro Alves', phone: '41977776666', document: CPF })]
  const first = plan({ checkins }).result
  assert.equal(first.creates.length, 1)
  assert.equal(first.creates[0].input.sourceId, 'z9')
  assert.equal(first.creates[0].input.cpf, '52998224725')
  const existing = [{ id: 'c9', name: 'Pedro Alves', phone: '41977776666', sourceSystem: 'zig', sourceId: 'z9', zigRefs: [{ system: 'zig', id: 'z9', lojaId: 'L1' }], cpf: '52998224725', cpfKey: '52998224725', email: 'x@x.com', birthday: '2000-01-01' }]
  const second = plan({ checkins, customers: existing }).result
  assert.equal(second.creates.length, 0)
  assert.equal(second.summary.updates, 0)
})

test('mesmo telefone com dois IDs Zig compatíveis cria um só e envia o outro às pendências', () => {
  const { result } = plan({ checkins: [checkin({ id: 'z1' }), checkin({ id: 'z2', name: 'Maria Souza Silva' })] })
  assert.equal(result.creates.length, 1)
  assert.equal(result.pending.length, 1)
  assert.deepEqual(result.pending[0].reasons, ['zig_possible_duplicate'])
})

test('divergências viram pendências, preservam decisões e não expõem dados brutos', () => {
  const customers = [
    { id: 'c1', name: 'Maria Souza', phone: '41999991111' },
    { id: 'c2', name: 'Maria Souza Lima', phone: '41999991111' },
  ]
  const { result } = plan({ checkins: [checkin({ document: CPF })], customers })
  assert.equal(result.summary.updates, 0)
  assert.equal(result.pending.length, 1)
  assert.equal(result.pending[0].raw.document, '52998224725')
  assert.ok(!JSON.stringify(publicPending(result.pending[0])).includes('52998224725'))
  const first = mergePending([], result.pending, NOW)
  assert.equal(first.added, 1)
  const decided = first.items.map((item) => ({ ...item, status: 'ignored' }))
  const second = mergePending(decided, result.pending, NOW)
  assert.equal(second.decided, 1)
  assert.equal(second.items[0].status, 'ignored')
})

test('resolver pendência: vincular só a candidato sugerido, criar ou ignorar', () => {
  const customers = [
    { id: 'c1', name: 'Maria Souza', phone: '41999991111' },
    { id: 'c2', name: 'Maria Souza Lima', phone: '41999991111' },
    { id: 'c3', name: 'Outra Pessoa', phone: '41900000000' },
  ]
  const { result } = plan({ checkins: [checkin({ document: CPF })], customers })
  const item = { ...mergePending([], result.pending, NOW).items[0], lojaId: 'L1' }
  const ctx = { customers, lojaId: 'L1', now: NOW }
  assert.throws(() => resolvePending(item, 'link', { ...ctx, customerId: 'c3' }), ZigApplyError)
  const linked = resolvePending(item, 'link', { ...ctx, customerId: 'c1' })
  assert.equal(linked.customer.zigRefs[0].id, 'z1')
  assert.equal(linked.customer.cpf, '52998224725')
  assert.equal(resolvePending(item, 'ignore', ctx).status, 'ignored')
  const created = resolvePending(item, 'create', ctx)
  assert.equal(created.create.input.sourceId, 'z1')
  assert.throws(() => resolvePending({ ...item, status: 'ignored' }, 'ignore', ctx), ZigApplyError)
})
