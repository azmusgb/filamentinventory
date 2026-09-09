import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../workshop-device-link-client.js', import.meta.url), 'utf8');
const navigation = await readFile(new URL('../navigation-architecture.js', import.meta.url), 'utf8');

test('Workshop OS device link uses the authoritative display-feed contract', () => {
  assert.match(source, /const DISPLAY_FEED_PATH = '\/api\/display-feed'/);
  assert.match(source, /'X-Filament-Sync-Key': key/);
  assert.match(source, /'X-Filament-Profile': profile/);
  assert.match(source, /result\.contractVersion !== 1/);
});

test('Workshop OS device link fails closed when the private profile is unknown', () => {
  assert.match(source, /const ALLOWED_PROFILES = new Set\(\['Bill', 'Aimee'\]\)/);
  assert.match(source, /return ALLOWED_PROFILES\.has\(profile\) \? profile : null/);
  assert.doesNotMatch(source, /currentUser\?\.\(\) \|\| 'Bill'/);
  assert.match(source, /if \(!profile\)/);
  assert.match(source, /No profile is inferred/);
});

test('Workshop OS device link strictly validates summary counts and staleness', () => {
  assert.match(source, /const SUMMARY_FIELDS = \['spools', 'loaded', 'low', 'unknown', 'queue'\]/);
  assert.match(source, /Number\.isInteger\(value\) && value >= 0/);
  assert.match(source, /typeof result\.stale !== 'boolean'/);
  assert.match(source, /validateDisplayFeed\(result\)/);
});

test('Workshop OS device link keeps the private key behind an explicit copy action', () => {
  assert.match(source, /id="copyWorkshopKeyBtn"/);
  assert.match(source, /copyText\(key, 'Private Workshop OS credential copied/);
  assert.doesNotMatch(source, /workshopCredentialState[^\n]*key/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*key/);
  assert.doesNotMatch(source, /textContent\s*=\s*key/);
});

test('Workshop OS device link refreshes when same-tab sync UI state changes', () => {
  assert.match(source, /observer\.observe\(document\.body, \{subtree:true, childList:true, attributes:true\}\)/);
  assert.match(source, /if \(document\.getElementById\('workshopDeviceCard'\)\) \{\s*render\(\);/);
});

test('Workshop OS device link states the transitional credential boundary', () => {
  assert.match(source, /Transitional credential/);
  assert.match(source, /revocable device-scoped credential/);
});

test('navigation architecture loads Workshop OS presentation assets', () => {
  assert.match(navigation, /\/css\/components\/workshop-device-link\.css/);
  assert.match(navigation, /\/workshop-device-link-client\.js/);
});
