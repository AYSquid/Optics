/* Supabase sync: account-scoped local cache, durable outbox and explicit conflicts. */
(function(){
 'use strict';
 const cfg=window.OPTICS_CLOUD_CONFIG, model=window.OpticsSyncModel;
 let client=null, user=null, attached=false, applying=false, running=false, timer=null;
 let records={}, baseline={}, storageFailed=false, initError='', generation=0;
 const byId=id=>document.getElementById(id);
 const uuid=()=>crypto.randomUUID();
 const validStatuses=['known','unknown','shaky'];
 const localKey=base=>user?base+'.user.'+user.id:base;
 const cacheKey=()=>localKey('gopt.cloud.records.v1');
 const pending=()=>Object.values(records).filter(r=>r.pending).length;
 const conflicts=()=>Object.entries(records).filter(([,r])=>r.conflict&&r.pending);
 const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
 function read(key,fallback){const s=localStorage.getItem(key);return s?JSON.parse(s):fallback;}
 function persist(){
  try{localStorage.setItem(cacheKey(),JSON.stringify(records));storageFailed=false;return true;}
  catch(e){storageFailed=true;message('本地记录缓存无法写入，请先导出备份。为防止丢失，已暂停云端同步。',true);return false;}
 }
 function message(text,error=false){
  if(byId('cloud-message')){byId('cloud-message').textContent=text;byId('cloud-message').dataset.error=String(error);}
  if(byId('cloud-short'))byId('cloud-short').textContent=error?'需处理':user?(pending()?'待同步 '+pending():'已登录'):'本地模式';
 }
 function updatePanel(){
  if(!byId('cloud-dialog'))return;
  byId('cloud-login').hidden=!!user;byId('cloud-account').hidden=!user;
  byId('cloud-email-label').textContent=user?user.email:'';
  byId('cloud-sync-now').disabled=!user||running;
  byId('cloud-guest-import').disabled=!user||running;
  const items=conflicts();byId('cloud-conflicts').hidden=!items.length;
  byId('cloud-conflict-count').textContent=items.length+' 条记录在另一设备上也被修改，请选择保留哪一边。';
  const list=byId('cloud-conflict-list');list.replaceChildren();
  items.forEach(([key,r])=>{const li=document.createElement('li');const names={known:'会做',unknown:'不会做',shaky:'不熟练'};
   li.textContent=key+'：本机 '+(names[r.pending.value]||r.pending.value||'未标记')+' / 云端 '+(names[r.value]||r.value||'未标记');list.append(li);});
 }
 function snapshot(){
  const result={};
  Object.entries(store.state.status).forEach(([k,v])=>{result['status:'+k]=v;});
  ['marks','choices','positions'].forEach((group,i)=>Object.entries(examProgress[group]).forEach(([k,v])=>{result[['mark:','choice:','position:'][i]+k]=v;}));
  return result;
 }
 function valid(key,value){
  if(!/^(status|mark|choice|position):[A-Za-z0-9_.:-]+$/.test(key)||key.length>240)return false;
  const at=key.indexOf(':'),type=key.slice(0,at),id=key.slice(at+1);
  if(type==='status')return DATA.questions.some(q=>(q.statusKey||q.id)===id)&&(value===null||validStatuses.includes(value));
  if(type==='mark')return !!EXAMS.byOccurrence[id]&&EXAMS.byOccurrence[id].playable!==false&&(value===null||validStatuses.includes(value));
  if(type==='choice')return !!DATA.byId[id]&&(value===null||DATA.byId[id].options.some(o=>o.key===value));
  const year=EXAMS.years.find(y=>y.id===id);
  return !!year&&(value===null||year.occurrenceIds.includes(value));
 }
 function capture(){
  if(!attached||applying||storageFailed)return;
  const next=snapshot();
  if(user){
   // Merge changes from other tabs before applying this tab's own edits.
   try{const saved=read(cacheKey(),{});Object.entries(saved).forEach(([k,r])=>{if(!records[k]||r.revision>records[k].revision||r.pending?.op!==records[k].pending?.op)records[k]=r;});}catch(e){storageFailed=true;message('同步缓存读取失败，已保留原数据并暂停同步。',true);return;}
   let changed=false;
   new Set([...Object.keys(baseline),...Object.keys(next)]).forEach(k=>{
    if((baseline[k]??null)!==(next[k]??null)&&valid(k,next[k]??null)){model.edit(records,k,next[k]??null,uuid());changed=true;}
   });
   if(changed){persist();message('已保存到本机，等待同步');updatePanel();schedule();}
  }
  baseline=next;
 }
 function apply(){
  if(!attached||!user)return;
  applying=true;
  try{
   const state={},marks={},choices={},positions={};
   Object.entries(records).forEach(([k,r])=>{
    const v=model.visible(r);if(v===null||!valid(k,v))return;
    const at=k.indexOf(':'),type=k.slice(0,at),id=k.slice(at+1);
    ({status:state,mark:marks,choice:choices,position:positions})[type][id]=v;
   });
   store.state.status=state;examProgress.marks=marks;examProgress.choices=choices;examProgress.positions=positions;
   Object.keys(EXAMS.byOccurrence).forEach(id=>{delete ui.choicePick[id];});Object.assign(ui.choicePick,choices);
   saveState();persistExam();
   const scroll=byId('scroller').scrollTop, currentId=currentQuestion()?.id;
   buildMatchIds();
   ui.keepCurrent=!!currentId&&!ui.matchIds.includes(currentId);
   if(ui.keepCurrent)ui.matchIds.splice(Math.min(ui.index,ui.matchIds.length),0,currentId);
   ui.index=currentId?Math.max(0,ui.matchIds.indexOf(currentId)):0;
   if(!currentId){ui.answerOpen=false;ui.analysisOpen=false;}
   render();byId('scroller').scrollTop=scroll;
   baseline=snapshot();
  }finally{applying=false;}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(sync,900);}
 async function sync(){
  if(!user||!attached||running||storageFailed)return;
  if(!navigator.onLine){message('离线：记录已保存在本机，联网后自动补传。');return;}
  if(navigator.locks)return navigator.locks.request('optics-sync-'+user.id,{ifAvailable:true},lock=>lock?performSync():undefined);
  return performSync();
 }
 async function performSync(){
  if(running||!user)return;
  running=true;const gen=generation;updatePanel();message('正在同步…');
  try{
   // Refresh the durable outbox before taking an immutable request snapshot.
   records=read(cacheKey(),records);
   const changes=Object.values(records).filter(r=>r.pending&&!r.conflict).map(r=>({...r.pending}));
   const sent=Object.fromEntries(changes.map(c=>[c.key,c]));
   const {data,error}=await client.rpc('optics_sync',{changes});
   if(error)throw error;
   if(gen!==generation)return;
   if(!data||!Array.isArray(data.rows)||!Array.isArray(data.acknowledged)||!Array.isArray(data.conflicts))throw Error('云端返回格式异常');
   records=read(cacheKey(),records); // preserve edits made while request was in flight
   model.reconcile(records,data,sent);
   if(!persist())return;
   apply();
   message(conflicts().length?'发现同步冲突，请在下方选择保留的记录。':pending()?'仍有本机改动，继续同步…':'已同步 · '+new Date().toLocaleTimeString('zh-CN'));
   if(pending()&&!conflicts().length)schedule();
   return true;
  }catch(e){message(friendly(e),true);}
  finally{running=false;updatePanel();}
 }
 function friendly(e){
  const m=String(e?.message||e);
  if(/optics_sync|PGRST202|schema cache/i.test(m)||e?.code==='PGRST202')return '云端数据库尚未初始化。请先在 Supabase SQL Editor 执行 setup.sql，然后点“立即同步”。本地记录已保留。';
  if(/Email address not authorized|email_address_not_authorized|sending emails/i.test(m))return 'Supabase 默认发信服务仅支持项目团队邮箱。请使用注册 Supabase 的邮箱，或为项目配置自定义 SMTP。';
  if(/rate limit|too many|security purposes/i.test(m))return '请求过于频繁，请稍后再试（邮件通常至少间隔 60 秒）。';
  if(/fetch|network|timeout|abort/i.test(m))return '连接云端失败；记录仍在本机。检查网络后点“立即同步”。';
  return '操作未完成：'+m;
 }
 function download(){
  const data={format:'optics-progress/v1',exportedAt:new Date().toISOString(),records:user&&!storageFailed?Object.entries(records).map(([key,r])=>({key,value:model.visible(r)})):Object.entries(snapshot()).map(([key,value])=>({key,value}))};
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.href=url;a.download='光学做题记录-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function importEntries(entries){
  if(user&&!(await sync()))throw Error('请先连接云端并完成同步，再合并记录，避免覆盖其他设备的进度。');
  if(!Array.isArray(entries)||entries.length>5000)throw Error('备份格式不正确或记录过多');
  const clean=[];let skipped=0;
  entries.forEach(x=>{if(!x||typeof x.key!=='string'||!valid(x.key,x.value)){skipped++;return;}clean.push(x);});
  if(!clean.length)throw Error('备份中没有可识别的本题库记录');
  const existing=snapshot();let count=0;
  clean.forEach(({key,value})=>{
   if(user){if(own(records,key)){skipped++;return;}model.edit(records,key,value,uuid());}
   else{
    if(own(existing,key)){skipped++;return;}
    const at=key.indexOf(':'),type=key.slice(0,at),id=key.slice(at+1);
    const target={status:store.state.status,mark:examProgress.marks,choice:examProgress.choices,position:examProgress.positions}[type];
    if(value!==null)target[id]=value;
   }count++;
  });
  if(user){persist();apply();schedule();}else{saveState();persistExam();Object.assign(ui.choicePick,examProgress.choices);render();baseline=snapshot();}
  updatePanel();message('已合并 '+count+' 条，跳过已有或不适用的 '+skipped+' 条；原有标记未覆盖。');
 }
 async function importGuest(){
  try{
   const s=read('gopt.state.v1',{status:{}}),e=read('gopt.exams.v1',{}),entries=[];
   Object.entries(s.status||{}).forEach(([k,v])=>entries.push({key:'status:'+k,value:v}));
   ['marks','choices','positions'].forEach((g,i)=>Object.entries(e[g]||{}).forEach(([k,v])=>entries.push({key:['mark:','choice:','position:'][i]+k,value:v})));
   await importEntries(entries);
  }catch(e){message(friendly(e),true);}
 }
 function resolveConflicts(useLocal){
  if(running)return;
  conflicts().forEach(([key,r])=>{if(useLocal)model.edit(records,key,r.pending.value,uuid());else{r.pending=null;r.conflict=null;}});
  persist();apply();updatePanel();sync();
 }
 function bindUI(){
  byId('cloud-open').onclick=()=>{updatePanel();byId('cloud-dialog').showModal();};
  byId('cloud-close').onclick=()=>byId('cloud-dialog').close();
  byId('cloud-export').onclick=download;
  byId('cloud-import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2e6)throw Error('备份超过 2 MB');const data=JSON.parse(await file.text());if(data.format!=='optics-progress/v1')throw Error('不是光学做题记录备份');await importEntries(data.records);}catch(err){message(friendly(err),true);}finally{e.target.value='';}};
  byId('cloud-guest-import').onclick=importGuest;
  byId('cloud-sync-now').onclick=sync;
  byId('cloud-use-local').onclick=()=>resolveConflicts(true);
  byId('cloud-use-remote').onclick=()=>resolveConflicts(false);
  byId('cloud-login').onsubmit=async e=>{
   e.preventDefault();if(!client){message(initError||'登录服务未就绪，请刷新重试。',true);return;}
   const btn=byId('cloud-send');btn.disabled=true;
   try{
    const email=byId('cloud-email').value.trim();
    const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
    if(error)throw error;
    message('登录邮件已发送。请把邮件验证码输入下方，登录当前设备；或在当前设备打开邮件链接。手机打开链接不会让电脑自动登录。');
   }catch(err){message(friendly(err),true);}finally{setTimeout(()=>{btn.disabled=false;},60000);}
  };
  byId('cloud-verify').onclick=async()=>{
   if(!client)return;
   const btn=byId('cloud-verify');btn.disabled=true;
   try{const {error}=await client.auth.verifyOtp({email:byId('cloud-email').value.trim(),token:byId('cloud-otp').value.trim(),type:'email'});if(error)throw error;}
   catch(e){message(friendly(e),true);}finally{btn.disabled=false;}
  };
  byId('cloud-signout').onclick=async()=>{
   if(pending()||running){message('请先完成同步或处理冲突，再退出账号。可先导出备份。',true);return;}
   const {error}=await client.auth.signOut({scope:'local'});if(error)message(friendly(error),true);
  };
 }
 function attach(){
  attached=true;bindUI();
  try{records=read(cacheKey(),{});if(!records||Array.isArray(records)||typeof records!=='object')throw Error('缓存格式异常');}
  catch(e){storageFailed=true;message('同步缓存无法读取，已停止同步以保留原始数据。请导出备份后联系维护者。',true);}
  baseline=snapshot();
  if(user&&!storageFailed)apply();
  updatePanel();if(!storageFailed)message(initError|| (user?'已登录，正在读取云端记录…':'本地模式 · 登录后可在多设备间同步。'),!!initError);
  if(user)sync();
  window.addEventListener('online',sync);
  window.addEventListener('focus',()=>{if(user)sync();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();});
  window.addEventListener('storage',e=>{if(user&&e.key===cacheKey()&&!running){try{records=read(cacheKey(),records);apply();updatePanel();}catch(err){message('无法读取其他标签页的记录',true);}}});
  setInterval(()=>{if(document.visibilityState==='visible')sync();},60000);
 }
 async function init(){
  if(!cfg?.url||!cfg?.publishableKey||!window.supabase){initError='云端配置或登录组件未加载；本地刷题仍可使用。';return;}
  try{
   client=window.supabase.createClient(cfg.url,cfg.publishableKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'optics.auth.v1'},
    global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal||AbortSignal.timeout(15000)})}
   });
   const {data,error}=await client.auth.getSession();if(error)throw error;user=data.session?.user||null;
   client.auth.onAuthStateChange((event,session)=>{
    const next=session?.user||null;
    if((next?.id||null)!==(user?.id||null)){
     generation++;user=next;
     // Reload to switch *all* app persistence keys and wipe previous account's view.
     if(attached){attached=false;clearTimeout(timer);setTimeout(()=>location.reload(),0);}
    }
   });
  }catch(e){initError=friendly(e);}
 }
 window.OpticsCloud={ready:init(),localKey,attach,capture,isApplying:()=>applying};
})();
