import assert from 'node:assert/strict'
import test from 'node:test'
import { changeFinance, emptyFinance, validFinanceDate, validateFinanceStore } from './finance.mjs'

const references = { events: [{ id: 'event' }], beneficiaries: [{ id: 'team:one', kind: 'team', name: 'Equipe' }, { id: 'dj:one', kind: 'dj', name: 'DJ' }] }
const draft = (changes = {}) => ({
  externalId: '', type: 'payable', category: 'general', description: 'Despesa',
  counterparty: 'Fornecedor', beneficiaryId: '', eventId: '', amountCents: 10,
  dueDate: '2026-10-22', status: 'pending', settledDate: '', paymentMethod: '', notes: '', ...changes,
})
const create = (entries, document = emptyFinance()) => changeFinance(document, { revision: document.revision, entries }, references, 'admin')
const update = (document, changes, refs = references) => changeFinance(document, { revision: document.revision, ...changes }, refs, 'admin', document.entries[0].id).document

test('money is exact integer cents; invalid dates, enums and nonfinite values reject', () => {
  const result = create([draft(), draft({ amountCents: 20 })])
  assert.equal(result.document.entries.reduce((sum, entry) => sum + entry.amountCents, 0), 30)
  for (const amountCents of [NaN, Infinity, 0, -1, 1.5, '100', Number.MAX_SAFE_INTEGER, 100_000_000_001]) {
    assert.throws(() => create([draft({ amountCents })]), /centavos/)
  }
  for (const dueDate of ['2026-02-29', '2026-04-31', '2026-1-01', '0000-01-01', '', 'not-a-date']) assert.throws(() => create([draft({ dueDate })]))
  assert.equal(validFinanceDate('2024-02-29'), true)
  for (const change of [{ type: 'expense' }, { category: 'salary' }, { status: 'paid' }, { paymentMethod: 'wire' }, { status: 'settled' }, { settledDate: '2026-10-22' }]) assert.throws(() => create([draft(change)]))
})

test('whole batches roll back and import keys are idempotent without replacing originals', () => {
  const document = emptyFinance()
  assert.throws(() => create([draft(), draft({ amountCents: -1 })], document))
  assert.deepEqual(document, emptyFinance())
  assert.throws(() => create(Array.from({ length: 1001 }, () => draft())))
  const original = draft({ externalId: 'spreadsheet:1' })
  const first = create([original, original])
  assert.equal(first.response.imported, 1)
  assert.equal(first.response.skipped, 1)
  const reimport = create([draft({ ...original, amountCents: 90 })], first.document)
  assert.equal(reimport.response.skipped, 1)
  assert.deepEqual(reimport.document, first.document)
  assert.throws(() => create([original, { ...original, amountCents: 20 }]), /conflitantes/)
  assert.throws(() => create([original, { ...original, amountCents: 20 }], first.document), /conflitantes/)
})

test('CSV multiline notes remain intact while names and identifiers reject controls', () => {
  const notes = 'Linha 1\nLinha 2\r\n\tComplemento'
  const document = create([draft({ externalId: 'x'.repeat(160), notes })]).document
  assert.equal(document.entries[0].notes, notes)
  assert.equal(document.entries[0].externalId.length, 160)
  assert.throws(() => create([draft({ externalId: 'x'.repeat(161) })]))
  for (const change of [{ description: 'Conta\ninválida' }, { counterparty: 'Nome\tinválido' }, { externalId: 'sheet\u0000id' }, { notes: 'Nota\u0000inválida' }]) {
    assert.throws(() => create([draft(change)]), /controle/)
  }
})

test('reference links enforce payable and authoritative names but preserve history after deletion', () => {
  for (const entry of [draft({ eventId: 'missing' }), draft({ category: 'dj', beneficiaryId: 'team:one' }), draft({ category: 'team', beneficiaryId: 'team:missing' }), draft({ type: 'receivable', category: 'team', beneficiaryId: 'team:one' })]) assert.throws(() => create([entry]))
  const first = create([draft({ category: 'team', beneficiaryId: 'team:one', counterparty: 'Spoof', eventId: 'event' })]).document
  assert.equal(first.entries[0].counterparty, 'Equipe')
  const settled = update(first, { status: 'settled', settledDate: '2026-10-23', paymentMethod: 'pix' }, { events: [], beneficiaries: [] })
  assert.equal(settled.entries[0].counterparty, 'Equipe')
  assert.equal(settled.entries[0].status, 'settled')
  const relinked = update(first, { category: 'dj', beneficiaryId: 'dj:one' })
  assert.equal(relinked.entries[0].counterparty, 'DJ')
})

test('settle, reopen and cancel retain audit and prevent rewriting closed records', () => {
  const first = create([draft()]).document
  const settled = update(first, { status: 'settled', settledDate: '2026-10-23', paymentMethod: 'cash' })
  assert.throws(() => update(settled, { amountCents: 50 }), /Reabra/)
  assert.throws(() => update(settled, { status: 'pending', amountCents: 50 }), /Reabra/)
  const reopened = update(settled, { status: 'pending' })
  assert.equal(reopened.entries[0].paymentMethod, '')
  assert.equal(reopened.entries[0].settledDate, '')
  assert.equal(reopened.entries[0].history.at(-1).before.paymentMethod, 'cash')
  assert.equal(reopened.entries[0].history.at(-1).after.paymentMethod, '')
  const cancelled = update(reopened, { status: 'cancelled' })
  assert.deepEqual(cancelled.entries[0].history.map(item => item.action), ['created', 'settled', 'reopened', 'cancelled'])
  assert.ok(cancelled.entries[0].history.every(item => item.actor === 'admin' && item.at))
  assert.equal(update(cancelled, { status: 'pending' }).entries[0].status, 'pending')
  assert.equal(validateFinanceStore(cancelled), cancelled)
  const corrected = update(first, { amountCents: 20, description: 'Correção' })
  assert.equal(corrected.entries[0].history.at(-1).before.amountCents, 10)
  assert.equal(corrected.entries[0].history.at(-1).after.amountCents, 20)
  assert.equal(corrected.entries[0].history.at(-1).before.description, 'Despesa')
  assert.equal(corrected.entries[0].history.at(-1).after.description, 'Correção')
})

test('revisions and persisted schema fail closed', () => {
  for (const revision of [undefined, -1, 1.1, '0', NaN]) assert.throws(() => changeFinance(emptyFinance(), { revision, entries: [draft()] }, references, 'admin'))
  assert.throws(() => changeFinance(emptyFinance(), { revision: 1, entries: [draft()] }, references, 'admin'), { status: 409 })
  for (const invalid of [null, [], {}, { revision: 0, entries: [{}] }]) assert.throws(() => validateFinanceStore(invalid), { status: 500 })
  const document = create([draft()]).document
  for (const patch of [{ amountCents: 1.5 }, { history: [] }, { createdAt: 'bad' }, { notes: undefined }]) {
    assert.throws(() => validateFinanceStore({ ...document, entries: [{ ...document.entries[0], ...patch }] }), { status: 500 })
  }
})
