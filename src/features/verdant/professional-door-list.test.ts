import { describe, expect, it } from 'vitest'
import { professionalDoorList } from './professional-door-list'

describe('Lista de profissionais para portaria', () => {
  it('inclui profissionais sem convidados e agrupa cada convidado no profissional correto', () => {
    expect(
      professionalDoorList(
        'DJs',
        ['DJ Ana', 'DJ Bruno'],
        [
          { professional: 'dj ana', name: 'João' },
          { professional: 'DJ Ana', name: 'Maria' },
          { professional: 'DJ não vinculado', name: 'José' },
        ]
      )
    ).toEqual([
      {
        title: 'DJs',
        groups: [
          { label: 'DJ Ana', names: ['João', 'Maria'] },
          { label: 'DJ Bruno', names: [] },
          { label: 'DJ não vinculado', names: ['José'] },
        ],
      },
    ])
  })
  it('preserva convidados sem indicação de profissional e funciona para influencers', () => {
    expect(
      professionalDoorList(
        'Influencers',
        [],
        [{ professional: '', name: 'Ana' }]
      )[0].groups
    ).toEqual([{ label: 'Profissional não informado', names: ['Ana'] }])
    expect(professionalDoorList('Influencers', [], [])).toEqual([])
  })
})
