// Generuje ikony PWA (PNG) z SVG: npx tsx scripts/icons.ts
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync } from 'node:fs'

/** Piłka (limonka) na granatowym tle. `pad` = margines (maskable potrzebuje większego). */
const svg = (pad: number) => {
  const r = 50 - pad
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#0b1120"/>
  <circle cx="50" cy="50" r="${r}" fill="#c8f53c"/>
  <g fill="none" stroke="#0b1120" stroke-width="${(r * 0.14).toFixed(2)}" stroke-linecap="round">
    <path d="M ${50 - r * 0.62} ${50 - r * 0.78} A ${r * 0.95} ${r * 0.95} 0 0 1 ${50 - r * 0.62} ${50 + r * 0.78}"/>
    <path d="M ${50 + r * 0.62} ${50 - r * 0.78} A ${r * 0.95} ${r * 0.95} 0 0 0 ${50 + r * 0.62} ${50 + r * 0.78}"/>
  </g>
</svg>`
}

const out: [string, number, number][] = [
  ['public/icons/icon-192.png', 192, 12],
  ['public/icons/icon-512.png', 512, 12],
  ['public/icons/maskable-512.png', 512, 24], // bezpieczna strefa Androida: środkowe 80%
  ['public/icons/apple-touch-icon.png', 180, 14],
]
for (const [file, size, pad] of out) {
  const png = new Resvg(svg(pad), { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(file, png)
  console.log(file, size)
}
writeFileSync('public/icons/icon.svg', svg(12))
