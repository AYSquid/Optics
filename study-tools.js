/* Real question data + account-scoped local collections. Existing status/cloud
 * records remain authoritative. A retest never reveals a key before submission. */
(function(){
 'use strict';
 const by=id=>document.getElementById(id);
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const btn=(text,fn,cls='study-button')=>{const b=node('button',cls,text);b.type='button';b.onclick=fn;return b;};
 const label={none:'未标记',known:'会做',shaky:'不熟练',unknown:'不会做'};
 const symbol={none:'',known:'✓',shaky:'',unknown:'×'};
 const modes={favorites:'收藏本',mastery:'掌握地图',knowledge:'知识图谱',retest:'错题复测'};
 let syncBaseline={},receivingCloud=false;
 let attached=false,root,owner=null,state,storageError='',snapshot=null,questionReturn='';
 let notes=null,notesLoading=false,notesError='',notesToken=0;
 let map={category:'all',chapter:'',statuses:[],attributes:[],enhanced:false};
 let graph={category:'all',chapter:'',search:'',topic:'',tab:'questions'};
 let favorites={category:'all',chapter:'',search:'',range:'all',sort:'new',page:0,from:'',to:''};
 let planFilter={view:'due',sort:'due',level:'all'};
 let questionReturnHash='';
 let review={category:'all',chapter:'',source:'all',limit:20,shuffle:true,dueOnly:true};
 let dialog,dialogBody,dialogTitle,favoriteFocus,selectedFavorite='',favoriteSearch='',favoriteFilter='all',replaceDialog;
 const mode=()=>location.hash.match(/^#\/(mastery|knowledge|retest|favorites)(?:[/?]|$)/)?.[1]||'';
 const key=()=> 'gopt.study-tools.v1'+(owner?'.space.'+owner:'.guest');
 const emptyState=()=>({version:1,favorites:{},mistakes:{},schedules:{},plans:{},session:null,history:[],syncEntries:{}});
 const canonical=q=>q?.canonicalId||q?.id;
 const status=q=>getStatus(statusKeyOf(q))||'none';
 const favorite=q=>!!state.favorites[canonical(q)];
 function persist(){
  try{updateSyncEntries();localStorage.setItem(key(),JSON.stringify(state));window.OpticsToolsCloud?.capture();storageError='';window.OpticsDashboard?.retestPosition(state.session);return true;}
  catch(e){storageError='本机保存失败，请导出收藏备份。本次改动仍保留在当前页面。';announce(storageError);return false;}
 }
 function load(){
  state=emptyState();storageError='';
  try{
   const raw=localStorage.getItem(key());if(!raw)return;const saved=JSON.parse(raw);
   if(!saved||saved.version!==1||typeof saved.favorites!=='object'||Array.isArray(saved.favorites)||typeof saved.mistakes!=='object'||Array.isArray(saved.mistakes))throw Error('Invalid storage');
   Object.entries(saved.favorites).forEach(([id,value])=>{if(DATA.byId[id]&&typeof value==='string'&&Number.isFinite(Date.parse(value)))state.favorites[id]=value;});
   Object.entries(saved.mistakes).forEach(([id,value])=>{if(DATA.byId[id]&&typeof value==='string')state.mistakes[id]=value;});
   Object.entries(saved.schedules||{}).forEach(([id,value])=>{if(DATA.byId[id]&&typeof value==='string'&&Number.isFinite(Date.parse(value)))state.schedules[id]=value;});
   Object.entries(saved.plans||{}).forEach(([id,p])=>{if(DATA.byId[id]&&p&&['known','shaky','unknown'].includes(p.level)&&Number.isInteger(p.step)&&p.step>=0&&typeof p.due==='string'&&Number.isFinite(Date.parse(p.due)))state.plans[id]=p;});
   state.syncEntries=saved.syncEntries&&typeof saved.syncEntries==='object'&&!Array.isArray(saved.syncEntries)?saved.syncEntries:{};
   state.history=Array.isArray(saved.history)?saved.history.filter(h=>h&&typeof h.date==='string').slice(-20):[];
   const s=saved.session;
   if(s&&Array.isArray(s.ids)&&s.ids.length&&s.ids.length<=DATA.questions.length&&s.ids.every(id=>DATA.byId[id]&&DATA.byId[id].playable!==false)&&Number.isInteger(s.index)&&s.index>=0&&s.index<s.ids.length&&s.results&&typeof s.results==='object'&&!Array.isArray(s.results)){
    s.picks=s.picks&&typeof s.picks==='object'?s.picks:{};s.drafts=s.drafts&&typeof s.drafts==='object'?s.drafts:{};
    state.session=s;
   }
  }catch(e){
   try{localStorage.setItem(key()+'.corrupt.'+Date.now(),localStorage.getItem(key())||'');}catch(_){}
   storageError='学习工具记录格式异常，原始内容已保留。请先导出检查。';
  }
 }
 function entityValues(){
  const out={};Object.entries(state.favorites).forEach(([id,v])=>out['favorite:'+id]=v);
  new Set([...Object.keys(state.plans),...Object.keys(state.schedules),...Object.keys(state.mistakes)]).forEach(id=>out['review:'+id]={plan:state.plans[id]||null,due:state.schedules[id]||null,mistake:state.mistakes[id]||null});
  if(state.session)out.session=state.session;return out;
 }
 function stableValue(value){return JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
 function seedSync(){const values=entityValues();state.syncEntries=state.syncEntries||{};for(const [k,v] of Object.entries(values)){if(!state.syncEntries[k])state.syncEntries[k]={value:JSON.parse(JSON.stringify(v)),at:k.startsWith('favorite:')?v:k==='session'?v.date:(v.plan?.lastDate?v.plan.lastDate+'T00:00:00.000Z':'1970-01-01T00:00:00.000Z')};}syncBaseline=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,JSON.stringify(v)]));}
 function updateSyncEntries(){if(receivingCloud)return;const values=entityValues();state.syncEntries=state.syncEntries||{};for(const k of new Set([...Object.keys(values),...Object.keys(syncBaseline)])){const text=JSON.stringify(values[k]);if(text!==syncBaseline[k]){const stamp=Math.max(Date.now(),(Date.parse(state.syncEntries[k]?.at)||0)+1);state.syncEntries[k]={value:values[k]===undefined?null:JSON.parse(text),at:new Date(stamp).toISOString()};}}syncBaseline=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,JSON.stringify(v)]));}
 function receiveToolsCloud(entries){
  if(owner!==window.OpticsAuth?.user?.id)return;receivingCloud=true;const before=stableValue(entityValues());
  try{for(const [key,entry] of Object.entries(entries)){const k=key.replace(/^settings:study-tools\./,'');if(!entry||typeof entry.at!=='string'||!Number.isFinite(Date.parse(entry.at)))continue;const local=state.syncEntries[k];if(local&&local.at>entry.at)continue;const id=k.split(':').slice(1).join(':');if(k!=='session'&&(!DATA.byId[id]||!['favorite','review'].includes(k.split(':')[0])))continue;state.syncEntries[k]=entry;const v=entry.value;
   if(k==='session'){if(stableValue(state.session)!==stableValue(v))state.session=v;continue;}if(k.startsWith('favorite:')){if(typeof v==='string'&&Number.isFinite(Date.parse(v)))state.favorites[id]=v;else if(v===null)delete state.favorites[id];}
   else{for(const [field,value] of [['plans',v?.plan],['schedules',v?.due],['mistakes',v?.mistake]]){if(value)state[field][id]=value;else delete state[field][id];}}
  }const changed=before!==stableValue(entityValues());localStorage.setItem(key(),JSON.stringify(state));if(changed)load();seedSync();if(changed){reflect();if(mode())renderHub();}}
  finally{receivingCloud=false;}
 }
 function announce(text){const n=by('study-announcement');if(n)n.textContent=text;}
 function textOf(q){return (q.stem||[]).map(b=>b.x||(b.items||[]).join(' ')).join(' ').replace(/\s+/g,' ');}
 function context(q){const ch=findChapter(q.chapterId);return [ch?ch.num+' '+ch.title:'其他资料',q.year?q.year+' 年':null,q.typeName,'原题 '+q.number].filter(Boolean).join(' · ');}
 const isPaper=q=>matchesBankSource(q,'past');
 function category(q,value){
  if(value==='all')return true;
  if(value==='past')return isPaper(q);
  if(value==='final')return matchesBankSource(q,'final');
  const ch=findChapter(q.chapterId);const group=ch?.subjectGroup||ch?.source;return value==='geom'?['geom','inst'].includes(group):group==='phys';
 }
 function questions(filter){return DATA.questions.filter(q=>q.playable!==false&&category(q,filter.category)&&(!filter.chapter||q.chapterId===filter.chapter));}
 function categories(host,filter,change){
  const row=node('div','study-filter-row');row.append(node('strong','study-filter-label','分类'));
  [['all','全部'],['geom','几何光学'],['phys','物理光学'],['past','历年真题'],['final','期末试卷']].forEach(([value,name])=>{
   const b=btn(name,()=>{filter.category=value;filter.chapter='';change();},'study-chip');b.dataset.category=value;
   b.setAttribute('aria-pressed',String(filter.category===value));b.append(node('small',null,String(DATA.questions.filter(q=>q.playable!==false&&category(q,value)&&(filter!==favorites||favorite(q))).length)));row.append(b);
  });host.append(row);
 }
 function chapters(host,filter,change){
  if(filter.category==='all')return;
  const row=node('div','study-filter-row study-chapter-row');row.append(node('strong','study-filter-label','章节'));
  const all=btn('全部章节',()=>{filter.chapter='';change();},'study-chip');all.setAttribute('aria-pressed',String(!filter.chapter));row.append(all);
  orderedStudyChapters().filter(ch=>DATA.questions.some(q=>q.chapterId===ch.id&&category(q,filter.category))).forEach(ch=>{
   const b=btn(ch.num+' '+ch.title,()=>{filter.chapter=ch.id;change();},'study-chip');b.dataset.chapter=ch.id;b.setAttribute('aria-pressed',String(filter.chapter===ch.id));row.append(b);
  });host.append(row);
 }
 function heading(title,subtitle){
  const h=node('div','study-page-head'),copy=node('div');copy.append(node('span','study-kicker','OPTICS / LEARNING RECORD'),node('h1',null,title),node('p',null,subtitle));
  h.append(copy,btn('← 返回刷题',back,'study-button study-back'));root.append(h);return h;
 }
 function toggleFavorite(q){
  if(!q)return;const id=canonical(q);if(state.favorites[id])delete state.favorites[id];else state.favorites[id]=new Date().toISOString();
  persist();reflect();if(dialog?.open){selectedFavorite?favoriteDetail():favoriteList();}if(mode())renderHub();
 }
 function reflect(){
  by('favorites-count').textContent=String(Object.keys(state.favorites).length);
  by('retest-count').textContent=String(candidates({category:'all',chapter:'',source:'all',dueOnly:true}).length);
  const q=currentQuestion(),b=by('btn-favorite');b.disabled=!q;b.setAttribute('aria-pressed',String(!!q&&favorite(q)));b.textContent=q&&favorite(q)?'★ 已收藏':'☆ 收藏';
  if(ui.scope.type==='list'){questionReturn=ui.scope.origin||'';questionReturnHash=ui.scope.returnHash||'';}
  by('btn-study-return').hidden=!questionReturn||!!mode();
  const undo=by('btn-undo-plan');if(undo)undo.hidden=!!mode()||!q||state.plans[canonical(q)]?.lastDate!==localDay();
  by('btn-study-return').textContent='返回'+(modes[questionReturn]||'地图');
  ['favorites','mastery','knowledge','retest'].forEach(m=>by(m+'-open').setAttribute('aria-current',mode()===m?'page':'false'));
 }
 function remember(){
  if(mode()||snapshot)return;
  snapshot={scope:JSON.parse(JSON.stringify(ui.scope)),statusFilter:ui.statusFilter,id:currentQuestion()?.id,answer:ui.answerOpen,analysis:ui.analysisOpen,picks:{...ui.choicePick},checked:ui.choiceChecked,scroll:by('scroller').scrollTop,hash:location.hash};
 }
 function open(m){
  remember();window.OpticsElectronicNotes?.close();closeNav();
  if(mode()===m){document.body.classList.remove('dashboard-page');renderHub();}else location.hash=toolHash(m).slice(1);
 }
 function back(){
  const saved=snapshot;snapshot=null;questionReturn='';location.hash=saved?.hash||'/bank';
  if(saved){ui.scope=saved.scope;ui.statusFilter=saved.statusFilter;ui.choiceQuestionId=saved.id;ui.choicePick=saved.picks;ui.choiceChecked=!!saved.checked;buildScopeIds();buildMatchIds();ui.index=Math.max(0,ui.matchIds.indexOf(saved.id));ui.answerOpen=saved.answer;ui.analysisOpen=saved.analysis;}
  cleanup();window.render();if(saved)by('scroller').scrollTop=saved.scroll;
 }
 function cleanup(){window.ExamTimer?.detach();document.body.classList.remove('study-page');root.hidden=true;}
 function openQuestion(q,origin){
  if(!q)return;if(dialog.open)dialog.close();const source=listContext(origin);
  if(source){startPractice(source.ids,source.name,q.id);return;}
  questionReturn=origin||'';questionReturnHash=location.hash;location.hash='/bank';cleanup();ui.statusFilter='all';
  const ch=findChapter(q.chapterId),kn=ch?.knowledge.find(k=>k.questionIds.includes(q.id));ui.scope=kn?{type:'kn',chapterId:ch.id,knId:kn.id}:{type:'all'};reselect({keepQuestionId:q.id});savePrefs();closeNav();reflect();
 }
 function renderHub(){
  const m=mode();if(!m||!attached)return;
  const pageScroll=by('scroller').scrollTop;
  if(m==='knowledge')graph.topic=location.hash.split('?')[0].split('/')[2]||'';
  history.replaceState(null,'',toolHash(m));
  window.OpticsElectronicNotes?.close();window.EnglishExams?.leave();if(m!=='retest'||!state.session||state.session.finished||state.session.paused)window.ExamTimer?.detach();
  document.body.classList.add('study-page');root.hidden=false;root.dataset.page=m;root.replaceChildren();
  by('crumb').textContent=modes[m];by('crumb-sub').textContent='工程光学 · 个人学习记录';
  document.querySelector('.page-eyebrow').textContent='STUDY / 学习工具';by('progress').textContent='可练习 '+DATA.questions.filter(q=>q.playable!==false).length+' 题';
  if(m==='mastery')renderMastery();else if(m==='knowledge')renderKnowledge();else if(m==='favorites')renderFavorites();else renderRetest();
  by('scroller').scrollTop=pageScroll;
  reflect();
  if(storageError)root.prepend(node('p','study-warning',storageError));
 }
 async function readNotes(force=false){
  if(notesLoading||notes!==null&&!force)return;
  notesLoading=true;notesError='';const token=++notesToken;
  try{
   const ids=await window.OpticsNotes.questionIds();if(token!==notesToken)return;
   notes=new Set(ids.map(id=>canonical(DATA.byId[id])||id));
  }catch(e){if(token===notesToken){notesError='笔记索引暂时无法读取';notes=null;}}
  finally{if(token===notesToken){notesLoading=false;if(mode()==='mastery')renderHub();}}
 }
 function mapMatch(q){return (!map.statuses.length||map.statuses.includes(status(q)))&&map.attributes.every(a=>a==='favorite'?favorite(q):notes?.has(canonical(q)));}
 function renderMastery(){
  const all=questions(map),matched=all.filter(mapMatch);
  const head=heading('掌握地图','每个方格对应一道题；学习状态沿用你的刷题记录。');
  head.append(btn('生成掌握卡',()=>exportMastery(all),'study-button'));
  const practice=btn('批量练习所选 '+matched.filter(q=>q.playable!==false).length+' 题',()=>startPractice(matched.map(q=>q.id),'掌握地图筛选'));practice.disabled=!matched.some(q=>q.playable!==false);head.append(practice);
  const filter=node('section','study-panel');categories(filter,map,renderHub);chapters(filter,map,renderHub);root.append(filter);
  const panel=node('section','study-panel');
  const statuses=node('div','study-status-grid');
  ['none','known','shaky','unknown'].forEach(s=>{
   const b=btn('',()=>{map.statuses=map.statuses.includes(s)?map.statuses.filter(v=>v!==s):map.statuses.concat(s);renderHub();},'study-status-tile');
   b.dataset.status=s;b.setAttribute('aria-pressed',String(map.statuses.includes(s)));
   b.append(node('span','study-dot',symbol[s]),node('span',null,label[s]),node('strong',null,String(all.filter(q=>status(q)===s).length)));statuses.append(b);
  });panel.append(node('h2','study-section-title','掌握状态 · 可多选'),statuses);
  const attrs=node('div','study-attributes');
  const fav=btn('★ 收藏题　'+all.filter(favorite).length,()=>{map.attributes=map.attributes.includes('favorite')?map.attributes.filter(v=>v!=='favorite'):map.attributes.concat('favorite');renderHub();},'study-chip');fav.setAttribute('aria-pressed',String(map.attributes.includes('favorite')));attrs.append(fav);
  const note=btn(notesLoading?'笔记索引读取中…':notesError?notesError+' · 重试':'有笔记　'+(notes?all.filter(q=>notes.has(canonical(q))).length:'—'),()=>{
   if(notes===null){readNotes(true);return;}map.attributes=map.attributes.includes('notes')?map.attributes.filter(v=>v!=='notes'):map.attributes.concat('notes');renderHub();
  },'study-chip');note.setAttribute('aria-pressed',String(map.attributes.includes('notes')));attrs.append(note);
  attrs.append(btn('清除筛选',()=>{map.statuses=[];map.attributes=[];renderHub();},'study-button study-muted'));panel.append(attrs);
  const gridHead=node('div','study-grid-head');gridHead.append(node('h2','study-section-title','题目地图'),node('span','study-muted','符合 '+matched.length+' / '+all.length+' 题'));
  const enhanced=node('label','study-checkbox'),checkbox=node('input');checkbox.type='checkbox';checkbox.checked=map.enhanced;checkbox.onchange=()=>{map.enhanced=checkbox.checked;renderHub();};enhanced.append(checkbox,document.createTextNode('增强辨识'));gridHead.append(enhanced);panel.append(gridHead);
  const grid=node('div','mastery-grid'+(map.enhanced?' enhanced':''));
  all.forEach((q,i)=>{
   const hit=mapMatch(q),s=status(q),b=btn(map.enhanced?symbol[s]:'',()=>openQuestion(q,'mastery'),'mastery-cell'+(hit?'':' is-dim'));
   b.dataset.question=q.id;b.dataset.status=s;b.dataset.match=String(hit);b.title=(i+1)+' · '+context(q)+' · '+label[s]+(favorite(q)?' · 已收藏':'');
   b.setAttribute('aria-label',b.title);b.disabled=!hit||q.playable===false;if(favorite(q))b.classList.add('is-favorite');grid.append(b);
  });panel.append(grid);if(!all.length)panel.append(node('p','study-empty','此分类暂无题目。'));root.append(panel);
  if(notes===null&&!notesLoading&&!notesError)queueMicrotask(()=>readNotes());
 }
 function renderKnowledge(){
  if(graph.topic){renderKnowledgeDetail();return;}
  heading('知识图谱','按笔记顺序梳理章节与知识点，点击知识点进入对应题目。');
  const panel=node('section','study-panel');categories(panel,graph,renderHub);
  const search=node('input','study-search');search.type='search';search.placeholder='搜索知识点或章节';search.setAttribute('aria-label','搜索知识点或章节');search.value=graph.search;
  search.oninput=()=>{graph.search=search.value;renderKnowledgeBody(body);};panel.append(search);root.append(panel);
  const body=node('div','knowledge-layout');root.append(body);renderKnowledgeBody(body);
 }
 function renderKnowledgeBody(host){
  host.replaceChildren();const term=graph.search.trim().toLowerCase();
  const catalog=orderedStudyChapters().map(ch=>({ch,topics:ch.knowledge.map(k=>({k,ids:k.questionIds.filter(id=>DATA.byId[id]?.playable!==false&&category(DATA.byId[id],graph.category))})).filter(t=>t.ids.length&&(!term|| (ch.num+' '+ch.title+' '+t.k.name).toLowerCase().includes(term)))})).filter(c=>c.topics.length);
  if(!catalog.some(c=>c.ch.id===graph.chapter))graph.chapter=catalog[0]?.ch.id||'';
  history.replaceState(null,'',toolHash('knowledge'));
  if(!catalog.length){host.append(node('p','study-panel study-empty','没有匹配的章节或知识点。'));return;}
  const nav=node('nav','knowledge-chapters');nav.setAttribute('aria-label','知识图谱章节');
  catalog.forEach(c=>{const b=btn('',()=>{graph.chapter=c.ch.id;renderKnowledgeBody(host);},'knowledge-chapter');b.setAttribute('aria-current',graph.chapter===c.ch.id?'page':'false');b.append(node('span',null,c.ch.num+' '+c.ch.title),node('small',null,String(c.topics.length)));nav.append(b);});host.append(nav);
  const chosen=catalog.find(c=>c.ch.id===graph.chapter),area=node('section','study-panel knowledge-topics'),h=node('div','study-grid-head');
  h.append(node('h2',null,chosen.ch.title),node('span','study-muted',chosen.topics.length+' 个知识点'));area.append(h);
  const grid=node('div','knowledge-grid');
  chosen.topics.forEach(({k,ids},i)=>{
   const known=ids.filter(id=>status(DATA.byId[id])==='known').length,weak=ids.filter(id=>['unknown','shaky'].includes(status(DATA.byId[id]))).length;
   const b=btn('',()=>{
    graph.topic=k.id;graph.tab='questions';location.hash=toolHash('knowledge').slice(1);
   },'knowledge-topic');b.dataset.topic=k.id;
   b.append(node('span','study-kicker',String(i+1).padStart(2,'0')+' / KNOWLEDGE'),node('strong',null,k.name),node('span','study-muted',ids.length+' 题 · 会做 '+known+' · 待巩固 '+weak));
   const progress=node('progress');progress.max=ids.length;progress.value=known;progress.setAttribute('aria-label','会做 '+known+' / '+ids.length+' 题');b.append(progress);grid.append(b);
  });area.append(grid);host.append(area);
 }
 function toolHash(m=mode()){
  const f=m==='mastery'?map:m==='favorites'?favorites:m==='knowledge'?graph:review,p=new URLSearchParams();
  if(f.category!=='all')p.set('category',f.category);if(f.chapter)p.set('chapter',f.chapter);
  if(m==='mastery'){if(map.statuses.length)p.set('status',map.statuses.join(','));if(map.attributes.length)p.set('attr',map.attributes.join(','));if(map.enhanced)p.set('enhanced','1');}
  if(m==='favorites'){if(f.search)p.set('q',f.search);if(f.range!=='all')p.set('time',f.range);if(f.sort!=='new')p.set('sort',f.sort);if(f.from)p.set('from',f.from);if(f.to)p.set('to',f.to);if(f.page)p.set('page',String(f.page));}
  if(m==='knowledge'){if(f.search)p.set('q',f.search);if(f.tab==='explain')p.set('tab','explain');}
  if(m==='retest'){if(planFilter.view!=='due')p.set('view',planFilter.view);if(planFilter.sort!=='due')p.set('sort',planFilter.sort);if(planFilter.level!=='all')p.set('level',planFilter.level);}
  return '#/'+m+(m==='knowledge'&&graph.topic?'/'+graph.topic:'')+(p.size?'?'+p:'');
 }
 function readToolRoute(){
  const m=mode();if(!m)return;const p=new URLSearchParams(location.hash.split('?')[1]||''),f=m==='mastery'?map:m==='favorites'?favorites:m==='knowledge'?graph:review;
  f.category=['all','geom','phys','past','final'].includes(p.get('category'))?p.get('category'):'all';f.chapter=findChapter(p.get('chapter'))?p.get('chapter'):'';
  if(m==='mastery'){map.statuses=(p.get('status')||'').split(',').filter(v=>['none','known','shaky','unknown'].includes(v));map.attributes=(p.get('attr')||'').split(',').filter(v=>['favorite','notes'].includes(v));map.enhanced=p.get('enhanced')==='1';}
  if(m==='favorites'){f.search=(p.get('q')||'').slice(0,200);f.range=['7','30','90','custom'].includes(p.get('time'))?p.get('time'):'all';f.sort=p.get('sort')==='old'?'old':'new';f.page=Math.max(0,Math.min(1000,Number(p.get('page'))||0));f.from=/^\d{4}-\d{2}-\d{2}$/.test(p.get('from'))?p.get('from'):'';f.to=/^\d{4}-\d{2}-\d{2}$/.test(p.get('to'))?p.get('to'):'';}
  if(m==='knowledge'){graph.topic=location.hash.split('?')[0].split('/')[2]||'';graph.search=(p.get('q')||'').slice(0,200);graph.tab=p.get('tab')==='explain'?'explain':'questions';}
  if(m==='retest'){planFilter.view=['future','all'].includes(p.get('view'))?p.get('view'):'due';planFilter.sort=p.get('sort')==='recent'?'recent':'due';planFilter.level=['known','shaky','unknown'].includes(p.get('level'))?p.get('level'):'all';}
 }
 function favoriteRows(){
  const term=favorites.search.trim().toLowerCase(),cutoff=favorites.range!=='all'&&favorites.range!=='custom'?Date.now()-Number(favorites.range)*86400000:0;
  return questions(favorites).filter(q=>favorite(q)&&(!term||(context(q)+' '+textOf(q)).toLowerCase().includes(term))).filter(q=>{const time=Date.parse(state.favorites[canonical(q)]);return (!cutoff||time>=cutoff)&&(!favorites.from||favorites.range!=='custom'||localDay(time)>=favorites.from)&&(!favorites.to||favorites.range!=='custom'||localDay(time)<=favorites.to);}).sort((a,b)=>state.favorites[canonical(a)].localeCompare(state.favorites[canonical(b)])*(favorites.sort==='new'?-1:1));
 }
 function listContext(origin){
  if(origin==='favorites')return {ids:favoriteRows().map(q=>q.id),name:'收藏本练习',filters:{...favorites}};
  if(origin==='mastery')return {ids:questions(map).filter(mapMatch).map(q=>q.id),name:'掌握地图筛选练习',filters:JSON.parse(JSON.stringify(map))};
  if(origin==='knowledge'){const ch=orderedStudyChapters().find(ch=>ch.knowledge.some(k=>k.id===graph.topic)),k=ch?.knowledge.find(k=>k.id===graph.topic);return {ids:(k?.questionIds||[]).filter(id=>DATA.byId[id]?.playable!==false&&category(DATA.byId[id],graph.category)),name:k?.name||'知识点练习',filters:{...graph}};}
  if(origin==='retest')return {ids:state.session?.ids||[],name:'本轮复测题目',filters:{...review}};
  return null;
 }
 function practiceIds(ids){const seen=new Set();return ids.filter(id=>{const q=DATA.byId[id],key=canonical(q);if(!q||q.playable===false||seen.has(key))return false;seen.add(key);return true;});}
 function startPractice(ids,name,selectedId){
  const playable=practiceIds(ids);if(!playable.length)return;
  const origin=mode(),source=listContext(origin),returnHash=origin?toolHash(origin):'',scope={type:'list',ids:playable,name,origin,returnHash,filters:source?.filters||{}};
  questionReturn=origin;questionReturnHash=returnHash;cleanup();window.EnglishExams?.leave();location.hash='/bank';ui.statusFilter='all';ui.scope=scope;ui.choiceQuestionId=null;ui.choiceChecked=false;ui.choicePick={};reselect({keepQuestionId:selectedId||playable[0]});savePrefs();closeNav();reflect();
 }
 function roundAssessed(result){return !!result&&['known','shaky','unknown'].includes(result.status);}
 function roundMastered(result){return roundAssessed(result)&&result.status==='known';}
 function roundLabel(result){return !result?'未作答':!roundAssessed(result)?'未评价':label[result.status];}

 function candidates(filter=review){const seen=new Set();return questions(filter).filter(q=>{const id=canonical(q);if(seen.has(id)||q.playable===false||state.plans[id]?.finished)return false;
  if(filter.dueOnly&&state.schedules[id]&&!isDue(id))return false;
  const matches=filter.source==='unknown'?status(q)==='unknown':filter.source==='shaky'?status(q)==='shaky':filter.source==='wrong'?!!state.mistakes[id]:['unknown','shaky'].includes(status(q))||!!state.schedules[id];
  if(matches)seen.add(id);return matches;});}
 function startRetestSession(ids,name,selectedId){
  const playable=practiceIds(ids);if(!playable.length)return;
  const begin=()=>{state.session={ids:playable,index:Math.max(0,playable.indexOf(selectedId)),picks:{},drafts:{},results:{},name,date:new Date().toISOString(),finished:false};persist();open('retest');};
  if(state.session&&!state.session.finished){
   if(replaceDialog?.open)return;replaceDialog=node('dialog','study-confirm');replaceDialog.setAttribute('aria-labelledby','retest-replace-title');
   const title=node('h2',null,'替换当前复测？');title.id='retest-replace-title';replaceDialog.append(title,node('p',null,'当前一轮已提交 '+Object.keys(state.session.results).length+' / '+state.session.ids.length+' 题。重新安排会替换本轮进度，收藏与掌握状态不受影响。'),btn('保留本轮',()=>replaceDialog.close()),btn('确认重新开始',()=>{replaceDialog.close();begin();},'study-button study-primary'));
   replaceDialog.addEventListener('close',()=>replaceDialog.remove(),{once:true});document.body.append(replaceDialog);replaceDialog.showModal();return;
  }begin();
 }
 function startRetest(){
  let ids=candidates().map(q=>q.id);if(review.shuffle){for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}}else ids.sort((a,b)=>(Date.parse(state.schedules[canonical(DATA.byId[a])])||0)-(Date.parse(state.schedules[canonical(DATA.byId[b])])||0));
  startRetestSession(ids.slice(0,review.limit),'错题复测');
 }
 function renderRetest(){
  heading('错题复测','到期题集中复测，未来计划可提前查看；在普通刷题中评价也会更新计划。');
  if(state.session&&!state.session.finished){if(state.session.paused)renderSetupPaused();else renderSession();return;}
  if(state.session?.finished)renderSummary();
  renderPlanQueue();
 }
 function renderSession(){
  const s=state.session,q=DATA.byId[s.ids[s.index]],result=s.results[q.id],keys=choiceAnswerKeys(q),auto=keys.length>0;
  window.OpticsDashboard?.retestPosition(s);
  const nav=node('div','study-session-nav'),progress=node('progress');progress.max=s.ids.length;progress.value=Object.values(s.results).filter(roundAssessed).length;progress.setAttribute('aria-label','已评价 '+Object.values(s.results).filter(roundAssessed).length+' / '+s.ids.length+' 题');
  nav.append(node('strong',null,s.name+'　'+(s.index+1)+' / '+s.ids.length),progress,btn('返回复测列表',()=>{s.paused=true;persist();renderHub();},'study-button study-muted'),btn('退出本轮',confirmExit,'study-button study-muted'));root.append(nav);
  const timer=node('div','study-session-timer');root.append(timer);window.ExamTimer?.attach('retest:'+s.date,timer);timer.querySelector('.exam-timer')?.setAttribute('aria-label','复测计时');
  const card=node('article','study-panel retest-card');card.dataset.question=q.id;
  const meta=node('div','study-grid-head');meta.append(node('span','study-muted',context(q)),renderQuestionSource(q),btn(favorite(q)?'★ 已收藏':'☆ 收藏',()=>toggleFavorite(q),'study-button'),btn('题目笔记',()=>window.OpticsNotes?.open(q.id,true),'study-button'));card.append(meta);
  const duplicate=duplicateMarker(q);if(duplicate)card.append(duplicate);
  if(q.review?.needsCheck)card.append(node('p','study-warning','本题答案或条件仍待核对；按参考答案自评，暂不自动判分。'));
  const stem=node('div','stem');renderBlocks(questionContentBlocks(q.stem),stem);card.append(stem);
  (q.stemImages||[]).forEach(im=>card.append(figureNode(im.src,im.alt||im.caption||'')));
  if(q.options?.length){
   const options=node('div','options retest-options'+(q.options.some(o=>displayOptionText(o).length>26)?'':' cols-2'));
   const picked=String(s.picks[q.id]||'').split('');
   q.options.forEach(o=>{const b=btn('',()=>{
    let picks=String(s.picks[q.id]||'').split('').filter(Boolean);if(isMultipleChoice(q)){picks=picks.includes(o.key)?picks.filter(k=>k!==o.key):picks.concat(o.key);}else picks=picks.includes(o.key)?[]:[o.key];s.picks[q.id]=picks.sort().join('');persist();renderHub();
   },'option');b.dataset.optionKey=o.key;b.setAttribute('aria-pressed',String(picked.includes(o.key)));b.disabled=!!result;
    b.setAttribute('data-verdict',result&&auto?(keys.includes(o.key)?'correct':picked.includes(o.key)?'wrong':''):'');b.append(node('span','option-key',o.key));const text=node('span','option-text');if(o.blocks?.some(b=>b.k==='image'))renderBlocks(o.blocks,text);else renderInline(displayOptionText(o),text);b.append(text);options.append(b);
   });card.append(options);if(isMultipleChoice(q))card.append(node('p','study-muted','多选题 · 提交前可反复调整选项'));
  }
  if(!auto){
   const area=node('textarea','study-draft');area.placeholder='先写下思路或答案，再查看参考答案自评';area.setAttribute('aria-label','复测思路或答案');area.value=s.drafts[q.id]||'';area.disabled=!!result;area.oninput=()=>{s.drafts[q.id]=area.value;persist();};card.append(area);
  }
  const live=node('p','study-result');live.id='retest-message';live.setAttribute('role','status');card.append(live);
  if(!result){
   const submit=btn(auto?'提交答案':'完成作答 · 对照答案',()=>{
    const pick=s.picks[q.id]||'';if(auto&&!validChoiceSelection(q,pick)){live.textContent='请先选择答案。';return;}
    s.results[q.id]={kind:auto?'objective':'manual',correct:auto?pick.split('').sort().join('')===keys.slice().sort().join(''):null,status:''};
    if(auto){const id=canonical(q);if(s.results[q.id].correct)delete state.mistakes[id];else state.mistakes[id]=new Date().toISOString();}
    persist();renderHub();
   },'study-button study-primary');card.append(submit);
  }else{
   live.dataset.verdict=result.kind==='objective'?(result.correct?'correct':'wrong'):'';
   live.textContent=result.kind==='objective'?(result.correct?'回答正确。':'回答错误。正确选项：'+keys.join('、')):'请对照参考答案和解析，评估自己的掌握情况。';
   const answers=node('section','study-solution');answers.append(node('h2',null,'参考答案'));renderBlocks(questionContentBlocks(answerContentBlocks(q.answer||[],q)),answers);
   const analysis=node('details','study-solution');analysis.append(node('summary',null,'展开解析与知识点'));const content=node('div');renderBlocks(questionContentBlocks(q.analysis||[]),content);(q.analysisImages||[]).forEach(im=>content.append(figureNode(im.src,im.alt||im.caption||'')));analysis.append(content);card.append(answers,analysis);
   const assessment=node('div','study-assessment');assessment.append(node('span','study-muted','更新掌握状态：'));
   ['known','shaky','unknown'].forEach(value=>{const b=btn(symbol[value]+' '+label[value]+assessmentCaption(q,value),()=>{result.status=value;const id=canonical(q);if(value==='known')delete state.mistakes[id];persist();setStatus(statusKeyOf(q),value);renderHub();},'study-button');b.dataset.status=value;b.setAttribute('aria-pressed',String(result.status===value));assessment.append(b);});card.append(assessment);
   if(state.plans[canonical(q)]?.lastDate===localDay())assessment.append(btn('撤销本次评价',()=>{undoAssessment(q);result.status='';persist();renderHub();},'study-button study-muted'));
   if(state.schedules[canonical(q)])card.append(node('p','study-muted','下次复测：'+new Date(state.schedules[canonical(q)]).toLocaleDateString('zh-CN')));
  }
  root.append(card);
  const pager=node('div','study-session-pager'),prev=btn('← 上一题',()=>{s.index--;persist();renderHub();by('scroller').scrollTop=0;}),next=btn(s.index===s.ids.length-1?'查看本轮结果':'下一题 →',()=>{
   if(!roundAssessed(result)){live.textContent='请先评价掌握程度，再进入下一题。';return;}
   if(s.index===s.ids.length-1){if(s.ids.some(id=>!roundAssessed(s.results[id]))){s.index=s.ids.findIndex(id=>!roundAssessed(s.results[id]));}else{s.finished=true;addHistory();}}else s.index++;persist();renderHub();by('scroller').scrollTop=0;
  });prev.disabled=s.index===0;next.disabled=!roundAssessed(result);pager.append(prev,next);root.append(pager);
 }
 function confirmExit(){
  let panel=by('retest-exit-confirm');if(panel){panel.focus();return;}
  panel=node('div','study-panel study-warning');panel.id='retest-exit-confirm';panel.tabIndex=-1;
  panel.append(node('p',null,'本轮进度会保留。可以暂时返回设置，稍后继续；重新开始会替换当前这一轮。'),btn('继续本轮',()=>panel.remove()),btn('暂时离开',()=>{state.session.paused=true;persist();renderSetupPaused();}),btn('结束并查看结果',()=>{state.session.finished=true;addHistory();persist();renderHub();}));root.prepend(panel);panel.focus();
 }
 function renderSetupPaused(){
  window.ExamTimer?.detach();
  const s=state.session;root.replaceChildren();heading('错题复测','本轮进度已保留，可随时继续。');
  const panel=node('section','study-panel');panel.append(node('h2',null,'已暂停 · '+Object.keys(s.results).length+' / '+s.ids.length+' 题'),btn('继续本轮',()=>{s.paused=false;persist();renderHub();},'study-button study-primary'),btn('重新安排一轮',()=>{s.finished=true;persist();renderHub();}));root.append(panel);renderPlanQueue();
 }
 function summary(){
  const s=state.session,rows=s.ids.map(id=>s.results[id]).filter(Boolean),objective=rows.filter(r=>r.kind==='objective'),manual=rows.filter(r=>r.kind==='manual');
  return {date:s.date,total:s.ids.length,assessed:rows.filter(roundAssessed).length,masteredTotal:rows.filter(roundMastered).length,submitted:rows.length,objective:objective.length,correct:objective.filter(r=>r.correct).length,manual:manual.length,mastered:manual.filter(r=>r.status==='known').length};
 }
 function addHistory(){const row=summary();if(!state.history.some(h=>h.date===row.date))state.history.push(row);state.history=state.history.slice(-20);}
 function renderSummary(){
  const s=state.session,row=summary(),panel=node('section','study-panel');panel.append(node('h2',null,'本轮结果'),node('p',null,'客观题：'+row.correct+' / '+row.objective+' 正确'),node('p',null,'掌握评价：'+row.assessed+' / '+row.total+' 题 · 会做 '+row.masteredTotal+' 题 · 待巩固 '+(row.total-row.masteredTotal)+' 题'),node('p',null,'未提交：'+(row.total-row.submitted)+' 题'));
  const remaining=s.ids.filter(id=>!roundMastered(s.results[id]));
  const again=btn('复测本轮未掌握 '+remaining.length+' 题',()=>startRetestSession(remaining,'本轮未掌握复测'));again.disabled=!remaining.length;panel.append(again);
  const list=node('div','study-result-list');s.ids.forEach((id,i)=>{const r=s.results[id],q=DATA.byId[id],b=btn((i+1)+' · '+q.number+' · '+roundLabel(r)+(r?.kind==='objective'?' · '+(r.correct?'作答正确':'作答错误'):''),()=>openQuestion(q,'retest'),'study-chip');b.dataset.status=roundAssessed(r)?r.status:'none';list.append(b);});panel.append(list);root.append(panel);
 }
 function createFavorites(){
  dialog=node('dialog','question-notes-dialog favorites-dialog');dialog.id='favorites-dialog';dialog.setAttribute('aria-labelledby','favorites-title');
  const panel=node('div','notes-panel'),head=node('div','notes-head');dialogTitle=node('h2',null,'收藏本');dialogTitle.id='favorites-title';
  head.append(dialogTitle,btn('×',()=>dialog.close(),'notes-close'));head.lastChild.setAttribute('aria-label','关闭收藏本');dialogBody=node('div','notes-body');panel.append(head,dialogBody);dialog.append(panel);document.body.append(dialog);
  dialog.addEventListener('close',()=>favoriteFocus?.focus({preventScroll:true}));dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 }
 function openFavorites(){open('favorites');}
 function favoriteList(){
  dialogTitle.textContent='收藏本';dialogBody.replaceChildren();
  dialogBody.append(node('p','notes-description','共 '+Object.keys(state.favorites).length+' 道收藏 · 按收藏时间排列 · 当前账号本机保存'));
  const controls=node('div','study-form-row'),search=node('input','study-search');search.type='search';search.placeholder='搜索收藏题目';search.setAttribute('aria-label','搜索收藏题目');search.value=favoriteSearch;
  const filter=node('select');[['all','全部状态'],['none','未标记'],['known','会做'],['shaky','不熟练'],['unknown','不会做']].forEach(([value,name])=>{const o=node('option',null,name);o.value=value;filter.append(o);});filter.value=favoriteFilter;filter.setAttribute('aria-label','收藏题掌握状态');
  const list=node('div','notes-list');function fill(){
   list.replaceChildren();const rows=Object.entries(state.favorites).sort((a,b)=>b[1].localeCompare(a[1])).filter(([id])=>{const q=DATA.byId[id];return q&&(favoriteFilter==='all'||status(q)===favoriteFilter)&&(!favoriteSearch||(context(q)+' '+textOf(q)).toLowerCase().includes(favoriteSearch.toLowerCase()));});
   rows.forEach(([id,date])=>{const q=DATA.byId[id],b=btn('',()=>{selectedFavorite=id;favoriteDetail();},'notes-list-item');b.append(node('strong',null,context(q)),node('div','notes-preview',textOf(q).slice(0,150)),node('span','study-muted',label[status(q)]+' · '+new Date(date).toLocaleDateString('zh-CN')));list.append(b);});
   if(!rows.length)list.append(node('p','study-empty',Object.keys(state.favorites).length?'没有符合筛选的收藏。':'暂无收藏。在题目底部点击“☆ 收藏”即可加入。'));
  }search.oninput=()=>{favoriteSearch=search.value;fill();};filter.onchange=()=>{favoriteFilter=filter.value;fill();};controls.append(search,filter);dialogBody.append(controls,list);fill();
  const io=node('div','notes-actions');io.append(btn('导出收藏',exportFavorites));const input=node('input');input.type='file';input.accept='.json,application/json';input.hidden=true;input.onchange=async()=>{
   try{const file=input.files[0];if(!file)return;if(file.size>1000000)throw Error('收藏备份不能超过 1 MB');const data=JSON.parse(await file.text());if(data.format!=='optics-favorites/v1'||!data.favorites||typeof data.favorites!=='object'||Array.isArray(data.favorites))throw Error('不是收藏本备份');
    let imported=0;Object.entries(data.favorites).forEach(([id,date])=>{if(DATA.byId[id]&&!state.favorites[id]&&typeof date==='string'&&Number.isFinite(Date.parse(date))){state.favorites[id]=date;imported++;}});persist();reflect();favoriteList();dialogBody.prepend(node('p','study-result','已导入 '+imported+' 道收藏，不覆盖已有记录。'));
   }catch(e){dialogBody.prepend(node('p','study-warning',e.message));}finally{input.value='';}
  };io.append(btn('导入收藏',()=>input.click()),input);dialogBody.append(io);if(storageError)dialogBody.prepend(node('p','study-warning',storageError));
 }
 function favoriteDetail(){
  const q=DATA.byId[selectedFavorite];if(!q){selectedFavorite='';favoriteList();return;}
  dialogTitle.textContent='收藏题目';dialogBody.replaceChildren();dialogBody.append(btn('← 返回收藏本',()=>{selectedFavorite='';favoriteList();},'study-button study-muted'),node('p','notes-description',context(q)));
  const stem=node('div','stem');renderBlocks(questionContentBlocks(q.stem),stem);dialogBody.append(stem);
  dialogBody.append(renderQuestionSource(q));if(q.review?.needsCheck)dialogBody.append(node('p','study-warning','本题仍有待核对内容，请同时查看题目来源及注解。'));
  if(q.options?.length){const options=node('div','favorite-options');q.options.forEach(o=>{const p=node('p');p.append(node('strong',null,o.key+'　'));renderInline(displayOptionText(o),p);options.append(p);});dialogBody.append(options);}
  (q.stemImages||[]).forEach(im=>dialogBody.append(figureNode(im.src,im.alt||im.caption||'')));
  const answer=node('details','study-solution');answer.append(node('summary',null,'查看答案与解析'));answer.addEventListener('toggle',()=>{if(!answer.open||answer.dataset.loaded)return;answer.dataset.loaded='true';const body=node('div');body.append(node('h3',null,'答案'));renderBlocks(questionContentBlocks(answerContentBlocks(q.answer||[],q)),body);body.append(node('h3',null,'解析'));renderBlocks(questionContentBlocks(q.analysis||[]),body);(q.analysisImages||[]).forEach(im=>body.append(figureNode(im.src,im.alt||im.caption||'')));answer.append(body);});dialogBody.append(answer);
  const actions=node('div','notes-actions');actions.append(btn('去刷这道题 →',()=>openQuestion(q,''),'study-button study-primary'),btn(favorite(q)?'★ 取消收藏':'☆ 加入收藏',()=>toggleFavorite(q)));dialogBody.append(actions);
 }
 function exportFavorites(){
  const blob=new Blob([JSON.stringify({format:'optics-favorites/v1',exportedAt:new Date().toISOString(),favorites:state.favorites},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='光学收藏本-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function selectControl(label,items,value,change){
  const wrap=node('label','flow-field');wrap.append(node('span',null,label));const input=node('select');input.setAttribute('aria-label',label);
  items.forEach(([v,t])=>{const o=node('option',null,t);o.value=v;input.append(o);});input.value=value;input.onchange=()=>change(input.value);wrap.append(input);return wrap;
 }
 function questionPreview(q,actions=[]){
  const item=node('article','flow-question-row');item.dataset.question=q.id;
  const summary=node('div','flow-question-head');summary.append(node('strong',null,context(q)),node('span','flow-status',label[status(q)]));item.append(summary);
  const duplicate=duplicateMarker(q);if(duplicate){item.classList.add('has-cross-duplicate');item.append(duplicate);}
  const details=node('details','flow-question-preview');const title=node('summary');const text=node('span');renderInline(textOf(q).slice(0,190),text);title.append(text,node('span','study-muted','展开题目'));details.append(title);
  details.addEventListener('toggle',()=>{if(!details.open||details.dataset.loaded)return;details.dataset.loaded='true';const stem=node('div','stem');renderBlocks(questionContentBlocks(q.stem),stem);details.append(stem);(q.stemImages||[]).forEach(im=>details.append(figureNode(im.src,im.alt||im.caption||'')));});item.append(details);
  const bar=node('div','flow-row-actions');actions.forEach(b=>bar.append(b));item.append(bar);return item;
 }
 function renderFavorites(){
  const head=heading('收藏本','收藏题目按分类和时间集中复习，筛选结果可直接开始练习。');
  const panel=node('section','study-panel');categories(panel,favorites,()=>{favorites.page=0;renderHub();});chapters(panel,favorites,()=>{favorites.page=0;renderHub();});
  const controls=node('div','flow-controls');const input=node('input','study-search');input.type='search';input.placeholder='搜索收藏题目或知识点';input.setAttribute('aria-label','搜索收藏题目');input.value=favorites.search;
  input.oninput=()=>{favorites.search=input.value;favorites.page=0;fill();};controls.append(input);
  controls.append(selectControl('收藏时间',[['all','全部时间'],['7','近 7 天'],['30','近 30 天'],['90','近 90 天'],['custom','自定义日期']],favorites.range,v=>{favorites.range=v;favorites.page=0;renderHub();}),selectControl('排序',[['new','新到旧'],['old','旧到新']],favorites.sort,v=>{favorites.sort=v;favorites.page=0;fill();}));panel.append(controls);
  if(favorites.range==='custom'){
   const dates=node('div','flow-controls');[['from','开始日期'],['to','结束日期']].forEach(([key,name])=>{const field=node('label','flow-field');field.append(node('span',null,name));const d=node('input');d.type='date';d.value=favorites[key];d.setAttribute('aria-label','收藏'+name);d.onchange=()=>{favorites[key]=d.value;favorites.page=0;fill();};field.append(d);dates.append(field);});panel.append(dates);
  }
  const overview=node('div','flow-collection-summary'),list=node('div','flow-question-list'),pager=node('div','flow-pager');panel.append(overview,list,pager);root.append(panel);
  function fill(){
   const rows=favoriteRows();
   overview.replaceChildren();const known=rows.filter(q=>status(q)==='known').length;overview.append(node('p',null,'我的收藏 · '+rows.length+' 题 · 掌握 '+known+' · 待巩固 '+rows.filter(q=>['shaky','unknown'].includes(status(q))).length));const progress=node('progress');progress.max=rows.length||1;progress.value=known;progress.setAttribute('aria-label','收藏题掌握进度');overview.append(progress);
   const start=btn('开始练习',()=>startPractice(rows.map(q=>q.id),'收藏本练习'),'study-button study-primary'),random=btn('随机选题',()=>openQuestion(rows[Math.floor(Math.random()*rows.length)],'favorites'));start.disabled=random.disabled=!rows.length;overview.append(start,random,btn('清除筛选',()=>{favorites={category:'all',chapter:'',search:'',range:'all',sort:'new',page:0,from:'',to:''};renderHub();}));
   list.replaceChildren();const pages=Math.max(1,Math.ceil(rows.length/12));favorites.page=Math.min(favorites.page,pages-1);
   rows.slice(favorites.page*12,(favorites.page+1)*12).forEach(q=>{const row=questionPreview(q,[btn('查看详情 / 去练习',()=>openQuestion(q,'favorites'),'study-button study-primary'),btn('取消收藏',()=>{toggleFavorite(q);},'study-button study-muted')]);row.append(node('time','study-muted','收藏时间：'+new Date(state.favorites[canonical(q)]).toLocaleString('zh-CN')));list.append(row);});
   if(!rows.length)list.append(node('p','study-empty','当前分类或时间范围内没有收藏。可清除筛选，或在题目中点击收藏。'));
   pager.replaceChildren();const prev=btn('上一页',()=>{favorites.page--;fill();}),next=btn('下一页',()=>{favorites.page++;fill();});prev.disabled=favorites.page===0;next.disabled=favorites.page>=pages-1;pager.append(prev,node('span',null,(favorites.page+1)+' / '+pages),next);
   history.replaceState(null,'',toolHash('favorites'));
  }fill();head.append(btn('导出收藏',exportFavorites),btn('导入收藏',importFavorites));
 }
 function importFavorites(){
  const input=node('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{const file=input.files[0];if(!file)return;if(file.size>1000000)throw Error('备份文件不能超过 1 MB');const data=JSON.parse(await file.text());if(data.format!=='optics-favorites/v1'||!data.favorites||typeof data.favorites!=='object'||Array.isArray(data.favorites))throw Error('不是有效的收藏本备份');let count=0;for(const [id,date] of Object.entries(data.favorites))if(DATA.byId[id]&&!state.favorites[id]&&typeof date==='string'&&Number.isFinite(Date.parse(date))){state.favorites[id]=date;count++;}persist();renderHub();announce('已导入 '+count+' 道收藏。');}catch(e){announce(e.message);window.alert(e.message);}};input.click();
 }
 function renderKnowledgeDetail(){
  const chapter=orderedStudyChapters().find(ch=>ch.knowledge.some(k=>k.id===graph.topic)),topic=chapter?.knowledge.find(k=>k.id===graph.topic);
  if(!topic){graph.topic='';location.hash=toolHash('knowledge').slice(1);return;}
  const ids=topic.questionIds.filter(id=>DATA.byId[id]?.playable!==false&&category(DATA.byId[id],graph.category)),qs=ids.map(id=>DATA.byId[id]);
  const head=heading(topic.name,chapter.num+' '+chapter.title);head.append(btn('← 返回知识点',()=>{graph.topic='';location.hash=toolHash('knowledge').slice(1);}),btn('开始知识点练习',()=>startPractice(ids,topic.name),'study-button study-primary'));
  const tabs=node('div','flow-tabs');[['questions','题目（'+qs.length+'）'],['explain','讲解与笔记']].forEach(([v,t])=>{const b=btn(t,()=>{graph.tab=v;renderHub();},'study-chip');b.setAttribute('aria-pressed',String(graph.tab===v));tabs.append(b);});root.append(tabs);
  const panel=node('section','study-panel');root.append(panel);
  if(graph.tab==='questions'){qs.forEach(q=>panel.append(questionPreview(q,[btn('练习这道题',()=>openQuestion(q,'knowledge'),'study-button')])));return;}
  panel.append(node('h2',null,'本知识点的复习资料'),node('p',null,'查看对应章节的电子笔记，或展开题库解析复习具体方法。'),btn('打开章节电子笔记',()=>window.OpticsElectronicNotes?.openByChapter(chapter.id),'study-button'));
  const formulas=[...new Set(qs.flatMap(q=>q.knowledge?.formulas||[]))],pitfalls=[...new Set(qs.flatMap(q=>q.knowledge?.pitfalls||[]))];
  if(formulas.length){panel.append(node('h3',null,'相关公式'));formulas.forEach(f=>{const p=node('div');renderBlocks([typeof f==='string'?{k:'p',x:f}:f],p);panel.append(p);});}
  if(pitfalls.length){panel.append(node('h3',null,'易错点'));pitfalls.forEach(t=>{const p=node('div');renderBlocks([typeof t==='string'?{k:'p',x:t}:t],p);panel.append(p);});}
  qs.slice(0,8).forEach(q=>{const details=node('details','study-solution');details.append(node('summary',null,(q.year?q.year+' 年真题 · ':'')+q.number+' · 答案与解析'));details.addEventListener('toggle',()=>{if(!details.open||details.dataset.loaded)return;details.dataset.loaded='true';const text=node('div');renderBlocks(questionContentBlocks(answerContentBlocks(q.answer||[],q)),text);renderBlocks(questionContentBlocks(q.analysis||[]),text);details.append(text);});panel.append(details);});
 }
 function exportMastery(qs){
  const canvas=document.createElement('canvas');canvas.width=1120;canvas.height=420+Math.ceil(qs.length/50)*20;const c=canvas.getContext('2d');c.fillStyle='#f6f0e3';c.fillRect(0,0,1120,860);c.fillStyle='#2d2a23';c.font='bold 40px Microsoft YaHei';c.fillText('工程光学 · 掌握卡',55,85);c.font='20px Microsoft YaHei';c.fillText(new Date().toLocaleDateString('zh-CN')+' · '+qs.length+' 题',55,128);
  const colors={none:'#bcb6ab',known:'#24764e',shaky:'#ac672d',unknown:'#a43e32'};
  ['none','known','shaky','unknown'].forEach((s,i)=>{const x=55+i*260;c.fillStyle=colors[s];c.fillRect(x,175,15,15);c.fillStyle='#2d2a23';c.font='18px Microsoft YaHei';c.fillText(label[s]+' '+qs.filter(q=>status(q)===s).length,x+24,191);});
  qs.forEach((q,i)=>{const x=55+(i%50)*20,y=235+Math.floor(i/50)*20;c.fillStyle=colors[status(q)];c.fillRect(x,y,15,15);});c.fillStyle='#2d2a23';c.font='24px Microsoft YaHei';c.fillText('掌握率 '+(qs.length?Math.round(qs.filter(q=>status(q)==='known').length/qs.length*100):0)+'%',55,canvas.height-95);c.font='18px Microsoft YaHei';c.fillText('专注一道题，理解一个知识点',55,canvas.height-55);
  canvas.toBlob(blob=>{const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='工程光学-掌握卡-'+localDay()+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 }
 function localDay(stamp=Date.now()){const d=new Date(stamp);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
 function dueAfter(days){const d=new Date();d.setDate(d.getDate()+days);d.setHours(0,0,0,0);return d.toISOString();}
 function isDue(id){return !state.schedules[id]||localDay(Date.parse(state.schedules[id]))<=localDay();}
 function nextInterval(q,level){const p=state.plans[canonical(q)],base=p?.lastDate===localDay()?p.prior:p;return level==='known'?14:({unknown:[1,3,7],shaky:[2,5,10]}[level][Math.min(base?.step||0,2)]);}
 function assessmentCaption(q,level){
  const id=canonical(q),p=state.plans[id],same=p?.lastDate===localDay(),base=same?p.prior:p;
  if(p&&!same&&!isDue(id))return '（保留原计划）';
  if(level==='known'&&base?.level==='known'&&(same||isDue(id)))return '（结束复测）';
  if(!p&&level==='known'&&!['shaky','unknown'].includes(status(q)))return '（无需复测）';
  return '（+'+(!base&&level!=='known'?1:nextInterval(q,level))+' 天）';
 }
 function recordAssessment(q,level){
  const id=canonical(q),today=localDay(),stored=state.plans[id];
  if(!['known','unknown','shaky'].includes(level)){delete state.plans[id];delete state.schedules[id];persist();return;}
  if(!stored&&!state.schedules[id]&&level==='known'&&!['shaky','unknown'].includes(status(q)))return;
  const same=stored?.lastDate===today,base=same?stored.prior:stored?JSON.parse(JSON.stringify(stored)):null;
  if(stored&&!same&&!isDue(id))return;
  if(base)delete base.prior;
  const priorStatus=same?stored.beforeStatus:status(q);
  if(level==='known'&&base?.level==='known'&&localDay(Date.parse(base.due))<=today){
   state.plans[id]={level:'known',step:base.step,due:base.due,lastDate:today,prior:base,beforeStatus:priorStatus,finished:true};delete state.schedules[id];
  }else{
   const initial=!base,days=initial&&level!=='known'?1:nextInterval(q,level),step=initial?0:(base.step||0)+1;
   const plan={level,step,due:dueAfter(days),lastDate:today,prior:base,beforeStatus:priorStatus,finished:false};state.plans[id]=plan;state.schedules[id]=plan.due;
  }persist();
 }
 function undoAssessment(q){const id=canonical(q),p=state.plans[id];if(!p||p.lastDate!==localDay())return;if(p.prior){state.plans[id]=p.prior;if(p.prior.finished)delete state.schedules[id];else state.schedules[id]=p.prior.due;}else{delete state.plans[id];delete state.schedules[id];}originalStatus(statusKeyOf(q),p.beforeStatus==='none'?'':p.beforeStatus);window.OpticsDashboard?.undo(id);persist();}
 function renderPlanQueue(){
  const panel=node('section','study-panel');categories(panel,review,renderHub);chapters(panel,review,renderHub);
  const tabs=node('div','flow-tabs');[['due','待复测'],['future','未来计划'],['all','我的复测']].forEach(([v,t])=>{const b=btn(t,()=>{planFilter.view=v;renderHub();},'study-chip');b.setAttribute('aria-pressed',String(planFilter.view===v));tabs.append(b);});panel.append(tabs);
  const controls=node('div','flow-controls');controls.append(selectControl('复测排序',[['due','最早到期优先'],['recent','最近错题优先']],planFilter.sort,v=>{planFilter.sort=v;renderHub();}),selectControl('掌握等级',[['all','全部'],['unknown','不会做'],['shaky','不熟练'],['known','已掌握，待确认']],planFilter.level,v=>{planFilter.level=v;renderHub();}));panel.append(controls);
  const rows=questions(review).filter(q=>q.playable!==false&&(!state.plans[canonical(q)]?.finished)&&(state.schedules[canonical(q)]||['shaky','unknown'].includes(status(q)))).filter(q=>planFilter.level==='all'||status(q)===planFilter.level).filter(q=>planFilter.view==='all'||(planFilter.view==='due'?isDue(canonical(q)):!isDue(canonical(q)))).sort((a,b)=>{
   const x=canonical(a),y=canonical(b);return planFilter.sort==='recent'?(state.plans[y]?.lastDate||state.mistakes[y]||'').localeCompare(state.plans[x]?.lastDate||state.mistakes[x]||''):(Date.parse(state.schedules[x])||0)-(Date.parse(state.schedules[y])||0);
  });
  const due=rows.filter(q=>isDue(canonical(q))),actions=node('div','flow-controls');actions.append(node('strong',null,rows.length+' 题 · 已到期 '+due.length));const start=btn('开始复测已到期题目',()=>startRetestSession(due.map(q=>q.id),'到期错题复测'),'study-button study-primary'),random=btn('随机选题',()=>startRetestSession(due.map(q=>q.id),'到期错题复测',due[Math.floor(Math.random()*due.length)]?.id));start.disabled=random.disabled=!due.length;actions.append(start,random);panel.append(actions);
  const rules=node('details','study-solution');rules.append(node('summary',null,'错题复测规则'),node('p',null,'首次标记不会做或不熟练，明天进入计划。到期后，不会做按 1、3、7 天，不熟练按 2、5、10 天安排；掌握后 14 天再确认，仍掌握则结束。未到期时评价不推进计划；当天改评不重复增加次数。移出计划不会改变掌握状态。'));panel.append(rules);
  rows.forEach(q=>{const id=canonical(q),stamp=state.schedules[id],time=stamp?localDay(Date.parse(stamp)):'待安排';const row=questionPreview(q,[btn('练习这道题',()=>startRetestSession(isDue(canonical(q))?due.map(q=>q.id):[q.id],'错题复测',q.id),'study-button'),btn('移出计划',()=>{if(!window.confirm('移出复测计划？当前掌握状态会保留。'))return;state.plans[id]={level:status(q)==='none'?'unknown':status(q),step:0,due:stamp||new Date().toISOString(),finished:true};delete state.schedules[id];delete state.mistakes[id];persist();renderHub();},'study-button study-muted')]);row.append(node('p','study-muted','下次复测：'+time+(isDue(id)?' · 已到期':' · 未到期')));panel.append(row);});
  if(!rows.length)panel.append(node('p','study-empty',planFilter.view==='future'?'暂无未到期的复测计划。':'当前筛选下没有待复测题目。可查看未来计划，或在做题时标记不熟练、不会做。'));root.append(panel);
 }

 const originalRender=window.render;
 const originalBuildScope=window.buildScopeIds;
 window.buildScopeIds=function(){originalBuildScope.apply(this,arguments);if(ui.scope.studyCategory&&ui.scope.studyCategory!=='all')ui.scopeIds=ui.scopeIds.filter(id=>category(DATA.byId[id],ui.scope.studyCategory));};
 window.render=function(){if(attached&&mode()){renderHub();return;}if(attached)cleanup();originalRender.apply(this,arguments);if(attached)reflect();};
 const originalScope=window.setScope;
 window.setScope=function(){if(attached&&mode()){location.hash='/bank';cleanup();snapshot=null;questionReturn='';}return originalScope.apply(this,arguments);};
 const originalFilter=window.setStatusFilter;
 window.setStatusFilter=function(){if(attached&&mode()){location.hash='/bank';cleanup();snapshot=null;questionReturn='';}return originalFilter.apply(this,arguments);};
 const originalStatus=window.setStatus;
 window.setStatus=function(id,value){if(attached){const q=DATA.questions.find(q=>statusKeyOf(q)===id);if(q)recordAssessment(q,value);}return originalStatus.apply(this,arguments);};
 const originalFeedback=window.applyChoiceFeedback;
 window.applyChoiceFeedback=function(q,opts){originalFeedback.apply(this,arguments);if(!attached||q.playable===false||isMultipleChoice(q)&&!ui.choiceChecked)return;const picked=selectedChoiceKeys(q),keys=choiceAnswerKeys(q);if(keys.length&&picked.some(k=>!keys.includes(k))){const id=canonical(q);state.mistakes[id]=new Date().toISOString();persist();reflect();}};
 function attach(){
  if(attached)return;owner=window.OpticsAuth?.user?.id||null;load();seedSync();root=by('study-hub');createFavorites();attached=true;window.OpticsToolsCloud?.attach(()=>state.syncEntries,receiveToolsCloud);if(mode())readToolRoute();
  ['favorites-open','notes-library-open'].forEach(id=>by(id).removeAttribute('aria-haspopup'));by('favorites-open').removeAttribute('aria-controls');
  by('favorites-open').onclick=openFavorites;by('btn-favorite').onclick=()=>toggleFavorite(currentQuestion());by('btn-study-return').onclick=()=>{if(questionReturnHash)location.hash=questionReturnHash;else open(questionReturn);};
  ['mastery','knowledge','retest'].forEach(m=>by(m+'-open').onclick=()=>open(m));
  const undo=btn('撤销本次评价',()=>{const q=currentQuestion();if(q){undoAssessment(q);render();}},'btn btn-ghost');undo.id='btn-undo-plan';undo.hidden=true;by('btn-study-return').after(undo);
  const live=node('span','study-live');live.id='study-announcement';live.setAttribute('role','status');document.body.append(live);
  window.addEventListener('hashchange',()=>{if(mode()){readToolRoute();renderHub();by('scroller').scrollTop=0;}else if(document.body.classList.contains('study-page')){cleanup();window.render();}});
  window.addEventListener('optics:progress',()=>{
   reflect();if(!mode())return;
   const focused=root.contains(document.activeElement)?document.activeElement:null;
   const selector=focused?.matches('input,textarea,select')?(focused.id?'#'+CSS.escape(focused.id):focused.getAttribute('aria-label')?'[aria-label="'+CSS.escape(focused.getAttribute('aria-label'))+'"]':null):null;
   const selection=focused?.matches('input[type="search"],textarea')?[focused.selectionStart,focused.selectionEnd]:null;
   renderHub();const next=selector&&root.querySelector(selector);if(next){next.focus({preventScroll:true});if(selection)next.setSelectionRange(...selection);}
  });
  window.addEventListener('optics:notes-changed',()=>{notesToken++;notes=null;notesError='';notesLoading=false;if(mode()==='mastery')readNotes(true);});
  window.addEventListener('storage',e=>{if(e.key===key()){load();seedSync();reflect();if(mode())renderHub();if(dialog.open)selectedFavorite?favoriteDetail():favoriteList();}});
  window.OpticsAuth?.subscribe(()=>{const next=window.OpticsAuth?.user?.id||null;if(next===owner)return;owner=next;notesToken++;notes=null;notesError='';notesLoading=false;snapshot=null;questionReturn='';load();seedSync();if(dialog.open)dialog.close();reflect();});
  document.addEventListener('keydown',e=>{
   if(!mode())return;if(e.key==='Escape'){closeNav();return;}
   if(['ArrowLeft','ArrowRight'].includes(e.key)&&!e.target.matches('input,textarea,select')&&!e.target.closest('dialog')&&!e.target.isContentEditable)e.stopImmediatePropagation();
  },true);
  render();
 }
 function restoreCheckpoint(saved){if(!saved||!Array.isArray(saved.ids)||!saved.ids.length||saved.ids.length>DATA.questions.length||!saved.ids.every(id=>DATA.byId[id]&&DATA.byId[id].playable!==false)||!Number.isInteger(saved.index)||saved.index<0||saved.index>=saved.ids.length)return false;const prior=state.session;if(prior?.date===saved.date&&prior.finished&&!saved.finished)return true;state.session={...saved,results:saved.results&&typeof saved.results==='object'?saved.results:{},picks:saved.picks&&typeof saved.picks==='object'?saved.picks:{},drafts:prior?.date===saved.date?prior.drafts||{}:{}};persist();return true;}
 window.OpticsStudyTools={restoreCheckpoint,attach,open,openFavorites,assess:recordAssessment,plans:()=>JSON.parse(JSON.stringify(state.plans)),startPractice,startRetest:startRetestSession};
})();
