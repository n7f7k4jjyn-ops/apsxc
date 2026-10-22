export const PUBLIC_FORM_META = {
  equipe: { title: 'Equipe Verdant — Atualização cadastral', description: 'Atualização cadastral e avaliação interna de quem já presta serviços na Verdant.', image: '/images/verdant-logo-colorida.webp', canonicalPath: '/equipe' },
  'trabalhe-conosco': { title: 'Faça parte da equipe Verdant', description: 'Cadastre seu interesse para oportunidades de trabalho eventual na Verdant, em Curitiba.', image: '/images/verdant-logo-colorida.webp', canonicalPath: '/trabalhe-conosco' },
  djs: { title: 'Lista de DJs | Verdant CWB', description: 'Escolha o evento e o DJ vinculado. Confira horário, valor e condições antes de enviar sua inscrição.', image: '/images/form-icons/djs.webp' },
  influencers: { title: 'Lista de Influencers | Verdant CWB', description: 'Escolha o evento e o Influencer vinculado. Confira as informações antes de enviar sua inscrição.', image: '/images/form-icons/influencers.webp' },
  lover: { title: 'Lista Amiga | Verdant CWB', description: 'Confira data, horário e valor da Lista Amiga antes de enviar seu nome.', image: '/images/form-icons/lovers.webp', canonicalPath: '/lovers' },
  lovers: { title: 'Lista Amiga | Verdant CWB', description: 'Confira data, horário e valor da Lista Amiga antes de enviar seu nome.', image: '/images/form-icons/lovers.webp', canonicalPath: '/lovers' },
  vip: { title: 'Lista VIP | Verdant CWB', description: 'Lista VIP para pessoas trans e artistas Drag. Consulte os eventos e as regras para solicitar inclusão.', image: '/images/form-icons/vip.webp' },
  aniversario: { title: 'Lista de Aniversário | Verdant CWB', description: 'Comemore na Verdant. Consulte as regras, a data e o limite de convidados antes de enviar sua lista.', image: '/images/form-icons/aniversario.webp' },
  'entrada-gratuita': { title: 'Entrada Gratuita | Verdant CWB', description: 'Ação temporária de entrada gratuita até 00h para eventos selecionados. Após o horário, aplica-se a portaria vigente.', image: '/images/form-icons/lovers.webp' },
}

const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function setMetaContent(html, attribute, key, content) {
  const escaped = escapeHtml(content)
  const tagPattern = /<meta\b[^>]*>/gi
  return html.replace(tagPattern, (tag) => {
    const match = tag.match(new RegExp(`\\b${attribute}=["']${key}["']`, 'i'))
    if (!match) return tag
    if (/\bcontent=["'][^"']*["']/i.test(tag)) {
      return tag.replace(/\bcontent=(["'])[^"']*\1/i, `content="${escaped}"`)
    }
    return tag.replace(/\s*\/?>(\s*)$/, ` content="${escaped}" />$1`)
  })
}

function publicOrigin(baseUrl) {
  try {
    const url = new URL(baseUrl || 'https://central.verdantcwb.com')
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url.origin
  } catch {}
  return 'https://central.verdantcwb.com'
}

export function personalizeFormShareHtml(html, slug, baseUrl = 'https://central.verdantcwb.com') {
  const meta = PUBLIC_FORM_META[slug]
  if (!meta) return html
  const title = escapeHtml(meta.title)
  const description = escapeHtml(meta.description)
  const origin = publicOrigin(baseUrl)
  const canonical = `${origin}${meta.canonicalPath || `/lista/${encodeURIComponent(slug)}`}`
  const image = `${origin}${meta.image}`
  let output = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
  output = setMetaContent(output, 'name', 'title', title)
  output = setMetaContent(output, 'name', 'description', description)
  output = setMetaContent(output, 'property', 'og:title', title)
  output = setMetaContent(output, 'property', 'og:description', description)
  output = setMetaContent(output, 'property', 'og:image', image)
  output = setMetaContent(output, 'property', 'twitter:title', title)
  output = setMetaContent(output, 'property', 'twitter:description', description)
  output = setMetaContent(output, 'property', 'twitter:image', image)
  output = setMetaContent(output, 'property', 'og:url', canonical)
  if (!/\bproperty=["']og:url["']/i.test(output)) {
    output = output.replace('</head>', `  <meta property="og:url" content="${canonical}" />\n</head>`)
  }
  const imageAlt = escapeHtml(meta.title)
  return output.replace('</head>', `  <meta property="og:image:alt" content="${imageAlt}" />\n  <link rel="canonical" href="${canonical}" />\n</head>`)
}

