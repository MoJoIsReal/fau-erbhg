import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import test from 'node:test';

function emailModule() {
  let options;
  const sockets = [];
  const context = { setTimeout, clearTimeout, Date, Promise, Set,
    process: { env: { GMAIL_USER: 'fixture@example.test', GMAIL_APP_PASSWORD: 'fixture' } },
    net: { connect() {
      const socket = new EventEmitter();
      socket.destroyed = false;
      socket.destroy = () => { socket.destroyed = true; socket.emit('close'); };
      sockets.push(socket);
      queueMicrotask(() => socket.emit('connect'));
      return socket;
    } },
    nodemailer: { createTransport(config) { options = config; return { close() {}, sendMail: async () => {} }; } },
  };
  const source = readFileSync('api/_shared/email.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
  vm.createContext(context); vm.runInContext(source, context);
  return { context, sockets, options: () => options };
}

test('SMTP transports have explicit connection, greeting and inactivity bounds', () => {
  const f = emailModule();
  for (const create of ['createTransporter', 'createPooledTransporter']) {
    f.context[create]();
    for (const key of ['connectionTimeout', 'greetingTimeout', 'socketTimeout']) {
      assert.ok(f.options()[key] > 0 && f.options()[key] <= 5000, key);
    }
  }
});

test('the absolute pool deadline destroys active underlying sockets, while retaining TLS upgrade', async () => {
  const f = emailModule();
  f.context.createPooledTransporter(Date.now() + 30);
  assert.equal(typeof f.options().getSocket, 'function');
  const socketOptions = await new Promise((resolve, reject) => f.options().getSocket({ host: 'smtp.gmail.com', port: 465 }, (err, value) => err ? reject(err) : resolve(value)));
  assert.equal(socketOptions.secured, false, 'Nodemailer must perform TLS before AUTH');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(f.sockets[0].destroyed, true);
  f.context.closePooledTransporter();
});

test('closing the pool also destroys busy sockets immediately', async () => {
  const f = emailModule(); f.context.createPooledTransporter(Date.now() + 10000);
  assert.equal(typeof f.options().getSocket, 'function');
  await new Promise(resolve => f.options().getSocket({ host: 'smtp.gmail.com', port: 465 }, resolve));
  f.context.closePooledTransporter();
  assert.equal(f.sockets[0].destroyed, true);
});
