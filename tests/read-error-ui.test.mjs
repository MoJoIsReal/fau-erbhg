import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

// Real pages, hooks and query cache rendered together. Only browser storage
// and network results are supplied by fixtures; no page component is mocked.
globalThis.localStorage = { getItem: () => 'no' };
const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
  import React from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { Router } from 'wouter';
  import { LanguageProvider } from './client/src/contexts/LanguageContext';
  import Home from './client/src/pages/home';
  import Messages from './client/src/pages/messages';
  import Admin from './client/src/pages/admin';
  import NewsPost from './client/src/pages/news-post';
  import Attendees from './client/src/components/event-registrations-view';
  import { translations } from './client/src/lib/i18n';
  export const copy = translations.no;
  export function render(name, status, data, overrides = {}) {
    const client = new QueryClient({defaultOptions:{queries:{queryFn:async()=>{throw new Error('unexpected fetch in static rendering')},retry:false, retryOnMount:false, staleTime:Infinity, gcTime:Infinity}}});
    const year = new Date().getFullYear() - (new Date().getMonth() < 7 ? 1 : 0);
    for (const url of ['/api/registrations?eventId=1', '/api/registrations?eventId=1&cancelled=1', '/api/events', '/api/yearly-calendar?schoolYear='+year, '/api/yearly-calendar?schoolYear='+(year+1), '/api/documents', '/api/secure-settings?resource=contact-messages', '/api/secure-settings?resource=blog-posts', '/api/secure-settings?resource=blog-posts&includeArchived=true', '/api/secure-settings?resource=blog-posts&id=42', '/api/secure-settings?resource=kindergarten-info']) {
      const q = client.getQueryCache().build(client, {queryKey:[url]});
      q.setState({status, error:status==='error'?new Error('fixture failure'):null, data: data ?? (status==='success'?[]:undefined), dataUpdatedAt: data ? Date.now() : 0});
      if (overrides[url]) q.setState(overrides[url]);
    }
    client.setQueryData(['/api/auth'], {userId:1, name:'Test', role:'admin'});
    const Page = {home:Home, messages:Messages, admin:Admin, article:NewsPost, attendees:()=> <Attendees event={{id:1,title:'Test',type:'other'}}/>}[name];
    return renderToStaticMarkup(<Router ssrPath='/nyheter/42'><QueryClientProvider client={client}><LanguageProvider><Page/></LanguageProvider></QueryClientProvider></Router>);
  }
` }, banner: { js: 'import { createRequire as testRequire } from "node:module"; const require = testRequire(' + JSON.stringify(import.meta.url) + ');' }, bundle: true, platform: 'node', format: 'esm', write: false, jsx: 'automatic',
  plugins: [{ name: 'asset-paths', setup(build) { build.onLoad({ filter: /\.(webp|png|jpg|svg)$/ }, args => ({ contents: 'export default ' + JSON.stringify(args.path), loader: 'js' })); } }], define: { 'import.meta.env.DEV': 'false' } });
const { render, copy } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

for (const page of ['home', 'messages', 'admin', 'article', 'attendees']) {
  test(`${page}: failed reads expose retry rather than successful absence`, () => {
    const html = render(page, 'error');
    assert.match(html, /Prøv igjen/);
    for (const empty of [copy.events.noRegistrationsYet, copy.home.noEvents, copy.messagesPage.noMessagesYet, copy.adminPage.allHandled, copy.newsPage.postNotFound]) {
      assert.ok(!html.includes(empty), empty);
    }
  });
}

test('successful empty article and inbox retain their real empty states', () => {
  assert.ok(render('article', 'success').includes(copy.newsPage.postNotFound));
  assert.ok(render('messages', 'success').includes(copy.messagesPage.noMessagesYet));
});

test('a failed article refresh retains the cached article with an explicit warning', () => {
  const html = render('article', 'error', [{ id: 42, title: 'Cached title', content: '', category: 'news', publishedDate: '2026-09-24' }]);
  assert.ok(html.includes('Cached title'));
  assert.ok(html.includes(copy.dataState.staleHint));
  assert.ok(!html.includes(copy.newsPage.postNotFound));
});

test('home keeps a valid event when a yearly-calendar source fails', () => {
  const html = render('home', 'error', undefined, { '/api/events': { status: 'success', error: null, data: [
    { id: 1, title: 'Available future event', date: '2099-09-24', time: '12:00', status: 'active', type: 'other', location: 'Kindergarten' },
  ], dataUpdatedAt: Date.now() } });
  assert.ok(html.includes('Available future event'));
  assert.ok(html.includes(copy.dataState.staleHint));
  assert.ok(!html.includes(copy.home.noEvents));
});
