import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readdirSync, readFileSync, rmSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {uploadBatch, uploadFiles} from './upload.mjs';

// The demo batch as a browser sends a chosen folder: every file under "demo/...".
const walk = (dir, base = '') => readdirSync(dir).flatMap(f => statSync(join(dir, f)).isDirectory() ? walk(join(dir, f), `${base}${f}/`) : [`${base}${f}`]);
const demoFiles = () => walk('battery/demo').map(p => ({path: `demo/${p}`, text: readFileSync(join('battery/demo', p), 'utf8')}));
const store = () => mkdtempSync(join(tmpdir(), 'upload-test-'));

test('a batch folder uploaded from the browser gives the same job input as upload.mjs', () => {
 const a = store(), b = store();
 try { assert.equal(uploadFiles(demoFiles(), a), uploadBatch('battery/demo', b)); }
 finally { rmSync(a, {recursive: true, force: true}); rmSync(b, {recursive: true, force: true}); }
});

test('an upload cannot reach files outside the batch', () => {
 const s = store();
 try {
  const files = demoFiles();
  assert.throws(() => uploadFiles([...files, {path: 'demo/../secret.txt', text: 'x'}], s), /not allowed/);
  const manifest = files.find(f => f.path === 'demo/manifest.json');
  const m = JSON.parse(manifest.text); m.documents[0].path = '../../.env';
  assert.throws(() => uploadFiles(files.map(f => f === manifest ? {...f, text: JSON.stringify(m)} : f), s), /not in the upload/);
  assert.throws(() => uploadFiles([], s), /No files/);
 } finally { rmSync(s, {recursive: true, force: true}); }
});
