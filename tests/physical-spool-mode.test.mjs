import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('active-profile scan opens physical spool without navigation',async()=>{const scan=await read('scan-client.js'); assert.match(scan,/const exists=core\.stateHasSpool\(state,parsed\.spoolId\)/); assert.match(scan,/if\(exists\).*openPhysicalSpool\(parsed\.spoolId\)/s); assert.match(scan,/actions\.openPhysical\(id,\{source:'scan'\}\)/);});
test('scanner does not cross private profile boundaries',async()=>{const scan=await read('scan-client.js'); assert.doesNotMatch(scan,/core\.resolveProfile/); assert.doesNotMatch(scan,/Switching to .*private inventory/); assert.match(scan,/showUnknown\(parsed\.spoolId\)/);});
test('physical spool exposes authoritative lifecycle actions',async()=>{const core=await read('spool-actions-core.js'); for(const action of ['weigh','placement','edit','label','archive','restore','delete']) assert.match(core,new RegExp(`key:'${action}'`));});
test('physical spool presentation is published and activated',async()=>{const assets=await read('scripts/public-assets.mjs'); const html=await read('index.html'); assert.match(assets,/'css\/components\/physical-spool\.css'/); assert.match(html,/href="\/css\/components\/physical-spool\.css"/);});
