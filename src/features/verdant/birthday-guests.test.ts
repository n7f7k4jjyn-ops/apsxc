import { describe, expect, it } from 'vitest'
import { birthdayDoorGroup, birthdayGuestNames } from './birthday-guests'

describe('Convidados de aniversário', () => {
  it('separa nomes antigos em uma linha ou várias linhas e remove numeração', () => {
    expect(
      birthdayGuestNames([
        '1. João Silva, 2. Maria Souza; Ana Lima\nJosé Luís',
        '  Carla  ',
        '',
      ])
    ).toEqual(['João Silva', 'Maria Souza', 'Ana Lima', 'José Luís', 'Carla'])
  })
  it('conta convidados separadamente do aniversariante', () => {
    expect(birthdayDoorGroup('Bruno Gomes', ['João, Maria'])).toEqual({
      label: 'Aniversariante: Bruno Gomes',
      hostName: 'Bruno Gomes',
      names: ['João', 'Maria'],
      summary: '2 convidados + aniversariante = 3 pessoas',
    })
  })
  it('não transforma o aniversariante em convidado quando faltam convidados', () => {
    expect(birthdayDoorGroup('Bruno', []).names).toEqual([])
    expect(birthdayGuestNames(undefined)).toEqual([])
  })
})
