(() => {
  'use strict';

  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const HISTORY_LIMIT=20;
  let conversation=[];
  let running=false;
  let initialized=false;

  function api(){return globalThis.FilamentInventoryLLM;}
  function transportApi(){return globalThis.FilamentInventoryLLMTransport;}
  function owner(){return globalThis.FilamentInventoryUsers?.currentUser?.()||localStorage.getItem('filament-current-user-v1')||'Bill';}
  function historyKey(){return `filament-llm-session-v1:${owner().toLowerCase()}`;}

  function loadConversation(){
    try{
      const parsed=JSON.parse(sessionStorage.getItem(historyKey())||'[]');
      conversation=Array.isArray(parsed)?parsed.slice(-HISTORY_LIMIT):[];
    }catch{conversation=[];}
  }

  function saveConversation(){
    try{sessionStorage.setItem(historyKey(),JSON.stringify(conversation.slice(-HISTORY_LIMIT)));}catch{}
  }

  function ensureSurface(){
    if($('assistantView')) return $('assistantView');
    const main=$('mainContent')||document.querySelector('.app-shell > main');
    if(!main) return null;
    const section=document.createElement('section');
    section.id='assistantView';
    section.className='view fi-llm-view';
    section.hidden=true;
    section.inert=true;
    section.setAttribute('aria-hidden','true');
    section.setAttribute('aria-labelledby','fiLlmTitle');
    section.innerHTML=`
      <header class="fi-page-header fi-llm-page-head">
        <div class="fi-page-header-copy">
          <span class="eyebrow">Inventory intelligence</span>
          <h2 id="fiLlmTitle" tabindex="-1">Assistant</h2>
          <p>Ask about the current private inventory. Stored evidence stays authoritative; unknown stays unknown.</p>
        </div>
        <div class="fi-llm-mode" aria-label="Assistant mode">
          <span class="fi-llm-mode-dot" aria-hidden="true"></span>
          <span><strong data-llm-mode>Grounded local</strong><small data-llm-owner>${esc(owner())} inventory</small></span>
        </div>
      </header>
      <div class="fi-llm-layout">
        <section class="panel fi-llm-chat" aria-labelledby="fiLlmConversationTitle">
          <header class="fi-llm-section-head">
            <div><h3 id="fiLlmConversationTitle">Ask Inventory</h3><p>Fast answers first. Evidence is shown beside every grounded result.</p></div>
            <button class="btn btn-ghost" type="button" data-llm-clear>Clear</button>
          </header>
          <div class="fi-llm-prompts" aria-label="Suggested questions">
            <button type="button" data-llm-prompt="What is low?">What is low?</button>
            <button type="button" data-llm-prompt="What is loaded now?">What is loaded?</button>
            <button type="button" data-llm-prompt="Find my black PLA">Find black PLA</button>
            <button type="button" data-llm-prompt="What should I buy soon?">Buy soon</button>
          </div>
          <div class="fi-llm-transcript" id="fiLlmTranscript" role="log" aria-live="polite" aria-relevant="additions text"></div>
          <form class="fi-llm-composer" id="fiLlmForm">
            <label class="sr-only" for="fiLlmInput">Ask the inventory assistant</label>
            <textarea id="fiLlmInput" rows="2" maxlength="500" placeholder="Ask about a spool, material, color, location, remaining amount, or AMS…" aria-describedby="fiLlmComposerHint"></textarea>
            <button class="btn btn-primary" type="submit" data-llm-send>Ask</button>
            <small id="fiLlmComposerHint">Enter sends · Shift+Enter adds a line</small>
          </form>
        </section>
        <aside class="fi-llm-side">
          <section class="panel fi-llm-evidence" aria-labelledby="fiLlmEvidenceTitle">
            <header class="fi-llm-section-head compact"><div><span class="eyebrow">Grounding</span><h3 id="fiLlmEvidenceTitle">Evidence</h3></div><span class="fi-llm-count" data-llm-evidence-count>0</span></header>
            <div class="fi-llm-evidence-body" id="fiLlmEvidence"><p class="muted">Ask a question to see exactly which inventory records support the answer.</p></div>
          </section>
          <section class="panel fi-llm-run" aria-labelledby="fiLlmRunTitle">
            <header class="fi-llm-section-head compact"><div><span class="eyebrow">Run details</span><h3 id="fiLlmRunTitle">Trace</h3></div></header>
            <dl class="fi-llm-trace">
              <div><dt>Mode</dt><dd data-llm-trace-mode>Local grounded</dd></div>
              <div><dt>Intent</dt><dd data-llm-trace-intent>—</dd></div>
              <div><dt>Confidence</dt><dd data-llm-trace-confidence>—</dd></div>
              <div><dt>Inventory</dt><dd data-llm-trace-count>—</dd></div>
              <div><dt>Latency</dt><dd data-llm-trace-latency>—</dd></div>
            </dl>
          </section>
          <details class="panel fi-llm-lab" id="fiLlmLab">
            <summary><span><span class="eyebrow">Developer</span><strong>LLM Lab</strong><small>Run grounding and hallucination checks against the current profile.</small></span><span aria-hidden="true">＋</span></summary>
            <div class="fi-llm-lab-body">
              <div class="fi-llm-lab-actions"><button class="btn" type="button" data-llm-run-suite>Run acceptance suite</button><strong data-llm-suite-score>Not run</strong></div>
              <div id="fiLlmSuiteResults" class="fi-llm-suite-results" aria-live="polite"></div>
              <p class="muted fi-llm-transport-note" data-llm-transport-note>Model transport is not connected. The UI is using the deterministic grounded engine.</p>
            </div>
          </details>
        </aside>
      </div>`;
    main.appendChild(section);
    return section;
  }

  function setSurface(active){
    const surface=ensureSurface();
    if(!surface) return;
    document.querySelectorAll('.view[id$="View"]').forEach(view=>{
      const isActive=active&&view===surface;
      view.classList.toggle('active',isActive);
      view.hidden=!isActive;
      view.setAttribute('aria-hidden',isActive?'false':'true');
      if(isActive)view.removeAttribute('inert');else view.setAttribute('inert','');
    });
    if(active){
      document.documentElement.dataset.currentView='assistant';
      document.querySelectorAll('[data-shell-view],[data-bottom-view]').forEach(node=>node.setAttribute('aria-current','false'));
      document.querySelectorAll('[data-shell-action="assistant"],[data-llm-open]').forEach(node=>node.setAttribute('aria-current','page'));
      renderConversation();
      transportApi()?.refresh?.();
      syncMode();
      requestAnimationFrame(()=>$('fiLlmTitle')?.focus({preventScroll:true}));
      window.scrollTo({top:0,behavior:'auto'});
    }
  }

  function open(){setSurface(true);}

  function syncMode(){
    const transport=transportApi();
    const view=transport?.presentation?.();
    if(view){
      document.querySelectorAll('[data-llm-mode]').forEach(node=>node.textContent=view.mode);
      document.querySelectorAll('[data-llm-owner]').forEach(node=>node.textContent=view.detail);
      document.querySelectorAll('.fi-llm-mode').forEach(node=>node.dataset.modeState=view.phase||'local');
      const note=document.querySelector('[data-llm-transport-note]');
      if(note)note.textContent=view.note;
      return;
    }
    const has=Boolean(api()?.hasTransport?.());
    document.querySelectorAll('[data-llm-mode]').forEach(node=>node.textContent=has?'Cloud ready':'Grounded local');
    document.querySelectorAll('[data-llm-owner]').forEach(node=>node.textContent=`${owner()} inventory`);
    const note=document.querySelector('[data-llm-transport-note]');
    if(note)note.textContent=has
      ? 'A model transport is available, but no validated model response has completed for this profile yet.'
      : 'Model transport is not connected. The UI is using the deterministic grounded engine.';
  }

  function renderConversation(){
    const root=$('fiLlmTranscript');
    if(!root)return;
    if(!conversation.length){
      root.innerHTML=`<div class="fi-llm-empty"><span aria-hidden="true">✦</span><h4>Inventory answers without guesswork</h4><p>Try “What is low?”, “Where is my blue PETG?”, or “How much black PLA is left?”</p><small>${esc(owner())} is the active private inventory.</small></div>`;
      return;
    }
    root.innerHTML=conversation.map(item=>item.role==='user'
      ? `<article class="fi-llm-message is-user"><span class="fi-llm-message-role">You</span><p>${esc(item.text).replace(/\n/g,'<br>')}</p></article>`
      : `<article class="fi-llm-message is-assistant"><span class="fi-llm-message-role">Assistant · ${esc(item.modeLabel||'Grounded')}</span><p>${esc(item.text).replace(/\n/g,'<br>')}</p>${item.evidenceCount?`<button type="button" class="fi-llm-evidence-link" data-llm-show-evidence>View ${item.evidenceCount} evidence record${item.evidenceCount===1?'':'s'}</button>`:''}</article>`).join('');
    root.scrollTop=root.scrollHeight;
  }

  function renderEvidence(result){
    const root=$('fiLlmEvidence');
    const count=document.querySelector('[data-llm-evidence-count]');
    if(!root||!count)return;
    const evidence=Array.isArray(result?.evidence)?result.evidence:[];
    count.textContent=String(evidence.length);
    if(!evidence.length){
      root.innerHTML=`<div class="fi-llm-evidence-empty"><strong>No record citation needed</strong><p>${result?.intent==='not-found'?'The answer is grounded in the absence of a matching current record.':'This response used aggregate inventory facts or guidance.'}</p></div>`;
      return;
    }
    root.innerHTML=evidence.map(row=>`<article class="fi-llm-evidence-row"><div class="fi-llm-evidence-id">${esc(row.id)}</div><div><strong>${esc(row.title)}</strong><p>${esc(row.detail)}</p><small>${esc(row.reason)}</small></div></article>`).join('');
  }

  function renderTrace(result,elapsedMs){
    const snapshot=result?.snapshot;
    const set=(selector,value)=>{const node=document.querySelector(selector);if(node)node.textContent=value;};
    set('[data-llm-trace-mode]',result?.mode==='model-grounded'?'Model grounded':'Local grounded');
    set('[data-llm-trace-intent]',result?.intent||'—');
    set('[data-llm-trace-confidence]',result?.confidence||'—');
    set('[data-llm-trace-count]',snapshot?`${snapshot.activeSpoolCount} active · ${snapshot.profile}`:'—');
    set('[data-llm-trace-latency]',Number.isFinite(elapsedMs)?`${Math.max(1,Math.round(elapsedMs))} ms`:'—');
  }

  async function ask(question){
    const core=api();
    const q=String(question||'').trim();
    if(!core||!q||running)return;
    running=true;
    const send=document.querySelector('[data-llm-send]');
    const input=$('fiLlmInput');
    if(send){send.disabled=true;send.textContent='Thinking…';}
    if(input)input.disabled=true;
    conversation.push({role:'user',text:q,at:new Date().toISOString()});
    renderConversation();
    const started=performance.now();
    try{
      const result=await core.ask(q);
      const elapsed=performance.now()-started;
      conversation.push({role:'assistant',text:result.answer,at:new Date().toISOString(),modeLabel:result.mode==='model-grounded'?'Model grounded':'Local grounded',evidenceCount:result.evidence?.length||0});
      conversation=conversation.slice(-HISTORY_LIMIT);
      saveConversation();
      renderConversation();
      renderEvidence(result);
      renderTrace(result,elapsed);
      syncMode();
      if(result.transportRejected)showTransient('Model response rejected because its evidence was invalid; local grounded answer used.');
      else if(result.transportError)showTransient('Model transport failed; local grounded answer used.');
    }catch(error){
      conversation.push({role:'assistant',text:`The assistant could not complete that request: ${error instanceof Error?error.message:String(error)}`,at:new Date().toISOString(),modeLabel:'Error',evidenceCount:0});
      renderConversation();
      syncMode();
    }finally{
      running=false;
      if(send){send.disabled=false;send.textContent='Ask';}
      if(input){input.disabled=false;input.value='';input.focus();}
    }
  }

  function showTransient(message){
    const node=document.querySelector('[data-llm-transport-note]');
    if(!node)return;
    const original=node.textContent;
    node.textContent=message;
    setTimeout(()=>{if(node.textContent===message)syncMode();},5000);
  }

  function runSuite(){
    const core=api();
    if(!core)return;
    const suite=core.runAcceptanceSuite(core.readState());
    const score=document.querySelector('[data-llm-suite-score]');
    const results=$('fiLlmSuiteResults');
    if(score)score.textContent=`${suite.passed}/${suite.total} passed`;
    if(results)results.innerHTML=suite.tests.map(test=>`<div class="fi-llm-suite-row ${test.pass?'is-pass':'is-fail'}"><span aria-hidden="true">${test.pass?'✓':'×'}</span><div><strong>${esc(test.id.replace(/-/g,' '))}</strong><small>${esc(test.detail)}</small></div></div>`).join('');
  }

  function clearConversation(){
    conversation=[];
    try{sessionStorage.removeItem(historyKey());}catch{}
    renderConversation();
    renderEvidence({evidence:[],intent:'empty'});
    renderTrace({},NaN);
  }

  function bind(){
    document.addEventListener('click',event=>{
      const opener=event.target.closest('[data-shell-action="assistant"],[data-llm-open]');
      if(opener){event.preventDefault();opener.closest('dialog')?.close();open();return;}
      const prompt=event.target.closest('[data-llm-prompt]');
      if(prompt){ask(prompt.dataset.llmPrompt);return;}
      if(event.target.closest('[data-llm-clear]')){clearConversation();return;}
      if(event.target.closest('[data-llm-run-suite]')){runSuite();return;}
      if(event.target.closest('[data-llm-show-evidence]')){$('fiLlmEvidenceTitle')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
    });
    document.addEventListener('submit',event=>{
      if(event.target.id!=='fiLlmForm')return;
      event.preventDefault();
      ask($('fiLlmInput')?.value);
    });
    document.addEventListener('keydown',event=>{
      if(event.target.id==='fiLlmInput'&&event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.target.form?.requestSubmit();}
    });
    document.addEventListener('fi:navigation',event=>{
      if(event.detail?.view!=='assistant')document.querySelectorAll('[data-shell-action="assistant"]').forEach(node=>node.setAttribute('aria-current','false'));
    });
    document.addEventListener('fi:llm-transport',syncMode);
    document.addEventListener('fi:profile-updated',()=>{loadConversation();syncMode();renderConversation();});
    window.addEventListener('storage',event=>{
      if(event.key==='filament-current-user-v1'){loadConversation();syncMode();renderConversation();}
    });
  }

  function init(){
    if(initialized)return;
    if(!api()){setTimeout(init,25);return;}
    initialized=true;
    ensureSurface();
    loadConversation();
    bind();
    syncMode();
    renderConversation();
    globalThis.FilamentInventoryAssistantUI=Object.freeze({open,ask,runSuite,clear:clearConversation,syncMode});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});
  else setTimeout(init,0);
})();
