// The summary only needs a small bar chart. SVG keeps this responsive without
// downloading and executing the full charting library on every mobile visit.
export function RegistrationChart({
  buckets,
  label,
}: {
  buckets: { name: string; total: number }[]
  label: string
}) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.total))
  const width = 600
  const height = 180
  const left = 30
  const plotWidth = width - left - 8
  const plotHeight = height - 30
  const step = plotWidth / Math.max(1, buckets.length)
  const tickEvery = Math.max(1, Math.ceil(buckets.length / 10))
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role='img'
      aria-label={label}
      className='h-40 w-full min-w-0 sm:h-[200px]'
    >
      <title>{label}</title>
      {[0, 0.5, 1].map((fraction) => (
        <g key={fraction}>
          <line
            x1={left}
            x2={width}
            y1={plotHeight * (1 - fraction)}
            y2={plotHeight * (1 - fraction)}
            stroke='currentColor'
            opacity='.15'
            strokeDasharray='3 3'
          />
          <text
            x={left - 6}
            y={plotHeight * (1 - fraction) + 4}
            textAnchor='end'
            fontSize='10'
            fill='currentColor'
          >
            {Math.round(max * fraction)}
          </text>
        </g>
      ))}
      {buckets.map((bucket, index) => {
        const barHeight = (bucket.total / max) * plotHeight
        const x = left + index * step
        return (
          <g key={`${index}-${bucket.name}`}>
            <rect
              x={x + step * 0.15}
              y={plotHeight - barHeight}
              width={step * 0.7}
              height={barHeight}
              rx={Math.min(4, step / 4)}
              fill='var(--primary)'
            >
              <title>{`${bucket.name}: ${bucket.total} ${label}`}</title>
            </rect>
            {index % tickEvery === 0 && (
              <text
                x={x + step / 2}
                y={height - 10}
                textAnchor='middle'
                fontSize='10'
                fill='currentColor'
              >
                {bucket.name}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
