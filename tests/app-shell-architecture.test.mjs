import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('shell uses durable destinations and task-specific widths',async()=>{const js=await read('app-shell-client.js'); assert.match(js,/\['dashboard','Home'\]/); assert.match(js,/\['inventory','Inventory'\]/); assert.match(js,/\['household','Printer'\]/); assert.doesNotMatch(js,/PRIMARY[^;]*weigh/s); assert.match(js,/weigh:'focus'/); assert.match(js,/inventory:'workbench'/); assert.match(js,/household:'workbench'/);});
test('desktop shell provides sidebar and mobile center action becomes scan',async()=>{const js=await read('app-shell-client.js'); assert.match(js,/fi-desktop-sidebar/); assert.match(js,/data-bottom-scan/); assert.match(js,/Scan spool/);});
test('shell assets are published',async()=>{const assets=await read('scripts/public-assets.mjs'); assert.match(assets,/'css\/components\/app-shell\.css'/); assert.match(assets,/'app-shell-client\.js'/);});
