import { readFile, writeFile } from 'node:fs/promises';

const read = file => readFile(file, 'utf8');
const write = (file, text) => writeFile(file, text, 'utf8');

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return text.replace(from, to);
}

{
  let text = await read('ui-v10-client.js');
  text = replaceOnce(
    text,
    "    const owner = currentUser();\n    button.innerHTML = `<span class=\"profile-avatar\" aria-hidden=\"true\">${initials(owner)}</span><span class=\"profile-chip-copy\"><strong>${owner}</strong><small>Private inventory</small></span><span aria-hidden=\"true\">⌄</span>`;\n    button.setAttribute('aria-label', `Switch private inventory. Current: ${owner}`);",
    "    const owner = currentUser();\n    const markup = `<span class=\"profile-avatar\" aria-hidden=\"true\">${initials(owner)}</span><span class=\"profile-chip-copy\"><strong>${owner}</strong><small>Private inventory</small></span><span aria-hidden=\"true\">⌄</span>`;\n    if (button.innerHTML !== markup) button.innerHTML = markup;\n    const label = `Switch private inventory. Current: ${owner}`;\n    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);",
    'profile observer loop guard',
  );
  await write('ui-v10-client.js', text);
}

{
  let text = await read('ui-system.css');
  if (!text.includes('V10 COMPONENT FOUNDATIONS')) {
    text += `\n\n/* ============================================================\n   V10 COMPONENT FOUNDATIONS\n   Layout primitives migrated from retired runtime style tags.\n   ============================================================ */\nhtml.fi-ui.fi-v10 .intake-banner { display:grid; }\nhtml.fi-ui.fi-v10 .intake-flow,\nhtml.fi-ui.fi-v10 .intake-suggestions { display:flex;gap:5px;flex-wrap:wrap; }\nhtml.fi-ui.fi-v10 .intake-duplicate,\nhtml.fi-ui.fi-v10 .intake-tare-hint { display:none; }\nhtml.fi-ui.fi-v10 .intake-duplicate.show,\nhtml.fi-ui.fi-v10 .intake-tare-hint.show { display:block; }\nhtml.fi-ui.fi-v10 .intake-placement { display:grid;grid-template-columns:1fr 1fr;gap:6px; }\n\nhtml.fi-ui.fi-v10 .qr-scanner-body { display:grid; }\nhtml.fi-ui.fi-v10 .qr-private-note { display:flex;align-items:center;justify-content:space-between;gap:12px; }\nhtml.fi-ui.fi-v10 .qr-video-shell { position:relative;overflow:hidden;aspect-ratio:4/3;background:#02060b; }\nhtml.fi-ui.fi-v10 .qr-video-shell[hidden] { display:none; }\nhtml.fi-ui.fi-v10 .qr-video { display:block;width:100%;height:100%;object-fit:cover; }\nhtml.fi-ui.fi-v10 .qr-reticle { position:absolute; }\nhtml.fi-ui.fi-v10 .qr-manual,\nhtml.fi-ui.fi-v10 .qr-scanner-actions { display:grid;grid-template-columns:1fr auto; }\nhtml.fi-ui.fi-v10 .qr-scanner-actions { grid-template-columns:1fr 1fr; }\n\nhtml.fi-ui.fi-v10 .printer-command { display:grid; }\nhtml.fi-ui.fi-v10 .printer-hero { display:flex;align-items:flex-start;justify-content:space-between; }\nhtml.fi-ui.fi-v10 .printer-metrics { display:grid; }\nhtml.fi-ui.fi-v10 .printer-layout { display:grid; }\nhtml.fi-ui.fi-v10 .printer-machine { overflow:hidden; }\nhtml.fi-ui.fi-v10 .printer-machine-head { display:flex;align-items:center;justify-content:space-between;gap:12px; }\nhtml.fi-ui.fi-v10 .printer-slots,\nhtml.fi-ui.fi-v10 .printer-board,\nhtml.fi-ui.fi-v10 .printer-candidates,\nhtml.fi-ui.fi-v10 .printer-attention { display:grid; }\nhtml.fi-ui.fi-v10 .printer-slot { display:grid;grid-template-columns:minmax(76px,.55fr) minmax(0,1.7fr) auto;gap:10px;align-items:center; }\nhtml.fi-ui.fi-v10 .printer-slot-actions { display:flex;gap:6px; }\nhtml.fi-ui.fi-v10 .printer-form { display:grid;grid-template-columns:1fr 1fr; }\nhtml.fi-ui.fi-v10 .printer-form .full { grid-column:1/-1; }\nhtml.fi-ui.fi-v10 .printer-form-actions { display:grid;grid-template-columns:1.2fr .8fr; }\nhtml.fi-ui.fi-v10 .printer-context { display:grid;grid-template-columns:1fr 1fr; }\nhtml.fi-ui.fi-v10 .printer-candidate { display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center; }\nhtml.fi-ui.fi-v10 .printer-attention-row { display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center; }\n\nhtml.fi-ui.fi-v10 .audit-panel { margin-bottom:16px; }\nhtml.fi-ui.fi-v10 .audit-head-actions { display:flex;gap:8px;flex-wrap:wrap; }\nhtml.fi-ui.fi-v10 .audit-dashboard-list { display:grid;gap:7px; }\nhtml.fi-ui.fi-v10 .audit-dashboard-row { display:flex;align-items:center;justify-content:space-between;gap:12px; }\nhtml.fi-ui.fi-v10 .audit-main strong { display:block; }\nhtml.fi-ui.fi-v10 .audit-meta { display:flex;gap:7px;flex-wrap:wrap; }\nhtml.fi-ui.fi-v10 .audit-chip { display:inline-flex;align-items:center; }\n\nhtml.fi-ui.fi-v10 .ux-check { display:flex;align-items:center;gap:10px; }\nhtml.fi-ui.fi-v10 .ux-profile-head { display:flex;align-items:center;justify-content:space-between; }\nhtml.fi-ui.fi-v10 .ux-profile-pill,\nhtml.fi-ui.fi-v10 .ux-actions,\nhtml.fi-ui.fi-v10 .ux-color-row { display:flex;align-items:center;gap:9px;flex-wrap:wrap; }\n\n@media (max-width:720px) {\n  html.fi-ui.fi-v10 .qr-manual,\n  html.fi-ui.fi-v10 .qr-scanner-actions,\n  html.fi-ui.fi-v10 .printer-form,\n  html.fi-ui.fi-v10 .printer-form-actions,\n  html.fi-ui.fi-v10 .printer-context,\n  html.fi-ui.fi-v10 .printer-candidate { grid-template-columns:1fr; }\n  html.fi-ui.fi-v10 .printer-hero { flex-direction:column; }\n  html.fi-ui.fi-v10 .printer-slot { grid-template-columns:1fr; }\n  html.fi-ui.fi-v10 .printer-slot-actions { display:grid;grid-template-columns:1fr 1fr; }\n  html.fi-ui.fi-v10 .printer-form .full { grid-column:auto; }\n  html.fi-ui.fi-v10 .audit-dashboard-row { align-items:flex-start;flex-direction:column; }\n}\n`;
    await write('ui-system.css', text);
  }
}

{
  let text = await read('tests/personal-integration.test.mjs');
  text = replaceOnce(
    text,
    "  assert.match(css, /#personalCommandCenter/);\n  assert.match(css, /#dashboardView\\[data-empty=\"true\"\\]/);",
    "  assert.match(source, /removeLegacyPersonalPanel/);\n  assert.match(css, /#dashboardView\\[data-empty=\"true\"\\]/);",
    'personal dashboard retired panel contract',
  );
  await write('tests/personal-integration.test.mjs', text);
}

{
  let text = await read('tests/ui-v10-integration.test.mjs');
  text = replaceOnce(
    text,
    "  assert.doesNotMatch(client, /Storage\\.prototype\\.setItem\\s*=/);",
    "  assert.doesNotMatch(client, /Storage\\.prototype\\.setItem\\s*=/);\n  assert.match(client, /if \\(button\\.innerHTML !== markup\\) button\\.innerHTML = markup/);",
    'profile loop regression contract',
  );
  await write('tests/ui-v10-integration.test.mjs', text);
}

{
  let text = await read('tests/ui-v10-architecture.test.mjs');
  text = replaceOnce(
    text,
    "  assert.match(css, /\\.data-group-v10/);",
    "  assert.match(css, /\\.data-group-v10/);\n  assert.match(css, /V10 COMPONENT FOUNDATIONS/);\n  assert.match(css, /\\.printer-command \\{ display:grid; \\}/);\n  assert.match(css, /\\.qr-scanner-body \\{ display:grid; \\}/);\n  assert.match(css, /\\.intake-banner \\{ display:grid; \\}/);",
    'component foundation regression contracts',
  );
  await write('tests/ui-v10-architecture.test.mjs', text);
}

console.log('Applied v10 hardening and component foundation migration.');
