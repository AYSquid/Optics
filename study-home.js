/* Independent per-account checkpoints: browsing a library cannot erase practice. */
(function(){'use strict';
 const by=id=>document.getElementById(id),copy=value=>JSON.parse(JSON.stringify(value));
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn,cls='study-button')=>{const b=node('button',cls,text);b.type='button';b.onclick=fn;return b;};
 let attached=false,key='',state={resume:null,days:{},examDate:''},active=false,restoring=false,writable=true,legacy=null;
 const dateKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 function save(){if(!writable)return;try{localStorage.setItem(key,JSON.stringify(state));}catch(e){writable=false;}}
 function isPractice(){return !document.body.classList.contains('study-page')&&!active&&/^#\/(bank|resume|year\/|exams\/(optics|english)\/)/.test(location.hash);}
 function record(id){if(!attached||!id)return;const day=dateKey();const items=state.days[day]||(state.days[day]=[]);if(!items.includes(id)){items.push(id);save();if(active)show();}}
 function capture(){
  if(!attached||restoring||!isPractice()||OpticsCloud?.isApplying())return;
  const q=currentQuestion();if(!q||!['all','chapter','kn','exam'].includes(ui.scope.type))return;
  const next={kind:'optics',scope:copy(ui.scope),filter:ui.statusFilter,questionId:q.id,title:scopeTitle(),number:String(q.number),count:ui.scopeIds.length,at:new Date().toISOString()};
  if(state.resume?.questionId===q.id&&JSON.stringify(state.resume.scope)===JSON.stringify(next.scope)&&state.resume.filter===next.filter)return;
  state.resume=next;save();
 }
 function retestPosition(session){
  if(!attached||active||location.hash!=='#/retest'||!session||session.finished)return;const q=DATA.byId[session.ids[session.index]];if(!q)return;state.resume={kind:'retest',questionId:q.id,title:'错题复测 / '+(findChapter(q.chapterId)?.title||'本轮练习'),number:String(q.number),count:session.ids.length,done:Object.keys(session.results).length,at:new Date().toISOString()};save();
 }
 function englishPosition(paper,group,q){
  if(!attached||!paper||!group||!q||active)return;
  state.resume={kind:'english',paperId:paper.id,groupId:group.id,questionNumber:q.number,questionId:q.id,title:paper.year+' · 英语'+(paper.variant===1?'一':'二')+' / '+group.label,number:String(q.number),count:group.questions.length,paperCount:paper.questionCount,at:new Date().toISOString()};save();
 }
 function exit(){active=false;document.body.classList.remove('dashboard-page');by('study-dashboard').hidden=true;by('home-return').removeAttribute('aria-current');}
 function open(){capture();closeNav();location.hash='/dashboard';show();}
 function resume(){
  const r=state.resume;exit();
  if(!r){location.hash='/bank';openBank();return;}
  window.OpticsElectronicNotes?.close();
  if(r.kind==='retest'){OpticsStudyTools.open('retest');return;}
  if(r.kind==='english'){location.hash='/exams/english/'+encodeURIComponent(r.paperId)+'/'+encodeURIComponent(r.groupId)+'/'+r.questionNumber;return;}
  if(!DATA.byId[r.questionId]){location.hash='/bank';openBank();return;}
  restoring=true;
  try{
   location.hash=r.scope.type==='exam'?'/year/'+encodeURIComponent(r.scope.paperId):'/resume';
   ui.scope=copy(r.scope);ui.statusFilter=['all','none','known','unknown','shaky'].includes(r.filter)?r.filter:'all';
   buildScopeIds();buildMatchIds();ui.keepCurrent=false;
   if(ui.scopeIds.includes(r.questionId)&&!ui.matchIds.includes(r.questionId)){
    ui.matchIds.push(r.questionId);ui.matchIds.sort((a,b)=>ui.scopeIds.indexOf(a)-ui.scopeIds.indexOf(b));ui.keepCurrent=true;
   }
   ui.index=Math.max(0,ui.matchIds.indexOf(r.questionId));ui.answerOpen=false;ui.analysisOpen=false;ui.choicePick={};ui.choiceQuestionId=null;
   render();savePrefs();by('scroller').scrollTop=0;
  }finally{restoring=false;}
 }
 function progress(r){
  if(!r)return {done:0,total:0};
  if(r.kind==='retest')return {done:r.done,total:r.count};
  if(r.kind==='english'){
   const p=window.EnglishExams?.paper;
   // English stores choices and graded subjective work independently of optics.
   const prefix=r.paperId+'-',choices=EnglishStore.list('choice:'+prefix).filter(x=>x.value?.key);
   const written=new Set(EnglishStore.list('version:'+prefix).filter(x=>x.value?.status==='complete').map(x=>x.value.questionId));
   return {done:choices.length+written.size,total:r.paperCount||p?.questionCount||0};
  }
  let ids=[];
  if(r.scope.type==='exam')ids=EXAMS.years.find(y=>y.id===r.scope.paperId)?.occurrenceIds||[];
  else if(r.scope.type==='chapter')ids=DATA.questions.filter(q=>q.chapterId===r.scope.chapterId).map(q=>q.id);
  else if(r.scope.type==='kn')ids=findKn(r.scope.chapterId,r.scope.knId)?.questionIds||[];
  else ids=DATA.questions.map(q=>q.id);
  ids=ids.filter(id=>DATA.byId[id]?.playable!==false);
  return {done:ids.filter(id=>!!getStatus(statusKeyOf(DATA.byId[id]))).length,total:ids.length};
 }
 function metric(label,value,suffix,detail){const n=node('article','dashboard-metric');n.append(node('span','dashboard-metric-label',label));const v=node('div','dashboard-metric-value');v.append(node('strong',null,value),node('span',null,suffix));n.append(v,node('p',null,detail));return n;}
 function show(){
  if(!attached)return;active=true;document.body.classList.remove('study-page');document.body.classList.add('dashboard-page');
  window.EnglishExams?.leave();window.OpticsElectronicNotes?.close();window.ExamTimer?.detach();
  const root=by('study-dashboard');root.hidden=false;root.replaceChildren();by('home-return').setAttribute('aria-current','page');
  document.querySelector('.page-eyebrow').textContent='STUDY / 学习首页';by('crumb').textContent='学习首页';by('crumb-sub').textContent='继续上一次练习，记录每一天的积累';by('progress').textContent='LEARNING / LOG';
  const head=node('div','dashboard-heading');head.append(node('span','study-kicker','STUDY TERMINAL / 学习终端'),node('h1',null,'从上一次，继续。'));head.append(button('返回开场',()=>{exit();location.hash='/home';},'study-button dashboard-entry'));root.append(head);
  const card=node('section','study-panel dashboard-continue');card.append(node('span','study-kicker','RESUME / 继续做题'),node('h2',null,'继续学习'));
  const r=state.resume,p=progress(r),detail=node('div','dashboard-resume-info');
  detail.append(node('h3',null,r?r.title:'准备开始你的第一段练习'));
  const meta=r?'上次停在第 '+r.number+' 题'+(r.kind==='optics'?' · '+statusFilterName(r.filter)+'筛选':'')+' · '+new Date(r.at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'选择一个章节或年份，开始后会自动保存位置。';
  detail.append(node('p','study-muted',meta));
  if(r){const line=node('p','dashboard-completion');line.append('已完成 ',node('strong',null,p.done), ' 题'+(p.total?' · 还剩 '+Math.max(0,p.total-p.done)+' 题':''));detail.append(line);if(p.total){const bar=node('progress');bar.max=p.total;bar.value=p.done;bar.setAttribute('aria-label','当前分类完成进度');detail.append(bar);}detail.append(node('p','dashboard-footnote',r.kind==='retest'?'提交答案后计入本轮完成进度。':r.kind==='english'?'客观题作答、主观题批改完成后计入进度。':'手动标记会做、不会做或不熟练后，计入完成进度。'));}
  card.append(detail,button(r?'继续做题 →':'开始练习 →',resume,'study-button study-primary dashboard-resume'));root.append(card);
  const stats=node('section','dashboard-stats');const today=dateKey(),yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);const n=state.days[today]?.length||0,prev=state.days[dateKey(yesterday)]?.length||0;
  const date=state.examDate?new Date(state.examDate+'T00:00:00'):null,midnight=new Date(today+'T00:00:00');const remaining=date?Math.ceil((date-midnight)/86400000):null;
  const countdown=metric('考试倒计时',remaining===null?'—':Math.max(0,remaining),'天',date?'目标日期 · '+state.examDate:'设置你的考试日期');
  const input=node('input','dashboard-date');input.type='date';input.value=state.examDate;input.setAttribute('aria-label','考试日期');input.onchange=()=>{state.examDate=input.value;save();show();};countdown.append(input);
  let streak=0,cursor=new Date();if(!n)cursor.setDate(cursor.getDate()-1);while(state.days[dateKey(cursor)]?.length){streak++;cursor.setDate(cursor.getDate()-1);}
  stats.append(countdown,metric('今日刷题数',n,'题','昨日 '+prev+' 题 · 同一道题每天计一次'),metric('连续学习',streak,'天','作答或标记掌握状态，记录当日学习'));root.append(stats);
  const activity=node('section','study-panel dashboard-activity');const title=node('div','dashboard-activity-head');title.append(node('h2',null,'学习活动'),node('span','study-muted','每日作答 · 近 17 周'));activity.append(title);
  const legend=node('div','dashboard-legend');legend.append(node('span',null,'刷题强度'));for(let i=0;i<5;i++){const s=node('i');s.dataset.level=i;s.title=['无','1–4 题','5–9 题','10–19 题','20 题及以上'][i];legend.append(s);}legend.append(node('span',null,'多'));activity.append(legend);
  const viewport=node('div','dashboard-heatmap-scroll'),chart=node('div','dashboard-heatmap');chart.setAttribute('aria-label','最近 17 周每日作答记录');
  const labels=node('div','dashboard-day-labels');labels.append(node('span',null,''));['日','一','二','三','四','五','六'].forEach(day=>labels.append(node('span',null,day)));chart.append(labels);
  const start=new Date(today+'T12:00:00');start.setDate(start.getDate()-start.getDay()-16*7);let lastMonth=-1,days=0;
  for(let w=0;w<17;w++){const col=node('div','dashboard-week');const wd=new Date(start);wd.setDate(start.getDate()+w*7);const month=wd.getMonth(),label=month!==lastMonth?month+1+'月':'';lastMonth=month;col.append(node('span','dashboard-month',label));for(let d=0;d<7;d++){const dt=new Date(wd);dt.setDate(wd.getDate()+d);const key=dateKey(dt),count=state.days[key]?.length||0;if(count)days++;const cell=node('span','dashboard-day');cell.dataset.level=count===0?0:count<5?1:count<10?2:count<20?3:4;cell.title=key+' · '+count+' 题';cell.setAttribute('aria-label',cell.title);if(key>today)cell.classList.add('is-future');if(key===today)cell.classList.add('is-today');col.append(cell);}chart.append(col);}
  viewport.append(chart);activity.append(viewport,node('p','dashboard-footnote','近 17 周记录 '+days+' 个作答日。每日记录从此功能启用后开始积累。'));root.append(activity);
  const shortcuts=node('div','dashboard-shortcuts');[['章节题库',()=>{exit();location.hash='/bank';openBank();}],['历年真题',()=>{exit();location.hash='/exams';openExamHome();}],['掌握地图',()=>OpticsStudyTools.open('mastery')],['错题复测',()=>OpticsStudyTools.open('retest')]].forEach(([text,fn])=>shortcuts.append(button(text+' →',fn)));root.append(shortcuts,node('p','dashboard-storage-note',writable?'做题位置、每日记录与考试日期保存在此浏览器，并按登录账号分别保存。':'本机记录保存失败，关闭网页后可能无法恢复本次位置。'));
 }
 function attach(){
  if(attached)return;key=OpticsCloud.localKey('gopt.study-home.v1');
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved==='object'&&!Array.isArray(saved)){state.resume=saved.resume||null;state.days=saved.days&&typeof saved.days==='object'&&!Array.isArray(saved.days)?saved.days:{};state.examDate=/^\d{4}-\d{2}-\d{2}$/.test(saved.examDate)?saved.examDate:'';}}catch(e){writable=false;}
  attached=true;by('home-return').onclick=open;
  if(!state.resume&&legacy&&DATA.byId[legacy.lastQuestionId]&&['all','chapter','kn','exam'].includes(legacy.scope?.type)){const q=DATA.byId[legacy.lastQuestionId];state.resume={kind:'optics',scope:legacy.scope,filter:legacy.statusFilter||'all',questionId:q.id,title:legacy.scope.type==='exam'?q.year+' 年真题':(findChapter(q.chapterId)?.title||'全部题目'),number:String(q.number),at:new Date().toISOString()};save();}
  window.addEventListener('hashchange',()=>{if(location.hash==='#/dashboard'){show();}else{const was=active;exit();if(was&&location.hash!=='#/home')render();capture();}});
  document.addEventListener('click',e=>{const option=e.target.closest('#options [data-option-key],.retest-options [data-option-key],.eng-option');if(option&&!option.disabled){const q=option.matches('.eng-option')?EnglishExams.current:option.closest('.retest-card')?DATA.byId[option.closest('.retest-card').dataset.question]:currentQuestion();if(q)record(q.canonicalId||q.statusKey||q.id);}});
  window.addEventListener('storage',e=>{if(e.key===key&&e.newValue){try{const other=JSON.parse(e.newValue);if(other&&other.days){state=other;if(active)show();}}catch(_){}}});
  document.addEventListener('keydown',e=>{if(active&&['ArrowLeft','ArrowRight'].includes(e.key)&&!e.target.matches('input,textarea,select')&&!e.target.closest('dialog'))e.stopImmediatePropagation();},true);
  if(location.hash==='#/dashboard')show();else capture();
 }
 const baseStart=window.start;window.start=function(){try{legacy=JSON.parse(localStorage.getItem(OpticsCloud.localKey('gopt.prefs.v1'))||'null');}catch(_){}return baseStart.apply(this,arguments);};
 const baseRender=window.render;window.render=function(){if(active&&location.hash==='#/dashboard'){show();return;}baseRender();capture();};
 const baseScope=window.setScope;window.setScope=function(scope,opts){if(active){exit();location.hash='/bank';}return baseScope(scope,opts);};
 const baseStatus=window.changeStatus;window.changeStatus=function(val){const q=currentQuestion();baseStatus(val);if(val&&q?.playable!==false&&q)record(q.canonicalId||q.statusKey||q.id);capture();};
 window.OpticsDashboard={attach,open,resume,record,englishPosition,retestPosition};
})();
