(()=>{
  const $=id=>document.getElementById(id);
  const set=(id,v)=>{const e=$(id);if(e&&v!==undefined&&v!==null)e.textContent=v};
  const fmt=u=>u<60?`${u}s`:u<3600?`${Math.floor(u/60)}m`:`${Math.floor(u/3600)}h ${Math.floor((u%3600)/60)}m`;
  const fToF=c=>Math.round((Number(c)||0)*9/5+32);
  const airNames=['Off','Manual','Auto','Post-print'];
  const toast=(m,bad=false)=>{const t=$('consoleToast');if(!t)return;t.textContent=m;t.dataset.bad=bad?'1':'0';t.style.borderColor=bad?'#6a3840':'#31515d';t.style.color=bad?'#ffadb4':'#dcecf1';t.style.opacity='1';t.style.transform='translateY(0)';clearTimeout(window.__whToast);window.__whToast=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(8px)'},4200)};

  function updateStatusDot(cardId,on,warn=false){const card=$(cardId)?.closest('.command-card');const dot=card?.querySelector('.command-status');if(!dot)return;dot.classList.toggle('off',!on);dot.classList.toggle('warn',!!warn);}

  function applyStatus(d){
    set('liveFirmware',d.firmware);
    set('liveSsid',d.network?.connected?d.network.ssid:'Offline');
    set('liveIp',`${d.network?.ip||'Offline'} • ${d.network?.rssi??0} dBm`);
    set('liveUptime',fmt(d.system?.uptimeSec||0));
    set('liveAlerts',d.alerts??0);
    set('liveBoot',d.system?.stableBoot?'Stable':'Validating');
    set('liveSlot',`${d.ota?.runningPartition||'?'} → ${d.ota?.nextPartition||'?'}`);
    const otaPct=d.ota?.total?Math.min(100,Math.round((d.ota.bytes||0)*100/d.ota.total)):0;
    set('liveOta',d.ota?.inProgress?`${d.ota.status||'Updating'} • ${otaPct}%`:(d.updater?.error||d.updater?.status||'Idle'));
    set('liveWeather',d.weather?.online?`${fToF(d.weather.temperatureC)}°F • ${d.weather.condition}`:(d.weather?.condition||'Unavailable'));

    const online=$('liveOnline');if(online){online.textContent=d.network?.connected?'ONLINE':'OFFLINE';online.className=`pill ${d.network?.connected?'good':'bad'}`}
    const dot=$('liveDot');if(dot)dot.style.opacity=d.network?.connected?'1':'.35';

    if(d.weather?.online){set('nowWeather',`${fToF(d.weather.temperatureC)}°F`);const el=$('nowWeather')?.nextElementSibling;if(el)el.textContent=`${d.weather.condition} • H ${fToF(d.weather.highC)}° / L ${fToF(d.weather.lowC)}° • rain ${d.weather.precipitationPercent||0}%`;updateStatusDot('nowWeather',true,!!d.weather.severeAlert)}else{set('nowWeather','Unavailable');updateStatusDot('nowWeather',false)}

    if(d.printer?.online){set('nowPrinter',d.printer.progress>0?`${d.printer.progress}%`:(d.printer.status||'Ready'));const el=$('nowPrinter')?.nextElementSibling;if(el)el.textContent=d.printer.progress>0?`${d.printer.job||'Print'} • ${d.printer.remainingMinutes||0} min left`:`${d.printer.name||'Bambu Lab'}${d.printer.model?` • ${d.printer.model}`:''}`;updateStatusDot('nowPrinter',true,!!d.printer.errorCode)}else{set('nowPrinter',d.printer?.configured?'Offline':'Not set up');updateStatusDot('nowPrinter',false)}

    const env=d.workshop?.environment;
    if(env?.online&&!env.stale){set('nowWorkshop',`${Math.round(env.humidity||0)}% RH`);const el=$('nowWorkshop')?.nextElementSibling;if(el)el.textContent=`PM2.5 ${Number(env.pm25||0).toFixed(1)} • VOC ${Math.round(env.voc||0)}`;updateStatusDot('nowWorkshop',true)}else{set('nowWorkshop','No sensor');const el=$('nowWorkshop')?.nextElementSibling;if(el)el.textContent=`Air mode: ${airNames[d.workshop?.airMode||0]}`;updateStatusDot('nowWorkshop',false)}
  }

  let syncing=false;
  async function sync(){if(syncing)return;syncing=true;try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`status ${r.status}`);applyStatus(await r.json())}catch(e){const on=$('liveOnline');if(on){on.textContent='STALE';on.className='pill warn'}}finally{syncing=false}}

  function bindAudio(){const slider=$('audioVolume'),label=$('audioVolumeValue');if(slider&&label){const paint=()=>label.textContent=`${slider.value}%`;slider.addEventListener('input',paint);paint()}document.querySelectorAll('[data-audio-volume]').forEach(b=>b.addEventListener('click',()=>{if(!slider)return;slider.value=b.dataset.audioVolume;slider.dispatchEvent(new Event('input',{bubbles:true}))}))}

  function bindConfirm(){document.querySelectorAll('[data-confirm]').forEach(el=>el.addEventListener('click',e=>{if(!confirm(el.dataset.confirm||'Continue?'))e.preventDefault()}))}

  function bindNav(){const links=[...document.querySelectorAll('.nav a[href^="#"]')];const map=new Map(links.map(a=>[a.getAttribute('href').slice(1),a]));const obs=new IntersectionObserver(entries=>{const hit=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!hit)return;links.forEach(a=>a.classList.remove('active'));map.get(hit.target.id)?.classList.add('active')},{rootMargin:'-15% 0px -70% 0px',threshold:[0,.2,.5]});map.forEach((_,id)=>{const el=$(id);if(el)obs.observe(el)})}

  function bindAsyncActions(){document.querySelectorAll("form[data-async='1']").forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const btn=form.querySelector('button');if(btn)btn.disabled=true;try{const r=await fetch(form.action,{method:(form.method||'POST').toUpperCase(),body:new FormData(form)});const text=await r.text();toast(text,!r.ok);await sync()}catch(err){toast('Request failed',true)}finally{if(btn)btn.disabled=false}}))}

  bindAudio();bindConfirm();bindNav();bindAsyncActions();sync();setInterval(sync,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
})();