// Generates resources/icon.png (256x256 droplet) with no image libraries: rasterise + zlib PNG encode.
import { deflateSync, crc32 } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const N = 512, SS = 4
const px = Buffer.alloc(N * N * 4)
const cx = 0.5, cy = 0.62, r = 0.33, top = 0.06
const inDrop = (x, y) => {
  if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true
  if (y < top || y > cy) return false
  const t = (y - top) / (cy - top)
  return Math.abs(x - cx) <= r * Math.pow(t, 0.85)
}
const inCircle = (x, y, ox, oy, rr) => (x - ox) ** 2 + (y - oy) ** 2 <= rr * rr
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  let a = 0, rs = 0, gs = 0, bs = 0
  for (let sj = 0; sj < SS; sj++) for (let si = 0; si < SS; si++) {
    const x = (i + (si + 0.5) / SS) / N, y = (j + (sj + 0.5) / SS) / N
    if (!inDrop(x, y)) continue
    let c = [56 - (y * 30), 189 - y * 40, 248]
    if (inCircle(x, y, 0.38, 0.45, 0.07)) c = [255, 255, 255]
    if (inCircle(x, y, 0.4, 0.62, 0.055) || inCircle(x, y, 0.6, 0.62, 0.055)) c = [15, 40, 70]
    if (inCircle(x, y, 0.415, 0.605, 0.018) || inCircle(x, y, 0.615, 0.605, 0.018)) c = [255, 255, 255]
    a++; rs += c[0]; gs += c[1]; bs += c[2]
  }
  const o = (j * N + i) * 4
  if (a) { px[o] = rs / a; px[o + 1] = gs / a; px[o + 2] = bs / a; px[o + 3] = (255 * a) / (SS * SS) }
}
const raw = Buffer.alloc(N * (N * 4 + 1))
for (let j = 0; j < N; j++) px.copy(raw, j * (N * 4 + 1) + 1, j * N * 4, (j + 1) * N * 4)
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6
mkdirSync('resources', { recursive: true })
writeFileSync('resources/icon.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
console.log('wrote resources/icon.png')
