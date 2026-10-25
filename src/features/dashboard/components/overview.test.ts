import { describe, expect, it } from 'vitest'
import { buildBuckets } from './overview'

function registration(formKey: 'DJS' | 'INFLUENCIADORES' | 'VIP', createdAt: string) {
  return {
    id: `${formKey}-${createdAt}`,
    formKey,
    eventId: 'event-1',
    eventName: 'Evento',
    eventDate: '2026-10-15',
    name: 'Pessoa',
    whatsapp: '',
    email: '',
    consent: false,
    optionId: '',
    optionName: '',
    profileType: '',
    birthdayDate: '',
    guestNames: [],
    createdAt,
    status: 'confirmed',
  }
}

describe('gráfico de inscrições por lista', () => {
  it('agrupa as contagens por formulário dentro do mês selecionado', () => {
    const registrations = [
      registration('DJS', '2026-10-02T12:00:00-03:00'),
      registration('DJS', '2026-10-14T12:00:00-03:00'),
      registration('INFLUENCIADORES', '2026-10-22T12:00:00-03:00'),
      registration('VIP', '2026-09-30T12:00:00-03:00'),
    ]

    const buckets = buildBuckets(registrations, [], new Date('2026-10-15T12:00:00-03:00'), 'month', 'lists')

    expect(buckets.map(({ name, total }) => [name, total])).toEqual([
      ['DJs', 2],
      ['Influencers', 1],
      ['Lover', 0],
      ['VIP', 0],
      ['Aniversário', 0],
      ['Entrada gratuita', 0],
    ])
  })

  it('mantém a seleção de período ao exibir uma única barra por lista', () => {
    const registrations = [
      registration('DJS', '2026-10-14T23:30:00-03:00'),
      registration('DJS', '2026-10-15T00:15:00-03:00'),
      registration('VIP', '2026-10-15T11:00:00-03:00'),
    ]

    const buckets = buildBuckets(registrations, [], new Date('2026-10-15T12:00:00-03:00'), 'day', 'lists')

    expect(buckets).toHaveLength(6)
    expect(buckets.find(({ name }) => name === 'DJs')?.total).toBe(1)
    expect(buckets.find(({ name }) => name === 'VIP')?.total).toBe(1)
  })
  it('uses the Curitiba day and month at the UTC boundary', () => {
    const rows = [
      registration('VIP', '2026-09-30T23:50:00-03:00'),
      registration('DJS', '2026-10-01T00:10:00-03:00'),
    ]
    const september = buildBuckets(rows, [], new Date('2026-10-01T01:00:00Z'), 'month', 'lists')
    expect(september.find(row => row.name === 'VIP')?.total).toBe(1)
    expect(september.find(row => row.name === 'DJs')?.total).toBe(0)
    const octoberFirst = buildBuckets(rows, [], new Date('2026-10-01T03:15:00Z'), 'day', 'lists')
    expect(octoberFirst.find(row => row.name === 'VIP')?.total).toBe(0)
    expect(octoberFirst.find(row => row.name === 'DJs')?.total).toBe(1)
  })

})
