/* Separate per-user namespace and RPC; never touches optics marks or choices. */
(function(){'use strict';
 let records={},loaded=false,key='',timer,running=false,error='',status='本机已保存';
 const model=()=>window.OpticsSyncModel;
 function save(){try{localStorage.setItem(key,JSON.stringify(records));error='';return true;}catch(e){error='本机存储失败，请导出英语记录';return false;}}
 function init(){if(loaded)return;loaded=true;key=window.OpticsCloud?OpticsCloud.localKey('gopt.exams.english.v1'):'gopt.exams.english.v1';try{const raw=localStorage.getItem(key);records=raw?JSON.parse(raw):{};if(!records||typeof records!=='object'||Array.isArray(records))throw Error();}catch(e){error='英语记录读取失败，保留原文件，请先导出';records={};}if(!error)sync();}
 function get(id,fallback=null){init();const r=records[id];if(!r)return fallback;try{return JSON.parse(model().visible(r));}catch(e){return fallback;}}
 function set(id,value){init();if(error&&/读取失败/.test(error))return false;model().edit(records,id,JSON.stringify(value),crypto.randomUUID());const ok=save();if(ok){status='本机已保存 · 待同步';clearTimeout(timer);timer=setTimeout(sync,1000);}notify();return ok;}
 function list(prefix){init();return Object.keys(records).filter(k=>k.startsWith(prefix)).map(k=>({key:k,value:get(k)}));}
 function notify(){window.dispatchEvent(new Event('english:sync-status'));}
 async function sync(){
  if(running||!loaded||error&&/读取失败/.test(error))return;
  const client=window.OpticsAuth?.client;if(!client||!navigator.onLine){status='本机已保存 · 离线';notify();return;}
  running=true;status='英语同步中';notify();
  try{
   const changes=Object.values(records).filter(r=>r.pending&&!r.conflict).map(r=>r.pending).slice(0,250),sent=Object.fromEntries(changes.map(c=>[c.key,c]));
   const {data,error:e}=await client.rpc('english_sync',{changes});if(e)throw e;
   if(!data||!Array.isArray(data.rows)||!Array.isArray(data.acknowledged)||!Array.isArray(data.conflicts))throw Error('同步响应无效');
   model().reconcile(records,data,sent);if(!save())return;
   const conflicts=Object.values(records).filter(r=>r.conflict),pending=Object.values(records).filter(r=>r.pending);
   status=conflicts.length?'英语记录有 '+conflicts.length+' 处冲突':pending.length?'英语待同步 '+pending.length:'英语已同步';
   if(pending.some(r=>!r.conflict))timer=setTimeout(sync,1200);
   window.dispatchEvent(new Event('english:progress'));
  }catch(e){status='英语记录保存在本机 · 云端未连接';}finally{running=false;notify();}
 }
 function resolve(id,local){const r=records[id];if(!r?.conflict)return;if(local){r.revision=r.conflict.revision;r.value=r.conflict.value;model().edit(records,id,r.pending.value,crypto.randomUUID());}else{records[id]={value:r.conflict.value,revision:r.conflict.revision,pending:null,conflict:null};}save();sync();window.dispatchEvent(new Event('english:progress'));}
 function exportData(){init();const blob=new Blob([JSON.stringify({namespace:key,records},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='english-records-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 window.addEventListener('online',sync);window.addEventListener('focus',()=>{if(loaded)sync();});window.addEventListener('storage',e=>{if(loaded&&e.key===key){try{const other=JSON.parse(e.newValue||'{}');Object.entries(other).forEach(([k,r])=>{if(!records[k]?.pending)records[k]=r;});window.dispatchEvent(new Event('english:progress'));}catch(e){}}});
 window.EnglishStore={init,get,set,list,sync,resolve,exportData,summary:()=>({text:error||status,conflicts:Object.entries(records).filter(([,r])=>r.conflict),pending:Object.values(records).filter(r=>r.pending).length})};
})();
