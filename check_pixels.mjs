import sharp from 'sharp';
import fs from 'fs';

const img = sharp('/home/honeyd/DEV/TYPESCRIPT/SVGBitmaps-from-rBlock/output/830000.webp');
const meta = await img.metadata();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

let orange = 0, dark = 0, other = 0;
for (let i = 0; i < data.length; i += info.channels) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (r === 255 && g === 165 && b === 0) orange++;
  else if (r === 26 && g === 26 && b === 26) dark++;
  else other++;
}
const total = info.width * info.height;
console.log(`dims=${info.width}x${info.height} channels=${info.channels}`);
console.log(`orange=${(orange / total * 100).toFixed(2)}% dark=${(dark / total * 100).toFixed(2)}% other=${(other / total * 100).toFixed(2)}%`);
console.log(`file size=${(fs.statSync('/home/honeyd/DEV/TYPESCRIPT/SVGBitmaps-from-rBlock/output/830000.webp').size / 1024).toFixed(1)} KB`);
