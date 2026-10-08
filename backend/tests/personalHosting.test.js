import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { personalAccess, serveFrontend } from '../services/personalHosting.js';

test('personal hosting fails closed, protects API/static content, and leaves only health public', async () => {
  assert.throws(() => personalAccess({ username: 'candidate' }), /requires both/);
  const directory = await mkdtemp(join(tmpdir(), 'jobmatch-static-'));
  await writeFile(join(directory, 'index.html'), '<h1>Personal portal</h1>');
  const app = express();
  app.use(personalAccess({ username: 'candidate', password: 'test-password' }));
  app.get('/_health', (req, res) => res.json({ ok: true }));
  app.get('/api/profile', (req, res) => res.json({ name: 'Test candidate' }));
  serveFrontend(app, directory);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: 'Basic ' + Buffer.from('candidate:test-password').toString('base64') };
  try {
    assert.equal((await fetch(base + '/_health')).status, 200);
    for (const path of ['/', '/api/profile']) {
      const denied = await fetch(base + path);
      assert.equal(denied.status, 401);
      assert.ok(denied.headers.get('www-authenticate'));
      assert.equal((await fetch(base + path, { headers: { Authorization: 'Basic d3Jvbmc=' } })).status, 401);
      assert.equal((await fetch(base + path, { headers })).status, 200);
    }
    assert.equal((await fetch(base + '/api/does-not-exist', { headers })).status, 404);
    assert.match(await (await fetch(base + '/applications', { headers })).text(), /Personal portal/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true });
  }
});
