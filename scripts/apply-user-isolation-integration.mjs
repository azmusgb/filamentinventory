import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, from, to) {
  let text = await readFile(path, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one match, found ${count}: ${from.slice(0,120)}`);
  text = text.replace(from, to);
  await writeFile(path, text);
}

async function patchPackageLock() {
  const path = 'package-lock.json';
  const lock = JSON.parse(await readFile(path, 'utf8'));
  if (lock.version !== '9.0.0' || lock.packages?.['']?.version !== '9.0.0') throw new Error('package-lock baseline version is not 9.0.0');
  lock.version = '9.1.0';
  lock.packages[''].version = '9.1.0';
  await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`);
}

await patchPackageLock();

await replaceExact(
  'index.html',
  '<script defer src="/personal-core.js"></script>\n<script defer src="/sync-client.js"></script>',
  '<script defer src="/personal-core.js"></script>\n<script defer src="/user-isolation.js"></script>\n<script defer src="/sync-client.js"></script>',
);

await replaceExact(
  'sync-client.js',
  "  const VERSION = 5;\n",
  "  const VERSION = 5;\n  const currentProfile = () => globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';\n",
);
await replaceExact(
  'sync-client.js',
  "      headers:{Accept:'application/json','X-Filament-Sync-Key':key,...(body ? {'Content-Type':'application/json'} : {})},",
  "      headers:{Accept:'application/json','X-Filament-Sync-Key':key,'X-Filament-Profile':currentProfile(),...(body ? {'Content-Type':'application/json'} : {})},",
);

await replaceExact(
  'security-client.js',
  "  const ADMIN_API = '/api/sync-admin';\n",
  "  const ADMIN_API = '/api/sync-admin';\n  const currentProfile = () => globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';\n",
);
await replaceExact(
  'security-client.js',
  "      headers:{Accept:'application/json','X-Filament-Sync-Key':key},",
  "      headers:{Accept:'application/json','X-Filament-Sync-Key':key,'X-Filament-Profile':currentProfile()},",
);
await replaceExact(
  'security-client.js',
  "      headers:{Accept:'application/json','Content-Type':'application/json','X-Filament-Sync-Key':key},",
  "      headers:{Accept:'application/json','Content-Type':'application/json','X-Filament-Sync-Key':key,'X-Filament-Profile':currentProfile()},",
);
await replaceExact(
  'security-client.js',
  "    return `${location.origin}${location.pathname}#filament-sync=${encodeURIComponent(key)}`;",
  "    return `${location.origin}${location.pathname}#filament-sync=${encodeURIComponent(key)}&filament-user=${encodeURIComponent(currentProfile())}`;",
);
await replaceExact(
  'security-client.js',
  "    if (!confirm('Connect this device to the Filament Inventory shared by this private pairing link?')) return;",
  "    if (!confirm(`Connect this device to ${currentProfile()}'s private Filament Inventory?`)) return;",
);
await replaceExact(
  'security-client.js',
  "      download(`filament-cloud-backup-${stamp}.json`, {",
  "      const profile = currentProfile();\n      download(`filament-cloud-backup-${profile.toLowerCase()}-${stamp}.json`, {",
);
await replaceExact(
  'security-client.js',
  "        source:'Filament Inventory v6 cloud backup',",
  "        source:`Filament Inventory ${globalThis.FilamentInventoryVersion?.DISPLAY_VERSION || ''} ${profile} cloud backup`.trim(),\n        profile,",
);
await replaceExact(
  'security-client.js',
  "      const newKeyHash = await sha256Hex(newKey);",
  "      const newKeyHash = await sha256Hex(`${currentProfile().toLowerCase()}:${newKey}`);",
);

for (const path of ['netlify/functions/sync.mts','netlify/functions/sync-admin.mts']) {
  await replaceExact(path, "const KEY_HEADER = 'x-filament-sync-key';\n", "const KEY_HEADER = 'x-filament-sync-key';\nconst PROFILE_HEADER = 'x-filament-profile';\n");
  await replaceExact(
    path,
    "function hashKey(key: string): string {\n  return createHash('sha256').update(key).digest('hex');\n}",
    "function profile(req: Request): 'Bill' | 'Aimee' | null {\n  const value = String(req.headers.get(PROFILE_HEADER) || '').trim();\n  return value === 'Bill' || value === 'Aimee' ? value : null;\n}\n\nfunction hashKey(key: string, owner: 'Bill' | 'Aimee'): string {\n  return createHash('sha256').update(`${owner.toLowerCase()}:${key}`).digest('hex');\n}",
  );
}

await replaceExact(
  'netlify/functions/sync.mts',
  "  const key = syncKey(req);\n  if (!key) return json({ ok:false, error:'A valid private sync key is required.' }, 401);\n\n  const hash = hashKey(key);",
  "  const key = syncKey(req);\n  if (!key) return json({ ok:false, error:'A valid private sync key is required.' }, 401);\n  const owner = profile(req);\n  if (!owner) return json({ ok:false, error:'A valid inventory profile is required.' }, 400);\n\n  const hash = hashKey(key, owner);",
);

await replaceExact(
  'netlify/functions/sync-admin.mts',
  "  const key = syncKey(req);\n  if (!key) return json({ok:false, error:'A valid private sync key is required.'}, 401);",
  "  const key = syncKey(req);\n  if (!key) return json({ok:false, error:'A valid private sync key is required.'}, 401);\n  const owner = profile(req);\n  if (!owner) return json({ok:false, error:'A valid inventory profile is required.'}, 400);",
);
await replaceExact(
  'netlify/functions/sync-admin.mts',
  "  const oldHash = hashKey(key);",
  "  const oldHash = hashKey(key, owner);",
);

await replaceExact(
  'personal-dashboard.js',
  'Shared household inventory, prioritized for the current profile.',
  'Private inventory only, prioritized for the current profile.',
);
await replaceExact(
  'personal-dashboard.js',
  'shared household data, personal priorities.',
  'private inventory only.',
);
await replaceExact(
  'personal-dashboard.js',
  "    const householdSelect = document.getElementById('currentUserV8');\n    if (householdSelect) {\n      householdSelect.value = owner;\n      householdSelect.dispatchEvent(new Event('change',{bubbles:true}));\n    } else {\n      localStorage.setItem(CURRENT_USER_KEY, owner);\n    }\n    scheduleRender();",
  "    localStorage.setItem(CURRENT_USER_KEY, owner);",
);

await replaceExact(
  'app.js',
  "  function markBackup() { meta.lastBackupAt = nowIso(); saveState(); renderDataHealth(); }\n",
  "  const currentProfile = () => globalThis.FilamentInventoryUsers?.currentUser?.() || 'Bill';\n  const profileSlug = () => currentProfile().toLowerCase();\n\n  function markBackup() { meta.lastBackupAt = nowIso(); saveState(); renderDataHealth(); }\n",
);
await replaceExact(
  'app.js',
  "    download(`filament-inventory-${VERSION_INFO.DISPLAY_VERSION}-${exportedAt.slice(0,10)}.json`, JSON.stringify({version:DATA_SCHEMA_VERSION,appVersion:APP_VERSION,exportedAt,meta,spools:inventory,weighLog},null,2), 'application/json');",
  "    download(`filament-inventory-${profileSlug()}-${VERSION_INFO.DISPLAY_VERSION}-${exportedAt.slice(0,10)}.json`, JSON.stringify({version:DATA_SCHEMA_VERSION,appVersion:APP_VERSION,profile:currentProfile(),exportedAt,meta,spools:inventory,weighLog},null,2), 'application/json');",
);
await replaceExact(
  'app.js',
  "    download(`filament-inventory-${VERSION_INFO.DISPLAY_VERSION}-${new Date().toISOString().slice(0,10)}.csv`,",
  "    download(`filament-inventory-${profileSlug()}-${VERSION_INFO.DISPLAY_VERSION}-${new Date().toISOString().slice(0,10)}.csv`,",
);
await replaceExact(
  'app.js',
  "    download(`filament-measurements-${VERSION_INFO.DISPLAY_VERSION}-${new Date().toISOString().slice(0,10)}.csv`,",
  "    download(`filament-measurements-${profileSlug()}-${VERSION_INFO.DISPLAY_VERSION}-${new Date().toISOString().slice(0,10)}.csv`,",
);
await replaceExact(
  'app.js',
  "      if (!parsed || !Array.isArray(parsed.spools)) throw new Error('JSON does not contain a spools array.');\n      const incoming = parsed.spools.map(normalizeSpool).filter(s => s.id);",
  "      if (!parsed || !Array.isArray(parsed.spools)) throw new Error('JSON does not contain a spools array.');\n      if (parsed.profile && parsed.profile !== currentProfile()) throw new Error(`This backup belongs to ${parsed.profile}. Switch to ${parsed.profile} before importing it.`);\n      const incoming = parsed.spools.map(normalizeSpool).filter(s => s.id);",
);
await replaceExact(
  'app.js',
  "  function resetStarter() {\n    if (!confirm('Reset all local edits and restore the 21-spool starter inventory? This replaces current local data.')) return;\n    const state = starterState(); inventory = state.spools; weighLog = state.weighLog; meta = state.meta; saveState(); renderAll(); showToast('Starter inventory restored.');\n  }",
  "  function resetStarter() {\n    const owner = currentProfile();\n    const message = owner === 'Bill' ? 'Reset Bill\\'s inventory to the original 21-spool starter set? This replaces Bill\\'s current local data.' : 'Reset Aimee\\'s inventory to empty? This replaces Aimee\\'s current local data.';\n    if (!confirm(message)) return;\n    const state = owner === 'Bill' ? starterState() : {spools:[],weighLog:[],meta:{lastBackupAt:null}}; inventory = state.spools; weighLog = state.weighLog; meta = state.meta; saveState(); renderAll(); showToast(`${owner}'s inventory reset.`);\n  }",
);

await replaceExact(
  'user-isolation.js',
  "  function splitLegacyState(input, {schemaVersion = 10, cloudOwner = 'Bill', at = nowIso()} = {}) {",
  "  function splitLegacyState(input, {schemaVersion = 10, at = nowIso()} = {}) {",
);
await replaceExact(
  'user-isolation.js',
  "\n    const activeCloudOwner = normalizeOwner(cloudOwner);\n    const otherOwner = activeCloudOwner === 'Bill' ? 'Aimee' : 'Bill';\n    for (const spool of states[otherOwner].spools) {\n      const id = lowerId(spool.id);\n      if (id) states[activeCloudOwner].tombstones[id] = at;\n    }\n    states[activeCloudOwner].meta = {...states[activeCloudOwner].meta, legacyCloudScopeOwner:activeCloudOwner};\n    return states;",
  "\n    return states;",
);
await replaceExact(
  'user-isolation.js',
  "        const split = splitLegacyState(legacyState, {schemaVersion, cloudOwner:owner});",
  "        const split = splitLegacyState(legacyState, {schemaVersion});",
);
await replaceExact(
  'user-isolation.js',
  "      const legacySyncKey = nativeGet.call(storage, SYNC_KEY);\n      const legacySyncSettings = nativeGet.call(storage, SYNC_SETTINGS_KEY);\n      if (legacySyncKey && !nativeGet.call(storage, physicalKey(owner, SYNC_KEY))) nativeSet.call(storage, physicalKey(owner, SYNC_KEY), legacySyncKey);\n      if (legacySyncSettings && !nativeGet.call(storage, physicalKey(owner, SYNC_SETTINGS_KEY))) nativeSet.call(storage, physicalKey(owner, SYNC_SETTINGS_KEY), legacySyncSettings);",
  "      const legacySyncKey = nativeGet.call(storage, SYNC_KEY);\n      const legacySettings = parse(nativeGet.call(storage, SYNC_SETTINGS_KEY), {});\n      for (const profileOwner of OWNERS) {\n        if (legacySyncKey && !nativeGet.call(storage, physicalKey(profileOwner, SYNC_KEY))) nativeSet.call(storage, physicalKey(profileOwner, SYNC_KEY), legacySyncKey);\n        if (!nativeGet.call(storage, physicalKey(profileOwner, SYNC_SETTINGS_KEY))) nativeSet.call(storage, physicalKey(profileOwner, SYNC_SETTINGS_KEY), JSON.stringify({...legacySettings, enabled:Boolean(legacySyncKey && legacySettings?.enabled), lastRevision:'', lastSyncedAt:null}));\n      }",
);
await replaceExact(
  'user-isolation.js',
  "      nativeSet.call(storage, MIGRATION_KEY, JSON.stringify({at:nowIso(), schemaVersion, legacyCloudScopeOwner:owner}));",
  "      nativeSet.call(storage, MIGRATION_KEY, JSON.stringify({at:nowIso(), schemaVersion, cloudIsolation:'profile-scoped'}));",
);

console.log('Applied isolated user inventory integration.');
