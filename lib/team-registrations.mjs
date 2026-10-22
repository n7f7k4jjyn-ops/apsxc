import { validateJobApplication } from './job-applications.mjs'

export function validateTeamRegistration(value, normalizePhone) {
  const { name, whatsapp, roles, availability } = validateJobApplication(value, normalizePhone)
  const pixKey = typeof value.pixKey === 'string' ? value.pixKey.trim() : ''
  if (!pixKey || pixKey.length > 254 || /[\u0000-\u001f\u007f]/.test(pixKey)) {
    const error = new Error('Informe uma chave Pix válida, com até 254 caracteres.')
    error.status = 400
    throw error
  }
  return { name, whatsapp, pixKey, roles, availability }
}
