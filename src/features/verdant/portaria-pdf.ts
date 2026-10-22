import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'

export type PortariaSection = {
  title: string
  groups: {
    label: string
    names: string[]
    summary?: string
    hostName?: string
  }[]
}
const mm = (value: number) => (value * 72) / 25.4

// Standard PDF fonts support Portuguese. Replace unsupported symbols without
// allowing a pasted emoji to prevent the entire door list from downloading.
function printable(text: string, font: PDFFont) {
  return Array.from(text.normalize('NFC').replace(/\s+/g, ' ').trim())
    .map((char) => {
      try {
        font.encodeText(char)
        return char
      } catch {
        return '?'
      }
    })
    .join('')
}
function lines(text: string, font: PDFFont, size: number, width: number) {
  const result: string[] = []
  let line = ''
  for (const word of printable(text, font).split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate
      continue
    }
    if (line) result.push(line)
    line = ''
    for (const char of word) {
      if (font.widthOfTextAtSize(line + char, size) > width && line) {
        result.push(line)
        line = ''
      }
      line += char
    }
  }
  if (line) result.push(line)
  return result.length ? result : ['']
}

export async function createPortariaPdf({
  eventName,
  eventDate,
  sections,
  letterhead,
  reportLabel = 'Lista de portaria',
}: {
  eventName: string
  eventDate: string
  sections: PortariaSection[]
  letterhead?: Uint8Array
  reportLabel?: string
}) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${reportLabel} - ${eventName} - ${eventDate}`)
  pdf.setAuthor('Verdant')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const background = letterhead ? await pdf.embedJpg(letterhead) : null
  const width = mm(210),
    height = mm(297),
    left = mm(19),
    bottom = mm(23)
  const top = height - mm(background ? 50 : 18)
  const columnWidth = (width - 2 * left - mm(10)) / 2
  let page = pdf.addPage([width, height]),
    column = 0,
    y = top,
    contentTop = top
  function newPage(first = false) {
    if (!first) page = pdf.addPage([width, height])
    if (background) page.drawImage(background, { x: 0, y: 0, width, height })
    let headingY = top
    for (const text of lines(
      [eventName, eventDate].filter(Boolean).join(' - '),
      bold,
      11,
      width - 2 * left
    )) {
      page.drawText(text, {
        x: (width - bold.widthOfTextAtSize(text, 11)) / 2,
        y: headingY,
        size: 11,
        font: bold,
      })
      headingY -= 14
    }
    contentTop = headingY - 12
    y = contentTop
    column = 0
    page.drawText(`${reportLabel} · Página ${pdf.getPageCount()}`, {
      x: left,
      y: mm(18),
      font: regular,
      size: 7,
      color: rgb(0.5, 0.5, 0.5),
    })
  }
  newPage(true)
  function ensureSpace(heightNeeded: number) {
    if (y - heightNeeded >= bottom) return false
    if (column === 0) {
      column = 1
      y = contentTop
    } else newPage()
    return true
  }
  function draw(text: string, font = regular, size = 10) {
    const wrapped = lines(text, font, size, columnWidth)
    for (const line of wrapped) {
      ensureSpace(13)
      page.drawText(line, {
        x: left + column * (columnWidth + mm(10)),
        y,
        size,
        font,
      })
      y -= 13
    }
  }
  if (!sections.length) draw('Nenhuma inscrição registrada para este evento.')
  for (const section of sections) {
    ensureSpace(lines(section.title, bold, 10, columnWidth).length * 13 + 42)
    draw(section.title, bold)
    y -= 5
    for (const group of section.groups) {
      ensureSpace(
        (group.label
          ? lines(group.label, bold, 9, columnWidth).length * 13
          : 0) + 26
      )
      if (group.label) draw(group.label, bold, 9)
      const sortedNames = [...group.names].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true }))
      for (const [index, name] of sortedNames.entries()) {
        const nameLines = lines(
          `${index + 1}. ${name}`,
          regular,
          10,
          columnWidth
        )
        if (ensureSpace(Math.min(nameLines.length * 13, contentTop - bottom))) {
          draw(`${section.title} (continuação)`, bold, 9)
          if (group.label) draw(group.label, bold, 9)
        }
        draw(`${index + 1}. ${name}`)
      }
      if (group.summary) {
        ensureSpace(lines(group.summary, bold, 9, columnWidth).length * 13)
        draw(group.summary, bold, 9)
      }
      y -= 7
    }
    y -= 9
  }
  return pdf.save()
}
