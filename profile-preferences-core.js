(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.FilamentInventoryProfilePreferences=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=2;
  const THEMES=Object.freeze(['system','dark','light']);
  const DENSITIES=Object.freeze(['comfortable','compact']);
  const ACCENTS=Object.freeze(['violet','teal','blue','green','orange']);
  const START_VIEWS=Object.freeze(['dashboard','inventory','household']);
  const DASHBOARD_DETAILS=Object.freeze(['focused','balanced']);
  const ACCENT_VALUES=Object.freeze({
    violet:Object.freeze({dark:['#9b87f5','#6c56e0'],light:['#6c56e0','#5942c5']}),
    teal:Object.freeze({dark:['#49d3c4','#168f84'],light:['#168f84','#0f766e']}),
    blue:Object.freeze({dark:['#78aaf8','#4f7ee8'],light:['#3868c9','#2f55ad']}),
    green:Object.freeze({dark:['#78d9a2','#35a76c'],light:['#237d4b','#19653b']}),
    orange:Object.freeze({dark:['#f5c95e','#d99527'],light:['#a66d00','#8a5a00']}),
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

  function normalizeLegacyAccent(value,owner){
    const aliases={cyan:'teal',amber:'orange',rose:'violet'};
    const next=aliases[String(value)]||String(value);
    return oneOf(next,ACCENTS,owner==='Aimee'?'violet':'teal');
  }

  function defaults(owner='Bill'){
    const displayName=text(owner)||'Bill';
    return {
      version:VERSION,
      identity:{displayName,initials:initials(displayName)},
      appearance:{theme:'system',accent:owner==='Aimee'?'violet':'teal',density:'comfortable'},
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
      identity:{displayName,initials:text(source.identity?.initials,3).toUpperCase()||initials(displayName)},
      appearance:{
        theme:oneOf(source.appearance?.theme,THEMES,base.appearance.theme),
        accent:normalizeLegacyAccent(source.appearance?.accent,owner),
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
    return normalize({
      ...existing,
      ...(patch||{}),
      identity:{...existing.identity,...(patch?.identity||{})},
      appearance:{...existing.appearance,...(patch?.appearance||{})},
      workspace:{...existing.workspace,...(patch?.workspace||{})},
      printing:{...existing.printing,...(patch?.printing||{})},
    },owner);
  }

  function effectiveTheme(theme,systemLight=false){
    if(theme==='light') return 'light';
    if(theme==='dark') return 'dark';
    return systemLight?'light':'dark';
  }

  function accentPair(accent,theme='dark'){
    const entry=ACCENT_VALUES[oneOf(accent,ACCENTS,'violet')]||ACCENT_VALUES.violet;
    return entry[theme==='light'?'light':'dark'];
  }

  return Object.freeze({VERSION,THEMES,DENSITIES,ACCENTS,START_VIEWS,DASHBOARD_DETAILS,ACCENT_VALUES,defaults,normalize,merge,initials,effectiveTheme,accentPair});
});
