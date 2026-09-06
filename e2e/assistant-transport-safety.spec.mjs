import { test, expect } from '@playwright/test';

const PRIVATE_KEY='assistantTransportSmokeKey_0123456789abcd';
const fixedState={
  version:10,
  appVersion:'10.2.0',
  profile:'Bill',
  savedAt:'2026-09-06T08:30:00.000Z',
  meta:{lastBackupAt:null},
  spools:[{
    id:'S1', owner:'Bill', brand:'Inland', material:'PLA+', colorName:'Black', colorHex:'#111827',
    spoolType:'Cardboard', startWeight:1000, gross:600, tare:200, visualPercent:null,
    location:'Rack A', confidence:'Confirmed', opened:'Yes', bagged:'No', purchaseSource:'',
    purchasePrice:null, purchaseDate:'', reorderThreshold:250, lastDriedDate:'', notes:'',
    createdAt:'2026-09-01T12:00:00.000Z', updatedAt:'2026-09-06T08:00:00.000Z', archivedAt:null,
  }],
  printers:[], weighLog:[], auditLog:[], printJobs:[], tombstones:{},
};

async function seed(page){
  await page.addInitScript(({state,key})=>{
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-09-06T08:30:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory',JSON.stringify(state));
    localStorage.setItem('filament-user-v1:bill:sync-key',key);
    localStorage.setItem('filament-user-v1:bill:sync-settings',JSON.stringify({enabled:true,auto:false,lastRevision:'r1',lastSyncedAt:'2026-09-06T08:00:00.000Z',deviceName:'Assistant smoke'}));
    localStorage.setItem('filament-user-v1:aimee:inventory',JSON.stringify({...state,profile:'Aimee',spools:[]}));
    localStorage.setItem('filament-user-v1:aimee:sync-settings',JSON.stringify({enabled:false,auto:false,lastRevision:'',lastSyncedAt:null,deviceName:'Assistant smoke'}));

    const nativeFetch=globalThis.fetch.bind(globalThis);
    globalThis.__fiAssistantPosts=[];
    globalThis.__fiAssistantMock={
      ok:true,
      answer:'S1 has 400 g remaining (40% by measured).',
      evidenceIds:['S1'],
      confidence:'high',
      model:'gpt-5.6-luna',
    };
    globalThis.fetch=async(input,init={})=>{
      const source=typeof input==='string'?input:input?.url;
      const url=new URL(source,location.href);
      const method=String(init.method||input?.method||'GET').toUpperCase();
      if(url.pathname==='/api/inventory-assistant'){
        if(method==='GET')return new Response(JSON.stringify({
          ok:true,service:'inventory-assistant',contractVersion:1,
          transport:{configured:true,model:'gpt-5.6-luna',provider:'openai-responses',storesResponses:false},
        }),{status:200,headers:{'Content-Type':'application/json'}});
        const rawBody=init.body??(input instanceof Request?await input.clone().text():'');
        globalThis.__fiAssistantPosts.push({
          body:JSON.parse(String(rawBody||'{}')),
          profile:String(new Headers(init.headers||input?.headers).get('x-filament-profile')||''),
        });
        return new Response(JSON.stringify(globalThis.__fiAssistantMock),{status:200,headers:{'Content-Type':'application/json'}});
      }
      if(url.pathname==='/api/sync'){
        if(method==='POST'){
          const rawBody=init.body??(input instanceof Request?await input.clone().text():'');
          const body=JSON.parse(String(rawBody||'{}'));
          return new Response(JSON.stringify({state:body.state,meta:{revision:'r2',updatedAt:'2026-09-06T08:30:00.000Z',devices:[],activity:[]},merge:{concurrent:false,conflictedSpools:0}}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return new Response(JSON.stringify({state,meta:{revision:'r1',updatedAt:'2026-09-06T08:00:00.000Z',devices:[],activity:[]}}),{status:200,headers:{'Content-Type':'application/json'}});
      }
      return nativeFetch(input,init);
    };
  },{state:fixedState,key:PRIVATE_KEY});
}

async function boot(page){
  await seed(page);
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>Boolean(globalThis.FilamentInventoryAssistantUI&&globalThis.FilamentInventoryLLMTransport))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>globalThis.FilamentInventoryLLMTransport.state().server.configured)).toBe(true);
  await page.evaluate(()=>globalThis.FilamentInventoryAssistantUI.open());
  await expect(page.locator('#assistantView')).toBeVisible();
}

test('valid grounded model answer is accepted and request remains profile-scoped',async({page})=>{
  await boot(page);
  await page.evaluate(()=>globalThis.FilamentInventoryAssistantUI.ask('How much black PLA is left?'));
  await expect(page.locator('#fiLlmTranscript')).toContainText('S1 has 400 g remaining');
  await expect(page.locator('[data-llm-mode]')).toHaveText('Grounded model');
  const post=await page.evaluate(()=>globalThis.__fiAssistantPosts.at(-1));
  expect(post.profile).toBe('Bill');
  expect(post.body.profile).toBe('Bill');
  expect(post.body.inventory.map(row=>row.id)).toEqual(['S1']);
  expect(post.body.inventory.every(row=>row.owner===undefined)).toBe(true);
});

test('client rejects numerically fabricated model output and falls back locally',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{
    globalThis.__fiAssistantMock={
      ok:true,
      answer:'S1 has 999 g remaining.',
      evidenceIds:['S1'],
      confidence:'high',
      model:'gpt-5.6-luna',
    };
  });
  await page.evaluate(()=>globalThis.FilamentInventoryAssistantUI.ask('How much black PLA is left?'));
  await expect(page.locator('#fiLlmTranscript')).toContainText('S1 has 400 g remaining');
  await expect(page.locator('#fiLlmTranscript')).not.toContainText('999 g');
  await expect(page.locator('[data-llm-mode]')).toHaveText('Local fallback');
  await expect(page.locator('[data-llm-transport-note]')).toContainText('failed client validation');
});

test('client rejects missing required evidence even when the answer text looks plausible',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{
    globalThis.__fiAssistantMock={
      ok:true,
      answer:'S1 has 400 g remaining.',
      evidenceIds:[],
      confidence:'high',
      model:'gpt-5.6-luna',
    };
  });
  await page.evaluate(()=>globalThis.FilamentInventoryAssistantUI.ask('How much black PLA is left?'));
  await expect(page.locator('#fiLlmTranscript')).toContainText('S1 has 400 g remaining');
  await expect(page.locator('[data-llm-mode]')).toHaveText('Local fallback');
  await expect(page.locator('[data-llm-transport-note]')).toContainText('failed client validation');
});
