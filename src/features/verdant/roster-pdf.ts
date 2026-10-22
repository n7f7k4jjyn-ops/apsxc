import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'
import { nbfLogo, verdantLogo } from './roster-brand'
import { displayDate, rosterGroups, type Roster } from './roster-types'

const color = (hex: string) =>
  rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255
  )
const ink = color('233139'),
  muted = color('707E83'),
  rule = color('DFE6E8'),
  green = color('568B2C'),
  navy = color('18313C')
function safe(value: string, font: PDFFont) {
  return Array.from(value.replace(/\s+/g, ' ').trim())
    .map((c) => {
      try {
        font.encodeText(c)
        return c
      } catch {
        return '?'
      }
    })
    .join('')
}
function wrap(value: string, font: PDFFont, size: number, width: number) {
  const result: string[] = []
  let line = ''
  for (const word of safe(value, font).split(' ')) {
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
async function buildRosterPdf(roster: Roster, s: number) {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const verdant = await pdf.embedPng(verdantLogo),
    nbf = await pdf.embedPng(nbfLogo)
  const W = 595.28,
    H = 841.89,
    L = 35,
    U = W - 70,
    gap = 25,
    C = (U - gap) / 2,
    model = roster.template
  const title = `Escala de ${roster.kind === 'security' ? 'Segurança' : 'STAFF'}`
  pdf.setTitle(`${title} - ${roster.eventName} - ${displayDate(roster.date)}`)
  pdf.setAuthor('Verdant CWB - Grupo NBF')
  let page: PDFPage
  let column = 0,
    y = 0
  const text = (
    x: number,
    y: number,
    value: string,
    size = 8.2,
    font = regular,
    tone = ink
  ) => page.drawText(safe(value, font), { x, y, size, font, color: tone })
  const right = (
    x: number,
    y: number,
    value: string,
    size = 8.2,
    font = regular,
    tone = ink
  ) =>
    text(
      x - font.widthOfTextAtSize(safe(value, font), size),
      y,
      value,
      size,
      font,
      tone
    )
  const center = (
    y: number,
    value: string,
    size = 8.2,
    font = regular,
    tone = ink
  ) =>
    text(
      (W - font.widthOfTextAtSize(safe(value, font), size)) / 2,
      y,
      value,
      size,
      font,
      tone
    )
  const line = (x: number, y: number, width = C) =>
    page.drawLine({
      start: { x, y },
      end: { x: x + width, y },
      thickness: 0.4,
      color: rule,
    })
  const groups = rosterGroups(roster)
  function headers(x: number, y: number) {
    text(x + 3, y, 'PROFISSIONAL', 6.2, bold, muted)
    right(x + C - 48, y, 'ENTRADA', 6.2, bold, muted)
    right(x + C - 2, y, 'SAÍDA', 6.2, bold, muted)
  }
  function newPage() {
    page = pdf.addPage([W, H])
    column = 0
    page.drawImage(verdant, {
      x: 64,
      y: 326,
      width: 310,
      height: (310 * verdant.height) / verdant.width,
      opacity: model < 3 ? 0.045 : 0.027,
    })
    page.drawImage(nbf, {
      x: 263,
      y: 221,
      width: 274,
      height: 274,
      opacity: model < 3 ? 0.045 : 0.027,
    })
    page.drawImage(verdant, {
      x: L,
      y: H - 86,
      width: 82,
      height: (82 * verdant.height) / verdant.width,
    })
    page.drawImage(nbf, { x: W - L - 84, y: H - 104, width: 84, height: 84 })
    ;['7CB519', '68B77A', '4AB3B0', '00728E'].forEach((hex, i) =>
      page.drawRectangle({
        x: L + (i * U) / 4,
        y: H - 104,
        width: U / 4,
        height: 1.3,
        color: color(hex),
      })
    )
    const subtitle = `${displayDate(roster.date)} | ${roster.eventName}`
    if (model === 1 || model === 3) {
      text(L, H - 140, title, 21, model === 1 ? bold : regular)
    } else
      center(
        H - 140,
        title,
        model === 2 ? 18 : 21,
        model === 2 ? bold : regular
      )
    const subtitleLines = wrap(subtitle, regular, 9, U)
    subtitleLines.forEach((s, i) =>
      center(H - 162 - i * 12, s, 9, regular, model === 2 ? green : ink)
    )
    const summary = `${roster.entries.length} ${roster.entries.length === 1 ? 'profissional' : 'profissionais'} / ${groups.length} ${groups.length === 1 ? 'bloco' : 'blocos'} / ${roster.status === 'draft' ? 'RASCUNHO' : 'FINALIZADA'}`
    const offset = (subtitleLines.length - 1) * 12
    if (model === 1) {
      const exitDates = [
        ...new Set(
          roster.entries
            .filter((entry) => entry.entry && entry.exit)
            .map(
              (entry) =>
                entry.exitDate ||
                (entry.exit < entry.entry
                  ? new Date(Date.parse(roster.date + 'T12:00:00Z') + 86400000)
                      .toISOString()
                      .slice(0, 10)
                  : roster.date)
            )
        ),
      ]
      const cards = [
        [String(roster.entries.length), 'PROFISSIONAIS'],
        [String(groups.length).padStart(2, '0'), 'BLOCOS'],
        [
          exitDates.length === 1 ? displayDate(exitDates[0]).slice(0, 5) : '—',
          'DATA DA SAÍDA',
        ],
      ]
      cards.forEach(([number, label], index) => {
        const width = (U - 14) / 3,
          x = L + index * (width + 7)
        page.drawRectangle({
          x,
          y: H - 209 - offset,
          width,
          height: 34,
          color: color('EFF5F7'),
        })
        text(x + 10, H - 196 - offset, number, 14, bold)
        text(x + 61, H - 195 - offset, label, 6.2, bold, muted)
      })
    } else {
      if (model === 2)
        page.drawRectangle({
          x: L,
          y: H - 197 - offset,
          width: U,
          height: 20,
          color: color('F0F5EE'),
        })
      center(H - 190 - offset, summary, 7.5, regular, muted)
    }
    y = top()
    line(L, 58, U)
    text(
      L,
      44,
      `${roster.kind === 'security' ? 'SEGURANÇA' : 'STAFF'} / TEMPLATE ${model} / ${roster.status === 'draft' ? 'RASCUNHO' : 'FINALIZADA'}`,
      6.2,
      bold,
      muted
    )
    right(W - L, 44, `Página ${pdf.getPageCount()}`, 6.2, regular, muted)
  }
  const top = () =>
    H -
    (model === 1 || model === 4 ? 229 : model === 3 ? 217 : 222) -
    (wrap(`${displayDate(roster.date)} | ${roster.eventName}`, regular, 9, U)
      .length -
      1) *
      12
  function nextColumn() {
    if (column === 0) {
      column = 1
      y = top()
    } else newPage()
  }
  function heading(label: string, count: number, continued = false) {
    const x = L + column * (C + gap),
      labels = wrap(
        label + (continued ? ' (continuação)' : ''),
        bold,
        8 * s,
        C - 33
      )
    const h = Math.max(
      (model === 3 || model === 4 ? 20 : 24) * s,
      labels.length * 11 * s + 10 * s
    )
    if (model === 1)
      page.drawRectangle({ x, y: y - h, width: C, height: h, color: navy })
    if (model === 2) {
      page.drawRectangle({
        x,
        y: y - h,
        width: C,
        height: h,
        color: color('ECF3E9'),
      })
      page.drawRectangle({ x, y: y - h, width: 3, height: h, color: green })
    }
    labels.forEach((line, i) =>
      text(
        x + (model < 3 ? 9 : 0),
        y - 14 * s - i * 11 * s,
        line,
        8 * s,
        bold,
        model === 1 ? rgb(1, 1, 1) : ink
      )
    )
    right(
      x + C - 6,
      y - 14 * s,
      String(count).padStart(2, '0'),
      7 * s,
      bold,
      model === 1 ? rgb(1, 1, 1) : muted
    )
    if (model >= 3) line(x, y - h)
    y -= h + 14 * s
    headers(x, y)
    y -= 18 * s
  }
  newPage()
  // Sequential reading order: left column, right column, next page.
  const rowHeight = (entry: Roster['entries'][number]) =>
    Math.max(
      22 * s,
      wrap(entry.name, model < 3 ? bold : regular, 8.1 * s, C - 105).length *
        11 *
        s +
        8 * s
    ) +
    (roster.kind === 'staff' && entry.posts.length
      ? wrap(entry.posts.join(' / '), regular, 7 * s, C - 6).length * 10 * s +
        3 * s
      : 0)
  const totalHeight = groups.reduce(
    (sum, [, entries]) =>
      sum + 60 * s + entries.reduce((height, e) => height + rowHeight(e), 0),
    0
  )
  const capacity = top() - 110
  const firstBottom =
    s === 1 && totalHeight <= capacity * 2
      ? Math.max(110, top() - totalHeight / 2 - 30)
      : 110
  const bottom = () => (column === 0 ? firstBottom : 110)
  for (const [label, entries] of groups) {
    const height = 60 * s + entries.reduce((sum, e) => sum + rowHeight(e), 0)
    const needed = s === 1 ? Math.min(height, capacity) : Math.min(height, 84 * s)
    if (y < top() && y - needed < bottom()) nextColumn()
    heading(label, entries.length)
    entries.forEach((entry, index) => {
      const h = rowHeight(entry)
      if (y - h < bottom()) {
        nextColumn()
        heading(label, entries.length, true)
      }
      const x = L + column * (C + gap)
      if (model === 1 && index % 2 === 1)
        page.drawRectangle({
          x,
          y: y - h + 12 * s,
          width: C,
          height: h,
          color: color('F7F9FA'),
        })
      const nameLines = wrap(
        entry.name,
        model < 3 ? bold : regular,
        8.1 * s,
        C - 105
      )
      nameLines.forEach((line, i) =>
        text(x + 3, y - i * 11 * s, line, 8.1 * s, model < 3 ? bold : regular)
      )
      text(
        x + C - 88,
        y,
        entry.entry || '--:--',
        8.1 * s,
        model === 1 ? bold : regular
      )
      right(
        x + C - 2,
        y,
        entry.exit || '--:--',
        7.7 * s,
        model === 1 ? bold : regular
      )
      if (roster.kind === 'staff' && entry.posts.length)
        wrap(entry.posts.join(' / '), regular, 7 * s, C - 6).forEach((line, i) =>
          text(
            x + 3,
            y - nameLines.length * 11 * s - s - i * 10 * s,
            line,
            7 * s,
            regular,
            muted
          )
        )
      y -= h
      if (model === 1) line(x, y + 9 * s)
    })
    y -= 16 * s
  }
  return pdf
}

// Shrinks the content until the whole roster fits on a single page.
export async function createRosterPdf(roster: Roster) {
  let pdf = await buildRosterPdf(roster, 1)
  for (let s = 0.92; pdf.getPageCount() > 1 && s >= 0.5; s -= 0.04) {
    pdf = await buildRosterPdf(roster, s)
  }
  return pdf.save()
}
