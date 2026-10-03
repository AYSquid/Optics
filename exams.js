/* Year occurrences reuse the existing practice renderer, keeping canonical status shared. */
var EXAMS={years:[],occurrences:[],relations:[]}, examProgress={positions:{},marks:{},choices:{}}, examWritable=true;
var EXAM_STORE_KEY='gopt.exams.v1';
var EXAM_SUBJECT='optics';
function renderExamSubjectPicker(into,subject){
 var existing=into.querySelector(".exam-subject-picker");if(existing && existing.dataset.subject===subject)return;
 var picker=el('details','exam-subject-picker exam-subject-picker--header'),summary=el('summary',null,subject==='english'?'考研英语':'浙江大学 · 841 工程光学基础'),menu=el('div','exam-subject-menu');
 picker.dataset.subject=subject;
 summary.setAttribute('aria-label','切换真题科目');
 menu.setAttribute('popover','manual');
 menu.appendChild(el('span',null,'SUBJECT / 科目'));
 [['optics','浙江大学 · 841 工程光学基础'],['english','考研英语']].forEach(function(item){var b=el('button',null,(item[0]===subject?'◆ ':'　')+item[1]);b.type='button';b.setAttribute('aria-pressed',String(item[0]===subject));b.onclick=function(){if(menu.hidePopover)menu.hidePopover();picker.open=false;location.hash='/exams/'+item[0];};menu.appendChild(b);});
 picker.append(summary,menu);
 picker.addEventListener('click',function(e){e.stopPropagation();});
 picker.addEventListener('keydown',function(e){e.stopPropagation();if(e.target===summary && (e.key==='Enter' || e.key===' ')){e.preventDefault();picker.open=!picker.open;return;}if(e.key==='Escape'){if(menu.hidePopover)menu.hidePopover();picker.open=false;summary.focus();}});
 picker.addEventListener('toggle',function(){
  if(!picker.isConnected)return;
  if(picker.open){var box=summary.getBoundingClientRect(),width=Math.min(360,innerWidth-24);menu.style.left=Math.max(12,Math.min(box.left,innerWidth-width-12))+'px';menu.style.top=(box.bottom+8)+'px';menu.style.width=width+'px';if(menu.showPopover)menu.showPopover();}
  else if(menu.hidePopover && menu.matches(':popover-open'))menu.hidePopover();
 });
 menu.addEventListener('toggle',function(e){if(e.newState==='closed')picker.open=false;});
 into.replaceChildren(picker);
}

function closeExamSubjectPicker(){var picker=document.querySelector('#crumb .exam-subject-picker');if(picker)picker.open=false;}
document.addEventListener('pointerdown',function(e){var picker=document.querySelector('#crumb .exam-subject-picker');if(picker && !picker.contains(e.target))closeExamSubjectPicker();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeExamSubjectPicker();});
window.addEventListener('resize',closeExamSubjectPicker);

function initExams(data){
 EXAM_STORE_KEY=window.OpticsCloud?OpticsCloud.localKey('gopt.exams.v1'):'gopt.exams.v1';
 EXAMS=data; EXAMS.byOccurrence={}; EXAMS.canonical={};
 data.canonicalQuestions.forEach(function(q){EXAMS.canonical[q.id]=q;});
 data.occurrences.forEach(function(o){
  EXAMS.byOccurrence[o.id]=o;
  var q=EXAMS.canonical[o.questionId]||DATA.byId[o.questionId];
  DATA.byId[o.id]=Object.assign({},q,{id:o.id,occurrenceId:o.id,canonicalId:o.questionId,statusKey:q.statusKey||o.questionId,stem:o.stem,options:o.options,answer:o.answer||[],analysis:o.analysis||[],answerAvailability:o.answerAvailability,review:o.review||q.review,number:o.questionNumber,year:o.year,section:o.section,order:o.order,playable:o.playable,completeness:o.completeness,typeName:o.revisionKind==='drawing'?'作图题':q.typeName,origin:{file:o.sourceFile,line:o.sourceLine}});
 });
 try{var p=JSON.parse(localStorage.getItem(EXAM_STORE_KEY)||'{}');['positions','marks','choices'].forEach(function(k){if(p[k]&&typeof p[k]==='object'&&!Array.isArray(p[k]))examProgress[k]=p[k];});}catch(e){examWritable=false;}
 Object.keys(examProgress.choices).forEach(function(id){var q=DATA.byId[id],pick=examProgress.choices[id];if(validChoiceSelection(q,pick))ui.choicePick[id]=pick;});
 Object.keys(examProgress.marks).forEach(function(id){if(!EXAMS.byOccurrence[id]||['known','unknown','shaky'].indexOf(examProgress.marks[id])<0)delete examProgress.marks[id];});
 $('module-bank').onclick=function(){location.hash='/bank';openBank();};
 $('module-exams').onclick=function(){location.hash='/exams';openExamHome();};
 window.addEventListener('hashchange',routeExam);
}
function persistExam(){if(!examWritable)return;try{localStorage.setItem(EXAM_STORE_KEY,JSON.stringify(examProgress));if(window.OpticsCloud)OpticsCloud.capture();}catch(e){examWritable=false;store.writable=false;store.message='浏览器无法保存学习记录，本次真题进度仅保存在当前页面。';renderStoreNote();}}
function saveExamChoice(q){if(ui.choicePick[q.id])examProgress.choices[q.id]=ui.choicePick[q.id];else delete examProgress.choices[q.id];persistExam();}
function markExamOccurrence(q,val){if(val)examProgress.marks[q.id]=val;else delete examProgress.marks[q.id];persistExam();}
function examYear(){return EXAMS.years.find(function(y){return y.id===ui.scope.paperId;});}
function openBank(){setScope({type:'all'});}
function openExamHome(subject){closeNav();EXAM_SUBJECT=subject==='english'?'english':'optics';ui.scope={type:'exams'};ui.statusFilter='all';if(EXAM_SUBJECT==='english'){ui.scopeIds=[];ui.matchIds=[];EnglishExams.home();return;}reselect();savePrefs();}
function openExam(id){var y=EXAMS.years.find(function(y){return y.id===id;});if(!y)return;EXAM_SUBJECT='optics';closeNav();ui.scope={type:'exam',paperId:id};ui.statusFilter='all';reselect({keepQuestionId:examProgress.positions[id]});savePrefs();}
function routeExam(){var h=location.hash,route=h.match(/^#\/exams\/(optics|english)(?:\/([^/]+))?(?:\/([^/]+))?(?:\/(\d+))?$/);if(route){var subject=route[1];if(!route[2])openExamHome(subject);else if(subject==='optics')openExam(decodeURIComponent(route[2]));else{EXAM_SUBJECT='english';ui.scope={type:'english',paperId:decodeURIComponent(route[2])};ui.scopeIds=[];ui.matchIds=[];closeNav();EnglishExams.open(ui.scope.paperId,route[3],route[4]);}}else if(h==='#/exams')openExamHome();else if(h==='#/bank'){if(['exam','exams','english'].indexOf(ui.scope.type)>=0)openBank();}else if(h.indexOf('#/year/')===0){var id=decodeURIComponent(h.slice(7));if(ui.scope.type!=='exam'||ui.scope.paperId!==id)openExam(id);}}
var baseStart=start;start=function(){baseStart();routeExam();};
var baseScopeIds=buildScopeIds;buildScopeIds=function(){if(ui.scope.type==='exam'){var y=examYear();ui.scopeIds=y?y.occurrenceIds.slice():[];}else if(ui.scope.type==='exams'||ui.scope.type==='english')ui.scopeIds=[];else baseScopeIds();};
var baseTitle=scopeTitle;scopeTitle=function(){return ui.scope.type==='exams'?'历年真题':ui.scope.type==='exam'?(examYear()?examYear().year+' 年真题':'年份不存在'):baseTitle();};
var baseKn=currentKnNames;currentKnNames=function(q){return q.occurrenceId?(q.knowledge.points||[]):baseKn(q);};
var baseTree=renderTree;renderTree=function(){
 if(ui.scope.type!=='exam'&&ui.scope.type!=='exams'){baseTree();return;}
 var tree=$('tree');clear(tree);var list=el('div','exam-year-nav');
 var home=el('button',null,'全部年份');home.onclick=function(){location.hash='/exams';openExamHome();};list.appendChild(home);
 EXAMS.years.slice().sort(function(a,b){return b.year-a.year;}).forEach(function(y){var b=el('button',null,y.year+' 年　·　'+y.count+' 题');b.setAttribute('aria-current',ui.scope.paperId===y.id?'page':'false');b.onclick=function(){location.hash='/exams/optics/'+y.id;openExam(y.id);};list.appendChild(b);});tree.appendChild(list);
};
var baseRender=render;render=function(){
 if(ui.scope.type==='english'||ui.scope.type==='exams'&&EXAM_SUBJECT==='english'){EnglishExams.render();return;}
 EnglishExams.leave();
 var home=ui.scope.type==='exams',isExam=home||ui.scope.type==='exam';
 renderStudyScopeNavigation();
 $('status-filter').closest('.side-block').hidden=home;
 $('module-bank').setAttribute('aria-pressed',!isExam);$('module-exams').setAttribute('aria-pressed',isExam);
 document.querySelector('.page-eyebrow').textContent=isExam?'PAST PAPERS / 历年真题':'PRACTICE / 章节练习';
 document.querySelector('.side-scope .side-label').textContent=isExam?'按年份练习':'章节与知识点';
 $('exam-home').hidden=!home;document.querySelector('.actionbar').hidden=home;document.querySelector('.question-nav').hidden=home;
 if(home){ExamTimer.detach();document.querySelector('.optics-exam-timer')?.remove();renderTree();renderFilterBar();renderStoreNote();$('card').hidden=true;$('empty').hidden=true;$('notice').hidden=true;$('crumb').textContent='浙江大学 · 841 工程光学基础';$('crumb-sub').textContent='保留原卷题序，逐题练习';$('progress').textContent=EXAMS.years.length+' 份年份资料 · '+EXAMS.occurrences.length+' 条原题';renderExamHome();return;}
 var timerHost=document.querySelector('.optics-exam-timer');if(ui.scope.type==='exam'){if(!timerHost){timerHost=el('div','optics-exam-timer');$('card').before(timerHost);}ExamTimer.attach('optics:'+ui.scope.paperId,timerHost);}else{ExamTimer.detach();if(timerHost)timerHost.remove();}
 baseRender();var q=currentQuestion();if(!q)return;
 if(q.occurrenceId){if(!window.OpticsCloud||!OpticsCloud.isApplying()){examProgress.positions[ui.scope.paperId]=q.id;persistExam();}$('crumb-sub').textContent=q.section+' · 原题 '+q.number+' · '+(isMultipleChoice(q)?'多选题':q.typeName);}
 if(q.playable===false){if(!$('stem').querySelector('.exam-warning')){var note=el('div','exam-warning','原始资料'+(q.completeness==='needs_image'?'缺少题图':'不完整')+'，本题暂不支持在线作答。保留原题号与原文，等待补全。');$('stem').prepend(note);}$('options').querySelectorAll('button').forEach(function(b){b.disabled=true;});$('status-buttons').querySelectorAll('button').forEach(function(b){b.disabled=true;});}
};
function renderExamHome(){
 var root=$('exam-home');clear(root);var intro=el('div','exam-intro');renderExamSubjectPicker($('crumb'),'optics');intro.appendChild(el('h1',null,'循着年份，回到考场。'));intro.appendChild(el('p',null,'按原题顺序练习，分别记录每份试卷的进度。部分年份为回忆版，缺失题目会原位保留；已补入修订稿参考答案与解析；有疑点的答案另行标注，暂不自动判分。'));root.appendChild(intro);
 var grid=el('div','exam-grid');EXAMS.years.slice().sort(function(a,b){return b.year-a.year;}).forEach(function(y){var c=el('article','year-card');c.appendChild(el('h2',null,''+y.year));var drawings=y.occurrenceIds.filter(function(id){return EXAMS.byOccurrence[id].revisionKind==='drawing';}).length;c.appendChild(el('p',null,'选择 '+(y.typeCounts.choice||0)+' · 填空 '+(y.typeCounts.blank||0)+' · 计算／简答 '+((y.typeCounts.calc||0)-drawings)+(drawings?' · 作图 '+drawings:'')));c.appendChild(el('p',null,'已补参考答案 '+(y.answerCount||0)+' / '+y.count+' 题'));var marked=y.occurrenceIds.filter(function(i){return EXAMS.byOccurrence[i].playable&&!!examProgress.marks[i];}).length;c.appendChild(el('p',null,'已标记 '+marked+' / '+y.playableCount+' 道可练习题'));var pg=el('progress');pg.max=y.playableCount||1;pg.value=marked;pg.setAttribute('aria-label','已标记进度');c.appendChild(pg);c.appendChild(el('p',null,y.incompleteCount?'资料待核：'+y.incompleteCount+' 条缺失／含图题':'电子版题面已收录，非原卷完整性认证'));if(y.sourceNote){var detail=el('details');detail.appendChild(el('summary',null,'资料说明'));detail.appendChild(el('p',null,y.sourceNote));c.appendChild(detail);}var b=el('button',null,examProgress.positions[y.id]?'继续练习 →':'开始练习 →');b.onclick=function(){location.hash='/exams/optics/'+y.id;openExam(y.id);};c.appendChild(b);grid.appendChild(c);});root.appendChild(grid);
}
var baseRegions=applyRegions;applyRegions=function(q){baseRegions(q);if(!q||!ui.analysisOpen)return;
 var cid=q.canonicalId||q.id;var appearances=EXAMS.occurrences.filter(function(o){return o.questionId===cid;});var rels=EXAMS.relations.filter(function(r){return r.questionIds&&r.questionIds.indexOf(cid)>=0&&r.type.indexOf('possible_')!==0;});if(!appearances.length&&!rels.length)return;
 var box=el('div','exam-relations');box.appendChild(el('h3',null,'历年出现与关联'));
 if(appearances.length)box.appendChild(el('p',null,'出现 '+appearances.length+' 次：'+appearances.map(function(o){return o.year+' 年 '+o.section+' 第 '+o.questionNumber+' 题';}).join('；')));
 rels.forEach(function(r){box.appendChild(el('p',null,(r.type==='numeric_variant'?'参数变式：':'表述变式：')+r.reason));var ids=r.questionIds;var linked=EXAMS.occurrences.filter(function(o){return ids.indexOf(o.questionId)>=0;});box.appendChild(el('p',null,linked.map(function(o){return o.year+' 年 '+o.section+' '+o.questionNumber;}).join('；')));});$('analysis-body').appendChild(box);
};
