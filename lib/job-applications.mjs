export const ROLES = ['Caixa', 'Bar', 'Limpeza', 'Segurança', 'Cozinha', 'Bombeiro']
export const DAYS = ['Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']

function invalid(message) {
  const error = new Error(message)
  error.status = 400
  throw error
}

export function validateJobApplication(value, normalizePhone) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Cadastro inválido.')
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!name || name.length > 160) invalid('Informe seu nome completo, com até 160 caracteres.')
  const whatsapp = typeof value.whatsapp === 'string' && value.whatsapp.length <= 50 ? normalizePhone(value.whatsapp) : ''
  if (!whatsapp) invalid('Informe um telefone válido com DDD.')
  const choices = (input, allowed, label) => {
    if (input === undefined) return []
    if (!Array.isArray(input) || input.length > allowed.length || input.some((item) => !allowed.includes(item))) invalid(`Selecione opções válidas em ${label}.`)
    return [...new Set(input)]
  }
  const roles = choices(value.roles, ROLES, 'funções')
  const availability = choices(value.availability, DAYS, 'disponibilidade')
  const experience = value.experience === undefined ? '' : value.experience
  if (typeof experience !== 'string' || experience.length > 4000) invalid('O resumo da experiência deve ter até 4.000 caracteres.')
  return { name, whatsapp, roles, availability, experience: experience.trim() }
}
