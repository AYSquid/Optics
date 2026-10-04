/* Independent passage renderer. The passage DOM survives question changes. */
(function(){'use strict';
 const by=id=>document.getElementById(id),node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn,cls='btn btn-outline')=>{const b=node('button',cls,text);b.type='button';b.onclick=fn;return b;};
 const mobile=matchMedia('(max-width:900px)');
 let root=null,indexData=null,paper=null,group=null,qindex=0,token=0,mounted='',questionMounted='',sheet=false,overview=false,active=false,homeVariant=1,lastTrigger=null;
 function ensure(){if(!root){root=node('section','english-root');root.id='english-root';by('scroller').append(root);}EnglishStore.init();return root;}
 function sourceUrl(src){const url=new URL(src,new URL(paper.sourceUrl||paper.url,location.href));if(url.origin!==location.origin||!url.pathname.includes('/assets/english/'))return '';return url.href;}
 function markdown(text,into,translation=false){
  // Text-only nodes and explicitly local images; no arbitrary HTML execution.
  String(text||'').split(/\n\s*\n/).filter(s=>s.trim()&&s.trim()!=='---').forEach(block=>{
   const images=[...block.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
   images.forEach(m=>image(m[2],m[1],into));
   const rest=block.replace(/!\[[^\]]*\]\([^)]+\)/g,'').replace(/^>\s?/gm,'').replace(/^#{1,4}\s?/gm,'');
   if(rest.trim()){
    const p=node('p'),text=EnglishData.plain(rest);
    if(translation&&paper?.variant===1&&group?.kind==='translation'){
     EnglishData.translationSegments(text,group.questions).forEach(part=>{
      if(part.number){const mark=node('u','eng-translation-target',part.text);mark.dataset.question=String(part.number);mark.classList.toggle('is-current',part.number===current()?.number);mark.setAttribute('aria-label','第 '+part.number+' 题翻译句');p.append(mark);}
      else p.append(document.createTextNode(part.text));
     });
    }else p.textContent=text;
    into.append(p);
   }
  });
 }
 function image(src,alt,into){const url=sourceUrl(typeof src==='string'?src:src.src||src.path||'');if(!url)return;const img=node('img','eng-image');img.src=url;img.alt=alt||'试题材料';img.loading='lazy';img.tabIndex=0;const open=()=>openLightbox(url,img.alt);img.onclick=open;img.onkeydown=e=>{if(e.key==='Enter')open();};into.append(img);}
 function current(){return group?.questions[qindex];}
 function position(){return {groupId:group.id,question:qindex};}
 function remember(){if(!paper||!group)return;EnglishStore.set('position:'+paper.id,position());EnglishStore.set('last',{paperId:paper.id,...position()});window.OpticsDashboard?.englishPosition(paper,group,current());}
 function scrollKey(){return 'scroll:'+paper.id+':'+group.id;}
 function saveScroll(){if(paper&&group&&by('eng-passage'))EnglishStore.set(scrollKey(),by('eng-passage').scrollTop);}
 function versions(q){return EnglishStore.list('version:'+q.id+':').map(r=>r.value).filter(Boolean).sort((a,b)=>a.version-b.version);}
 function completed(q){return q.type==='objective'?!!EnglishStore.get('choice:'+q.id):versions(q).some(v=>v.status==='complete');}
 function shell(home=false){
  active=true;ensure();document.querySelector('.optics-exam-timer')?.remove();by('app').dataset.examSubject='english';by('scroller').classList.toggle('english-paper-open',!home);
  by('exam-home').hidden=true;by('card').hidden=true;by('empty').hidden=true;by('notice').hidden=true;
  document.querySelector('.actionbar').hidden=true;document.querySelector('.question-nav').hidden=true;
  by('status-filter').closest('.side-block').hidden=true;
  document.querySelector('.page-eyebrow').textContent='PAST PAPERS / 历年真题';
  document.querySelector('.side-scope .side-label').textContent=home?'英语年份':'试卷与篇章';
  by('module-bank').setAttribute('aria-pressed','false');by('module-exams').setAttribute('aria-pressed','true');
  root.hidden=false;
 }
 function modeButtons(){const box=node('div','eng-mode-buttons');box.setAttribute('aria-label','英语作答模式');['practice','paper'].forEach(mode=>{const b=button(mode==='practice'?'刷题模式':'套卷模式',()=>{if(mode===EnglishObjective.getMode())return;EnglishObjective.setMode(mode);questionMounted='';if(paper)buildPaper();else renderHome();});b.dataset.mode=mode;b.setAttribute('aria-pressed',String(mode===EnglishObjective.getMode()));box.append(b);});return box;}
 function syncBar(into){
  const bar=node('div','eng-sync');const status=node('span',null,EnglishStore.summary().text);status.id='eng-sync-status';bar.append(status,button('同步',()=>EnglishStore.sync(),'btn btn-ghost'),button('导出记录',()=>EnglishStore.exportData(),'btn btn-ghost'),modeButtons());
  const conflicts=EnglishStore.summary().conflicts;
  if(conflicts.length){const details=node('details');details.append(node('summary',null,'处理英语同步冲突'));conflicts.forEach(([key])=>{const row=node('div','eng-conflict');row.append(node('span',null,key),button('保留本机',()=>{EnglishStore.resolve(key,true);refresh();}),button('采用云端',()=>{EnglishStore.resolve(key,false);refresh();}));details.append(row);});bar.append(details);}
  into.append(bar);
 }
 async function home(){
  by('eng-submit-dialog')?.close();ExamTimer.detach();saveScroll();shell(true);mounted='';questionMounted='';paper=null;group=null;root.replaceChildren(node('p',null,'正在读取英语年份…'));
  const seq=++token;
  try{indexData=await EnglishData.index();if(seq!==token||!active)return;renderHome();}catch(e){if(seq===token)root.replaceChildren(node('p','eng-error',e.message),button('重试',home));}
 }
 function renderHome(){
  root.replaceChildren();const intro=node('div','exam-intro');intro.append(node('h1',null,'循着年份，回到考场。'),node('p',null,'按原题顺序练习，分别记录每份试卷的进度。客观题提交后判分；翻译和作文保存草稿及每次批改。'));
  const switcher=node('div','eng-variants');[1,2].forEach(v=>{const b=button('英语'+(v===1?'一':'二'),()=>{homeVariant=v;renderHome();});b.setAttribute('aria-pressed',String(v===homeVariant));switcher.append(b);});intro.append(switcher);root.append(intro);syncBar(root);
  const grid=node('div','exam-grid');indexData.papers.filter(p=>p.variant===homeVariant).sort((a,b)=>b.year-a.year).forEach(p=>{
   const card=node('article','year-card');card.append(node('h2',null,p.year));card.append(node('p',null,Object.entries(p.sectionCounts).map(([k,n])=>EnglishData.labels[k]+' '+n).join(' · ')));
   const done=EnglishStore.list('choice:'+p.id+'-').length+new Set(EnglishStore.list('version:'+p.id+'-').filter(r=>r.value?.status==='complete').map(r=>r.value.questionId)).size;
   const graded=EnglishObjective.results(p.id),stats=node('div','eng-objective-stats');Object.entries(p.objectiveSections||{}).forEach(([kind,items])=>{let right=0,score=0,answered=0;items.forEach(item=>{const pick=EnglishStore.get('choice:'+item.id);if(pick){answered++;}const result=graded.find(a=>a.id===item.id);if(result?.correct){right++;score+=item.score;}});stats.append(node('p',null,EnglishData.labels[kind]+'：'+right+' / '+items.length+'　'+score+' 分'+(!graded.some(a=>items.some(item=>item.id===a.id))?' · 未提交':'')+' · 已答 '+answered));});card.append(stats);card.append(node('p',null,'已作答 '+done+' / '+p.questionCount));const pg=node('progress');pg.max=p.questionCount;pg.value=done;pg.setAttribute('aria-label','英语完成进度');card.append(pg,button(EnglishStore.get('position:'+p.id)?'继续练习 →':'开始练习 →',()=>{closeNav();location.hash='/exams/english/'+p.id;},''));grid.append(card);
  });root.append(grid);renderExamSubjectPicker(by('crumb'),'english');by('crumb-sub').textContent='英语'+(homeVariant===1?'一 · 201':'二 · 204')+' · 2010–2026';by('progress').textContent=indexData.papers.filter(p=>p.variant===homeVariant).length+' 份英语试卷';tree();
 }
 async function open(id,groupId,question){
  if(/^\d{4}$/.test(id))id='english1-'+id;const keepSheet=sheet,oldKey=paper?.id+':'+group?.id;shell();const seq=++token;if(paper?.id!==id){saveScroll();root.replaceChildren(node('p',null,'正在载入这份英语试卷…'));mounted='';}
  try{
   indexData=indexData||await EnglishData.index();const next=await EnglishData.load(id);if(seq!==token||!active)return;
   const previous=EnglishStore.get('position:'+id,{});const nextGroup=next.groups.find(g=>g.id===(groupId||previous.groupId))||next.groups[0];
   if(paper&&group&&(paper.id!==next.id||group.id!==nextGroup.id))saveScroll();
   next.groups.sort((a,b)=>({cloze:0,reading:1,new:2,translation:3,short:4,long:5}[a.kind]??6)-({cloze:0,reading:1,new:2,translation:3,short:4,long:5}[b.kind]??6));next.groups.forEach(g=>{if(g.kind==='reading')g.label='阅读 '+String.fromCharCode(64+Number(g.id.replace('text','')));else if(g.kind==='cloze')g.label='完形';});paper=next;homeVariant=next.variant;group=nextGroup;qindex=question?group.questions.findIndex(q=>q.number===Number(question)):Number(previous.question||0);if(qindex<0||qindex>=group.questions.length)qindex=0;
   if(oldKey!==paper.id+':'+group.id)setSheet(false);buildPaper();if(keepSheet&&oldKey===paper.id+':'+group.id)setSheet(true);remember();
  }catch(e){if(seq===token)root.replaceChildren(node('p','eng-error',e.message),button('重试',()=>open(id,groupId,question)));}
 }
 function tree(){
  const nav=by('tree');nav.replaceChildren();const list=node('div','exam-year-nav');list.append(button(paper?'← 全部年份':'全部年份',()=>{closeNav();location.hash='/exams/english';},''));
  if(paper){
   paper.groups.filter(g=>!['short','long'].includes(g.kind)).forEach(g=>{const b=button(g.label,()=>navigate(g,0),'');b.setAttribute('aria-current',g.id===group?.id?'page':'false');list.append(b);});
   const writing=paper.groups.filter(g=>['short','long'].includes(g.kind));if(writing.length){const selected=writing.includes(group),b=button('作文',()=>navigate(selected?group:writing[0],0),'');b.setAttribute('aria-current',selected?'page':'false');list.append(b);}
  }else if(indexData)indexData.papers.filter(p=>p.variant===homeVariant).sort((a,b)=>b.year-a.year).forEach(p=>list.append(button(p.year+' 年　·　'+p.questionCount+' 题',()=>{closeNav();location.hash='/exams/english/'+p.id;},'')));
  nav.append(list);
 }
 function navigate(g,i){if(!paper)return;saveScroll();closeNav();location.hash='/exams/english/'+paper.id+'/'+g.id+'/'+g.questions[i].number;}
 function step(dir){if(dir>0&&EnglishObjective.getMode()==='paper'&&isLastObjective()&&!EnglishObjective.submission(paper,group)){confirmObjective();return;}const i=qindex+dir;if(i>=0&&i<group.questions.length)navigate(group,i);else{const n=paper.groups.indexOf(group)+dir;if(n>=0&&n<paper.groups.length){const g=paper.groups[n];navigate(g,dir>0?0:g.questions.length-1);}}}
 function buildPaper(){
  const key=paper.id+':'+group.id,changed=mounted!==key;
  if(changed){
   mounted=key;questionMounted='';overview=false;root.replaceChildren();
   const toolbar=node('div','eng-toolbar');toolbar.append(button('← 年份',()=>{saveScroll();location.hash='/exams/english';},'btn btn-ghost'),node('span','eng-paper-title',paper.year+' · 英语'+(paper.variant===1?'一':'二')+' · '+group.label));
   const tabs=node('div','eng-tabs');tabs.append(button('文章',()=>showOverview(false),'btn btn-ghost'),button('题目',()=>showOverview(true),'btn btn-ghost'));toolbar.append(tabs);const modeLabel=node('span','eng-mode-label');modeLabel.id='eng-mode-label';toolbar.append(modeLabel);const syncLabel=node('span','eng-paper-sync',EnglishStore.summary().text);syncLabel.id='eng-sync-status';toolbar.append(syncLabel);ExamTimer.attach('english:'+paper.id,toolbar);root.append(toolbar);
   const workspace=node('div','eng-workspace');workspace.dataset.kind=group.kind;
   const passage=node('article','eng-passage');passage.id='eng-passage';passage.tabIndex=0;passage.setAttribute('aria-label','文章，独立滚动');
   const title=node('h2',null,group.label);passage.append(title);markdown(group.passage||current().prompt,passage,true);
   [...passage.querySelectorAll('p')].forEach((p,i)=>{p.id='eng-paragraph-'+(i+1);p.dataset.paragraph=String(i+1);});
   let scrollTimer;passage.addEventListener('scroll',()=>{clearTimeout(scrollTimer);const k=scrollKey();scrollTimer=setTimeout(()=>EnglishStore.set(k,passage.scrollTop),180);},{passive:true});
   const panel=node('section','eng-question-panel');panel.id='eng-question-panel';panel.setAttribute('aria-label','当前题目');
   const content=node('div','eng-q-content');content.id='eng-q-content';panel.append(content);
   const overviewEl=node('div','eng-overview');overviewEl.id='eng-overview';overviewEl.hidden=true;
   workspace.append(passage,panel,overviewEl);root.append(workspace);
   const bar=button('',()=>setSheet(true),'eng-current-bar');bar.id='eng-current-bar';bar.setAttribute('aria-controls','eng-question-panel');root.append(bar);
   const backdrop=button('',()=>setSheet(false),'eng-sheet-backdrop');backdrop.id='eng-sheet-backdrop';backdrop.setAttribute('aria-label','关闭题目面板');backdrop.hidden=true;root.append(backdrop);
   passage.scrollTop=EnglishStore.get(scrollKey(),0);requestAnimationFrame(()=>{if(mounted===key)passage.scrollTop=EnglishStore.get(scrollKey(),0);});
  }
  if(questionMounted!==current().id){renderQuestion();questionMounted=current().id;}tree();by('crumb').textContent=paper.year+' · '+group.label;by('crumb-sub').textContent='考研英语'+(paper.variant===1?'一':'二')+' · 独立学习记录';by('progress').textContent='第 '+(qindex+1)+' 题 / 共 '+group.questions.length+' 题';
  by('eng-mode-label').textContent=EnglishObjective.getMode()==='practice'?'刷题模式 · 分篇提交':'套卷模式 · 统一批改';by('eng-current-bar').hidden=current().type!=='objective';root.dataset.kind=group.kind;setSheet(sheet);renderOverview();
 }
 function renderQuestion(){
  const q=current();if(!q)return;root.querySelectorAll('.eng-translation-target').forEach(mark=>mark.classList.toggle('is-current',Number(mark.dataset.question)===q.number));const content=by('eng-q-content');content.replaceChildren();
  const head=node('div','eng-q-head');head.append(node('span','eng-label','QUESTION / '+q.number),button('收起 ↓',()=>setSheet(false),'btn btn-ghost eng-sheet-close'));content.append(head);
  if(q.type==='writing'){const tabs=node('div','eng-writing-tabs');paper.groups.filter(g=>['short','long'].includes(g.kind)).forEach(g=>{const b=button(g.label,()=>navigate(g,0));b.setAttribute('aria-pressed',String(g===group));tabs.append(b);});content.append(tabs);}
  const prompt=node('div','eng-prompt');markdown(q.prompt,prompt);content.append(prompt);(q.images||[]).forEach(src=>image(src,'作文题图 / 图表',prompt));
  const paragraph=q.paragraph||q.paragraphIndex;if(paragraph)content.append(button('定位原文',()=>{showOverview(false);setSheet(false);const p=by('eng-paragraph-'+paragraph);if(p){p.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});p.classList.add('eng-located');setTimeout(()=>p.classList.remove('eng-located'),1800);}}));
  if(q.type==='objective'){
   const options=node('div','eng-options');q.options.forEach(o=>{const b=button('',()=>{if(EnglishStore.get('choice:'+q.id)?.key===o.key)return;EnglishStore.set('choice:'+q.id,{key:o.key,at:new Date().toISOString()});feedback();renderOverview();renderObjectiveSummary();if(EnglishObjective.getMode()==='paper'&&isLastObjective())confirmObjective();},'eng-option');b.dataset.key=o.key;b.append(node('strong','eng-option-key',o.key),node('span',null,o.text));options.append(b);});content.append(options);const feedbackEl=node('div','eng-feedback');feedbackEl.id='eng-feedback';feedbackEl.setAttribute('aria-live','polite');content.append(feedbackEl);const grading=node('div','eng-objective-summary');grading.id='eng-objective-summary';content.append(grading);const submit=button('',()=>confirmObjective(),'btn eng-objective-submit');submit.id='eng-objective-submit';content.append(submit);feedback();renderObjectiveSummary();
  }else{
   if(q.type==='translation')content.append(button('查看上下文',openContext,'btn btn-outline eng-context-button'));
   const label=node('label','eng-input-label',q.type==='translation'?'你的翻译':'你的作文');label.htmlFor='eng-answer';const input=node('textarea','eng-answer');input.id='eng-answer';input.placeholder=q.type==='translation'?'在这里输入中文翻译…':'Write your answer here…';input.value=EnglishStore.get('draft:'+q.id,'');input.rows=q.type==='translation'?8:14;
   const count=node('span','eng-word-count');const updateCount=()=>{const n=(input.value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;count.textContent=q.type==='writing'?n+' words · 草稿自动保存':'草稿自动保存';};updateCount();
   input.oninput=()=>{EnglishStore.set('draft:'+q.id,input.value);updateCount();};content.append(label,input,count);
   const submit=button('提交批改',()=>submitGrade(q,input.value,submit),'btn eng-submit');content.append(submit);const saveNote=node('p','eng-save-note');saveNote.id='eng-save-note';saveNote.setAttribute('role','status');content.append(saveNote);const grading=node('div','eng-grading');grading.id='eng-grading';content.append(grading);renderVersions(q);
  }
  const pager=node('nav','eng-pager');pager.setAttribute('aria-label','英语题目切换');const prev=button('← 上一题',()=>step(-1),'btn btn-ghost'),next=button(EnglishObjective.getMode()==='paper'&&isLastObjective()&&!EnglishObjective.submission(paper,group)?'完成客观题 / 批改套卷':'下一题 →',()=>step(1),'btn btn-ghost');prev.disabled=qindex===0&&paper.groups.indexOf(group)===0;next.disabled=qindex===group.questions.length-1&&paper.groups.indexOf(group)===paper.groups.length-1;pager.append(prev,node('span',null,(qindex+1)+' / '+group.questions.length),next);content.append(pager);
  by('eng-current-bar').textContent='Q'+q.number+'　'+EnglishData.plain(q.prompt).slice(0,90)+'　↑';
 }
 function isLastObjective(){const last=EnglishObjective.objectiveGroups(paper).at(-1);return group===last&&qindex===group.questions.length-1;}
 function feedback(){const q=current();if(!q||q.type!=='objective')return;const pick=EnglishStore.get('choice:'+q.id),result=EnglishObjective.result(paper,group,q);document.querySelectorAll('.eng-option').forEach(b=>{b.setAttribute('aria-pressed',String(pick?.key===b.dataset.key));b.dataset.verdict=result?(b.dataset.key===result.answer?'correct':b.dataset.key===result.key?'wrong':''):'';});if(by('eng-feedback'))by('eng-feedback').textContent=result?(result.correct?'✓ 正确':(result.key?'× 选择错误':'○ 未答')+'，正确答案 '+result.answer)+(q.answerText?' · '+q.answerText:''):pick?'已选 '+pick.key+' · 提交后显示答案':'';}
 function renderOverview(){if(!group||!by('eng-overview'))return;const box=by('eng-overview');box.replaceChildren(node('h2',null,group.label+' · 题目总览'));group.questions.forEach((q,i)=>{const choice=EnglishStore.get('choice:'+q.id),result=q.type==='objective'?EnglishObjective.result(paper,group,q):null;const label=result?(result.correct?'✓ ':'× ')+(result.key||'未答'):choice?'已选 '+choice.key:completed(q)?'✓ 已批改':i===qindex?'● 当前':'○ 未答';const b=button(q.number+'　'+label,()=>{showOverview(false);navigate(group,i);},'btn btn-outline');b.dataset.verdict=result?(result.correct?'correct':'wrong'):'';box.append(b);});}
 function renderObjectiveSummary(){const box=by('eng-objective-summary');if(!box||!paper)return;const record=EnglishObjective.submission(paper,group),mode=EnglishObjective.getMode();box.replaceChildren();if(record){const t=EnglishObjective.totals(record.answers);box.append(node('p',null,(mode==='paper'?'客观题总分':'本篇得分')+'：'+t.score+' / '+t.max+' 分 · 正确 '+t.right+' / '+t.count),button('查看批改明细',()=>showObjectiveResults(record),'btn btn-outline'));}const submit=by('eng-objective-submit');const next=by('eng-q-content')?.querySelector('.eng-pager button:last-child');if(next&&mode==='paper'&&isLastObjective())next.textContent=record?'下一题 →':'完成客观题 / 批改套卷';if(submit)submit.textContent=mode==='paper'?(record?'重新批改套卷':'提交套卷'):(record?'重新提交本篇':group.kind==='reading'?'提交本篇答案':'提交'+EnglishData.labels[group.kind]);}
 function gradeDialog(){const d=node('dialog','eng-grade-dialog');d.id='eng-submit-dialog';d.setAttribute('aria-label','英语客观题批改');document.body.append(d);const trigger=document.activeElement;d.addEventListener('close',()=>{d.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});});d.showModal();return d;}
 function confirmObjective(){if(!paper||by('eng-submit-dialog')?.open)return;by('eng-submit-dialog')?.remove();const targetPaper=paper,targetGroup=group,mode=EnglishObjective.getMode(),missing=EnglishObjective.missing(targetPaper,targetGroup,mode),d=gradeDialog();d.append(node('h2',null,mode==='paper'?'是否批改这份套卷？':'提交本篇答案？'),node('p',null,mode==='paper'?'统一批改完形、四篇阅读与新题型；主观题另行提交 AI 批改。':'提交后显示本篇得分、正误和正确答案。'));if(missing.length){d.append(node('p','eng-missing-warning','还有 '+missing.length+' 题未作答，确认后按 0 分计入。'),node('p','eng-missing-list','未答题号：'+missing.join('、')));}else d.append(node('p',null,'本次批改范围内的题目已全部作答。'));const row=node('div','eng-dialog-actions');row.append(button('继续作答',()=>d.close(),'btn btn-outline'),button('确认批改',()=>{const record=EnglishObjective.submit(targetPaper,targetGroup,mode);if(mode==='paper')ExamTimer.pause();feedback();renderOverview();renderObjectiveSummary();showObjectiveResults(record,d);},'btn eng-confirm-grade'));d.append(row);}
 function showObjectiveResults(record,d=null){if(!d){if(by('eng-submit-dialog')?.open)return;by('eng-submit-dialog')?.remove();d=gradeDialog();}d.replaceChildren();const t=EnglishObjective.totals(record.answers);d.append(node('h2',null,record.mode==='paper'?'套卷客观题批改结果':'本篇批改结果'),node('p','eng-result-total',t.score+' / '+t.max+' 分'),node('p',null,'正确 '+t.right+' / '+t.count+' · 未答 '+t.missing));const stats=node('div','eng-objective-stats');['cloze','reading','new'].forEach(kind=>{const answers=record.answers.filter(a=>a.kind===kind);if(answers.length){const v=EnglishObjective.totals(answers);stats.append(node('p',null,EnglishData.labels[kind]+'：'+v.right+' / '+v.count+'　'+v.score+' 分'));}});d.append(stats);const grid=node('div','eng-result-grid');record.answers.forEach(a=>{const b=button(a.number+' '+(a.correct?'✓':a.key?'×':'○'),()=>{d.close();const g=paper?.groups.find(g=>g.id===a.groupId);if(g){navigate(g,g.questions.findIndex(q=>q.id===a.id));if(mobile.matches)setTimeout(()=>setSheet(true),600);}},'btn btn-outline');b.dataset.verdict=a.correct?'correct':'wrong';b.setAttribute('aria-label','第 '+a.number+' 题：'+(a.correct?'正确':a.key?'错误':'未答'));grid.append(b);});d.append(grid,button('返回试卷',()=>d.close(),'btn btn-outline'));}
 function showOverview(value){overview=value;if(by('eng-overview')){by('eng-overview').hidden=!value;by('eng-passage').inert=value;by('eng-passage').setAttribute('aria-hidden',String(value));}if(value)setSheet(false);}
 function setSheet(value){
  sheet=!!value&&mobile.matches&&current()?.type==='objective';const panel=by('eng-question-panel');if(!panel)return;
  const objective=current()?.type==='objective';panel.classList.toggle('eng-sheet-open',sheet);panel.inert=mobile.matches&&objective&&!sheet;
  panel.setAttribute('aria-hidden',String(mobile.matches&&objective&&!sheet));if(sheet){panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');lastTrigger=document.activeElement;requestAnimationFrame(()=>panel.querySelector('button')?.focus());}else{panel.removeAttribute('role');panel.removeAttribute('aria-modal');}
  by('eng-current-bar').setAttribute('aria-expanded',String(sheet));by('eng-sheet-backdrop').hidden=!sheet;by('eng-passage').inert=sheet||overview;
  if(!sheet&&lastTrigger?.isConnected){lastTrigger.focus({preventScroll:true});lastTrigger=null;}
 }
 function openContext(){const d=node('dialog','eng-context');d.append(button('关闭',()=>d.close(),'btn btn-outline'));const article=node('article','eng-context-content');markdown(group.passage,article,true);d.append(article);document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();}
 async function submitGrade(q,answer,submit){
  if(!answer.trim()){by('eng-save-note').textContent='请先输入答案';return;}
  const gradingPaper=paper,gradingGroup=group;const prior=versions(q),previous=prior.filter(v=>v.status==='complete').at(-1),id=crypto.randomUUID(),key='version:'+q.id+':'+id;
  const record={id,questionId:q.id,version:prior.length+1,answer,status:'pending',createdAt:new Date().toISOString(),result:null};EnglishStore.set(key,record);window.OpticsDashboard?.record(q.id);submit.disabled=true;by('eng-save-note').textContent='正在批改，当前答案已保存为 Version '+String(record.version).padStart(2,'0');renderVersions(q);
  try{const result=await EnglishGrader.grade(gradingPaper,gradingGroup,q,answer,previous);EnglishStore.set(key,{...record,status:'complete',result});}
  catch(e){EnglishStore.set(key,{...record,status:'error',error:e.message});}
  finally{if(current()?.id===q.id&&by('eng-grading')){submit.disabled=false;by('eng-save-note').textContent='';renderVersions(q);}}
 }
 function renderVersions(q){
  const into=by('eng-grading');if(!into)return;into.replaceChildren();const list=versions(q),success=list.filter(v=>v.status==='complete');
  if(success.length>1){const before=success.at(-2).result.score,after=success.at(-1).result.score;into.append(node('div','eng-score-change',before+' → '+after+'　'+(after>=before?'+':'')+(after-before)));}
  list.slice().reverse().forEach((v,i)=>{const detail=node('details','eng-version');detail.open=i===0;detail.append(node('summary',null,'Version '+String(v.version).padStart(2,'0')+' · '+(v.status==='complete'?v.result.score+' / '+q.maxScore:v.status==='pending'?'等待批改':'批改未完成')));detail.append(node('p','eng-original-answer',v.answer));
   if(v.status==='error')detail.append(node('p','eng-error',v.error));else if(v.status==='pending')detail.append(node('p',null,'提交记录已保存。若刷新中断了批改，可以再次提交，旧版本会保留。'));else{
    const r=v.result;detail.append(node('h3',null,'01 / SCORE'),node('p','eng-score',r.score+' / '+q.maxScore+(r.band?' · '+r.band:'')+' · AI 估分'),node('h3',null,'02 / FEEDBACK'),node('p',null,r.summary));
    r.points.forEach(p=>detail.append(node('p',null,p.point+'：'+p.feedback+(p.max>0?'　'+p.earned+' / '+p.max:''))));
    r.dimensions.forEach(d=>detail.append(node('p',null,d.name+'：'+d.assessment)));
    r.issues.forEach(i=>{const names={grammar:'语法',collocation:'搭配',expression:'表达',structure:'结构与逻辑',translation:'翻译'};detail.append(node('p',null,(names[i.category]||i.category)+' · '+i.original+' → '+i.suggestion+'；'+i.reason));});
    detail.append(node('h3',null,'03 / REVISION'));r.revisions.forEach(s=>detail.append(node('p',null,s.original+' → '+s.revised+'；'+s.reason)));detail.append(node('p','eng-revised-answer',r.revisedAnswer));const ref=node('details');ref.append(node('summary',null,'参考译文 / 范文与采分点'));markdown(q.reference,ref);detail.append(ref);
    if(r.improvements.length){detail.append(node('h3',null,'本次改善'));r.improvements.forEach(x=>detail.append(node('p',null,x)));}if(r.remaining.length){detail.append(node('h3',null,'仍存在的问题'));r.remaining.forEach(x=>detail.append(node('p',null,x)));}
   }into.append(detail);
  });
 }
 function leave(){by('eng-submit-dialog')?.close();if(active){saveScroll();setSheet(false);ExamTimer.detach();token++;active=false;questionMounted='';}if(root)root.hidden=true;by('scroller').classList.remove('english-paper-open');delete by('app').dataset.examSubject;}
 function refresh(){if(!active)return;if(!paper){if(indexData)renderHome();return;}feedback();renderOverview();renderObjectiveSummary();if(current()?.type!=='objective')renderVersions(current());}
 window.addEventListener('english:sync-status',()=>{if(by('eng-sync-status'))by('eng-sync-status').textContent=EnglishStore.summary().text;});window.addEventListener('english:progress',refresh);
 window.addEventListener('pagehide',saveScroll);mobile.addEventListener('change',()=>setSheet(false));
 document.addEventListener('keydown',e=>{if(!active)return;if(sheet&&e.key==='Escape'){e.preventDefault();setSheet(false);}if(sheet&&e.key==='Tab'){const items=[...by('eng-question-panel').querySelectorAll('button:not([disabled]),textarea')];const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
 if(window.visualViewport){const update=()=>document.documentElement.style.setProperty('--eng-visible-height',visualViewport.height+'px');visualViewport.addEventListener('resize',update);update();}
 window.EnglishExams={home,open,leave,refresh,render:()=>{if(ui.scope.type==='exams'){if(!active||paper)home();else if(indexData)renderHome();}else if(active&&paper)buildPaper();},navigate,get current(){return current();},get paper(){return paper;},get group(){return group;}};
})();
