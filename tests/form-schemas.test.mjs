import assert from 'node:assert/strict';
import test from 'node:test';
import { importBundle } from './helpers.mjs';

// The public forms validate against plain zod schemas (client/src/lib/
// form-schemas.ts) so drizzle-orm stays out of their bundle. These are the
// generated insert schemas they stand in for; one bundle, so one zod.
const schemas = await importBundle({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'ts',
    contents: `
      export { insertEventSchema, insertEventRegistrationSchema, insertContactMessageSchema } from './shared/schema.ts';
      export { eventFormBaseSchema, registrationFormBaseSchema, contactFormBaseSchema, createSignupFormSchema, createContactFormSchema } from './client/src/lib/form-schemas.ts';
    `,
  },
  platform: 'node',
});

// "string", "string?|null", …: the base type and whether it may be left out
// or null, which is what a form's validation depends on.
function describe(field) {
  let type = field;
  const modifiers = new Set();
  while (['optional', 'nullable', 'default'].includes(type?.def?.type)) {
    modifiers.add(type.def.type === 'default' ? 'optional' : type.def.type);
    type = type.def.innerType;
  }
  return `${type.def.type}${modifiers.has('optional') ? '?' : ''}${modifiers.has('nullable') ? '|null' : ''}`;
}

const pairs = [
  ['event', schemas.eventFormBaseSchema, schemas.insertEventSchema, []],
  // The modal supplies eventId itself, from the event being signed up for.
  ['registration', schemas.registrationFormBaseSchema, schemas.insertEventRegistrationSchema, ['eventId']],
  ['contact', schemas.contactFormBaseSchema, schemas.insertContactMessageSchema, []],
];

for (const [name, form, insert, suppliedElsewhere] of pairs) {
  test(`the ${name} form schema matches the table's insert schema`, () => {
    for (const [key, field] of Object.entries(form.shape)) {
      assert.ok(key in insert.shape, `${key} is not a column`);
      assert.equal(describe(field), describe(insert.shape[key]), key);
    }
    // Every column a row cannot be inserted without is a field of the form.
    const required = Object.entries(insert.shape)
      .filter(([, field]) => !describe(field).includes('?'))
      .map(([key]) => key)
      .filter((key) => !suppliedElsewhere.includes(key));
    assert.deepEqual(required.filter((key) => !(key in form.shape)), []);
  });
}

// TEST-004. What the public forms refuse before anything is sent (UX-004): an
// empty form used to reach the server and come back as a toast.
const MESSAGES = { min: 'min', max: 'max', required: 'required', email: 'email', subject: 'subject' };
const problems = (schema, value) => {
  const result = schema.safeParse(value);
  if (result.success) return {};
  // The form shows the first message for a field, as zodResolver does.
  const first = {};
  for (const issue of result.error.issues) first[issue.path.join('.')] ??= issue.message;
  return first;
};

test('the signup form needs a name, an address the API accepts and one to ten attendees', () => {
  const signup = schemas.createSignupFormSchema(MESSAGES);
  const valid = { name: 'Kari', email: 'Kari@Example.no ', attendeeCount: 1 };
  assert.deepEqual(problems(signup, valid), {});
  assert.deepEqual(problems(signup, { ...valid, name: '   ', email: '' }), { name: 'required', email: 'required' });
  for (const email of ['kari', 'kari@example', 'kari @example.no', 'kari@example.n']) {
    assert.deepEqual(problems(signup, { ...valid, email }), { email: 'email' }, email);
  }
  assert.deepEqual(problems(signup, { ...valid, attendeeCount: 0 }), { attendeeCount: 'min' });
  assert.deepEqual(problems(signup, { ...valid, attendeeCount: 11 }), { attendeeCount: 'max' });
});

test('the contact form needs a subject and a message, and a name and address unless anonymous', () => {
  const contact = schemas.createContactFormSchema(MESSAGES);
  const valid = { subject: 'general', name: 'Ola', email: 'ola@example.no', message: 'Hei' };
  assert.deepEqual(problems(contact, valid), {});
  assert.deepEqual(problems(contact, { subject: '', name: '', email: '', message: ' ' }),
    { subject: 'subject', message: 'required', name: 'required', email: 'required' });
  assert.deepEqual(problems(contact, { ...valid, email: 'ola@' }), { email: 'email' });
  assert.deepEqual(problems(contact, { subject: 'anonymous', name: '', email: '', message: 'Tips' }), {}, 'anonymous needs no name or address');
});
