import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {APPLE_TOUCH_ICON_DATA_URL, LANDING_MARK_ICON_DATA_URL} from '../brandIcon';
import {ensureBrandAssets} from '../../scripts/ensure-brand-assets.mjs';

test('ensureBrandAssets restores canonical brand PNGs from tracked brandIcon.ts on a clean checkout', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'elsewhere-brand-assets-'));
  try {
    fs.mkdirSync(path.join(tmpRoot, 'src'), {recursive: true});
    fs.copyFileSync(
      path.join(process.cwd(), 'src/brandIcon.ts'),
      path.join(tmpRoot, 'src/brandIcon.ts')
    );

    const first = ensureBrandAssets(tmpRoot);
    assert.deepEqual(first.updated, [
      'public/apple-touch-icon.png',
      'public/assets/aistudio/image_8fde87a3.png',
    ]);

    const touchDisk = fs.readFileSync(path.join(tmpRoot, 'public/apple-touch-icon.png'));
    const markDisk = fs.readFileSync(path.join(tmpRoot, 'public/assets/aistudio/image_8fde87a3.png'));
    const touchExpected = Buffer.from(APPLE_TOUCH_ICON_DATA_URL.split(',')[1], 'base64');
    const markExpected = Buffer.from(LANDING_MARK_ICON_DATA_URL.split(',')[1], 'base64');

    assert.equal(touchDisk.equals(touchExpected), true);
    assert.equal(markDisk.equals(markExpected), true);

    const second = ensureBrandAssets(tmpRoot);
    assert.deepEqual(second.updated, []);
  } finally {
    fs.rmSync(tmpRoot, {recursive: true, force: true});
  }
});
