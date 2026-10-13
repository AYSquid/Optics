/* Reuses the already deployed private JSON settings interface. This client only
 * writes its own settings prefix; English answers and optics marks are untouched. */
(function(){'use strict';
 const prefix='settings:study-tools.',model=window.OpticsSyncModel;
 let getState,receive,records={},uid=null,key='',generation=0,applying=false,running=false,firstPull=false,ready=false,problem='',timer,retryDelay=15000;
 const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
 function readValue(row){try{return JSON.parse(model.visible(row));}catch(_){return null;}}
 function persist(){if(!key)return;try{localStorage.setItem(key,JSON.stringify(records));}catch(_){problem='本机缓存无法保存';}}
 function notify(){window.dispatchEvent(new Event('tools:sync'));}
 function snapshot(){const out={};for(const [id,value] of Object.entries(getState()||{}))out[prefix+id]=value;return out;}
 function mergeValue(k,a,b){
  if(!a)return b;if(!b)return a;
  return String(a.at||'')>String(b.at||'')?a:b;
 }
 function publishToView(){
  const local=snapshot(),merged={};new Set([...Object.keys(records),...Object.keys(local)]).forEach(k=>{if(k.startsWith(prefix))merged[k]=mergeValue(k,local[k],records[k]?readValue(records[k]):null);});
  applying=true;try{receive(merged);}finally{applying=false;}
 }
 function capture(){
  if(!uid||uid!==OpticsAuth.user?.id||!getState||applying||firstPull)return;
  const values=snapshot();let changed=false;Object.entries(values).forEach(([k,v])=>{const text=canonical(v);if(text.length>145000){problem='学习记录较多，暂时保留在本机';return;}if(!records[k]||canonical(readValue(records[k]))!==text){model.edit(records,k,text,crypto.randomUUID());changed=true;}});
  if(changed){persist();schedule();}notify();
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(sync,800);}
 async function sync(){
  if(uid!==OpticsAuth.user?.id){accountChanged();return;}if(!uid||!getState||running)return;if(!navigator.onLine){firstPull=false;problem='离线';notify();return;}
  const owner=uid,gen=generation;running=true;notify();
  try{
   try{const stored=JSON.parse(localStorage.getItem(key)||'{}');Object.entries(stored).forEach(([k,r])=>{if(k.startsWith(prefix)&&(!records[k]||r.revision>records[k].revision||r.pending?.op!==records[k].pending?.op))records[k]=r;});}catch(_){}
   const changes=firstPull?[]:Object.values(records).filter(r=>r.pending&&!r.conflict).map(r=>({...r.pending})).slice(0,250),sent=Object.fromEntries(changes.map(c=>[c.key,c]));
   const result=await OpticsAuth.client.rpc('english_sync',{changes});if(result.error)throw result.error;if(gen!==generation||owner!==uid||owner!==OpticsAuth.user?.id)return;
   const data=result.data;if(!data||!Array.isArray(data.rows)||!Array.isArray(data.acknowledged)||!Array.isArray(data.conflicts))throw Error('Invalid response');
   const filtered={rows:data.rows.filter(r=>typeof r.key==='string'&&r.key.startsWith(prefix)),acknowledged:data.acknowledged.filter(r=>r.key?.startsWith(prefix)),conflicts:data.conflicts.filter(k=>k.startsWith(prefix))};
   model.reconcile(records,filtered,sent);
   // A day merges accepted question IDs; a profile uses its latest explicit edit.
   // Conflicts here contain no answer text and do not alter question mastery.
   Object.entries(records).forEach(([k,r])=>{if(r.conflict&&r.pending){const v=mergeValue(k,readValue(r),JSON.parse(r.value));r.pending=null;r.conflict=null;model.edit(records,k,canonical(v),crypto.randomUUID());}});
   firstPull=false;ready=true;problem='';retryDelay=15000;persist();publishToView();capture();
   if(Object.values(records).some(r=>r.pending))schedule();
  }catch(_){if(gen===generation){firstPull=false;problem='云端暂未连接';persist();clearTimeout(timer);timer=setTimeout(sync,retryDelay);retryDelay=Math.min(60000,retryDelay*2);}}
  finally{if(gen===generation){running=false;notify();}}
 }
 function accountChanged(){
  const next=window.OpticsAuth?.user?.id||null;if(next===uid&&key)return;generation++;clearTimeout(timer);uid=next;records={};ready=false;problem='';running=false;firstPull=!!uid;
  key=uid?'gopt.tools.cloud.v1.space.'+uid:'';
  if(key)try{records=JSON.parse(localStorage.getItem(key)||'{}');if(!records||Array.isArray(records))records={};}catch(_){records={};}
  notify();if(uid&&getState)sync();
 }
 function attach(getter,receiver){getState=getter;receive=receiver;accountChanged();OpticsAuth.subscribe(()=>{setTimeout(accountChanged,0);});window.addEventListener('online',()=>{capture();sync();});window.addEventListener('focus',sync);window.addEventListener('storage',e=>{if(e.key===key&&!running)sync();});}
 function summary(){const pending=Object.values(records).filter(r=>r.pending).length;return {enabled:!!uid,ready,running,pending,problem,text:!uid?'登录后，收藏与复测计划会自动同步；离线时先保存在本机。':problem?'云端暂未连接，记录已保存在本机，恢复连接后补传。':firstPull||running?'正在同步收藏与复测计划…':pending?'已保存在本机，等待上传 '+pending+' 条记录。':ready?'收藏与复测计划已同步到个人云端。':'正在连接个人云端…'};}
 window.OpticsToolsCloud={attach,capture,sync,summary,pendingInitialPull:()=>firstPull,isApplying:()=>applying};
})();
