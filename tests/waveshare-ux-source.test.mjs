import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ino = fs.readFileSync(path.join(root, 'firmware/waveshare-home/WaveshareHome/WaveshareHome.ino'), 'utf8');
const services = fs.readFileSync(path.join(root, 'firmware/waveshare-home/WaveshareHome/Services.cpp'), 'utf8');
const model = fs.readFileSync(path.join(root, 'firmware/waveshare-home/WaveshareHome/AppModel.h'), 'utf8');

function functionBody(source, name) {
  const marker = `static void ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} should exist`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  assert.fail(`${name} has an unbalanced body`);
}

function literalButtons(block, parent) {
  const re = new RegExp(`button\\(${parent},\\s*"([^"]+)",\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)`, 'g');
  return [...block.matchAll(re)].map((m) => ({
    label: m[1], x: Number(m[2]), y: Number(m[3]), w: Number(m[4]), h: Number(m[5]),
  }));
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test('Waveshare Home UX release is versioned as 1.5.0 with schema 5', () => {
  assert.match(model, /FW_VERSION\[\]\s*=\s*"1\.5\.0"/);
  assert.match(model, /CONFIG_SCHEMA_VERSION\s*=\s*5/);
});

test('touch navigation uses a stable Home / Printer / More model', () => {
  const nav = functionBody(ino, 'addBottomNav');
  assert.match(nav, /\{"Home", ScreenId::Home\}/);
  assert.match(nav, /\{"Printer", ScreenId::Printer\}/);
  assert.match(nav, /\{"More", ScreenId::Apps\}/);
  assert.doesNotMatch(nav, /\{"Today", ScreenId::Today\}/);
});

test('More launcher is intentionally reduced and touch friendly', () => {
  const apps = functionBody(ino, 'createApps');
  const entries = [...apps.matchAll(/\{"([^"]+)",\s*ScreenId::/g)].map((m) => m[1]);
  assert.deepEqual(entries, ['Workshop', 'Filament', 'Today', 'Smart Home', 'Timers', 'Settings']);
  assert.match(apps, /142, 70/);
  assert.doesNotMatch(apps, /24,\s*navEvent/);
});

test('Quick Control has no overlapping literal controls and all are >= 44px tall', () => {
  const quick = functionBody(ino, 'createQuick');
  const buttons = literalButtons(quick, 'screenQuick');
  assert.equal(buttons.length, 8);
  for (const button of buttons) assert.ok(button.h >= 44, `${button.label} is too short`);
  for (let i = 0; i < buttons.length; i += 1) {
    for (let j = i + 1; j < buttons.length; j += 1) {
      assert.equal(overlaps(buttons[i], buttons[j]), false, `${buttons[i].label} overlaps ${buttons[j].label}`);
    }
  }
});

test('printer screen is a visual status surface instead of a text dump', () => {
  const create = functionBody(ino, 'createPrinter');
  const refresh = functionBody(ino, 'refreshPrinter');
  assert.match(create, /lv_bar_create\(hero\)/);
  assert.match(create, /printerAmsPanels\[i\]/);
  assert.match(create, /"Hold Stop"/);
  assert.match(create, /LV_EVENT_LONG_PRESSED/);
  assert.match(refresh, /lv_bar_set_value/);
  assert.match(refresh, /printerNozzleLabel/);
  assert.match(refresh, /printerAmsLabels/);
});

test('dynamic home content navigates to its current destination', () => {
  assert.match(ino, /static ScreenId heroDestination\(\)/);
  assert.match(ino, /lv_obj_add_event_cb\(hero, heroEvent/);
  assert.match(ino, /static void homeCardEvent/);
  assert.match(ino, /screenForCard\(config\.homeCards\[index\]\)/);
});

test('all touch screens, including Modes, are created', () => {
  const ui = functionBody(ino, 'createUi');
  assert.match(ui, /createModes\(\)/);
  for (const screen of ['createHome', 'createPrinter', 'createApps', 'createWorkshop', 'createSystem', 'createAmbient']) {
    assert.match(ui, new RegExp(`${screen}\\(\\)`));
  }
});

test('web dashboard uses simplified navigation and progressive disclosure', () => {
  assert.match(services, /Primary dashboard navigation/);
  assert.match(services, /<a href='#home'>Home<\/a><a href='#bambu'>Printer<\/a><a href='#workshop'>Workshop<\/a><a href='#integrations'>Connections<\/a><a href='#device'>Device<\/a><a href='#ota'>System<\/a>/);
  assert.match(services, /System health & maintenance/);
  assert.match(services, /Advanced printer diagnostics/);
  assert.doesNotMatch(services, /<a href='#now'>Now<\/a><a href='#attention'>Attention<\/a><a href='#wifi'>Network<\/a>/);
});

test('web dashboard includes keyboard focus and reduced-motion support', () => {
  assert.match(services, /:focus-visible/);
  assert.match(services, /prefers-reduced-motion:reduce/);
  assert.match(services, /aria-live','polite/);
});

test('web home prioritizes normal workshop actions over maintenance actions', () => {
  const rootStart = services.indexOf('void WebDashboard::sendRoot()');
  const integrationsStart = services.indexOf("<div class='card panel' id='wifi'", rootStart);
  const homeSource = services.slice(rootStart, integrationsStart);
  assert.match(homeSource, /Open printer/);
  assert.match(homeSource, />Workshop<\/a>/);
  assert.match(homeSource, /What needs you/);
  assert.doesNotMatch(homeSource, /hero-actions.*Check for update/);
  assert.doesNotMatch(homeSource, /hero-actions.*Reconnect Wi-Fi/);
  assert.doesNotMatch(homeSource, /hero-actions.*Test speaker/);
});


test('v1.5 home defaults prioritize printer, filament and workshop', () => {
  assert.match(model, /HomeCard homeCards\[3\] = \{HomeCard::Printer, HomeCard::Filament, HomeCard::Workshop\}/);
  assert.match(model, /Workshop = 8/);
});

test('bottom navigation meets the 44px touch-target floor', () => {
  const nav = functionBody(ino, 'addBottomNav');
  assert.match(nav, /95, 44/);
});

test('settings no longer overlap a multiline summary and theme changes apply', () => {
  const create = functionBody(ino, 'createSettings');
  const refresh = functionBody(ino, 'refreshSettings');
  assert.match(create, /settingsBody = label/);
  assert.doesNotMatch(refresh, /Cards:/);
  const action = functionBody(ino, 'settingAction');
  assert.match(action, /action == 4[\s\S]*ESP\.restart\(\)/);
});

test('dynamic touch surfaces are bounded or scrollable', () => {
  assert.match(ino, /scrollBodyLabel/);
  for (const name of ['createAttention', 'createTimers', 'createActivity', 'createSystem']) {
    assert.match(functionBody(ino, name), /scrollBodyLabel/);
  }
});

test('touch refresh follows the active screen and includes Modes', () => {
  assert.match(ino, /static ScreenId currentScreen/);
  const active = functionBody(ino, 'refreshActiveScreen');
  assert.match(active, /case ScreenId::Modes: refreshModes\(\)/);
  const loopStart = ino.indexOf('void loop()');
  assert.match(ino.slice(loopStart), /refreshActiveScreen\(\)/);
});

test('workshop air modes have explicit Manual and PostPrint behavior', () => {
  const workshop = fs.readFileSync(path.join(root, 'firmware/waveshare-home/WaveshareHome/Workshop.cpp'), 'utf8');
  assert.match(workshop, /AirMode::Manual/);
  assert.match(workshop, /Manual request/);
  assert.match(workshop, /AirMode::PostPrint/);
  assert.match(workshop, /Post-print filtration/);
});

test('readiness separates core health from optional integrations', () => {
  const readiness = functionBody(ino, 'refreshReadiness');
  assert.match(readiness, /CORE/);
  assert.match(readiness, /OPTIONAL/);
  assert.doesNotMatch(readiness, /configured\*100/);
});

test('web API exposes authoritative printer printing state and filament attention', () => {
  assert.match(services, /doc\["printer"\]\["printing"\]/);
  assert.match(services, /attentionCount/);
});

test('web live state uses request timeouts and authoritative print state', () => {
  assert.match(services, /fetchWithTimeout/);
  assert.match(services, /d\.printer\.printing/);
  assert.match(services, /nowFilament/);
});
