import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import test from 'node:test';
import nodemailer from 'nodemailer';
import {
  closePooledTransporter,
  createPooledTransporter,
  createTransporter,
} from '../api/_shared/email.js';

Object.assign(process.env, { GMAIL_USER: 'fixture@example.test', GMAIL_APP_PASSWORD: 'fixture' });

// Only the network edges are replaced: nodemailer hands back its options, and
// every socket is a local emitter that connects on the next tick.
function smtp(t) {
  let options;
  const sockets = [];
  t.mock.method(nodemailer, 'createTransport', (config) => {
    options = config;
    return { close() {}, sendMail: async () => {} };
  });
  t.mock.method(net, 'connect', () => {
    const socket = new EventEmitter();
    socket.destroyed = false;
    socket.destroy = () => { socket.destroyed = true; socket.emit('close'); };
    sockets.push(socket);
    queueMicrotask(() => socket.emit('connect'));
    return socket;
  });
  t.after(closePooledTransporter);
  return { sockets, options: () => options };
}

const connect = (f) => new Promise((resolve, reject) =>
  f.options().getSocket({ host: 'smtp.gmail.com', port: 465 }, (error, value) => (error ? reject(error) : resolve(value))));

test('SMTP transports have explicit connection, greeting and inactivity bounds', (t) => {
  const f = smtp(t);
  for (const create of [createTransporter, createPooledTransporter]) {
    create();
    for (const key of ['connectionTimeout', 'greetingTimeout', 'socketTimeout']) {
      assert.ok(f.options()[key] > 0 && f.options()[key] <= 5000, key);
    }
  }
});

test('the absolute pool deadline destroys active underlying sockets, while retaining TLS upgrade', async (t) => {
  const f = smtp(t);
  createPooledTransporter(Date.now() + 30);
  const socketOptions = await connect(f);
  assert.equal(socketOptions.secured, false, 'Nodemailer must perform TLS before AUTH');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(f.sockets[0].destroyed, true);
});

test('closing the pool also destroys busy sockets immediately', async (t) => {
  const f = smtp(t);
  createPooledTransporter(Date.now() + 10000);
  await connect(f);
  closePooledTransporter();
  assert.equal(f.sockets[0].destroyed, true);
});

test('a pool past its deadline refuses to open another socket', async (t) => {
  const f = smtp(t);
  createPooledTransporter(Date.now() - 1);
  await assert.rejects(connect(f), /SMTP deadline exceeded/);
  assert.equal(f.sockets.length, 0);
});
