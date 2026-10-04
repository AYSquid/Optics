/* Personal notes use the existing Auth client and the real rendered question ID.
 * Only unsaved, per-user drafts live in memory; successful saves require Supabase.
 */
(function(){
 'use strict';
 const byId=id=>document.getElementById(id),auth=()=>window.OpticsAuth;
 const FIELDS='id,user_id,question_id,content,created_at,updated_at',PAGE=50;
 let uid=null,generation=0,count=null,countRequest=0,cache=new Map(),pending=new Map(),drafts=new Map();
 let library=[],listOffset=0,listMore=false,libraryLoaded=false,loadingList=false;
 let current=null,mode='list',editing=false,busy=false,viewRevision=0,lastFocus=null,toastTimer,entryRevision=0;
 const dialog=document.createElement('dialog');dialog.id='question-notes-dialog';dialog.className='question-notes-dialog';dialog.setAttribute('aria-labelledby','notes-title');dialog.setAttribute('autofocus','');
 const head=document.createElement('div');head.className='notes-head';
 const title=document.createElement('h2');title.id='notes-title';title.textContent='题目笔记';
 const close=document.createElement('button');close.type='button';close.className='notes-close';close.textContent='×';close.setAttribute('aria-label','关闭题目笔记');
 head.append(title,close);const body=document.createElement('div');body.className='notes-body';
 // Keep the native dialog/backdrop stationary; animate its separate visual panel.
 const panel=document.createElement('div');panel.className='notes-panel';panel.append(head,body);dialog.append(panel);document.body.append(dialog);
 const toastNode=document.createElement('div');toastNode.className='notes-toast';toastNode.hidden=true;toastNode.setAttribute('role','status');document.body.append(toastNode);
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function button(text,cls,fn){const b=node('button',cls||'btn btn-outline',text);b.type='button';b.onclick=fn;return b;}
 function toast(text){toastNode.textContent=text;toastNode.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastNode.hidden=true,2600);}
 function message(text,error=false){const n=byId('notes-message');if(n){n.textContent=text;n.dataset.error=String(error);}}
 function friendly(error){
  const code=String(error?.code||''),text=String(error?.message||'');
  if(code==='PGRST205'||code==='42P01'||/schema cache.*question_notes|could not find.*question_notes/i.test(text))return '笔记云端表尚未初始化。请在 Supabase SQL Editor 执行 20260930_question_notes.sql 后重试。';
  if(code==='23505'||code==='NOTE_CONFLICT')return '这份笔记已在其他页面修改。当前文字已保留，可先查看最新云端内容，再决定是否覆盖。';
  if(code==='AUTH_REQUIRED'||code==='PGRST301'||code==='PGRST303')return '登录已失效，请重新登录后重试。';
  return '保存失败，请重试。当前文字已保留。';
 }
 function requireUser(){const user=auth()?.user;if(!user||user.id!==uid||!auth().client)throw {code:'AUTH_REQUIRED'};return user.id;}
 function question(id){return typeof DATA!=='undefined'?(DATA.byId[id]||EXAMS?.canonical?.[id]||null):null;}
 function activeQuestion(){return typeof currentQuestion==='function'&&typeof DATA!=='undefined'?currentQuestion():null;}
 function context(q){
  const ch=q&&typeof findChapter==='function'?findChapter(q.chapterId):null;
  const points=q&&typeof currentKnNames==='function'?currentKnNames(q):[];
  return [(ch?ch.num+' '+ch.title:q?.section||'题目资料'),points?.length?points.join('、'):null].filter(Boolean).join(' · ');
 }
 function metadata(q){return [q?.year?q.year+' 年':null,q?.typeName||null,q?.number?'原题 '+q.number:null].filter(Boolean).join(' · ');}
 function preview(q){return (q?.stem||[]).map(b=>b.x||(b.items||[]).join(' ')).join(' ').replace(/\s+/g,' ').slice(0,150)||'题目数据暂不可用';}
 function formatDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
 function reflect(){
  const countEl=byId('notes-count');if(countEl)countEl.textContent=uid?(count===null?'—':String(count)):'需登录';
  const b=byId('btn-question-note'),q=activeQuestion();if(!b)return;
  b.disabled=!uid||!q;
  const exists=q&&cache.get(q.id);const dot=b.querySelector('.note-record-dot');if(dot)dot.hidden=!exists;
  b.title=exists?'这道题已记录云端笔记':'记录这道题的理解与易错点';
 }
 async function refreshCount(){
  if(!uid)return;const gen=generation,request=++countRequest,id=uid;
  try{requireUser();const result=await auth().client.from('question_notes').select('id',{count:'exact',head:true}).eq('user_id',id);if(result.error)throw result.error;
   if(gen===generation&&request===countRequest){count=result.count??0;reflect();}
  }catch(e){if(gen===generation&&request===countRequest){count=null;reflect();byId('notes-count').title=friendly(e);}}
 }
 function readNote(id,force=false){
  requireUser();if(!force&&cache.has(id))return Promise.resolve(cache.get(id));if(!force&&pending.has(id))return pending.get(id);
  const gen=generation,owner=uid;
  const task=(async()=>{const result=await auth().client.from('question_notes').select(FIELDS).eq('user_id',owner).eq('question_id',id).maybeSingle();if(result.error)throw result.error;
   if(gen!==generation)throw {code:'AUTH_REQUIRED'};
   const row=result.data||null;if(row&&row.user_id!==owner)throw {code:'AUTH_REQUIRED'};cache.set(id,row);reflect();return row;
  })().finally(()=>{if(gen===generation)pending.delete(id);});pending.set(id,task);return task;
 }
 function draftKey(id){return uid+':'+id;}
 function rememberDraft(){
  const input=byId('notes-text');if(!current||!input||!editing)return;
  const key=draftKey(current.id),text=input.value,saved=cache.get(current.id)||null;
  const base=drafts.has(key)?drafts.get(key).base:saved;
  if(text===(saved?.content||''))drafts.delete(key);else drafts.set(key,{text,base});
 }
 function show(){
  dialog.dataset.view=mode==='current'?'current':'library';
  if(dialog.open)return;
  lastFocus=document.activeElement;
  const revision=++entryRevision;
  dialog.dataset.entering='pending';dialog.showModal();
  // Give the stationary background a paint before animating the panel.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(dialog.open&&revision===entryRevision)dialog.dataset.entering='ready';
  }));
 }
 dialog.addEventListener('close',()=>{if(!dialog.open){entryRevision++;delete dialog.dataset.entering;}});
 function closeModal(){rememberDraft();const hasDraft=current&&drafts.has(draftKey(current.id));dialog.close();viewRevision++;current=null;lastFocus?.focus({preventScroll:true});if(hasDraft)toast('未保存文字已保留，重新打开这道题可继续编辑（刷新页面会清除草稿）。');}
 close.onclick=closeModal;dialog.addEventListener('cancel',e=>{e.preventDefault();closeModal();});
 dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();});
 // Capture prevents the practice page's arrow/Escape shortcuts changing the question.
 dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeModal();}else if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing&&editing){e.preventDefault();save();}e.stopPropagation();});
 function setHead(back=false){head.replaceChildren();if(back)head.append(button('← 返回笔记列表','notes-back',()=>{rememberDraft();openLibrary(false);}));else head.append(title);head.append(close);dialog.setAttribute('aria-label',back?'题目笔记详情':'题目笔记');if(back)dialog.removeAttribute('aria-labelledby');else dialog.setAttribute('aria-labelledby','notes-title');}
 function loading(text){body.replaceChildren(node('p','notes-description',text));}
 function readError(error,retry){body.replaceChildren(node('p','notes-description',friendly(error)),button('重新加载','btn btn-outline',retry));}
 async function openCurrent(){const q=activeQuestion();if(!q||!uid)return;mode='current';await openDetail(q.id,true);}
 async function openDetail(id,edit){
  rememberDraft();const q=question(id);current={id,q};editing=edit;setHead(mode!=='current');const revision=++viewRevision;
  loading('正在读取云端笔记…');show();
  try{const row=await readNote(id,true);if(revision!==viewRevision||!dialog.open)return;current={id,q};renderDetail(row,edit);}
  catch(e){if(revision===viewRevision&&dialog.open)readError(e,()=>openDetail(id,edit));}
 }
 function original(q){
  const section=node('section','notes-original');let into=section;
  if(mode==='current'){
   const d=node('details');d.append(node('summary',null,'查看原题'));section.append(d);
   // Closed original questions do not need KaTeX layout or image decoding yet.
   let rendered=false;
   d.addEventListener('toggle',()=>{if(d.open&&!rendered){rendered=true;renderOriginal(q,d);}});
  }else{into.append(node('h3',null,'原题'));renderOriginal(q,into);}
  return section;
 }
 function renderOriginal(q,into){
  if(!q){into.append(node('p',null,'对应题目资料暂不可用；笔记仍可查看与编辑。'));return;}
  const stem=node('div','notes-stem');renderBlocks(q.stem,stem);into.append(stem);
  if(q.options?.length){const options=node('div','notes-options');q.options.forEach(o=>{const item=node('div','notes-option');item.append(node('strong',null,o.key));const text=node('span');renderInline(o.x,text);item.append(text);options.append(item);});into.append(options);}
  const images=q.stemImages?.length?q.stemImages:(q.occurrenceId?EXAMS.byOccurrence[q.occurrenceId]?.sourceImages||[]:[]);
  images.forEach(im=>{const fig=node('figure');const img=node('img');img.src=im.src;img.alt=im.alt||im.caption||'原题图片';img.loading='lazy';img.decoding='async';fig.append(img);if(im.caption)fig.append(node('figcaption',null,im.caption));into.append(fig);});
 }
 function renderDetail(row,edit){
  if(!current)return;editing=edit;body.replaceChildren();const q=current.q,id=current.id,draft=drafts.get(draftKey(id));
  body.append(node('div','notes-context',context(q)));const meta=node('div','notes-meta',metadata(q));meta.append(node('span','notes-id','题目 ID：'+id));body.append(meta,original(q));
  const label=node('label','notes-editor-label','我的笔记');body.append(label);
  if(edit){const input=node('textarea','notes-textarea');input.id='notes-text';input.maxLength=50000;input.placeholder='在这里记录理解、公式、易错点、解题思路……';input.value=draft?draft.text:row?.content||'';input.autocomplete='off';label.htmlFor=input.id;input.addEventListener('input',()=>{rememberDraft();message('有未保存的修改；关闭后可在本次页面中继续编辑。');});body.append(input);}
  else body.append(node('div','notes-content',row?.content||'暂无笔记'));
  const actions=node('div','notes-actions');if(row)actions.append(button('删除笔记','notes-delete',confirmDelete));
  actions.append(button(edit?'保存笔记':'编辑笔记','btn btn-primary',edit?save:()=>renderDetail(cache.get(id),true)));actions.lastChild.id='notes-save';body.append(actions);
  if(edit&&busy){actions.lastChild.disabled=true;actions.lastChild.textContent='保存中…';}
  const feedback=node('p','notes-message');feedback.id='notes-message';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');body.append(feedback);
  if(draft)message('已恢复本次页面中未保存的草稿；尚未保存到云端。');
  if(row)body.append(node('p','notes-meta','最后保存：'+formatDate(row.updated_at)));
  dialog.scrollTop=0;panel.scrollTop=0;
  if(edit){const input=byId('notes-text');requestAnimationFrame(()=>{if(dialog.open&&input.isConnected&&(document.activeElement===dialog||document.activeElement===close||document.activeElement===document.body))input.focus({preventScroll:true});});}
 }
 async function save(){
  if(busy||!current||!editing)return;
  const input=byId('notes-text'),content=input?.value||'';if(!content.trim()){message('请输入笔记内容。如需删除已有笔记，请使用“删除笔记”。',true);input?.focus();return;}
  if(content.length>50000){message('笔记最长为 50000 个字符。',true);return;}
  const existingDraft=drafts.get(draftKey(current.id));
  const id=current.id,gen=generation,revision=viewRevision,owner=uid,base=existingDraft?existingDraft.base:cache.get(id)||null;
  rememberDraft();busy=true;const saveButton=byId('notes-save');saveButton.disabled=true;saveButton.textContent='保存中…';message('正在保存到云端…');
  try{
   requireUser();let request;
   if(base)request=auth().client.from('question_notes').update({content}).eq('user_id',owner).eq('question_id',id).eq('updated_at',base.updated_at);
   else request=auth().client.from('question_notes').insert({user_id:owner,question_id:id,content});
   const result=await request.select(FIELDS).maybeSingle();if(result.error)throw result.error;if(!result.data)throw {code:'NOTE_CONFLICT'};
   if(gen!==generation)return;cache.set(id,result.data);libraryLoaded=false;refreshCount();reflect();
   const draft=drafts.get(draftKey(id));if(draft?.text===content)drafts.delete(draftKey(id));else if(draft)draft.base=result.data;
   if(revision===viewRevision&&dialog.open){message(byId('notes-text')?.value===content?'已保存':'已保存提交的版本；新输入的文字尚未保存。');}
   if(typeof BroadcastChannel==='function')channel?.postMessage({user:owner,question:id});
   window.dispatchEvent(new Event('optics:notes-changed'));
  }catch(e){if(gen===generation&&revision===viewRevision&&dialog.open){message(friendly(e),true);if(e.code==='23505'||e.code==='NOTE_CONFLICT')showConflict(id,revision);}}
  finally{if(gen===generation){busy=false;if(editing&&byId('notes-save')){byId('notes-save').disabled=false;byId('notes-save').textContent='保存笔记';}}}
 }
 function showConflict(id,revision){
  if(byId('notes-conflict'))return;
  const action=button('查看最新云端内容','btn btn-outline',async()=>{
   action.disabled=true;rememberDraft();
   try{const row=await readNote(id,true);if(revision!==viewRevision||!dialog.open)return;
    const section=node('section','notes-confirm');section.append(node('p',null,'最新云端笔记（你的草稿仍在上方）：'),node('div','notes-content',row?.content||'云端笔记已删除'));
    section.append(button('保留我的文字，准备覆盖此版本','btn btn-outline',()=>{
     rememberDraft();const draft=drafts.get(draftKey(id));if(draft)draft.base=row;
     renderDetail(row,true);message('已保留你的文字。点击保存后将覆盖刚才查看的云端版本。');
    }));action.replaceWith(section);
   }catch(e){message(friendly(e),true);action.disabled=false;}
  });action.id='notes-conflict';body.append(action);
 }
 function confirmDelete(){
  if(busy||!current||byId('notes-delete-confirm'))return;
  const confirm=node('section','notes-confirm');confirm.id='notes-delete-confirm';confirm.append(node('p',null,'确定删除这道题的笔记？原题和刷题记录不会被删除。'));
  const actions=node('div','notes-actions');actions.append(button('取消','btn btn-ghost',()=>confirm.remove()),button('确认删除笔记','btn btn-outline',removeNote));confirm.append(actions);body.append(confirm);confirm.scrollIntoView({block:'nearest'});actions.firstChild.focus({preventScroll:true});
 }
 async function removeNote(){
  if(busy||!current)return;const id=current.id,base=cache.get(id);if(!base)return;const gen=generation,revision=viewRevision,owner=uid;busy=true;
  const confirm=byId('notes-delete-confirm');confirm.querySelectorAll('button').forEach(b=>b.disabled=true);message('正在删除笔记…');
  try{requireUser();const result=await auth().client.from('question_notes').delete().eq('user_id',owner).eq('question_id',id).eq('updated_at',base.updated_at).select('id');if(result.error)throw result.error;if(!result.data?.length)throw {code:'NOTE_CONFLICT'};
   if(gen!==generation)return;cache.set(id,null);drafts.delete(draftKey(id));library=library.filter(r=>r.question_id!==id);libraryLoaded=false;refreshCount();reflect();channel?.postMessage({user:owner,question:id});
   window.dispatchEvent(new Event('optics:notes-changed'));
   if(revision===viewRevision&&dialog.open){current=null;await openLibrary(true);toast('笔记已删除');}
  }catch(e){if(gen===generation&&revision===viewRevision)message(friendly(e),true);}
  finally{if(gen===generation){busy=false;confirm?.querySelectorAll('button').forEach(b=>b.disabled=false);if(editing&&byId('notes-save')){byId('notes-save').disabled=false;byId('notes-save').textContent='保存笔记';}}}
 }
 async function openLibrary(force=true){
  rememberDraft();current=null;mode='list';editing=false;show();setHead();viewRevision++;const revision=viewRevision;loading('正在读取笔记列表…');
  if(!force&&libraryLoaded){renderList();return;}
  if(loadingList){setTimeout(()=>{if(revision===viewRevision)openLibrary(force);},100);return;}
  library=[];listOffset=0;libraryLoaded=false;await loadList(false,revision);
 }
 async function loadList(append,revision=viewRevision){
  if(loadingList)return;loadingList=true;const gen=generation,owner=uid,offset=append?listOffset:0;
  try{requireUser();const result=await auth().client.from('question_notes').select('id,question_id,created_at,updated_at',{count:'exact'}).eq('user_id',owner).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+PAGE-1);if(result.error)throw result.error;if(gen!==generation)return;
   const rows=result.data||[];library=append?library.concat(rows):rows;listOffset=offset+rows.length;listMore=listOffset<(result.count||0);libraryLoaded=true;count=result.count??library.length;countRequest++;reflect();
   if(revision===viewRevision&&mode==='list'&&dialog.open)renderList();
  }catch(e){if(gen===generation&&revision===viewRevision&&dialog.open)readError(e,()=>openLibrary(true));}
  finally{if(gen===generation)loadingList=false;}
 }
 function renderList(){
  body.replaceChildren(node('p','notes-description','共 '+(count??library.length)+' 条云端笔记 · 最近修改在前'));
  if(!library.length){const empty=node('div','notes-empty');empty.append(node('strong',null,'暂无题目笔记'),node('p',null,'在做题时点击“题目笔记”即可记录。'));body.append(empty);return;}
  const list=node('div','notes-list');library.forEach(row=>{const q=question(row.question_id),item=button('','notes-list-item',()=>{mode='library';openDetail(row.question_id,false);});item.append(node('strong',null,context(q)),node('div','notes-meta',metadata(q)),node('div','notes-preview',preview(q)));const time=node('time',null,formatDate(row.updated_at));time.dateTime=row.updated_at;item.append(time);list.append(item);});body.append(list);
  if(listMore)body.append(button('加载更多','btn btn-ghost notes-load-more',async()=>{const revision=viewRevision;await loadList(true,revision);}));
 }
 function sessionChanged(){
  const next=auth()?.user?.id||null;if(next===uid)return;uid=next;generation++;countRequest++;count=null;cache=new Map();pending=new Map();drafts=new Map();library=[];libraryLoaded=false;loadingList=false;busy=false;current=null;viewRevision++;
  if(dialog.open)dialog.close();toastNode.hidden=true;reflect();if(uid){refreshCount();updateCurrent();}
 }
 function updateCurrent(){reflect();const q=activeQuestion();if(uid&&q&&!cache.has(q.id)&&!pending.has(q.id))readNote(q.id).catch(()=>{});}
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('optics-question-notes'):null;
 if(channel)channel.onmessage=e=>{if(e.data?.user!==uid)return;cache.delete(e.data.question);libraryLoaded=false;refreshCount();updateCurrent();window.dispatchEvent(new Event('optics:notes-changed'));};
 byId('btn-question-note').onclick=openCurrent;byId('notes-library-open').onclick=()=>openLibrary(true);
 const originalRender=window.render;window.render=function(){originalRender.apply(this,arguments);updateCurrent();};
 auth().subscribe(()=>setTimeout(sessionChanged,0));auth().ready.then(sessionChanged);
 // The mastery map reads only IDs; note bodies remain lazy and private.
 async function questionIds(){
  requireUser();const owner=uid,gen=generation,ids=[];
  for(let offset=0;;offset+=500){
   const result=await auth().client.from('question_notes').select('question_id').eq('user_id',owner).order('question_id',{ascending:true}).range(offset,offset+499);
   if(result.error)throw result.error;
   if(gen!==generation)throw Error('登录用户已变化');
   const rows=result.data||[];ids.push(...rows.map(row=>row.question_id));if(rows.length<500)break;
  }
  return ids;
 }
 window.OpticsNotes={updateCurrent,questionIds};
})();
