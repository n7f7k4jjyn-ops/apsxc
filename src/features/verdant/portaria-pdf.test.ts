import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { createPortariaPdf } from './portaria-pdf'

describe('PDF da portaria', () => {
  it('gera um A4 válido mesmo sem inscrições e sem timbrado', async () => {
    const bytes = await createPortariaPdf({
      eventName: 'Verdant',
      eventDate: '17/10/2026',
      sections: [],
    })
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28, 1)
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89, 1)
  })
  it('pagina listas longas e aceita acentos, emoji e palavras extensas', async () => {
    const bytes = await createPortariaPdf({
      eventName: 'Festa 🎉',
      eventDate: '17/10/2026',
      sections: [
        {
          title: 'LISTA ANIVERSÁRIO',
          groups: [
            {
              label: 'João da Conceição',
              names: [
                ...Array.from(
                  { length: 250 },
                  (_, i) => `Convidado ${i} - José Antônio`
                ),
                'A'.repeat(300),
                'Ana 🎉',
              ],
            },
          ],
        },
      ],
    })
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThan(2)
    expect(pdf.getTitle()).toContain('Festa')
  })
  it('rejeita um timbrado inválido em vez de baixar um PDF sem a marca solicitada', async () => {
    await expect(
      createPortariaPdf({
        eventName: 'Verdant',
        eventDate: '17/10/2026',
        sections: [],
        letterhead: new TextEncoder().encode('<html>erro</html>'),
      })
    ).rejects.toThrow()
  })
})
