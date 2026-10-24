import { describe, expect, it } from 'vitest'
import {
  makeConfigs,
  type Registration,
  type VerdantEvent,
  type VerdantState,
} from '@/features/verdant/data'
import { buildWorkflow, periodKeys } from './workflow'

const now = Date.parse('2026-10-18T02:00:00Z') // 17/10 às 23h em Curitiba
const event = (id: string, date: string, active = true): VerdantEvent => ({
  id,
  date,
  name: id,
  active,
  eventTime: '22:00',
  entryValue: '',
})
const row = (id: string, eventId: string, createdAt: string): Registration => ({
  id,
  eventId,
  createdAt,
  formKey: 'DJS',
  eventName: eventId,
  eventDate: '2026-10-17',
  name: id,
  whatsapp: '',
  email: '',
  consent: false,
  optionId: '',
  optionName: '',
  profileType: '',
  birthdayDate: '',
  guestNames: [],
  status: 'Recebido',
})
const state = (): VerdantState => ({
  version: 4,
  revision: 1,
  updatedAt: '',
  people: [],
  forms: [],
  events: [
    event('yesterday', '2026-10-16'),
    event('today', '2026-10-17'),
    event('tomorrow', '2026-10-18'),
    event('archived', '2026-10-17', false),
  ],
  registrations: [
    row('a', 'today', '2026-10-18T01:30:00Z'),
    row('b', 'today', '2026-10-17T02:30:00Z'),
    row('c', 'tomorrow', '2026-10-18T01:00:00Z'),
    row('d', 'archived', '2026-10-18T01:00:00Z'),
  ],
})

describe('resumo operacional', () => {
  it('usa a data de Curitiba no foco, nos indicadores e no gráfico', () => {
    const result = buildWorkflow(state(), now, 'day', 'next')
    expect(result.today).toBe('2026-10-17')
    expect(result.event?.id).toBe('today')
    expect(result.received).toBe(1)
    expect(result.registrations).toHaveLength(2)
    expect(result.buckets[22].total).toBe(1)
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(
      result.received
    )
  })
  it('filtra pelo evento e exclui eventos arquivados da visão geral', () => {
    expect(buildWorkflow(state(), now, 'day', 'tomorrow').received).toBe(1)
    const all = buildWorkflow(state(), now, 'day', 'all')
    expect(all.event).toBeUndefined()
    expect(all.received).toBe(2)
    expect(all.registrations).toHaveLength(3)
  })
  it('distingue listas agendadas, abertas, encerradas e horários inválidos', () => {
    const data = state()
    data.forms = makeConfigs(data.events[1]).map((config, index) => ({
      ...config,
      enabled: index !== 4,
      openAt:
        index === 1
          ? '2026-10-18T00:00'
          : index === 3
            ? ''
            : '2026-10-15T20:00',
      cutoff: index === 0 || index === 1 ? '23:59' : '19:00',
    }))
    const result = buildWorkflow(data, now, 'day', 'today')
    expect(result.lists.map((list) => list.status)).toEqual([
      'open',
      'invalid',
      'closed',
      'invalid',
      'disabled',
      'closed',
    ])
    expect(result.openLists).toBe(1)
    data.forms[1].openAt = '2026-10-17T23:30'
    expect(buildWorkflow(data, now, 'day', 'today').lists[1].status).toBe(
      'scheduled'
    )
    expect(
      result.issues.some((issue) => issue.text.includes('profissionais'))
    ).toBe(true)
  })
  it('gera semanas de segunda a domingo e meses sem depender do fuso do navegador', () => {
    expect(periodKeys(Date.parse('2026-01-01T12:00:00Z'), 'week')).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ])
    expect(
      periodKeys(Date.parse('2028-02-15T12:00:00Z'), 'month')
    ).toHaveLength(29)
  })
})


describe('intervalo personalizado', () => {
  it('inclui os dois extremos e a virada do mês', () => {
    expect(periodKeys(Date.parse('2026-10-24T12:00:00Z'), 'week', { from: '2026-09-30', to: '2026-10-02' })).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
  })
  it('rejeita datas inválidas, intervalo incompleto e ordem invertida', () => {
    for (const range of [{ from: '', to: '2026-10-24' }, { from: '2026-02-30', to: '2026-03-01' }, { from: '2026-10-25', to: '2026-10-24' }]) expect(() => periodKeys(Date.now(), 'day', range)).toThrow()
  })
})
