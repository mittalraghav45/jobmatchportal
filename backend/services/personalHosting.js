import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

function equalSecret(actual, expected) {
  const hash = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(actual), hash(expected));
}

export function personalAccess({ username, password }) {
  if (!username || !password) throw new Error('Personal hosting requires both PERSONAL_USERNAME and PERSONAL_PASSWORD.');
  return (req, res, next) => {
    if (req.method === 'GET' && req.path === '/_health') return next();
    const header = String(req.headers.authorization || '');
    let supplied = '';
    if (header.startsWith('Basic ')) supplied = Buffer.from(header.slice(6), 'base64').toString('utf8');
    if (equalSecret(supplied, `${username}:${password}`)) return next();
    res.set('WWW-Authenticate', 'Basic realm="Personal JobMatch", charset="UTF-8"');
    res.set('Cache-Control', 'no-store');
    return res.status(401).send('Sign in to your personal JobMatch portal.');
  };
}

export function serveFrontend(app, directory) {
  app.use(express.static(directory));
  app.get('*', (req, res) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found' });
    return res.sendFile('index.html', { root: directory });
  });
}
