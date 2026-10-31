import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fetchRemoteFiles, isPublicAddress} from './remote-files.mjs';
import {parseJobInput} from './job-input.mjs';
import {loadJobInputs} from './battery/ingest.mjs';

// Named gap (open problem #3): a buyer outside our machine had no way to send its documents.
const bytes = readFileSync('battery/demo/packs/A/invoice-2021-de.txt');
const hash = createHash('sha256').update(bytes).digest('hex');
const doc = (over = {}) => ({doc_id: 'packA-invoice-2021-de', sha256: hash, url: 'https://files.example.com/a.txt', pack_id: 'A', kind: 'service_invoice', language: 'de', ...over});
const job = (d = doc()) => parseJobInput(JSON.stringify({packs: ['A'], documents: [d]}));
const publicDns = async () => [{address: '93.184.216.34'}];
const serve = body => async () => new Response(body);

test('a linked document is downloaded, checked by hash, and then loads like an upload', async () => {
 const store = mkdtempSync(join(tmpdir(), 'remote-'));
 assert.equal(await fetchRemoteFiles(job(), store, {fetchImpl: serve(bytes), resolve: publicDns}), 1);
 const {documents} = loadJobInputs(job(), store);
 assert.equal(documents[0].sha256, hash);
 assert.equal(documents[0].pack_id, 'A');
 assert.equal(await fetchRemoteFiles(job(), store, {fetchImpl: () => assert.fail('already stored'), resolve: publicDns}), 0);
});

test('a changed file, a non-https link, a private host, or an oversized file is refused', async () => {
 const store = mkdtempSync(join(tmpdir(), 'remote-'));
 await assert.rejects(fetchRemoteFiles(job(), store, {fetchImpl: serve('changed'), resolve: publicDns}), /does not match the job input/);
 assert.throws(() => job(doc({url: 'http://files.example.com/a.txt'})), /https link/);
 await assert.rejects(fetchRemoteFiles(job(), store, {fetchImpl: serve(bytes), resolve: async () => [{address: '127.0.0.1'}]}), /not a public address/);
 await assert.rejects(fetchRemoteFiles(job(doc({url: 'https://192.168.1.5/a.txt'})), store, {fetchImpl: serve(bytes), resolve: publicDns}), /not a public address/);
 await assert.rejects(fetchRemoteFiles(job(), store, {fetchImpl: serve(bytes), resolve: publicDns, limits: {fileBytes: 10, totalBytes: 10, timeoutMs: 1000}}), /larger than/);
 for (const a of ['10.0.0.1', '172.16.0.1', '169.254.1.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.equal(isPublicAddress(a), false, a);
});

test('a linked document must state its pack, kind, and language; an uploaded one must not', () => {
 assert.throws(() => job(doc({pack_id: 'B'})), /pack_id listed in packs/);
 assert.throws(() => job(doc({kind: undefined})), /needs a kind/);
 assert.throws(() => job(doc({language: 'german'})), /two-letter language/);
 assert.throws(() => job({doc_id: 'x', sha256: hash, kind: 'service_invoice'}), /without a url/);
 assert.doesNotThrow(() => job({doc_id: 'x', sha256: hash}));
});
