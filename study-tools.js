/* Real question data + account-scoped local collections. Existing status/cloud
 * records remain authoritative. A retest never reveals a key before submission. */
(function(){
 'use strict';
 const by=id=>document.getElementById(id);
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const btn=(text,fn,cls='study-button')=>{const b=node('button',cls,text);b.type='button';b.onclick=fn;return b;};
 const label={none:'未标记',known:'会做',shaky:'不熟练',unknown:'不会做'};
 const symbol={none:'',known:'✓',shaky:'',unknown:'×'};
 const modes={mastery:'掌握地图',knowledge:'知识图谱',retest:'错题复测'};
 let attached=false,root,owner=null,state,storageError='',snapshot=null,questionReturn='';
 let notes=null,notesLoading=false,notesError='',notesToken=0;
 let map={category:'all',chapter:'',statuses:[],attribute:'',enhanced:false};
 let graph={category:'all',chapter:'',search:''};
 let review={category:'all',chapter:'',source:'all',limit:20,shuffle:true,dueOnly:true};
 let dialog,dialogBody,dialogTitle,favoriteFocus,selectedFavorite='',favoriteSearch='',favoriteFilter='all',replaceDialog;
 const mode=()=>location.hash.match(/^#\/(mastery|knowledge|retest)$/)?.[1]||'';
 const key=()=> 'gopt.study-tools.v1'+(owner?'.space.'+owner:'.guest');
 const emptyState=()=>({version:1,favorites:{},mistakes:{},schedules:{},session:null,history:[]});
 const canonical=q=>q?.canonicalId||q?.id;
 const status=q=>getStatus(statusKeyOf(q))||'none';
 const favorite=q=>!!state.favorites[canonical(q)];
 function persist(){
  try{localStorage.setItem(key(),JSON.stringify(state));storageError='';window.OpticsDashboard?.retestPosition(state.session);return true;}
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
 function announce(text){const n=by('study-announcement');if(n)n.textContent=text;}
 function textOf(q){return (q.stem||[]).map(b=>b.x||(b.items||[]).join(' ')).join(' ').replace(/\s+/g,' ');}
 function context(q){const ch=findChapter(q.chapterId);return [ch?ch.num+' '+ch.title:'其他资料',q.year?q.year+' 年':null,q.typeName,'原题 '+q.number].filter(Boolean).join(' · ');}
 const isPaper=q=>(EXAMS.occurrences||[]).some(o=>o.questionId===canonical(q));
 function category(q,value){
  if(value==='all')return true;
  if(value==='past')return isPaper(q);
  const ch=findChapter(q.chapterId);return value==='geom'?['geom','inst'].includes(ch?.source):ch?.source==='phys';
 }
 function questions(filter){return DATA.questions.filter(q=>category(q,filter.category)&&(!filter.chapter||q.chapterId===filter.chapter));}
 function categories(host,filter,change){
  const row=node('div','study-filter-row');row.append(node('strong','study-filter-label','分类'));
  [['all','全部'],['geom','几何光学'],['phys','物理光学'],['past','历年真题']].forEach(([value,name])=>{
   const b=btn(name,()=>{filter.category=value;filter.chapter='';change();},'study-chip');b.dataset.category=value;
   b.setAttribute('aria-pressed',String(filter.category===value));b.append(node('small',null,String(DATA.questions.filter(q=>category(q,value)).length)));row.append(b);
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
  by('btn-study-return').hidden=!questionReturn||!!mode();
  by('btn-study-return').textContent='返回'+(modes[questionReturn]||'地图');
  ['mastery','knowledge','retest'].forEach(m=>by(m+'-open').setAttribute('aria-current',mode()===m?'page':'false'));
 }
 function remember(){
  if(mode()||snapshot)return;
  snapshot={scope:JSON.parse(JSON.stringify(ui.scope)),statusFilter:ui.statusFilter,id:currentQuestion()?.id,answer:ui.answerOpen,analysis:ui.analysisOpen,picks:{...ui.choicePick},scroll:by('scroller').scrollTop,hash:location.hash};
 }
 function open(m){
  remember();window.OpticsElectronicNotes?.close();closeNav();
  if(location.hash==='#/'+m)renderHub();else location.hash='/'+m;
 }
 function back(){
  const saved=snapshot;snapshot=null;questionReturn='';location.hash=saved?.hash||'/bank';
  if(saved){ui.scope=saved.scope;ui.statusFilter=saved.statusFilter;ui.choiceQuestionId=saved.id;ui.choicePick=saved.picks;buildScopeIds();buildMatchIds();ui.index=Math.max(0,ui.matchIds.indexOf(saved.id));ui.answerOpen=saved.answer;ui.analysisOpen=saved.analysis;}
  cleanup();window.render();if(saved)by('scroller').scrollTop=saved.scroll;
 }
 function cleanup(){window.ExamTimer?.detach();document.body.classList.remove('study-page');root.hidden=true;}
 function openQuestion(q,origin){
  if(!q)return;if(dialog.open)dialog.close();questionReturn=origin||'';
  location.hash='/bank';cleanup();ui.statusFilter='all';
  const ch=findChapter(q.chapterId),kn=ch?.knowledge.find(k=>k.questionIds.includes(q.id));
  ui.scope=kn?{type:'kn',chapterId:ch.id,knId:kn.id}:{type:'all'};reselect({keepQuestionId:q.id});savePrefs();closeNav();reflect();
 }
 function renderHub(){
  const m=mode();if(!m||!attached)return;
  window.OpticsElectronicNotes?.close();window.EnglishExams?.leave();if(m!=='retest'||!state.session||state.session.finished||state.session.paused)window.ExamTimer?.detach();
  document.body.classList.add('study-page');root.hidden=false;root.dataset.page=m;root.replaceChildren();
  by('crumb').textContent=modes[m];by('crumb-sub').textContent='工程光学 · 个人学习记录';
  document.querySelector('.page-eyebrow').textContent='STUDY / 学习工具';by('progress').textContent='共 '+DATA.questions.length+' 题';
  if(m==='mastery')renderMastery();else if(m==='knowledge')renderKnowledge();else renderRetest();
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
 function mapMatch(q){return (!map.statuses.length||map.statuses.includes(status(q)))&&(!map.attribute||map.attribute==='favorite'&&favorite(q)||map.attribute==='notes'&&notes?.has(canonical(q)));}
 function renderMastery(){
  const all=questions(map),matched=all.filter(mapMatch);
  const head=heading('掌握地图','每个方格对应一道题；学习状态沿用你的刷题记录。');
  const practice=btn('练习所选 '+matched.filter(q=>q.playable!==false).length+' 题',()=>startPractice(matched.map(q=>q.id),'掌握地图筛选'));practice.disabled=!matched.some(q=>q.playable!==false);head.append(practice);
  const filter=node('section','study-panel');categories(filter,map,renderHub);chapters(filter,map,renderHub);root.append(filter);
  const panel=node('section','study-panel');
  const statuses=node('div','study-status-grid');
  ['none','known','shaky','unknown'].forEach(s=>{
   const b=btn('',()=>{map.statuses=map.statuses.includes(s)?map.statuses.filter(v=>v!==s):map.statuses.concat(s);renderHub();},'study-status-tile');
   b.dataset.status=s;b.setAttribute('aria-pressed',String(map.statuses.includes(s)));
   b.append(node('span','study-dot',symbol[s]),node('span',null,label[s]),node('strong',null,String(all.filter(q=>status(q)===s).length)));statuses.append(b);
  });panel.append(node('h2','study-section-title','掌握状态 · 可多选'),statuses);
  const attrs=node('div','study-attributes');
  const fav=btn('★ 收藏题　'+all.filter(favorite).length,()=>{map.attribute=map.attribute==='favorite'?'':'favorite';renderHub();},'study-chip');fav.setAttribute('aria-pressed',String(map.attribute==='favorite'));attrs.append(fav);
  const note=btn(notesLoading?'笔记索引读取中…':notesError?notesError+' · 重试':'有笔记　'+(notes?all.filter(q=>notes.has(canonical(q))).length:'—'),()=>{
   if(notes===null){readNotes(true);return;}map.attribute=map.attribute==='notes'?'':'notes';renderHub();
  },'study-chip');note.setAttribute('aria-pressed',String(map.attribute==='notes'));attrs.append(note);
  attrs.append(btn('清除筛选',()=>{map.statuses=[];map.attribute='';renderHub();},'study-button study-muted'));panel.append(attrs);
  const gridHead=node('div','study-grid-head');gridHead.append(node('h2','study-section-title','题目地图'),node('span','study-muted','符合 '+matched.length+' / '+all.length+' 题'));
  const enhanced=node('label','study-checkbox'),checkbox=node('input');checkbox.type='checkbox';checkbox.checked=map.enhanced;checkbox.onchange=()=>{map.enhanced=checkbox.checked;renderHub();};enhanced.append(checkbox,document.createTextNode('增强辨识'));gridHead.append(enhanced);panel.append(gridHead);
  const grid=node('div','mastery-grid'+(map.enhanced?' enhanced':''));
  all.forEach((q,i)=>{
   const hit=mapMatch(q),s=status(q),b=btn(map.enhanced?symbol[s]:'',()=>openQuestion(q,'mastery'),'mastery-cell'+(hit?'':' is-dim'));
   b.dataset.question=q.id;b.dataset.status=s;b.dataset.match=String(hit);b.title=(i+1)+' · '+context(q)+' · '+label[s]+(favorite(q)?' · 已收藏':'');
   b.setAttribute('aria-label',b.title);if(favorite(q))b.classList.add('is-favorite');grid.append(b);
  });panel.append(grid);if(!all.length)panel.append(node('p','study-empty','此分类暂无题目。'));root.append(panel);
  if(notes===null&&!notesLoading&&!notesError)queueMicrotask(()=>readNotes());
 }
 function renderKnowledge(){
  heading('知识图谱','按笔记顺序梳理章节与知识点，点击知识点进入对应题目。');
  const panel=node('section','study-panel');categories(panel,graph,renderHub);
  const search=node('input','study-search');search.type='search';search.placeholder='搜索知识点或章节';search.setAttribute('aria-label','搜索知识点或章节');search.value=graph.search;
  search.oninput=()=>{graph.search=search.value;renderKnowledgeBody(body);};panel.append(search);root.append(panel);
  const body=node('div','knowledge-layout');root.append(body);renderKnowledgeBody(body);
 }
 function renderKnowledgeBody(host){
  host.replaceChildren();const term=graph.search.trim().toLowerCase();
  const catalog=orderedStudyChapters().map(ch=>({ch,topics:ch.knowledge.map(k=>({k,ids:k.questionIds.filter(id=>category(DATA.byId[id],graph.category))})).filter(t=>t.ids.length&&(!term|| (ch.num+' '+ch.title+' '+t.k.name).toLowerCase().includes(term)))})).filter(c=>c.topics.length);
  if(!catalog.some(c=>c.ch.id===graph.chapter))graph.chapter=catalog[0]?.ch.id||'';
  if(!catalog.length){host.append(node('p','study-panel study-empty','没有匹配的章节或知识点。'));return;}
  const nav=node('nav','knowledge-chapters');nav.setAttribute('aria-label','知识图谱章节');
  catalog.forEach(c=>{const b=btn('',()=>{graph.chapter=c.ch.id;renderKnowledgeBody(host);},'knowledge-chapter');b.setAttribute('aria-current',graph.chapter===c.ch.id?'page':'false');b.append(node('span',null,c.ch.num+' '+c.ch.title),node('small',null,String(c.topics.length)));nav.append(b);});host.append(nav);
  const chosen=catalog.find(c=>c.ch.id===graph.chapter),area=node('section','study-panel knowledge-topics'),h=node('div','study-grid-head');
  h.append(node('h2',null,chosen.ch.title),node('span','study-muted',chosen.topics.length+' 个知识点'));area.append(h);
  const grid=node('div','knowledge-grid');
  chosen.topics.forEach(({k,ids},i)=>{
   const known=ids.filter(id=>status(DATA.byId[id])==='known').length,weak=ids.filter(id=>['unknown','shaky'].includes(status(DATA.byId[id]))).length;
   const b=btn('',()=>{
    questionReturn='knowledge';location.hash='/bank';cleanup();ui.statusFilter='all';ui.scope={type:'kn',chapterId:chosen.ch.id,knId:k.id,studyCategory:graph.category};reselect({preferReview:true});savePrefs();closeNav();reflect();
   },'knowledge-topic');b.dataset.topic=k.id;
   b.append(node('span','study-kicker',String(i+1).padStart(2,'0')+' / KNOWLEDGE'),node('strong',null,k.name),node('span','study-muted',ids.length+' 题 · 会做 '+known+' · 待巩固 '+weak));
   const progress=node('progress');progress.max=ids.length;progress.value=known;progress.setAttribute('aria-label','会做 '+known+' / '+ids.length+' 题');b.append(progress);grid.append(b);
  });area.append(grid);host.append(area);
 }
 function candidates(filter=review){const seen=new Set();return questions(filter).filter(q=>{const id=canonical(q);if(seen.has(id)||q.playable===false)return false;
  if(filter.dueOnly&&state.schedules[id]&&Date.parse(state.schedules[id])>Date.now())return false;
  const matches=filter.source==='unknown'?status(q)==='unknown':filter.source==='shaky'?status(q)==='shaky':filter.source==='wrong'?!!state.mistakes[id]:['unknown','shaky'].includes(status(q))||!!state.mistakes[id]||!!state.schedules[id];
  if(matches)seen.add(id);return matches;});}
 function startPractice(ids,name){
  const seen=new Set(),playable=ids.filter(id=>{const q=DATA.byId[id],key=canonical(q);if(!q||q.playable===false||seen.has(key))return false;seen.add(key);return true;});if(!playable.length)return;
  const begin=()=>{state.session={ids:playable,index:0,picks:{},drafts:{},results:{},name,date:new Date().toISOString(),finished:false};persist();open('retest');};
  if(state.session&&!state.session.finished){
   if(replaceDialog?.open)return;replaceDialog=node('dialog','study-confirm');replaceDialog.setAttribute('aria-labelledby','retest-replace-title');
   const title=node('h2',null,'替换当前复测？');title.id='retest-replace-title';replaceDialog.append(title,node('p',null,'当前一轮已提交 '+Object.keys(state.session.results).length+' / '+state.session.ids.length+' 题。重新安排会替换本轮进度，收藏与掌握状态不受影响。'),btn('保留本轮',()=>replaceDialog.close()),btn('确认重新开始',()=>{replaceDialog.close();begin();},'study-button study-primary'));
   replaceDialog.addEventListener('close',()=>replaceDialog.remove(),{once:true});document.body.append(replaceDialog);replaceDialog.showModal();return;
  }begin();
 }
 function startRetest(){
  let ids=candidates().map(q=>q.id);if(review.shuffle){for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}}else ids.sort((a,b)=>(Date.parse(state.schedules[canonical(DATA.byId[a])])||0)-(Date.parse(state.schedules[canonical(DATA.byId[b])])||0));
  startPractice(ids.slice(0,review.limit),'错题复测');
 }
 function renderRetest(){
  heading('错题复测','提交后再看答案；选择题核对选项，填空与计算题对照解析自评。');
  if(state.session&&!state.session.finished){if(state.session.paused)renderSetupPaused();else renderSession();return;}
  if(state.session?.finished)renderSummary();
  const panel=node('section','study-panel');panel.append(node('h2',null,'安排一轮复测'));categories(panel,review,renderHub);chapters(panel,review,renderHub);
  const fields=node('div','study-form-row');
  const source=node('select');[['all','不会做 / 不熟练 / 答错'],['unknown','只练不会做'],['shaky','只练不熟练'],['wrong','只练答错记录']].forEach(([value,text])=>{const o=node('option',null,text);o.value=value;source.append(o);});source.value=review.source;source.setAttribute('aria-label','复测来源');source.onchange=()=>{review.source=source.value;renderHub();};fields.append(source);
  const limit=node('select');[10,20,30,50,DATA.questions.length].forEach(n=>{const o=node('option',null,n===DATA.questions.length?'全部题目':n+' 题');o.value=String(n);limit.append(o);});limit.value=String(review.limit);limit.setAttribute('aria-label','复测题量');limit.onchange=()=>{review.limit=Number(limit.value);};fields.append(limit);
  const shuffle=node('label','study-checkbox'),box=node('input');box.type='checkbox';box.checked=review.shuffle;box.onchange=()=>{review.shuffle=box.checked;};shuffle.append(box,document.createTextNode('随机顺序'));fields.append(shuffle);panel.append(fields);
  const due=node('label','study-checkbox'),dueBox=node('input');dueBox.type='checkbox';dueBox.checked=review.dueOnly;dueBox.onchange=()=>{review.dueOnly=dueBox.checked;renderHub();};due.append(dueBox,document.createTextNode('只练到期题'));fields.append(due);
  const count=candidates().length;panel.append(node('p',null,'可复测 '+count+' 题 · 缺失资料的题目自动跳过'));
  const start=btn('开始复测 →',startRetest,'study-button study-primary');start.disabled=!count;panel.append(start);
  if(!count)panel.append(node('p','study-empty','暂无符合条件的题目。刷题时标记“不会做”或“不熟练”，答错的选择题也会进入这里。'));
  if(state.history.length){const history=node('details','study-history');history.append(node('summary',null,'最近复测记录'));state.history.slice().reverse().slice(0,5).forEach(h=>history.append(node('p',null,new Date(h.date).toLocaleString('zh-CN')+' · '+h.total+' 题 · 客观正确 '+h.correct+' / '+h.objective+' · 自评会做 '+h.mastered+' / '+h.manual)));panel.append(history);}
  root.append(panel);
 }
 function renderSession(){
  const s=state.session,q=DATA.byId[s.ids[s.index]],result=s.results[q.id],keys=choiceAnswerKeys(q),auto=keys.length>0;
  const nav=node('div','study-session-nav'),progress=node('progress');progress.max=s.ids.length;progress.value=Object.keys(s.results).length;progress.setAttribute('aria-label','已提交 '+Object.keys(s.results).length+' / '+s.ids.length+' 题');
  nav.append(node('strong',null,s.name+'　'+(s.index+1)+' / '+s.ids.length),progress,btn('退出本轮',confirmExit,'study-button study-muted'));root.append(nav);
  const timer=node('div','study-session-timer');root.append(timer);window.ExamTimer?.attach('retest:'+s.date,timer);timer.querySelector('.exam-timer')?.setAttribute('aria-label','复测计时');
  const card=node('article','study-panel retest-card');card.dataset.question=q.id;
  const meta=node('div','study-grid-head');meta.append(node('span','study-muted',context(q)),renderQuestionSource(q),btn(favorite(q)?'★ 已收藏':'☆ 收藏',()=>toggleFavorite(q),'study-button'));card.append(meta);
  if(q.review?.needsCheck)card.append(node('p','study-warning','本题答案或条件仍待核对；按参考答案自评，暂不自动判分。'));
  const stem=node('div','stem');renderBlocks(questionContentBlocks(q.stem),stem);card.append(stem);
  (q.stemImages||[]).forEach(im=>card.append(figureNode(im.src,im.alt||im.caption||'')));
  if(q.options?.length){
   const options=node('div','options retest-options'+(q.options.some(o=>o.x.length>26)?'':' cols-2'));
   const picked=String(s.picks[q.id]||'').split('');
   q.options.forEach(o=>{const b=btn('',()=>{
    let picks=String(s.picks[q.id]||'').split('').filter(Boolean);if(isMultipleChoice(q)){picks=picks.includes(o.key)?picks.filter(k=>k!==o.key):picks.concat(o.key);}else picks=picks.includes(o.key)?[]:[o.key];s.picks[q.id]=picks.sort().join('');persist();renderHub();
   },'option');b.dataset.optionKey=o.key;b.setAttribute('aria-pressed',String(picked.includes(o.key)));b.disabled=!!result;
    b.setAttribute('data-verdict',result&&auto?(keys.includes(o.key)?'correct':picked.includes(o.key)?'wrong':''):'');b.append(node('span','option-key',o.key));const text=node('span','option-text');renderInline(o.x,text);b.append(text);options.append(b);
   });card.append(options);if(isMultipleChoice(q))card.append(node('p','study-muted','多选题 · 提交前可反复调整选项'));
  }
  if(!auto){
   const area=node('textarea','study-draft');area.placeholder='先写下思路或答案，再查看参考答案自评';area.setAttribute('aria-label','复测思路或答案');area.value=s.drafts[q.id]||'';area.disabled=!!result;area.oninput=()=>{s.drafts[q.id]=area.value;persist();};card.append(area);
  }
  const live=node('p','study-result');live.id='retest-message';live.setAttribute('role','status');card.append(live);
  if(!result){
   const submit=btn(auto?'提交答案':'完成作答 · 对照答案',()=>{
    const pick=s.picks[q.id]||'';if(auto&&!validChoiceSelection(q,pick)){live.textContent='请先选择答案。';return;}
    window.OpticsDashboard?.record(canonical(q));s.results[q.id]={kind:auto?'objective':'manual',correct:auto?pick.split('').sort().join('')===keys.slice().sort().join(''):null,status:''};
    if(auto){const id=canonical(q);if(s.results[q.id].correct)delete state.mistakes[id];else state.mistakes[id]=new Date().toISOString();}
    persist();renderHub();
   },'study-button study-primary');card.append(submit);
  }else{
   live.dataset.verdict=result.kind==='objective'?(result.correct?'correct':'wrong'):'';
   live.textContent=result.kind==='objective'?(result.correct?'回答正确。':'回答错误。正确选项：'+keys.join('、')):'请对照参考答案和解析，评估自己的掌握情况。';
   const answers=node('section','study-solution');answers.append(node('h2',null,'参考答案'));renderBlocks(questionContentBlocks(q.answer||[]),answers);
   const analysis=node('details','study-solution');analysis.append(node('summary',null,'展开解析与知识点'));const content=node('div');renderBlocks(questionContentBlocks(q.analysis||[]),content);(q.analysisImages||[]).forEach(im=>content.append(figureNode(im.src,im.alt||im.caption||'')));analysis.append(content);card.append(answers,analysis);
   const assessment=node('div','study-assessment');assessment.append(node('span','study-muted','更新掌握状态：'));
   const intervals={known:14,shaky:2,unknown:1};
   ['known','shaky','unknown'].forEach(value=>{const b=btn(symbol[value]+' '+label[value]+'（+'+intervals[value]+' 天）',()=>{result.status=value;const id=canonical(q);state.schedules[id]=new Date(Date.now()+intervals[value]*86400000).toISOString();if(value==='known')delete state.mistakes[id];persist();setStatus(statusKeyOf(q),value);renderHub();},'study-button');b.dataset.status=value;b.setAttribute('aria-pressed',String(result.status===value));assessment.append(b);});card.append(assessment);
   if(state.schedules[canonical(q)])card.append(node('p','study-muted','下次复测：'+new Date(state.schedules[canonical(q)]).toLocaleDateString('zh-CN')));
  }
  root.append(card);
  const pager=node('div','study-session-pager'),prev=btn('← 上一题',()=>{s.index--;persist();renderHub();by('scroller').scrollTop=0;}),next=btn(s.index===s.ids.length-1?'查看本轮结果':'下一题 →',()=>{
   if(result?.kind==='manual'&&!result.status){live.textContent='请先完成自评，再进入下一题。';return;}
   if(s.index===s.ids.length-1){if(Object.keys(s.results).length<s.ids.length){s.index=s.ids.findIndex(id=>!s.results[id]);}else{s.finished=true;addHistory();}}else s.index++;persist();renderHub();by('scroller').scrollTop=0;
  });prev.disabled=s.index===0;next.disabled=!result;pager.append(prev,next);root.append(pager);
 }
 function confirmExit(){
  let panel=by('retest-exit-confirm');if(panel){panel.focus();return;}
  panel=node('div','study-panel study-warning');panel.id='retest-exit-confirm';panel.tabIndex=-1;
  panel.append(node('p',null,'本轮进度会保留。可以暂时返回设置，稍后继续；重新开始会替换当前这一轮。'),btn('继续本轮',()=>panel.remove()),btn('暂时离开',()=>{state.session.paused=true;persist();renderSetupPaused();}),btn('结束并查看结果',()=>{state.session.finished=true;addHistory();persist();renderHub();}));root.prepend(panel);panel.focus();
 }
 function renderSetupPaused(){
  window.ExamTimer?.detach();
  const s=state.session;root.replaceChildren();heading('错题复测','本轮进度已保留，可随时继续。');
  const panel=node('section','study-panel');panel.append(node('h2',null,'已暂停 · '+Object.keys(s.results).length+' / '+s.ids.length+' 题'),btn('继续本轮',()=>{s.paused=false;persist();renderHub();},'study-button study-primary'),btn('重新安排一轮',()=>{s.finished=true;persist();renderHub();}));root.append(panel);
 }
 function summary(){
  const s=state.session,rows=s.ids.map(id=>s.results[id]).filter(Boolean),objective=rows.filter(r=>r.kind==='objective'),manual=rows.filter(r=>r.kind==='manual');
  return {date:s.date,total:s.ids.length,submitted:rows.length,objective:objective.length,correct:objective.filter(r=>r.correct).length,manual:manual.length,mastered:manual.filter(r=>r.status==='known').length};
 }
 function addHistory(){const row=summary();if(!state.history.some(h=>h.date===row.date))state.history.push(row);state.history=state.history.slice(-20);}
 function renderSummary(){
  const s=state.session,row=summary(),panel=node('section','study-panel');panel.append(node('h2',null,'本轮结果'),node('p',null,'客观题：'+row.correct+' / '+row.objective+' 正确'),node('p',null,'主观自评：'+row.mastered+' / '+row.manual+' 会做'),node('p',null,'未提交：'+(row.total-row.submitted)+' 题'));
  const remaining=s.ids.filter(id=>!s.results[id]||s.results[id].kind==='objective'&&!s.results[id].correct||s.results[id].kind==='manual'&&s.results[id].status!=='known');
  const again=btn('复测本轮未掌握 '+remaining.length+' 题',()=>startPractice(remaining,'本轮未掌握复测'));again.disabled=!remaining.length;panel.append(again);
  const list=node('div','study-result-list');s.ids.forEach((id,i)=>{const r=s.results[id],q=DATA.byId[id],b=btn((i+1)+' · '+q.number+' · '+(!r?'未提交':r.kind==='objective'?(r.correct?'正确':'错误'):label[r.status]||'未自评'),()=>openQuestion(q,'retest'),'study-chip');b.dataset.status=!r?'none':r.kind==='objective'?(r.correct?'known':'unknown'):r.status||'none';list.append(b);});panel.append(list);root.append(panel);
 }
 function createFavorites(){
  dialog=node('dialog','question-notes-dialog favorites-dialog');dialog.id='favorites-dialog';dialog.setAttribute('aria-labelledby','favorites-title');
  const panel=node('div','notes-panel'),head=node('div','notes-head');dialogTitle=node('h2',null,'收藏本');dialogTitle.id='favorites-title';
  head.append(dialogTitle,btn('×',()=>dialog.close(),'notes-close'));head.lastChild.setAttribute('aria-label','关闭收藏本');dialogBody=node('div','notes-body');panel.append(head,dialogBody);dialog.append(panel);document.body.append(dialog);
  dialog.addEventListener('close',()=>favoriteFocus?.focus({preventScroll:true}));dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 }
 function openFavorites(){window.OpticsElectronicNotes?.close();closeNav();favoriteFocus=document.activeElement;selectedFavorite='';favoriteSearch='';favoriteFilter='all';favoriteList();if(!dialog.open)dialog.showModal();}
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
  if(q.options?.length){const options=node('div','favorite-options');q.options.forEach(o=>{const p=node('p');p.append(node('strong',null,o.key+'　'));renderInline(o.x,p);options.append(p);});dialogBody.append(options);}
  (q.stemImages||[]).forEach(im=>dialogBody.append(figureNode(im.src,im.alt||im.caption||'')));
  const answer=node('details','study-solution');answer.append(node('summary',null,'查看答案与解析'));answer.addEventListener('toggle',()=>{if(!answer.open||answer.dataset.loaded)return;answer.dataset.loaded='true';const body=node('div');body.append(node('h3',null,'答案'));renderBlocks(questionContentBlocks(q.answer||[]),body);body.append(node('h3',null,'解析'));renderBlocks(questionContentBlocks(q.analysis||[]),body);(q.analysisImages||[]).forEach(im=>body.append(figureNode(im.src,im.alt||im.caption||'')));answer.append(body);});dialogBody.append(answer);
  const actions=node('div','notes-actions');actions.append(btn('去刷这道题 →',()=>openQuestion(q,''),'study-button study-primary'),btn(favorite(q)?'★ 取消收藏':'☆ 加入收藏',()=>toggleFavorite(q)));dialogBody.append(actions);
 }
 function exportFavorites(){
  const blob=new Blob([JSON.stringify({format:'optics-favorites/v1',exportedAt:new Date().toISOString(),favorites:state.favorites},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='光学收藏本-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const originalRender=window.render;
 const originalBuildScope=window.buildScopeIds;
 window.buildScopeIds=function(){originalBuildScope.apply(this,arguments);if(ui.scope.studyCategory&&ui.scope.studyCategory!=='all')ui.scopeIds=ui.scopeIds.filter(id=>category(DATA.byId[id],ui.scope.studyCategory));};
 window.render=function(){if(attached&&mode()){renderHub();return;}if(attached)cleanup();originalRender.apply(this,arguments);if(attached)reflect();};
 const originalScope=window.setScope;
 window.setScope=function(){if(attached&&mode()){location.hash='/bank';cleanup();snapshot=null;questionReturn='';}return originalScope.apply(this,arguments);};
 const originalFilter=window.setStatusFilter;
 window.setStatusFilter=function(){if(attached&&mode()){location.hash='/bank';cleanup();snapshot=null;questionReturn='';}return originalFilter.apply(this,arguments);};
 const originalFeedback=window.applyChoiceFeedback;
 window.applyChoiceFeedback=function(q,opts){originalFeedback.apply(this,arguments);if(!attached||q.playable===false)return;const picked=selectedChoiceKeys(q),keys=choiceAnswerKeys(q);if(keys.length&&picked.some(k=>!keys.includes(k))){const id=canonical(q);state.mistakes[id]=new Date().toISOString();persist();reflect();}};
 function attach(){
  if(attached)return;owner=window.OpticsAuth?.user?.id||null;load();root=by('study-hub');createFavorites();attached=true;
  by('favorites-open').onclick=openFavorites;by('btn-favorite').onclick=()=>toggleFavorite(currentQuestion());by('btn-study-return').onclick=()=>open(questionReturn);
  ['mastery','knowledge','retest'].forEach(m=>by(m+'-open').onclick=()=>open(m));
  const live=node('span','study-live');live.id='study-announcement';live.setAttribute('role','status');document.body.append(live);
  window.addEventListener('hashchange',()=>{if(mode()){renderHub();by('scroller').scrollTop=0;}else if(document.body.classList.contains('study-page')){cleanup();window.render();}});
  window.addEventListener('optics:progress',()=>{
   reflect();if(!mode())return;
   const focused=root.contains(document.activeElement)?document.activeElement:null;
   const selector=focused?.matches('input,textarea,select')?(focused.id?'#'+CSS.escape(focused.id):focused.getAttribute('aria-label')?'[aria-label="'+CSS.escape(focused.getAttribute('aria-label'))+'"]':null):null;
   const selection=focused?.matches('input[type="search"],textarea')?[focused.selectionStart,focused.selectionEnd]:null;
   renderHub();const next=selector&&root.querySelector(selector);if(next){next.focus({preventScroll:true});if(selection)next.setSelectionRange(...selection);}
  });
  window.addEventListener('optics:notes-changed',()=>{notesToken++;notes=null;notesError='';notesLoading=false;if(mode()==='mastery')readNotes(true);});
  window.addEventListener('storage',e=>{if(e.key===key()){load();reflect();if(mode())renderHub();if(dialog.open)selectedFavorite?favoriteDetail():favoriteList();}});
  window.OpticsAuth?.subscribe(()=>{const next=window.OpticsAuth?.user?.id||null;if(next===owner)return;owner=next;notesToken++;notes=null;notesError='';notesLoading=false;snapshot=null;questionReturn='';load();if(dialog.open)dialog.close();reflect();});
  document.addEventListener('keydown',e=>{
   if(!mode())return;if(e.key==='Escape'){closeNav();return;}
   if(['ArrowLeft','ArrowRight'].includes(e.key)&&!e.target.matches('input,textarea,select')&&!e.target.closest('dialog')&&!e.target.isContentEditable)e.stopImmediatePropagation();
  },true);
  render();
 }
 window.OpticsStudyTools={attach,open,openFavorites};
})();
