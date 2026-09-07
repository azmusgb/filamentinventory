
/* Smart Home v10.4 Portal UX */
var v104PortalTimer=null;
var v104PrinterHooked=false;
function v104El(id){return document.getElementById(id)}
function v104NavTo(section){if(typeof loadSection==='function')loadSection(section);else location.hash='#'+section}
function v104EnsureTopHealth(){
  var actions=document.querySelector('.topbar-actions');if(!actions||v104El('v104TopHealth'))return;
  document.querySelectorAll('.topbar-actions .status-dot').forEach(function(x){x.classList.add('v104-legacy-status')});
  var wrap=document.createElement('div');wrap.id='v104TopHealth';wrap.className='v104-top-health';
  wrap.innerHTML='<span class="v104-health-pill ok" id="v104DeviceHealth"><i></i><span>Device</span><strong>Online</strong></span><span class="v104-health-pill" id="v104PrinterHealth"><i></i><span>Printer</span><strong>Checking</strong></span>';
  var theme=v104El('themeToggle');actions.insertBefore(wrap,theme||null);
}
function v104RefreshTopHealth(){
  v104EnsureTopHealth();var slot=Number(window.currentSlot||0),p=v104El('v104PrinterHealth'),d=v104El('v104DeviceHealth');if(!p||!d)return;
  fetch('/status?slot='+slot+'&_='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('status');return r.json()}).then(function(s){
    d.className='v104-health-pill ok';d.querySelector('strong').textContent='Online';
    p.querySelector('span').textContent='Printer '+(slot+1);
    var connected=!!s.connected,configured=!!s.configured;
    p.className='v104-health-pill '+(connected?'ok':(configured?'warn':''));
    p.querySelector('strong').textContent=connected?(s.state||'Connected'):(configured?'Offline':'Not set up');
  }).catch(function(){d.className='v104-health-pill warn';d.querySelector('strong').textContent='Check';p.className='v104-health-pill';p.querySelector('strong').textContent='Unavailable'});
}
function v104BuildSlotSwitcher(){
  var root=v104El('v96PrinterWorkspace'),hero=root&&root.querySelector('.v96-printer-hero');if(!root||!hero||v104El('v104SlotSwitcher'))return;
  var old=v104El('printerTabs');if(!old)return;
  var bar=document.createElement('div');bar.id='v104SlotSwitcher';bar.className='v104-slot-switcher';bar.innerHTML='<span class="v104-slot-label">ACTIVE PRINTER</span><div class="v104-slot-buttons"></div><span class="v104-slot-summary" id="v104SlotSummary">Selected slot</span>';
  var dest=bar.querySelector('.v104-slot-buttons');
  old.querySelectorAll('.tab-btn').forEach(function(btn,i){
    if(btn.style&&btn.style.display==='none')return;
    var b=document.createElement('button');b.type='button';b.className='v104-slot-btn';b.dataset.slot=String(i);b.textContent='Printer '+(i+1);b.onclick=function(){if(typeof selectPrinterTab==='function'){selectPrinterTab(i);setTimeout(function(){v104SyncPrinterUX();v104RefreshTopHealth()},300)}};dest.appendChild(b);
  });
  hero.insertAdjacentElement('afterend',bar);
  var oldCard=old.closest('.card');if(oldCard)oldCard.classList.add('v104-backend-slot');
}
function v104BuildSupportPanel(){
  var panel=document.querySelector('.v96-panel[data-panel="advanced"] .v96-panel-stack');if(!panel||v104El('v104SupportCard'))return;
  var note=panel.querySelector('.v96-panel-note');if(note){note.innerHTML='<strong>Support &amp; advanced</strong> keeps troubleshooting and uncommon printer controls out of the everyday workflow.'}
  var card=document.createElement('div');card.id='v104SupportCard';card.className='v104-support-card';
  card.innerHTML='<div class="v104-support-copy"><span class="v96-eyebrow">SUPPORT</span><h3>Printer support tools</h3><p>Verify the selected printer, export a credential-redacted report, or open device diagnostics.</p></div><div class="v104-support-actions"><button type="button" class="btn btn-primary" onclick="if(typeof verifyPrinterSetup===\'function\')verifyPrinterSetup()">Verify connection</button><button type="button" class="btn btn-ghost" onclick="if(typeof exportSupportReport===\'function\')exportSupportReport()">Export support report</button><button type="button" class="btn btn-ghost" onclick="v104NavTo(\'diag\')">Diagnostics</button><button type="button" class="btn btn-ghost" id="v104ErrorsBtn" onclick="v104NavTo(\'errors\')">Printer errors</button><button type="button" class="btn btn-danger" onclick="if(typeof clearPrinter===\'function\')clearPrinter()">Clear selected printer</button></div>';
  if(!v104El('sec-errors'))card.querySelector('#v104ErrorsBtn').style.display='none';
  panel.insertBefore(card,note?note.nextSibling:panel.firstChild);
  var legacy=v104El('v96LegacyPrinter');if(legacy&&!v104El('v104LegacyDetails')){
    var details=document.createElement('details');details.id='v104LegacyDetails';details.className='v104-legacy-details';details.innerHTML='<summary>Legacy / expert printer controls</summary><p>Original BambuHelper controls remain available here for troubleshooting and edge cases.</p>';
    legacy.parentNode.insertBefore(details,legacy);details.appendChild(legacy);
  }
}
function v104TrimConnectionActions(){
  var con=v104El('v96ConnectionCards');if(!con)return;
  var card=con.querySelector('.card');if(card)card.classList.add('v104-connection-card');
  var support=v104El('supportBundleBtn');if(support)support.classList.add('v104-moved-action');
  if(card){card.querySelectorAll('.btn-danger').forEach(function(b){if(/clear printer/i.test(b.textContent||''))b.classList.add('v104-moved-action')})}
}
function v104PolishDisplayPanel(){
  var details=v104El('v97LegacyDisplay');if(details){var s=details.querySelector('summary');if(s)s.textContent='Advanced gauge configuration';var p=details.querySelector('p');if(p)p.textContent='Fine-tune individual gauge slots only when the visual presets above are not enough.'}
}
function v104SyncPrinterUX(){
  var root=v104El('v96PrinterWorkspace');if(!root)return;
  var state=v104El('v96PrinterState'),slot=Number(window.currentSlot||0),connected=state&&state.classList.contains('ok');
  var setup=v104El('printerSetupProgress'),health=v104El('setupHealth');if(setup)setup.classList.toggle('v104-hide-when-ready',!!connected);if(health)health.classList.add('v104-redundant-health');
  document.querySelectorAll('.v104-slot-btn').forEach(function(b){b.classList.toggle('active',Number(b.dataset.slot)===slot)});
  var summary=v104El('v104SlotSummary');if(summary)summary.textContent=(state?state.textContent:'Selected')+' · Printer '+(slot+1);
  var originalTabs=root.querySelectorAll('.v96-tab');originalTabs.forEach(function(b){var t=b.getAttribute('data-tab');if(t==='display')b.textContent='Touchscreen';if(t==='automation')b.textContent='Automations';if(t==='advanced')b.textContent='Support'});
}
function v104EnsurePrinterWorkspace(){
  var sec=v104El('sec-printer');if(!sec)return;
  if(!v104El('v96PrinterWorkspace')&&typeof v96InitPrinterWorkspace==='function'){try{v96InitPrinterWorkspace()}catch(e){console.warn('v10.4 printer workspace init',e)}}
  var root=v104El('v96PrinterWorkspace');if(!root)return;
  root.classList.add('v104-printer-workspace');v104BuildSlotSwitcher();v104BuildSupportPanel();v104TrimConnectionActions();v104PolishDisplayPanel();v104SyncPrinterUX();
  if(!v104PrinterHooked&&typeof v96RefreshPrinterWorkspace==='function'){
    var base=v96RefreshPrinterWorkspace;v96RefreshPrinterWorkspace=function(){var r=base.apply(this,arguments);setTimeout(v104SyncPrinterUX,260);return r};v104PrinterHooked=true;
  }
}
function v104PolishSidebar(){
  var footer=document.querySelector('.sidebar-footer');if(footer&&!footer.dataset.v104){footer.dataset.v104='1';footer.innerHTML='<strong>Workshop OS v10.4</strong><span>ws_lcd_350 · local-first</span><button type="button" onclick="v104NavTo(\'diag\')">System details</button>'}
  var adv=document.querySelector('.nav-item[data-section="advanced"] span:first-child');if(adv)adv.textContent='Advanced & Recovery';
}
function v104InitPortalUX(){
  v104EnsureTopHealth();v104PolishSidebar();v104EnsurePrinterWorkspace();v104RefreshTopHealth();
  if(v104PortalTimer)clearInterval(v104PortalTimer);v104PortalTimer=setInterval(function(){v104RefreshTopHealth();if(v104El('sec-printer')&&!v104El('v96PrinterWorkspace'))v104EnsurePrinterWorkspace()},5000);
  document.querySelectorAll('.nav-item[data-section="printer"]').forEach(function(b){b.addEventListener('click',function(){setTimeout(v104EnsurePrinterWorkspace,60)})});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',v104InitPortalUX);else v104InitPortalUX();
setTimeout(v104InitPortalUX,700);setTimeout(v104EnsurePrinterWorkspace,1800);
