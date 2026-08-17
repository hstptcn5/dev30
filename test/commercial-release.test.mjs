import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const index = read('public/index.html');
const pricing = read('public/pricing.html');
const privacy = read('public/privacy.html');
const terms = read('public/terms.html');
const refunds = read('public/refunds.html');
const css = read('public/commercial.css');
const js = read('public/commercial.js');
const netlify = read('netlify.toml');

test('main product exposes commercial identity and legal navigation', () => {
  assert.match(index, /Built &amp; operated by/);
  assert.match(index, /hstptcn5/);
  assert.match(index, /href="\/pricing"/);
  assert.match(index, /href="\/privacy"/);
  assert.match(index, /href="\/terms"/);
  assert.match(index, /href="\/refunds"/);
  assert.match(index, /commercial\.css/);
  assert.match(index, /early access/);
});

test('public commercial pages canonicalize to the custom production domain', () => {
  assert.match(index, /rel="canonical" href="https:\/\/getdev30\.xyz\/"/);
  assert.match(pricing, /rel="canonical" href="https:\/\/getdev30\.xyz\/pricing"/);
  assert.match(privacy, /rel="canonical" href="https:\/\/getdev30\.xyz\/privacy"/);
  assert.match(terms, /rel="canonical" href="https:\/\/getdev30\.xyz\/terms"/);
  assert.match(refunds, /rel="canonical" href="https:\/\/getdev30\.xyz\/refunds"/);
  assert.match(privacy, /hosted service at getdev30\.xyz/);
  assert.doesNotMatch(privacy, /dev-30\.netlify\.app/);
});

test('pricing states the launch Free and Pro contract', () => {
  assert.match(pricing, /5 fresh analyses per month/);
  assert.match(pricing, /100 fresh analyses per month/);
  assert.match(pricing, /\$5\.99/);
  assert.match(pricing, /\$49\.99\/year/);
  assert.match(pricing, /Private repository analysis/);
  assert.match(pricing, /Paddle as Merchant of Record/);
  assert.match(pricing, /data-commercial-upgrade/);
});

test('privacy page describes private opt-in and actual disconnect retention boundary', () => {
  assert.match(privacy, /Private repositories are not included by default/);
  assert.match(privacy, /does <strong>not<\/strong> automatically erase previously saved snapshots or reports/);
  assert.match(privacy, /DeepSeek/);
  assert.match(privacy, /RevenueCat and Paddle/);
  assert.match(privacy, /Supabase/);
});

test('terms keep evidence limitations and prohibit people scoring', () => {
  assert.match(terms, /AI-generated explanations can still be incomplete, stale, or wrong/);
  assert.match(terms, /definitive hiring score, talent ranking/);
  assert.match(terms, /Built &amp; operated by hstptcn5/);
  assert.match(terms, /Paddle, which acts as Merchant of Record/);
});

test('refund policy avoids a blanket no-refunds claim and defers mandatory rights', () => {
  assert.match(refunds, /Mandatory consumer rights/);
  assert.match(refunds, /Paddle acts as Merchant of Record/);
  assert.match(refunds, /full or partial refund/);
  assert.doesNotMatch(refunds, /all sales are final/i);
  assert.doesNotMatch(refunds, /no refunds/i);
});

test('commercial UI remains an editorial brand layer with a guarded checkout CTA', () => {
  assert.match(css, /\.brand-mark/);
  assert.match(css, /footer\.site-footer/);
  assert.match(css, /\.pricing-grid/);
  assert.match(js, /\/api\/billing\/checkout/);
  assert.match(js, /checkout is being activated/i);
});

test('Netlify serves clean commercial routes', () => {
  for (const route of ['pricing', 'privacy', 'terms', 'refunds']) {
    assert.match(netlify, new RegExp(`from = "\\/${route}"[\\s\\S]*?to = "\\/${route}\\.html"`));
  }
});
