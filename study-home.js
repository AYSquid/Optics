/* Independent per-account checkpoints: browsing a library cannot erase practice. */
(function(){'use strict';
 const by=id=>document.getElementById(id),copy=value=>JSON.parse(JSON.stringify(value));
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn,cls='study-button')=>{const b=node('button',cls,text);b.type='button';b.onclick=fn;return b;};
 let attached=false,key='',state={resume:null,days:{},events:{},removed:{},examDate:'',examDateAt:''},active=false,restoring=false,writable=true,legacy=null;
 const dateKey=(d=new Date())=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));return v.year+'-'+v.month+'-'+v.day;};
 const previousDay=day=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
 let activityDay='',account=null;
 function save(){if(!writable)return;try{localStorage.setItem(key,JSON.stringify(state));window.OpticsDashboardCloud?.capture();}catch(e){writable=false;}}
 function isPractice(){return !document.body.classList.contains('study-page')&&!active&&/^#\/(bank|resume|year\/|exams\/(optics|english)\/)/.test(location.hash);}
 function record(id,details={}){
  if(!attached||!id)return;const q=DATA.byId[id];id=q?.canonicalId||q?.statusKey||id;
  const day=dateKey(),items=state.days[day]||(state.days[day]=[]),events=state.events[day]||(state.events[day]={});
  const old=events[id]||{},sources={...(old.sources||{})};sources[details.kind||'assessment']=true;
  events[id]={...old,...details,sources,at:new Date().toISOString(),label:q?(findChapter(q.chapterId)?.title||'光学题目')+' · '+q.number:details.label||'英语题目'};
  if(!items.includes(id))items.push(id);if(state.removed[day])delete state.removed[day][id];
  if(state.resume&&(state.resume.questionId===id||q&&state.resume.questionId===q.id))state.resume.at=new Date().toISOString();
  save();if(active)show();
 }
 function undoRecord(id){
  const day=dateKey(),event=state.events[day]?.[id];if(!event?.sources?.assessment)return;delete event.sources.assessment;
  if(!Object.keys(event.sources).length){delete state.events[day][id];(state.removed[day]||(state.removed[day]={}))[id]=new Date().toISOString();state.days[day]=(state.days[day]||[]).filter(qid=>qid!==id);}save();if(active)show();
 }
 function loadState(){
  key=OpticsCloud.localKey('gopt.study-home.v1');state={resume:null,days:{},events:{},removed:{},examDate:'',examDateAt:''};writable=true;
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
   state.resume=saved.resume||null;state.examDate=/^\d{4}-\d{2}-\d{2}$/.test(saved.examDate)?saved.examDate:'';
   for(const [day,ids] of Object.entries(saved.days||{}))if(/^\d{4}-\d{2}-\d{2}$/.test(day)&&Array.isArray(ids))state.days[day]=[...new Set(ids.filter(id=>typeof id==='string'))];
   if(saved.events&&typeof saved.events==='object'&&!Array.isArray(saved.events))state.events=saved.events;
   if(saved.removed&&typeof saved.removed==='object'&&!Array.isArray(saved.removed))state.removed=saved.removed;
   state.examDateAt=typeof saved.examDateAt==='string'?saved.examDateAt:'';
  }}catch(e){writable=false;}
 }
 function totals(){const qs=DATA.questions.filter(q=>q.playable!==false),completed=qs.filter(q=>!!getStatus(statusKeyOf(q))).length;return {total:qs.length,completed,remaining:qs.length-completed,weak:qs.filter(q=>['shaky','unknown'].includes(getStatus(statusKeyOf(q)))).length};}
 function capture(){
  if(window.OpticsDashboardCloud?.pendingInitialPull())return;
  if(!attached||restoring||!isPractice()||OpticsCloud?.isApplying())return;
  const q=currentQuestion();if(!q||!['all','chapter','kn','exam'].includes(ui.scope.type))return;
  const next={kind:'optics',scope:copy(ui.scope),filter:ui.statusFilter,questionId:q.id,title:scopeTitle(),number:String(q.number),count:ui.scopeIds.length,at:new Date().toISOString()};
  if(state.resume?.questionId===q.id&&JSON.stringify(state.resume.scope)===JSON.stringify(next.scope)&&state.resume.filter===next.filter)return;
  state.resume=next;save();
 }
 function retestPosition(session){
  if(!attached||active||location.hash!=='#/retest'||!session||session.finished)return;const q=DATA.byId[session.ids[session.index]];if(!q)return;state.resume={kind:'retest',questionId:q.id,title:'错题复测 / '+(findChapter(q.chapterId)?.title||'本轮练习'),number:String(q.number),count:session.ids.length,checkpoint:{ids:session.ids,index:session.index,name:session.name,date:session.date,picks:session.picks,results:session.results,finished:session.finished,paused:session.paused},done:Object.values(session.results).filter(r=>['known','shaky','unknown'].includes(r.status)).length,at:new Date().toISOString()};save();
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
  if(r.kind==='retest'){if(r.checkpoint)OpticsStudyTools.restoreCheckpoint(r.checkpoint);OpticsStudyTools.open('retest');return;}
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
   const prefix=r.paperId+'-',answered=new Set(EnglishObjective.results(r.paperId).filter(a=>a.key).map(a=>a.id));
   const written=new Set(EnglishStore.list('version:'+prefix).filter(x=>x.value?.status==='complete').map(x=>x.value.questionId));
   return {done:answered.size+written.size,total:r.paperCount||p?.questionCount||0};
  }
  let ids=[];
  if(r.scope.type==='exam')ids=EXAMS.years.find(y=>y.id===r.scope.paperId)?.occurrenceIds||[];
  else if(r.scope.type==='chapter')ids=DATA.questions.filter(q=>q.chapterId===r.scope.chapterId).map(q=>q.id);
  else if(r.scope.type==='kn')ids=findKn(r.scope.chapterId,r.scope.knId)?.questionIds||[];
  else ids=DATA.questions.map(q=>q.id);
  ids=ids.filter(id=>DATA.byId[id]&&DATA.byId[id].playable!==false&&(!r.scope.studyCategory||r.scope.studyCategory==='all'||(r.scope.studyCategory==='past'?DATA.byId[id].sourceType==='past_exam':r.scope.studyCategory==='geom'?['geom','inst'].includes(findChapter(DATA.byId[id].chapterId)?.source):findChapter(DATA.byId[id].chapterId)?.source==='phys')));
  return {done:ids.filter(id=>!!getStatus(statusKeyOf(DATA.byId[id]))).length,total:ids.length};
 }
 function metric(label,value,suffix,detail){const n=node('article','dashboard-metric');n.append(node('span','dashboard-metric-label',label));const v=node('div','dashboard-metric-value');v.append(node('strong',null,value),node('span',null,suffix));n.append(v,node('p',null,detail));return n;}
 function show(){
  if(!attached)return;active=true;document.body.classList.remove('study-page','notes-page');document.body.classList.add('dashboard-page');
  window.EnglishExams?.leave();window.OpticsElectronicNotes?.close();window.ExamTimer?.detach();
  const root=by('study-dashboard');root.hidden=false;root.replaceChildren();by('home-return').setAttribute('aria-current','page');
  document.querySelector('.page-eyebrow').textContent='STUDY / 学习首页';by('crumb').textContent='学习首页';by('crumb-sub').textContent='继续上一次练习，记录每一天的积累';by('progress').textContent='LEARNING / LOG';

  const card=node('section','study-panel dashboard-continue');card.append(node('span','study-kicker','RESUME / 继续做题'),node('h2',null,'继续学习'));
  const r=state.resume,p=progress(r),sum=totals(),detail=node('div','dashboard-resume-info');
  detail.append(node('h3',null,r?r.title:'准备开始你的第一段练习'));
  const meta=r?'上次停在第 '+r.number+' 题'+(r.kind==='optics'?' · '+statusFilterName(r.filter)+'筛选':'')+' · '+new Date(r.at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'选择一个章节或年份，开始后会自动保存位置。';
  detail.append(node('p','study-muted',meta));
  const lines=node('div','dashboard-progress-stack');
  function progressLine(name,done,total,kind,extra=''){
   const row=node('section','dashboard-progress-row');row.dataset.kind=kind;
   const labels=node('div','dashboard-progress-labels');labels.append(node('strong',null,name),node('span',null,total?'已完成 '+done+' / '+total+' 题 · 还剩 '+Math.max(0,total-done)+' 题':'选择章节后开始记录'));if(extra)labels.append(node('small',null,extra));
   const bar=node('progress');bar.max=total||1;bar.value=done;bar.setAttribute('aria-label',name+'：已完成 '+done+' / '+total+' 题');row.append(labels,bar);lines.append(row);
  }
  progressLine('当前练习',p.done,p.total,'current');
  progressLine('题库整体',sum.completed,sum.total,'bank','待巩固 '+sum.weak+' 题');
  detail.append(lines);
  if(r)detail.append(node('p','dashboard-footnote',r.kind==='retest'?'标记会做、不会做或不熟练后，计入本轮完成进度。':r.kind==='english'?'客观题提交批改、主观题批改完成后计入进度。':'手动标记会做、不会做或不熟练后，计入完成进度。'));
  card.append(detail,button(r?'继续做题 →':'开始练习 →',resume,'study-button study-primary dashboard-resume'));root.append(card);
  const stats=node('section','dashboard-stats');const today=dateKey(),yesterday=previousDay(today);const n=state.days[today]?.length||0,prev=state.days[yesterday]?.length||0;
  const date=state.examDate?new Date(state.examDate+'T00:00:00'):null,midnight=new Date(today+'T00:00:00');const remaining=date?Math.ceil((date-midnight)/86400000):null;
  const countdown=metric('考试倒计时',remaining===null?'—':Math.max(0,remaining),'天',date?'目标日期 · '+state.examDate:'设置你的考试日期');
  const input=node('input','dashboard-date');input.type='date';input.value=state.examDate;input.setAttribute('aria-label','考试日期');input.onchange=()=>{state.examDate=input.value;state.examDateAt=new Date().toISOString();save();show();};countdown.append(input);
  let streak=0,cursor=n?today:yesterday;while(state.days[cursor]?.length){streak++;cursor=previousDay(cursor);}
  stats.append(countdown,metric('今日刷题数',n,'题',prev?('昨日 '+prev+' 题 · '+(n===prev?'与昨日持平':'较昨日'+(n>prev?'增加 ':'减少 ')+Math.abs(Math.round((n-prev)/prev*100))+'%')):'昨日无刷题记录'),metric('连续学习',streak,'天','有效作答判定日连续累计'));root.append(stats);
  const width=by('scroller').clientWidth-56,weeks=width<608?13:width<800?17:26,activity=node('section','study-panel dashboard-activity'),title=node('div','dashboard-activity-head');title.append(node('h2',null,'学习活动'),node('span','study-muted','每日作答 · 近 '+weeks+' 周'));activity.append(title);
  const legend=node('div','dashboard-legend');legend.append(node('span',null,'刷题强度'));for(let i=0;i<5;i++){const swatch=node('i');swatch.dataset.level=i;swatch.title=['无','轻：1–5 次','中：6–15 次','高：16–30 次','很高：31 次及以上'][i];legend.append(swatch);}legend.append(node('span',null,'很高'));activity.append(legend);
  const viewport=node('div','dashboard-heatmap-scroll'),chart=node('div','dashboard-heatmap');chart.style.gridTemplateColumns='18px repeat('+weeks+',minmax(0,1fr))';chart.setAttribute('aria-label','刷题强度热力图（按作答判定次数）');
  const labels=node('div','dashboard-day-labels');labels.append(node('span',null,''));['日','一','二','三','四','五','六'].forEach(day=>labels.append(node('span',null,day)));chart.append(labels);
  const start=new Date(today+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-start.getUTCDay()-(weeks-1)*7);let lastMonth=-1,days=0;
  const dayDetail=node('div','dashboard-day-detail');dayDetail.hidden=true;
  for(let w=0;w<weeks;w++){
   const col=node('div','dashboard-week'),wd=new Date(start);wd.setUTCDate(start.getUTCDate()+w*7);const month=wd.getUTCMonth(),name=month!==lastMonth?month+1+'月':'';lastMonth=month;col.append(node('span','dashboard-month',name));
   for(let d=0;d<7;d++){
    const dt=new Date(wd);dt.setUTCDate(wd.getUTCDate()+d);const day=dt.toISOString().slice(0,10);if(day>today)continue;
    const count=state.days[day]?.length||0;if(count)days++;const cell=node('button','dashboard-day');cell.type='button';cell.dataset.day=day;cell.dataset.level=count===0?0:count<=5?1:count<=15?2:count<=30?3:4;cell.title=day+' · '+count+' 次作答判定';cell.setAttribute('aria-label',cell.title);if(day===today)cell.classList.add('is-today');
    cell.onclick=()=>{activityDay=day;dayDetail.hidden=false;dayDetail.replaceChildren(node('h3',null,day+' · '+count+' 次作答判定'));(state.days[day]||[]).forEach(id=>{const event=state.events[day]?.[id],q=DATA.byId[id];const row=node('div','dashboard-day-record');row.append(node('span',null,event?.label||(q?(findChapter(q.chapterId)?.title||'光学题目')+' · '+q.number:'英语题目')),node('small',null,event?.level?({known:'会做',shaky:'不熟练',unknown:'不会做'}[event.level]):event?.kind==='objective'?'已提交批改':event?.kind==='subjective'?'批改完成':'历史学习记录'));if(q)row.append(button('查看原题',()=>{exit();location.hash='/bank';ui.statusFilter='all';ui.scope={type:'chapter',chapterId:q.chapterId};reselect({keepQuestionId:q.id});savePrefs();}));dayDetail.append(row);});if(!count)dayDetail.append(node('p',null,'当天没有作答判定记录。'));};col.append(cell);
   }chart.append(col);
  }
  viewport.append(chart);activity.append(viewport,dayDetail,node('p','dashboard-footnote','近 '+weeks+' 周记录 '+days+' 个作答日。点击日期可查看当日题目；选择选项或查看答案不计数，同日同题改评不重复累计。'));root.append(activity);
  const shortcuts=node('div','dashboard-shortcuts');[['章节题库',()=>{exit();location.hash='/bank';openBank();}],['历年真题',()=>{exit();location.hash='/exams';openExamHome();}],['掌握地图',()=>OpticsStudyTools.open('mastery')],['错题复测',()=>OpticsStudyTools.open('retest')],['返回开场',()=>{exit();location.hash='/home';}]].forEach(([text,fn])=>shortcuts.append(button(text+' →',fn)));root.append(shortcuts,node('p','dashboard-storage-note',storageText()));reflectLights();
 }
 function storageText(){return writable?(window.OpticsDashboardCloud?.summary().text||'离线记录会先保存在本机。'):'本机记录保存失败，请先备份已有记录。';}
 function receiveCloud(values){
  const prefix='settings:study-home.';
  for(const [k,v] of Object.entries(values)){
   if(k===prefix+'resume'&&v&&['optics','english','retest'].includes(v.kind)&&typeof v.at==='string')state.resume=v;
   else if(k===prefix+'exam-date'&&v&&(/^\d{4}-\d{2}-\d{2}$/.test(v.date)||v.date==='')){state.examDate=v.date;state.examDateAt=v.at||'';}
   else if(k.startsWith(prefix+'day:')&&v&&Array.isArray(v.ids)){
    const day=k.slice((prefix+'day:').length);if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;
    state.days[day]=[...new Set(v.ids.filter(id=>typeof id==='string'))];state.events[day]=v.events||{};state.removed[day]=v.removed||{};
   }
  }
  try{localStorage.setItem(key,JSON.stringify(state));}catch(_){writable=false;}
  if(active)show();reflectLights();
 }
 function reflectLights(){
  const host=by('dashboard-statusbar');if(!host)return;
  const cloud=window.OpticsDashboardCloud?.summary(),optics=window.OpticsCloud?.summary();
  const entries=[['存储正常',writable?'ok':'error'],[!cloud?.enabled?'未登录':cloud.problem?'云端未连接':cloud.running||cloud.pending||optics?.pending?'同步中':cloud.ready?'云端已同步':'连接中',!cloud?.enabled||cloud.problem?'idle':cloud.running||cloud.pending||optics?.pending?'pending':'ok'],['今日 '+(state.days[dateKey()]?.length||0)+' 题','ok']];
  entries.forEach(([text,tone],index)=>{let item=host.children[index];if(!item){item=node('span','dashboard-status-item');const lamp=node('i','dashboard-status-lamp');lamp.setAttribute('aria-hidden','true');item.append(lamp,document.createTextNode(''));host.append(item);}item.firstElementChild.dataset.tone=tone;item.lastChild.nodeValue=text;});
 }
 function attach(){
  if(attached)return;key=OpticsCloud.localKey('gopt.study-home.v1');
  loadState();account=window.OpticsAuth?.user?.id||null;
  attached=true;
  const statusbar=node('div','dashboard-statusbar');statusbar.id='dashboard-statusbar';statusbar.setAttribute('role','status');document.querySelector('.actionbar').append(statusbar);
  window.OpticsDashboardCloud?.attach(()=>copy(state),receiveCloud);
  window.addEventListener('dashboard:sync',()=>{const foot=document.querySelector('.dashboard-storage-note');if(foot)foot.textContent=storageText();reflectLights();});
  window.addEventListener('optics:sync-status',reflectLights);
  by('home-return').onclick=open;document.querySelector('.brand-home').onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();open();};
  if(!state.resume&&legacy&&DATA.byId[legacy.lastQuestionId]&&['all','chapter','kn','exam'].includes(legacy.scope?.type)){const q=DATA.byId[legacy.lastQuestionId];state.resume={kind:'optics',scope:legacy.scope,filter:legacy.statusFilter||'all',questionId:q.id,title:legacy.scope.type==='exam'?q.year+' 年真题':(findChapter(q.chapterId)?.title||'全部题目'),number:String(q.number),at:new Date().toISOString()};save();}
  window.addEventListener('hashchange',()=>{if(location.hash==='#/dashboard'){show();}else{const was=active;exit();if(was&&location.hash!=='#/home')render();capture();}});

  window.addEventListener('storage',e=>{if(e.key===key&&e.newValue){try{const other=JSON.parse(e.newValue);if(other&&other.days){loadState();if(active)show();}}catch(_){}}});
  document.addEventListener('keydown',e=>{if(active&&['ArrowLeft','ArrowRight'].includes(e.key)&&!e.target.matches('input,textarea,select')&&!e.target.closest('dialog'))e.stopImmediatePropagation();},true);
  OpticsAuth?.subscribe(()=>{const next=OpticsAuth.user?.id||null;if(next===account)return;account=next;loadState();if(active)show();});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(active)show();},150);});
  if(location.hash==='#/dashboard')show();else capture();
 }
 const baseStart=window.start;window.start=function(){try{legacy=JSON.parse(localStorage.getItem(OpticsCloud.localKey('gopt.prefs.v1'))||'null');}catch(_){}return baseStart.apply(this,arguments);};
 const baseRender=window.render;window.render=function(){if(active&&location.hash==='#/dashboard'){show();return;}baseRender();capture();};
 const baseScope=window.setScope;window.setScope=function(scope,opts){if(active){exit();location.hash='/bank';}return baseScope(scope,opts);};
 const baseStatus=window.changeStatus;window.changeStatus=function(val){const q=currentQuestion();baseStatus(val);capture();};
 const baseSetStatus=window.setStatus;window.setStatus=function(id,value){const old=getStatus(id),result=baseSetStatus.apply(this,arguments);if(attached&&value&&value!==old){const q=DATA.byId[id]||DATA.questions.find(q=>statusKeyOf(q)===id);if(q&&q.playable!==false)record(q.canonicalId||q.statusKey||q.id,{kind:'assessment',level:value});}return result;};
 window.OpticsDashboard={attach,open,resume,record,undo:undoRecord,englishPosition,retestPosition,totals,progress:()=>progress(state.resume),counts:()=>copy(state.days)};
})();
