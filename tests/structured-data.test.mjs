import assert from 'node:assert/strict';
import test from 'node:test';
import {
  articleJsonLd,
  eventStartDate,
  newsSitemapXml,
  plainDescription,
  upcomingEventsJsonLd,
} from '../shared/structured-data.js';

const BASE = 'https://www.erdal-bhg.no';
const NOW = new Date('2026-10-30T10:00:00Z');

function event(overrides = {}) {
  return {
    id: 3,
    title: 'Høstdugnad',
    description: '<p>Kom &amp; hjelp oss å rydde uteområdet.</p>',
    date: '2026-11-05',
    time: '18:00',
    location: 'Ute',
    customLocation: null,
    status: 'active',
    ...overrides,
  };
}

test('an event starts at the Oslo time on the invitation, with that day\'s offset', () => {
  assert.equal(eventStartDate('2026-11-05', '18:00'), '2026-11-05T18:00:00+01:00');
  assert.equal(eventStartDate('2026-06-05', '9:30'), '2026-06-05T09:30:00+02:00');
  assert.equal(eventStartDate('2026-06-05T00:00:00.000Z', '17:00'), '2026-06-05T17:00:00+02:00');
  // A time the feed cannot read either: the event is the whole day.
  assert.equal(eventStartDate('2026-06-05', '17.00'), '2026-06-05');
  assert.equal(eventStartDate('neste fredag', '18:00'), null);
});

test('upcoming events are marked up soonest first, past ones and deleted ones left out', () => {
  const marked = upcomingEventsJsonLd([
    event({ id: 9, date: '2026-12-01' }),
    event({ id: 1, date: '2026-10-01' }),
    event({ id: 2, status: 'deleted' }),
    event({ id: 3 }),
    event({ id: 4, date: '2026-10-30', status: 'cancelled' }),
  ], BASE, { now: NOW });

  assert.deepEqual(marked.map(({ url }) => url), [
    `${BASE}/kalender?vis=event-4`,
    `${BASE}/kalender?vis=event-3`,
    `${BASE}/kalender?vis=event-9`,
  ]);
  assert.equal(marked[0].eventStatus, 'https://schema.org/EventCancelled');

  const [, dugnad] = marked;
  assert.equal(dugnad['@type'], 'Event');
  assert.equal(dugnad.name, 'Høstdugnad');
  assert.equal(dugnad.description, 'Kom & hjelp oss å rydde uteområdet.');
  assert.equal(dugnad.eventStatus, 'https://schema.org/EventScheduled');
  assert.equal(dugnad.eventAttendanceMode, 'https://schema.org/OfflineEventAttendanceMode');
  assert.equal(dugnad.location.name, 'Erdal barnehage');
  assert.equal(dugnad.location.address.streetAddress, 'Steinråsa 5');
  assert.equal(dugnad.organizer.name, 'FAU Erdal Barnehage');

  assert.equal(upcomingEventsJsonLd(undefined, BASE, { now: NOW }).length, 0);
  assert.equal(upcomingEventsJsonLd([event(), event({ id: 5 })], BASE, { now: NOW, limit: 1 }).length, 1);
});

test('an event elsewhere or online names where it is', () => {
  const [elsewhere, online] = upcomingEventsJsonLd([
    event({ id: 1, location: 'Annet', customLocation: 'Erdal kirke' }),
    event({ id: 2, date: '2026-11-06', location: 'Digitalt' }),
  ], BASE, { now: NOW });
  assert.deepEqual(elsewhere.location, { '@type': 'Place', name: 'Erdal kirke', address: 'Erdal kirke' });
  assert.equal(online.eventAttendanceMode, 'https://schema.org/OnlineEventAttendanceMode');
  assert.deepEqual(online.location, { '@type': 'VirtualLocation', url: `${BASE}/kalender?vis=event-2` });
});

test('a post is an article with its own description, date, author and picture', () => {
  const post = {
    id: 12,
    title: 'Referat fra foreldremøtet',
    content: '<p>Takk til alle som kom!</p><img src="https://res.cloudinary.com/x/image/upload/fau-documents/a.jpg"><p>Neste møte er i mars.</p>',
    publishedDate: '2026-10-01T00:00:00.000Z',
    author: 'Kari Nordmann',
  };
  const article = articleJsonLd(post, BASE);
  assert.equal(article['@type'], 'BlogPosting');
  assert.equal(article.headline, 'Referat fra foreldremøtet');
  assert.equal(article.description, 'Takk til alle som kom! Neste møte er i mars.');
  assert.equal(article.datePublished, '2026-10-01T00:00:00.000Z');
  assert.deepEqual(article.author, { '@type': 'Person', name: 'Kari Nordmann' });
  assert.deepEqual(article.image, ['https://res.cloudinary.com/x/image/upload/fau-documents/a.jpg']);
  assert.equal(article.url, `${BASE}/nyheter/12`);

  // Signed by the council, or not at all: the organisation is the author.
  const unsigned = articleJsonLd({ ...post, author: 'FAU', content: '<p>Hei</p><img src="/local.png">' }, BASE);
  assert.equal(unsigned.author['@type'], 'Organization');
  assert.deepEqual(unsigned.image, [`${BASE}/og-home.jpg`], 'only an absolute https picture is used');
});

test('a description is one line, cut at a word', () => {
  assert.equal(plainDescription('<p>En</p>\n<p>to   tre</p>'), 'En to tre');
  const long = plainDescription(`<p>${'ord '.repeat(80)}</p>`);
  assert.ok(long.length <= 156 && long.endsWith('…'), long);
  assert.equal(plainDescription(null), '');
});

test('the news sitemap lists each post with the day it last changed', () => {
  const xml = newsSitemapXml([
    { id: 4, publishedDate: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-03T10:00:00.000Z' },
    { id: 5, publishedDate: '2026-10-01', updatedAt: null },
  ], BASE);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/www\.erdal-bhg\.no\/nyheter\/4<\/loc>\n {4}<lastmod>2026-09-03<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/www\.erdal-bhg\.no\/nyheter\/5<\/loc>\n {4}<lastmod>2026-10-01<\/lastmod>/);
  assert.match(newsSitemapXml([], BASE), /<urlset[^>]*>\n<\/urlset>/);
});
