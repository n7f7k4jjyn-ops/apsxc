import { randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

async function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error('Execute este comando em um terminal interativo.')
  }
  process.stdout.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  let value = ''
  return new Promise((resolve) => {
    const onData = (chunk) => {
      const char = chunk.toString()
      if (char === '\u0003') {
        process.stdin.setRawMode(false)
        process.exit(130)
      }
      if (char === '\r' || char === '\n') {
        process.stdin.off('data', onData)
        process.stdin.setRawMode(false)
        process.stdout.write('\n')
        resolve(value)
      } else if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1)
      } else if (char >= ' ') {
        value += char
      }
    }
    process.stdin.on('data', onData)
  })
}

const password = await readHidden('Senha (mínimo 12 caracteres): ')
const confirm = await readHidden('Confirme a senha: ')
if (password.length < 12) throw new Error('Use uma senha com pelo menos 12 caracteres.')
if (password !== confirm) throw new Error('As senhas não coincidem.')

const salt = randomBytes(16)
const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
process.stdout.write(`Hash para o campo passwordHash:\nscrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}\n`)
