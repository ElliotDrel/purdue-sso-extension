import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const name = `purdue-sso-extension-${manifest.version}`;
const folder = resolve('dist', name);
await mkdir(folder, { recursive: true });
const files = ['manifest.json', 'content.js', 'options.html', 'options.js', 'popup.html', 'popup.js', 'setup-core.js', 'ui.css', 'README.md', 'NOTICE.md'];
for (const file of files) await copyFile(file, resolve(folder, file));
const zip = resolve('dist', `${name}.zip`);
// Standard ZIP with stored entries: no OS archive command or dependency needed.
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const entries = [];
const directory = [];
let offset = 0;
for (const file of files) {
  const data = await readFile(resolve(folder, file));
  const filename = Buffer.from(`${name}/${file}`, 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(33, 12); // 1980-01-01, deterministic archive timestamp.
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  entries.push(local, filename, data);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(33, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28);
  central.writeUInt32LE(offset, 42);
  directory.push(central, filename);
  offset += local.length + filename.length + data.length;
}
const centralData = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralData.length, 12);
end.writeUInt32LE(offset, 16);
await writeFile(zip, Buffer.concat([...entries, centralData, end]));
console.log(`Created ${zip}`);
