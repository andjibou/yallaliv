import React from 'react';

/**
 * Graphique en barres SVG (sans dépendance).
 * data : [{label:'05/09', value: 123}, ...]
 */
export function BarsChart({ data, color = '#0e9f6e', fmt = (v) => v, height = 130 }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const W = 640, H = height, pad = 26;
  const bw = (W - pad * 2) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 28}`} style={{ width: '100%', display: 'block' }} role="img">
      {data.map((d, i) => {
        const h = Math.max(d.value > 0 ? 4 : 2, (d.value / max) * (H - 34));
        const x = pad + i * bw + bw * 0.18;
        const y = H - h;
        return (
          <g key={i + '-' + d.label}>
            <rect x={x} y={y} width={bw * 0.64} height={h} rx={Math.min(5, bw * 0.3)} fill={d.value > 0 ? color : '#e2e8f0'} />
            {d.value > 0 && (
              <text x={x + bw * 0.32} y={y - 5} fontSize="10" textAnchor="middle" fill="#475569">{fmt(d.value)}</text>
            )}
            <text x={x + bw * 0.32} y={H + 14} fontSize="9.5" textAnchor="middle" fill="#94a3b8">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export const compactMoney = (v) => (v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(v)));
