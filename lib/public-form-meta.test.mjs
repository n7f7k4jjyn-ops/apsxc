import assert from 'node:assert/strict'
import test from 'node:test'
import { personalizeFormShareHtml } from './public-form-meta.mjs'

const html = '<html><head><title>Original</title><meta property="og:image" content="/original.png"></head><body></body></html>'

test('form share metadata uses the configured public origin', () => {
  const output = personalizeFormShareHtml(html, 'djs', 'https://preview.verdant.example:8443/panel')

  assert.match(output, /<link rel="canonical" href="https:\/\/preview\.verdant\.example:8443\/lista\/djs"/)
  assert.match(output, /property="og:image" content="https:\/\/preview\.verdant\.example:8443\/images\/form-icons\/djs\.webp"/)
})

test('form share metadata defaults to the Central Verdant origin and ignores unknown forms', () => {
  const output = personalizeFormShareHtml(html, 'lover')

  assert.match(output, /href="https:\/\/central\.verdantcwb\.com\/lovers"/)
  assert.match(personalizeFormShareHtml(html, 'lovers'), /href="https:\/\/central\.verdantcwb\.com\/lovers"/)
  assert.equal(personalizeFormShareHtml(html, 'unknown'), html)
})


test('work opportunities have their own title and canonical path', () => {
  const output = personalizeFormShareHtml(html, 'trabalhe-conosco', 'https://verdantcwb.com')
  assert.match(output, /<title>Faça parte da equipe Verdant<\/title>/)
  assert.match(output, /href="https:\/\/verdantcwb\.com\/trabalhe-conosco"/)
  assert.doesNotMatch(output, /\/lista\/trabalhe-conosco/)
})

test('team updates have their own title and canonical path', () => {
  const output = personalizeFormShareHtml(html, 'equipe', 'https://connect.verdantcwb.com')
  assert.match(output, /<title>Equipe Verdant — Atualização cadastral<\/title>/)
  assert.match(output, /href="https:\/\/connect\.verdantcwb\.com\/equipe"/)
  assert.doesNotMatch(output, /\/lista\/equipe/)
})
