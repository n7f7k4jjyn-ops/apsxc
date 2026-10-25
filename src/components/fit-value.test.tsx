import '@/styles/index.css'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { FitValue } from './fit-value'

describe('full numeric values in compact cards', () => {
  it('retains currency and cents while fitting a narrow mobile card', async () => {
    const value = 'R$ 9.876.543.210,98'
    const screen = await render(<div style={{ width: 120 }}><FitValue value={value} maxSize={28} /></div>)
    const result = screen.getByText(value, { exact: true })
    await expect.element(result).toHaveTextContent(value)
    await expect.poll(() => {
      const element = result.element()
      return element.scrollWidth <= element.clientWidth + 1
    }).toBe(true)
    expect(parseFloat(getComputedStyle(result.element()).fontSize)).toBeGreaterThanOrEqual(12)
  })
})
