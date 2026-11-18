import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function extractPngFromBrandModule(source, exportName) {
  const match = source.match(
    new RegExp(`${exportName}\\s*=\\s*["'\`]data:image/png;base64,([A-Za-z0-9+/=]+)["'\`]`)
  );
  if (!match) {
    throw new Error(`Missing PNG data URL for ${exportName} in src/brandIcon.ts`);
  }
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Error(`Invalid PNG bytes decoded from ${exportName} in src/brandIcon.ts`);
  }
  return bytes;
}

function writeIfChanged(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath);
    if (existing.equals(bytes)) return false;
  }
  fs.writeFileSync(filePath, bytes);
  return true;
}

export function ensureBrandAssets(root = process.cwd()) {
  const source = fs.readFileSync(path.join(root, 'src/brandIcon.ts'), 'utf8');
  const assets = [
    {
      relativePath: 'public/apple-touch-icon.png',
      bytes: extractPngFromBrandModule(source, 'APPLE_TOUCH_ICON_DATA_URL'),
    },
    {
      relativePath: 'public/assets/aistudio/image_8fde87a3.png',
      bytes: extractPngFromBrandModule(source, 'LANDING_MARK_ICON_DATA_URL'),
    },
  ];
  const updated = [];
  for (const asset of assets) {
    if (writeIfChanged(path.join(root, asset.relativePath), asset.bytes)) {
      updated.push(asset.relativePath);
    }
  }
  return {
    assets: assets.map((asset) => ({path: asset.relativePath, bytes: asset.bytes.length})),
    updated,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = ensureBrandAssets(process.cwd());
  console.log('Brand assets ready:', JSON.stringify(result));
}
