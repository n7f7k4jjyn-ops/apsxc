import { useLayoutEffect, useRef, useState } from 'react'

// Keep full numeric values readable without abbreviating or clipping cents.
export function FitValue({ value, maxSize = 24, minSize = 12 }: { value: string; maxSize?: number; minSize?: number }) {
  const container = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState(maxSize)
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return
    const fit = () => {
      const width = element.clientWidth
      if (!width) return
      const style = getComputedStyle(element)
      context.font = `${style.fontWeight} ${maxSize}px ${style.fontFamily}`
      const naturalWidth = context.measureText(value).width
      const next = Math.max(minSize, Math.min(maxSize, Math.floor((width - 4) / Math.max(1, naturalWidth) * maxSize)))
      setSize(current => current === next ? current : next)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    fit()
    let alive = true
    void document.fonts.ready.then(() => { if (alive) fit() })
    return () => { alive = false; observer.disconnect() }
  }, [value, maxSize, minSize])
  return <span ref={container} data-fit-value='' className='block min-w-0 max-w-full tabular-nums' style={{ fontSize: size, lineHeight: 1.25, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{value}</span>
}
