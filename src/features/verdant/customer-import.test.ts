import { describe, expect, it } from 'vitest'
import { isValidCpf, readCustomerImport } from './customer-import'

const encoder = new TextEncoder()

function crc32(bytes: Uint8Array) {
  let crc = -1
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ -1) >>> 0
}

function zip(files: Record<string, string>) {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0
  for (const [name, text] of Object.entries(files)) {
    const filename = encoder.encode(name)
    const body = encoder.encode(text)
    const crc = crc32(body)
    const local = new Uint8Array(30 + filename.length + body.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(8, 0, true)
    localView.setUint32(14, crc, true); localView.setUint32(18, body.length, true); localView.setUint32(22, body.length, true)
    localView.setUint16(26, filename.length, true); local.set(filename, 30); local.set(body, 30 + filename.length)
    localParts.push(local)
    const central = new Uint8Array(46 + filename.length)
    const view = new DataView(central.buffer)
    view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true)
    view.setUint16(10, 0, true); view.setUint32(16, crc, true); view.setUint32(20, body.length, true); view.setUint32(24, body.length, true)
    view.setUint16(28, filename.length, true); view.setUint32(42, localOffset, true); central.set(filename, 46)
    centralParts.push(central)
    localOffset += local.length
  }
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, centralParts.length, true)
  endView.setUint16(10, centralParts.length, true); endView.setUint32(12, centralSize, true); endView.setUint32(16, localOffset, true)
  const parts = [...localParts, ...centralParts, end]
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}

describe('importação de clientes', () => {
  it('lê a aba Excel, seleciona campos necessários e sinaliza dados inválidos', async () => {
    const strings = ['Identificador', 'Nome', 'CPF', 'E-mail', 'Telefone', 'Aniversário', 'Presenças', 'Primeira entrada no local', 'Última visita', 'Saldo disponível', 'Consumo', 'ID do evento', 'Primeira interação', 'Excluir esta coluna', 'cliente-001', 'Pessoa Teste', '529.982.247-25', 'teste@example.com', '5541999999999', '10/06/1990', '3', '01/01/2025', '03/10/2026', '50,00', '100,50', 'evt-123', '05/05/2024', 'não importar']
    const shared = `<sst>${strings.map((value) => `<si><t>${value}</t></si>`).join('')}</sst>`
    const headers = strings.slice(0, 14)
    const cells = headers.map((_, index) => `<c r="${String.fromCharCode(65 + index)}1" t="s"><v>${index}</v></c>`).join('')
    const values = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]
    const row = values.map((index, column) => `<c r="${String.fromCharCode(65 + column)}2" t="s"><v>${index}</v></c>`).join('')
    const sheet = `<worksheet><sheetData><row r="1">${cells}</row><row r="2">${row}</row></sheetData></worksheet>`
    const file = new File([zip({ 'xl/worksheets/sheet1.xml': sheet, 'xl/sharedStrings.xml': shared })], 'clientes.xlsx')
    const result = await readCustomerImport(file)
    expect(result.customers).toHaveLength(1)
    expect(result.customers[0]).toMatchObject({ sourceId: 'cliente-001', name: 'Pessoa Teste', cpf: '529.982.247-25', presenceCount: 3, sourceEventId: 'evt-123' })
    expect(result.customers[0].qualityFlags).toEqual([])
    expect(Object.keys(result.customers[0])).not.toContain('Excluir esta coluna')
  })

  it('não considera CPF inválido como chave e marca para revisão', async () => {
    const csv = 'Identificador;Nome;CPF;Telefone\nabc-2;Pessoa Exemplo;111.111.111-11;telefone\n'
    const result = await readCustomerImport(new File([csv], 'clientes.csv'))
    expect(result.customers[0].qualityFlags).toContain('CPF para revisão')
    expect(isValidCpf('111.111.111-11')).toBe(false)
  })
})
