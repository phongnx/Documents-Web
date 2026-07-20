// Biểu đồ tự vẽ bằng SVG/CSS, không thêm thư viện ngoài.

export interface BarDatum {
  label: string;
  value: number;
}

// Bar chart ngang: nhãn + thanh (độ dài theo tỉ lệ max) + số.
export function BarChart({
  data,
  color = 'var(--primary)',
  empty = 'Không có dữ liệu',
}: {
  data: BarDatum[];
  color?: string;
  empty?: string;
}) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);
  if (data.length === 0 || max === 0) {
    return <p className="muted">{empty}</p>;
  }
  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div key={d.label} className="bar-row">
          <span className="bar-label" title={d.label}>
            {d.label}
          </span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: color,
              }}
            />
          </div>
          <span className="bar-value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

// Donut chart bằng SVG stroke-dasharray + chú thích.
export function DonutChart({
  segments,
  size = 160,
}: {
  segments: DonutSegment[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const cx = size / 2;

  if (total === 0) {
    return <p className="muted">Không có dữ liệu</p>;
  }

  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          {segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const len = (s.value / total) * c;
              const dash = `${len} ${c - len}`;
              const el = (
                <circle
                  key={s.label}
                  cx={cx}
                  cy={cx}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={20}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </g>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="donut-center"
        >
          {total}
        </text>
      </svg>
      <ul className="donut-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="dot" style={{ background: s.color }} />
            {s.label}
            <span className="muted"> · {s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
