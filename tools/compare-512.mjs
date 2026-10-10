/**
 * Simulator: how each candidate file looks displayed in a fixed 512x512
 * marketplace box (object-fit: contain), with a 3x zoom of the dense region.
 *
 *   node tools/compare-512.mjs <blockheight> [outHtml]
 *
 * Produces a self-contained HTML (images embedded as data URIs) you can open
 * in any browser. No server needed.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { renderWebp } from "../dist/webpRenderer.js";
import { renderSvg } from "../dist/svgRenderer.js";
import { fetchRawBlockHex, hexToBytes, parseRawBlock, generateMondrianArray } from "../dist/index.js";

const H = Number(process.argv[2] ?? 830000);
const outHtml = process.argv[3] ?? `/tmp/compare-512-${H}.html`;

const hex = await fetchRawBlockHex(H);
const { rects, viewBox } = generateMondrianArray(parseRawBlock(hexToBytes(hex)).txValues);

const cands = [
  { n: "direct 512", note: "exact 512 · no rescale", buf: await renderWebp(rects, viewBox, { size: 512 }) },
  { n: "native grid", note: "perfect gaps · non-512", buf: await renderWebp(rects, viewBox, { size: 512, native: true }) },
  { n: "direct 1024", note: "over-size · rescaled to 512", buf: await renderWebp(rects, viewBox, { size: 1024 }) },
  { n: "static SVG", note: "vector · viewer rasterizes", buf: Buffer.from(renderSvg(rects, viewBox, { size: 512 })) },
];

const prepped = [];
for (const c of cands) {
  const inBox = await sharp(c.buf).resize(512, 512, { fit: "contain", background: "#000000" }).png().toBuffer();
  const zoom = await sharp(inBox).extract({ left: 300, top: 300, width: 180, height: 180 })
    .resize(512, 512, { kernel: "nearest" }).png().toBuffer();
  prepped.push({ n: c.n, note: c.note, kb: (c.buf.length / 1024).toFixed(1), inBox: inBox.toString("base64"), zoom: zoom.toString("base64") });
}

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>512-box comparison block ${H}</title>
<style>
html,body{margin:0;background:#0d0d0d;color:#eee;font-family:system-ui,sans-serif}
.wrap{padding:16px 20px;max-width:1320px;margin:0 auto}
h1{font-size:17px;margin:0 0 3px}.note{color:#999;font-size:12px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.card{background:#161616;border:1px solid #2a2a2a;border-radius:9px;padding:11px}
h2{font-size:13px;margin:0;color:#ff9d3c}.meta{font-size:11px;color:#888;margin:2px 0 8px}
img{display:block;width:100%}.zoom{margin-top:8px}.cap{font-size:10px;color:#777;margin:3px 0 5px}
</style></head><body><div class="wrap">
<h1>Bitmaps in a fixed 512&times;512 marketplace box &mdash; block ${H}</h1>
<div class="note">Top = file shown in a 512 box (object-fit: contain, like a marketplace &lt;img&gt;). Bottom = 3&times; zoom of dense region to reveal gap quality.</div>
<div class="grid">
${prepped.map(p => `<div class="card"><h2>${p.n}</h2><div class="meta">${p.kb} KB &middot; ${p.note}</div><img src="data:image/png;base64,${p.inBox}"><div class="zoom"><div class="cap">3&times; zoom</div><img src="data:image/png;base64,${p.zoom}"></div></div>`).join("")}
</div></div></body></html>`;

writeFileSync(outHtml, html);
console.log("wrote", outHtml);
