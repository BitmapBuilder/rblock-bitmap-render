import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { renderWebp } from "../dist/webpRenderer.js";
import { renderSvg } from "../dist/svgRenderer.js";
import { fetchRawBlockHex, hexToBytes, parseRawBlock, generateMondrianArray } from "../dist/index.js";

const H = Number(process.argv[2] ?? 830000);
const OUT = process.argv[3] ?? "/home/honeyd/Downloads/bitmap-options.html";
const hex = await fetchRawBlockHex(H);
const { rects, viewBox } = generateMondrianArray(parseRawBlock(hexToBytes(hex)).txValues);

const KB = (b) => (b.length / 1024).toFixed(1);

// ---- build every candidate HANDOVER file ----
const candidates = [];

// 1. WebP direct 512
candidates.push({
  group: "WebP",
  title: "WebP 512 · direct",
  desc: "rendered at exactly 512, no rescale",
  buf: await renderWebp(rects, viewBox, { size: 512 }),
  kind: "raster",
});

// 2. WebP direct 1024 (display downscales to 512)
candidates.push({
  group: "WebP",
  title: "WebP 1024 · downscaled",
  desc: "1024 source, browser scales to 512",
  buf: await renderWebp(rects, viewBox, { size: 1024 }),
  kind: "raster",
});

// 3. WebP native grid (perfect gaps, non-512, forced into 512)
{
  const b = await renderWebp(rects, viewBox, { size: 512, native: true });
  const m = await sharp(b).metadata();
  candidates.push({
    group: "WebP",
    title: `WebP native ${m.width} · forced 512`,
    desc: "perfect gaps, resampled to 512",
    buf: b,
    kind: "raster",
  });
}

// 4. WebP supersampled 512 (anti-aliased)
{
  const big = await sharp(await renderWebp(rects, viewBox, { size: 1024 })).raw().toBuffer({ resolveWithObject: true });
  const aa = await sharp(big.data, { raw: { width: big.info.width, height: big.info.height, channels: big.info.channels } })
    .resize(512, 512, { kernel: "lanczos3" }).png().toBuffer();
  candidates.push({
    group: "WebP",
    title: "WebP 512 · anti-aliased",
    desc: "supersampled, smooth edges",
    buf: await sharp(aa).webp({ lossless: true }).toBuffer(),
    kind: "raster",
  });
}

// 5. SVG declared 512 (rasterized to 512 by viewer)
candidates.push({
  group: "SVG",
  title: "SVG 512 · rasterized",
  desc: "vector drawn fresh at 512",
  buf: Buffer.from(renderSvg(rects, viewBox, { size: 512 })),
  kind: "svg",
});

// 6. SVG declared 1024 (rasterized to 512 by viewer)
candidates.push({
  group: "SVG",
  title: "SVG 1024 · rasterized",
  desc: "vector declared 1024, drawn at 512",
  buf: Buffer.from(renderSvg(rects, viewBox, { size: 1024 })),
  kind: "svg",
});

// 7. SVG no size declared (intrinsic = viewBox, tiny)
candidates.push({
  group: "SVG",
  title: "SVG no-size (broken)",
  desc: "no width/height → rasterizer uses viewBox",
  buf: Buffer.from(renderSvg(rects, viewBox)),
  kind: "svg",
});

// 8. WebP native padded to exactly 512 (perfect gaps, NO upscale — border only)
{
  // pick the largest native step that fits within 512 (even px/unit scale)
  const long = Math.max(viewBox[2], viewBox[3]) - 0.5;
  let s = Math.max(2, Math.floor(512 / long));
  if (s % 2 !== 0) s -= 1;
  const nativeSide = Math.round(long * s);
  const nativeBuf = await renderWebp(rects, viewBox, { size: nativeSide, native: true });
  const meta0 = await sharp(nativeBuf).metadata();
  // pad to 512, centered, 1:1 (no resize)
  const padded = await sharp({
    create: { width: 512, height: 512, channels: 3, background: "#000000" },
  })
    .composite([{ input: nativeBuf, gravity: "center" }])
    .webp({ lossless: true })
    .toBuffer();
  candidates.push({
    group: "Hybrid",
    title: `WebP native ${meta0.width} · padded 512`,
    desc: `perfect gaps, 1:1 + border (no upscale)`,
    buf: padded,
    kind: "raster",
  });
}

// ---- prepare display (in a 512 box) + zoom for each ----
const prepped = [];
for (const c of candidates) {
  // how the site displays it: fit into a 512x512 box
  const inBox = await sharp(c.buf).resize(512, 512, { fit: "contain", background: "#000000" }).png().toBuffer();
  const meta = await sharp(inBox).metadata();
  // zoom: 4x on a dense lower-right region (fixed source coords)
  const zc = 128;
  const zleft = Math.min(meta.width - zc, Math.floor(meta.width * 0.62));
  const ztop = Math.min(meta.height - zc, Math.floor(meta.height * 0.62));
  const zoom = await sharp(inBox).extract({ left: zleft, top: ztop, width: zc, height: zc })
    .resize(512, 512, { kernel: "nearest" }).png().toBuffer();
  prepped.push({ ...c, kb: KB(c.buf), inBox: inBox.toString("base64"), zoom: zoom.toString("base64") });
}

const groups = ["WebP", "SVG", "Hybrid"];
const cards = prepped.map(p => `
  <div class="card">
    <div class="grp">${p.group}</div>
    <h2>${p.title}</h2>
    <div class="meta">${p.kb} KB &middot; ${p.desc}</div>
    <div class="frame"><img src="data:image/png;base64,${p.inBox}"></div>
    <div class="zcap">4&times; zoom &middot; dense region</div>
    <div class="zframe"><img src="data:image/png;base64,${p.zoom}"></div>
  </div>`).join("");

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bitmap delivery options — block ${H}</title>
<style>
html,body{margin:0;background:#0b0b0b;color:#ececec;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{padding:20px 24px;max-width:1500px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}
.sub{color:#9a9a9a;font-size:13px;margin-bottom:20px;max-width:900px;line-height:1.5}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.card{background:#151515;border:1px solid #292929;border-radius:11px;padding:13px}
.grp{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#666;margin-bottom:3px}
h2{font-size:14px;margin:0 0 2px;color:#ff9d3c;line-height:1.3}
.meta{font-size:11px;color:#8f8f8f;margin:3px 0 10px;line-height:1.4}
.frame{width:100%;aspect-ratio:1/1;background:#000;border:1px solid #333;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.frame img{width:100%;height:100%;object-fit:contain;image-rendering:auto}
.zcap{font-size:10px;color:#777;margin:9px 0 4px}
.zframe{width:100%;aspect-ratio:1/1;background:#000;border:1px solid #553;border-radius:6px;overflow:hidden}
.zframe img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
</style></head><body><div class="wrap">
<h1>Bitmap delivery options &mdash; every format discussed &mdash; block ${H}</h1>
<div class="sub">Each card: the SOURCE FILE we would hand over (size in KB shown), displayed inside a fixed 512&times;512 box exactly as the marketplace does (object-fit: contain), then a 4&times; zoom of the dense lower-right region so gap quality is visible. Same artwork, same crop, all comparable.</div>
<div class="grid">${cards}</div>
</div></body></html>`;

writeFileSync(OUT, html);
console.log("wrote", OUT);
for (const p of prepped) console.log(`  ${p.group} | ${p.title} | ${p.kb} KB`);
