(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.FilamentInventoryProfilePreferences=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=1;
  const THEMES=Object.freeze(['system','dark','light']);
  const DENSITIES=Object.freeze(['comfortable','compact']);
  const ACCENTS=Object.freeze(['cyan','blue','violet','green','orange']);
  const START_VIEWS=Object.freeze(['dashboard','inventory','household']);
  const DASHBOARD_DETAILS=Object.freeze(['focused','balanced']);
  const ACCENT_VALUES=Object.freeze({
    cyan:['#22d3ee','#38bdf8'],
    blue:['#60a5fa','#818cf8'],
    violet:['#a78bfa','#c084fc'],
    green:['#4ade80','#2dd4bf'],
    orange:['#fb923c','#f59e0b'],
  });

  const text=(value,max=48)=>String(value??'').trim().slice(0,max);
  const oneOf=(value,allowed,fallback)=>allowed.includes(String(value))?String(value):fallback;
  const number=(value,min,max,fallback)=>{
    const parsed=Number(value);
    return Number.isFinite(parsed)?Math.min(max,Math.max(min,parsed)):fallback;
  };

  function initials(name,fallback='FI'){
    const parts=text(name,60).split(/\s+/).filter(Boolean);
    if(!parts.length) return fallback;
    return (parts.length===1?parts[0].slice(0,2):`${parts[0][0]}${parts.at(-1)[0]}`).toUpperCase();
  }

  function defaults(owner='Bill'){
    const displayName=text(owner)||'Bill';
    return {
      version:VERSION,
      identity:{displayName, initials:initials(displayName)},
      appearance:{theme:'system',accent:owner==='Aimee'?'violet':'cyan',density:'comfortable'},
      workspace:{startView:'dashboard',dashboardDetail:'focused'},
      printing:{safetyMargin:10,defaultReorderGrams:250,defaultStartWeight:1000},
    };
  }

  function normalize(input,owner='Bill'){
    const base=defaults(owner);
    const source=input&&typeof input==='object'?input:{};
    const displayName=text(source.identity?.displayName)||base.identity.displayName;
    return {
      version:VERSION,
      identity:{
        displayName,
        initials:text(source.identity?.initials,3).toUpperCase()||initials(displayName),
      },
      appearance:{
        theme:oneOf(source.appearance?.theme,THEMES,base.appearance.theme),
        accent:oneOf(source.appearance?.accent,ACCENTS,base.appearance.accent),
        density:oneOf(source.appearance?.density,DENSITIES,base.appearance.density),
      },
      workspace:{
        startView:oneOf(source.workspace?.startView,START_VIEWS,base.workspace.startView),
        dashboardDetail:oneOf(source.workspace?.dashboardDetail,DASHBOARD_DETAILS,base.workspace.dashboardDetail),
      },
      printing:{
        safetyMargin:number(source.printing?.safetyMargin,0,100,base.printing.safetyMargin),
        defaultReorderGrams:number(source.printing?.defaultReorderGrams,0,5000,base.printing.defaultReorderGrams),
        defaultStartWeight:number(source.printing?.defaultStartWeight,1,10000,base.printing.defaultStartWeight),
      },
    };
  }

  function merge(current,patch,owner='Bill'){
    const existing=normalize(current,owner);
    const next={
      ...existing,
      ...(patch||{}),
      identity:{...existing.identity,...(patch?.identity||{})},
      appearance:{...existing.appearance,...(patch?.appearance||{})},
      workspace:{...existing.workspace,...(patch?.workspace||{})},
      printing:{...existing.printing,...(patch?.printing||{})},
    };
    return normalize(next,owner);
  }

  return Object.freeze({VERSION,THEMES,DENSITIES,ACCENTS,START_VIEWS,DASHBOARD_DETAILS,ACCENT_VALUES,defaults,normalize,merge,initials});
});
