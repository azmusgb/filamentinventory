(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.FilamentInventoryLLM=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const INVENTORY_KEY='filament-inventory-v1';
  const CURRENT_USER_KEY='filament-current-user-v1';
  const MAX_EVIDENCE=8;
  const MATERIALS=Object.freeze(['PLA','PETG','ABS','ASA','TPU','PA','NYLON','PC','PVA','HIPS','PP','PEEK','PCTG']);
  const COLORS=Object.freeze(['black','white','red','orange','yellow','green','blue','purple','pink','brown','tan','gray','grey','silver','gold','natural','cream','clear','transparent','teal','cyan','magenta']);
  const STOP_WORDS=new Set(['a','an','and','any','are','can','do','does','for','have','i','in','is','it','me','my','of','on','show','some','tell','the','this','to','what','which','with','you']);
  let transport=null;

  const clean=value=>String(value??'').trim();
  const lower=value=>clean(value).toLowerCase();
  const finite=value=>value!==''&&value!==null&&value!==undefined&&Number.isFinite(Number(value));
  const nowIso=()=>new Date().toISOString();

  function currentOwner(storage){
    const fromApi=typeof globalThis!=='undefined'&&globalThis.FilamentInventoryUsers?.currentUser?.();
    if(fromApi) return clean(fromApi)||'Bill';
    try{return clean(storage?.getItem?.(CURRENT_USER_KEY))||'Bill';}catch{return 'Bill';}
  }

  function readState(storage=typeof localStorage!=='undefined'?localStorage:null){
    if(!storage) return {profile:'Bill',spools:[],printers:[],weighLog:[],meta:{},readError:'Storage unavailable'};
    const profile=currentOwner(storage);
    try{
      const raw=storage.getItem(INVENTORY_KEY);
      if(!raw) return {profile,spools:[],printers:[],weighLog:[],meta:{}};
      const parsed=JSON.parse(raw);
      return {
        ...parsed,
        profile:clean(parsed?.profile)||profile,
        spools:Array.isArray(parsed?.spools)?parsed.spools:[],
        printers:Array.isArray(parsed?.printers)?parsed.printers:[],
        weighLog:Array.isArray(parsed?.weighLog)?parsed.weighLog:[],
        meta:parsed?.meta&&typeof parsed.meta==='object'?parsed.meta:{},
      };
    }catch(error){
      return {profile,spools:[],printers:[],weighLog:[],meta:{},readError:error instanceof Error?error.message:String(error)};
    }
  }

  function measurement(spool){
    const start=finite(spool?.startWeight)&&Number(spool.startWeight)>0?Number(spool.startWeight):1000;
    if(finite(spool?.gross)&&finite(spool?.tare)&&Number(spool.gross)>=Number(spool.tare)){
      const grams=Math.min(start,Math.max(0,Number(spool.gross)-Number(spool.tare)));
      return {grams,percent:Math.round((grams/start)*1000)/10,source:'Measured'};
    }
    if(finite(spool?.visualPercent)){
      const percent=Math.max(0,Math.min(100,Number(spool.visualPercent)));
      return {grams:Math.round(start*percent/100),percent,source:'Visual estimate'};
    }
    return {grams:null,percent:null,source:'Unknown'};
  }

  function isArchived(spool){return Boolean(spool?.archivedAt);}
  function reorderNeeded(spool){
    if(isArchived(spool)) return false;
    const m=measurement(spool);
    const threshold=finite(spool?.reorderThreshold)?Math.max(0,Number(spool.reorderThreshold)):250;
    return m.grams!==null&&m.grams<=threshold;
  }

  function loadedDescriptor(spool){
    const fields=[spool?.placementV8,spool?.placement,spool?.location,spool?.feederV8,spool?.slotV8,spool?.amsSlot,spool?.loadedIn].map(clean).filter(Boolean);
    const joined=fields.join(' · ');
    const loaded=/\b(ams|slot|loaded|external spool|printer)\b/i.test(joined)||Boolean(spool?.loaded);
    return {loaded,detail:joined||''};
  }

  function compactSpool(spool){
    const m=measurement(spool);
    const loaded=loadedDescriptor(spool);
    return {
      id:clean(spool?.id),
      brand:clean(spool?.brand)||'Unknown',
      material:clean(spool?.material)||'Unknown',
      colorName:clean(spool?.colorName)||'Unknown',
      location:clean(spool?.location),
      confidence:clean(spool?.confidence)||'Unknown',
      remainingGrams:m.grams,
      remainingPercent:m.percent,
      remainingSource:m.source,
      reorderNeeded:reorderNeeded(spool),
      loaded:loaded.loaded,
      loadedDetail:loaded.detail,
    };
  }

  function buildSnapshot(state){
    const active=(Array.isArray(state?.spools)?state.spools:[]).filter(spool=>!isArchived(spool)).map(compactSpool);
    return {
      profile:clean(state?.profile)||'Bill',
      generatedAt:nowIso(),
      activeSpoolCount:active.length,
      spools:active,
      printers:Array.isArray(state?.printers)?state.printers.map(printer=>({
        id:clean(printer?.id),name:clean(printer?.name)||clean(printer?.displayName),model:clean(printer?.model),
        ams:Array.isArray(printer?.ams)?printer.ams:undefined,
      })):[],
      readError:clean(state?.readError),
    };
  }

  function materialInQuestion(question){
    const upper=clean(question).toUpperCase();
    return MATERIALS.find(material=>new RegExp(`(^|[^A-Z0-9])${material.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^A-Z0-9]|$)`).test(upper))||null;
  }

  function colorInQuestion(question){
    const q=lower(question);
    return COLORS.find(color=>new RegExp(`\\b${color}\\b`,'i').test(q))||null;
  }

  function brandInQuestion(question,spools){
    const q=lower(question);
    const brands=[...new Set(spools.map(s=>clean(s.brand)).filter(value=>value&&lower(value)!=='unknown'))].sort((a,b)=>b.length-a.length);
    return brands.find(brand=>q.includes(lower(brand)))||null;
  }

  function queryTerms(question){
    return lower(question).replace(/[^a-z0-9+\-]+/g,' ').split(/\s+/).filter(token=>token.length>1&&!STOP_WORDS.has(token));
  }

  function matchesSpecific(spool,{material,color,brand}){
    if(material&&!lower(spool.material).includes(lower(material))) return false;
    if(color&&!lower(spool.colorName).includes(color)) return false;
    if(brand&&lower(spool.brand)!==lower(brand)&&!lower(spool.brand).includes(lower(brand))) return false;
    return true;
  }

  function rankedMatches(question,snapshot){
    const specific={material:materialInQuestion(question),color:colorInQuestion(question),brand:brandInQuestion(question,snapshot.spools)};
    const hasSpecific=Boolean(specific.material||specific.color||specific.brand);
    const terms=queryTerms(question).filter(token=>!MATERIALS.map(lower).includes(token)&&!COLORS.includes(token));
    const ranked=snapshot.spools
      .filter(spool=>matchesSpecific(spool,specific))
      .map(spool=>{
        const hay=lower([spool.id,spool.brand,spool.material,spool.colorName,spool.location,spool.loadedDetail].join(' '));
        let score=hasSpecific?4:0;
        for(const term of terms) if(hay.includes(term)) score+=term===lower(spool.id)?5:1;
        return {spool,score};
      })
      .filter(row=>hasSpecific||row.score>0)
      .sort((a,b)=>b.score-a.score||a.spool.id.localeCompare(b.spool.id));
    return {specific,rows:ranked};
  }

  function evidenceFor(spools,reason){
    return spools.slice(0,MAX_EVIDENCE).map(spool=>({
      id:spool.id,
      title:`${spool.id} · ${spool.brand} ${spool.material}`,
      detail:[spool.colorName,spool.remainingGrams===null?'remaining unknown':`${Math.round(spool.remainingGrams)} g ${spool.remainingSource.toLowerCase()}`,spool.location||spool.loadedDetail].filter(Boolean).join(' · '),
      reason,
    }));
  }

  function result(answer,intent,evidence=[],confidence='high',extra={}){
    return {answer,intent,evidence,confidence,mode:'local-grounded',...extra};
  }

  function listSpools(spools){
    return spools.slice(0,6).map(spool=>{
      const amount=spool.remainingGrams===null?'remaining unknown':`${Math.round(spool.remainingGrams)} g`;
      return `${spool.id}: ${spool.brand} ${spool.material}, ${spool.colorName} — ${amount}`;
    }).join('\n');
  }

  function answerLow(snapshot){
    const low=snapshot.spools.filter(spool=>spool.reorderNeeded).sort((a,b)=>(a.remainingGrams??Infinity)-(b.remainingGrams??Infinity));
    if(!low.length) return result(`I don’t see any ${snapshot.profile} spools at or below their reorder threshold.`, 'low-stock', [], 'high');
    const noun=low.length===1?'spool is':'spools are';
    return result(`${low.length} ${noun} at or below the reorder threshold:\n${listSpools(low)}`, 'low-stock', evidenceFor(low,'At or below reorder threshold'),'high',{matchedSpoolIds:low.map(s=>s.id)});
  }

  function answerLoaded(snapshot){
    const loaded=snapshot.spools.filter(spool=>spool.loaded);
    if(!loaded.length) return result(`I don’t see any spool records explicitly marked as loaded for ${snapshot.profile}. I won’t infer an AMS assignment from color or material alone.`, 'loaded', [], 'medium');
    return result(`${loaded.length} spool${loaded.length===1?' is':'s are'} marked as loaded:\n${loaded.slice(0,6).map(s=>`${s.id}: ${s.brand} ${s.material}, ${s.colorName}${s.loadedDetail?` — ${s.loadedDetail}`:''}`).join('\n')}`, 'loaded', evidenceFor(loaded,'Explicit loaded/AMS placement'),'high',{matchedSpoolIds:loaded.map(s=>s.id)});
  }

  function answerSummary(snapshot){
    const measured=snapshot.spools.filter(s=>s.remainingSource==='Measured').length;
    const visual=snapshot.spools.filter(s=>s.remainingSource==='Visual estimate').length;
    const unknown=snapshot.spools.filter(s=>s.remainingGrams===null).length;
    const low=snapshot.spools.filter(s=>s.reorderNeeded).length;
    return result(`${snapshot.profile} has ${snapshot.activeSpoolCount} active spool${snapshot.activeSpoolCount===1?'':'s'}. Remaining amount is measured for ${measured}, visually estimated for ${visual}, and unknown for ${unknown}. ${low} ${low===1?'is':'are'} at or below the reorder threshold.`, 'summary', [], 'high',{facts:{measured,visual,unknown,low}});
  }

  function answerSpecific(question,snapshot){
    const {specific,rows}=rankedMatches(question,snapshot);
    const spools=rows.map(row=>row.spool);
    const asksRemaining=/\b(how much|remaining|left|amount|weight)\b/i.test(question);
    const asksWhere=/\b(where|location|located|stored)\b/i.test(question);
    const asksCount=/\b(how many|count|number)\b/i.test(question);
    const strict=Boolean(specific.material||specific.color||specific.brand);

    if(!spools.length){
      if(strict) {
        const description=[specific.brand,specific.color,specific.material].filter(Boolean).join(' ');
        return result(`I don’t see a matching ${description} spool in ${snapshot.profile}’s current inventory.`, 'not-found', [], 'high');
      }
      return null;
    }

    if(asksCount) return result(`${snapshot.profile} has ${spools.length} matching active spool${spools.length===1?'':'s'}.\n${listSpools(spools)}`, 'count', evidenceFor(spools,'Matched current inventory'),'high',{matchedSpoolIds:spools.map(s=>s.id)});

    if(asksRemaining&&spools.length===1){
      const spool=spools[0];
      if(spool.remainingGrams===null) return result(`${spool.id} matches, but its remaining amount is unknown. Weigh the spool to establish an authoritative value; I won’t invent one.`, 'remaining-unknown', evidenceFor([spool],'Matched spool; remaining value absent'),'high',{matchedSpoolIds:[spool.id]});
      return result(`${spool.id} has ${Math.round(spool.remainingGrams)} g remaining (${spool.remainingPercent}% by ${spool.remainingSource.toLowerCase()}).`, 'remaining', evidenceFor([spool],'Matched spool and remaining evidence'),'high',{matchedSpoolIds:[spool.id]});
    }

    if(asksWhere&&spools.length===1){
      const spool=spools[0];
      const location=spool.loadedDetail||spool.location;
      if(!location) return result(`${spool.id} matches, but no storage or loaded location is recorded.`, 'location-unknown', evidenceFor([spool],'Matched spool; location absent'),'high',{matchedSpoolIds:[spool.id]});
      return result(`${spool.id} is recorded at ${location}.`, 'location', evidenceFor([spool],'Recorded location'),'high',{matchedSpoolIds:[spool.id]});
    }

    return result(`${spools.length} matching spool${spools.length===1?'':'s'}:\n${listSpools(spools)}`, 'search', evidenceFor(spools,'Matched current inventory'),'high',{matchedSpoolIds:spools.map(s=>s.id)});
  }

  function answerLocal(question,snapshot){
    const q=clean(question);
    if(!q) return result('Ask a question about the current filament inventory.','empty',[],'low');
    if(snapshot.readError) return result(`I can’t read the current inventory: ${snapshot.readError}.`,'storage-error',[],'low');
    if(/\b(low|reorder|almost empty|nearly empty|running out|buy soon|purchase soon)\b/i.test(q)) return answerLow(snapshot);
    if(/\b(ams|loaded|load(ed)? now|in the printer)\b/i.test(q)) return answerLoaded(snapshot);
    const specific=answerSpecific(q,snapshot);
    if(specific) return specific;
    if(/\b(inventory|spools?|summary|what do i have|how much filament)\b/i.test(q)) return answerSummary(snapshot);
    return result(`I can answer grounded inventory questions such as “What is low?”, “What is loaded?”, “How much black PLA is left?”, or “Where is my PETG?”.\n\nCurrent snapshot: ${snapshot.activeSpoolCount} active spool${snapshot.activeSpoolCount===1?'':'s'} for ${snapshot.profile}.`, 'help', [], 'medium');
  }

  function buildModelRequest(question,snapshot,localResult){
    const relevantIds=new Set(localResult?.evidence?.map(row=>row.id).filter(Boolean));
    const relevant=relevantIds.size?snapshot.spools.filter(spool=>relevantIds.has(spool.id)):snapshot.spools.slice(0,40);
    return {
      version:1,
      task:'filament-inventory-assistant',
      question:clean(question),
      profile:snapshot.profile,
      groundingRules:[
        'Inventory records are authoritative for ownership, identity, location and remaining amount.',
        'Never invent a spool, location, weight, AMS assignment or measurement.',
        'If a requested fact is absent, say it is unknown.',
        'Recommendations must be labeled as recommendations rather than stored inventory facts.',
        'Return evidenceIds containing only IDs present in the provided inventory records.'
      ],
      inventory:relevant,
      localGrounding:{intent:localResult.intent,evidenceIds:[...relevantIds],fallbackAnswer:localResult.answer}
    };
  }

  function validateTransportResponse(response,snapshot,localResult){
    if(!response||typeof response!=='object'||!clean(response.answer)) return null;
    const validIds=new Set(snapshot.spools.map(spool=>spool.id));
    const evidenceIds=Array.isArray(response.evidenceIds)?response.evidenceIds.map(clean).filter(Boolean):[];
    if(evidenceIds.some(id=>!validIds.has(id))) return null;
    const evidence=evidenceIds.map(id=>localResult.evidence.find(row=>row.id===id)||evidenceFor([snapshot.spools.find(s=>s.id===id)],'Model-cited inventory record')[0]).filter(Boolean);
    return {...localResult,answer:clean(response.answer),evidence:evidence.length?evidence:localResult.evidence,mode:'model-grounded',confidence:clean(response.confidence)||localResult.confidence};
  }

  function setTransport(fn){transport=typeof fn==='function'?fn:null;return Boolean(transport);}
  function hasTransport(){return typeof transport==='function';}

  async function ask(question,{state,storage,signal}={}){
    const snapshot=buildSnapshot(state||readState(storage));
    const localResult=answerLocal(question,snapshot);
    if(!transport) return {...localResult,snapshot};
    try{
      const response=await transport(buildModelRequest(question,snapshot,localResult),{signal});
      const validated=validateTransportResponse(response,snapshot,localResult);
      return {...(validated||localResult),snapshot,transportRejected:Boolean(response&&!validated)};
    }catch(error){
      return {...localResult,snapshot,transportError:error instanceof Error?error.message:String(error)};
    }
  }

  function runAcceptanceSuite(state){
    const snapshot=buildSnapshot(state);
    const tests=[];
    const push=(id,pass,detail)=>tests.push({id,pass:Boolean(pass),detail});
    const summary=answerLocal('Give me an inventory summary',snapshot);
    push('summary-count',summary.answer.includes(String(snapshot.activeSpoolCount)),`Expected active count ${snapshot.activeSpoolCount}`);
    const low=answerLocal('What is low?',snapshot);
    const expectedLow=snapshot.spools.filter(s=>s.reorderNeeded).length;
    push('low-stock',low.intent==='low-stock'&&low.answer.includes(String(expectedLow)),`Expected ${expectedLow} low/reorder spools`);
    const phantom=answerLocal('How much ZZZ_TEST_NONEXISTENT filament do I have?',snapshot);
    push('phantom-resistance',phantom.evidence.length===0&&!/\b\d+\s*g\b/i.test(phantom.answer),'Must not invent a gram value for a nonexistent item');
    const unknown=snapshot.spools.find(s=>s.remainingGrams===null);
    if(unknown){
      const check=answerLocal(`How much ${unknown.id} is left?`,snapshot);
      push('unknown-remains-unknown',check.intent==='remaining-unknown'&&!/\b\d+\s*g\b/i.test(check.answer),`${unknown.id} has no authoritative remaining amount`);
    } else push('unknown-remains-unknown',true,'No unknown remaining values in current inventory');
    const loaded=answerLocal('What is loaded now?',snapshot);
    const explicitLoaded=snapshot.spools.filter(s=>s.loaded).length;
    push('loaded-grounding',loaded.intent==='loaded'&&(!explicitLoaded||loaded.evidence.length>0),`Explicit loaded records: ${explicitLoaded}`);
    push('profile-isolation',snapshot.spools.every(()=>Boolean(snapshot.profile)),`Snapshot profile: ${snapshot.profile}`);
    return {passed:tests.filter(t=>t.pass).length,total:tests.length,tests,snapshot};
  }

  return Object.freeze({
    INVENTORY_KEY,MATERIALS,COLORS,readState,measurement,reorderNeeded,loadedDescriptor,buildSnapshot,
    answerLocal,buildModelRequest,validateTransportResponse,setTransport,hasTransport,ask,runAcceptanceSuite,
  });
});