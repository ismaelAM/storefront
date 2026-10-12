import { copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Deterministic assets from the owner's existing logo; no generated imagery.
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const font = fileURLToPath(new URL("../assets/fonts/Geist-Regular.ttf", import.meta.url));
if (process.argv[2]) await copyFile(process.argv[2], `${publicDir}bison-brand-logo.webp`);
const logo = await readFile(`${publicDir}bison-brand-logo.webp`);
const cream = "#f5f0e4";
const brown = "#362b20";

async function label(text, size, color = brown) {
  return sharp({ text: { text: `<span foreground="${color}">${text}</span>`, font: `Geist ${size}`, fontfile: font, rgba: true } }).png().toBuffer();
}

const background = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="${cream}"/><rect x="470" y="117" width="92" height="8" rx="4" fill="#efbd5b"/><rect x="0" y="548" width="1200" height="82" fill="${brown}"/></svg>`);
await sharp(background).composite([
  { input: await sharp(logo).trim().resize({ width: 330, height: 320, fit: "inside" }).png().toBuffer(), left: 70, top: 146 },
  { input: await label("Tu tienda friki", 58), left: 470, top: 164 },
  { input: await label("de confianza", 58), left: 470, top: 242 },
  { input: await label("TCG · Mesa y rol · Manga", 29), left: 470, top: 366 },
  { input: await label("Accesorios y coleccionables", 29), left: 470, top: 411 },
  { input: await label("bisontcg.com", 31, cream), left: 70, top: 573 },
]).webp({ quality: 92 }).toFile(`${publicDir}bison-social-image.webp`);

for (const [name, size] of [["bison-icon.png", 192], ["bison-apple-icon.png", 180]]) {
  await sharp({ create: { width: size, height: size, channels: 4, background: cream } })
    .composite([{ input: await sharp(logo).trim().resize({ width: size - 24, height: size - 24, fit: "inside" }).png().toBuffer(), gravity: "centre" }])
    .png().toFile(`${publicDir}${name}`);
}
for (const name of ["bison-social-image.webp", "bison-icon.png", "bison-apple-icon.png"]) {
  const { width, height } = await sharp(`${publicDir}${name}`).metadata();
  console.log(`${name}: ${width}x${height}`);
}

// ICO supports PNG frames. Keep Next's file-based favicon branded too.
const sizes = [32, 48, 192];
const frames = await Promise.all(sizes.map((size) => sharp(`${publicDir}bison-icon.png`).resize(size, size).png().toBuffer()));
const directory = Buffer.alloc(6 + 16 * frames.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;
for (const [index, frame] of frames.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
}
await writeFile(fileURLToPath(new URL("../src/app/favicon.ico", import.meta.url)), Buffer.concat([directory, ...frames]));
