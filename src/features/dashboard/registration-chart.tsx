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
  const width = 360
  const height = 180
  const left = 30
  const plotWidth = width - left - 8
  const plotHeight = height - 30
  const step = plotWidth / Math.max(1, buckets.length)
  const tickEvery = Math.max(1, Math.ceil(buckets.length / 7))
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role='img'
      aria-label={label}
      className='h-40 w-full min-w-0 sm:h-[200px]'
    >
      <title>{label}</title>
      <desc>
        {buckets.map((bucket) => `${bucket.name}: ${bucket.total}`).join('; ')}
      </desc>
      {[...new Set([0, Math.ceil(max / 2), max])].map((value) => (
        <g key={value}>
          <line
            x1={left}
            x2={width}
            y1={plotHeight * (1 - value / max)}
            y2={plotHeight * (1 - value / max)}
            stroke='currentColor'
            opacity='.15'
            strokeDasharray='3 3'
          />
          <text
            x={left - 6}
            y={plotHeight * (1 - value / max) + 4}
            textAnchor='end'
            fontSize='12'
            fill='currentColor'
          >
            {value}
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
                fontSize='12'
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
