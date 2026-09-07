import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('active-inventory scan opens physical spool without cross-profile navigation',async()=>{const scan=await read('scan-client.js'); assert.match(scan,/const state=readState\(\),exists=core\.stateHasSpool\(state,parsed\.spoolId\)/); assert.match(scan,/openPhysicalSpool\(parsed\.spoolId\)/); assert.match(scan,/actions\.openPhysical\(id,\{source:'scan'\}\)/);});
test('scanner preserves the private workspace boundary instead of discovering another profile',async()=>{const scan=await read('scan-client.js'); assert.match(scan,/location\.assign\(target\)/); assert.match(scan,/showUnknown\(parsed\.spoolId\)/); assert.doesNotMatch(scan,/Switching to .*private inventory|allProfileStates\(|core\.resolveProfile\(/);});
test('physical spool exposes authoritative lifecycle actions',async()=>{const core=await read('spool-actions-core.js'); for(const action of ['weigh','placement','edit','label','archive','restore','delete']) assert.match(core,new RegExp(`key:'${action}'`));});
test('physical spool presentation is published and activated',async()=>{const assets=await read('scripts/public-assets.mjs'); const html=await read('index.html'); assert.match(assets,/'css\/components\/physical-spool\.css'/); assert.match(html,/href="\/css\/components\/physical-spool\.css"/);});
