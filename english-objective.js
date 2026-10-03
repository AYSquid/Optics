/* Submission gates objective feedback; selections never reveal an answer. */
(function(){'use strict';
 const getMode=()=>EnglishStore.get('settings:mode','practice')==='paper'?'paper':'practice';
 function setMode(mode){EnglishStore.set('settings:mode',mode==='paper'?'paper':'practice');}
 function objectiveGroups(paper){return paper.groups.filter(g=>g.questions.some(q=>q.type==='objective'));}
 function key(paper,group,mode=getMode()){return 'submission:'+mode+':'+paper.id+(mode==='practice'?':'+group.id:'');}
 function valid(record){return !!record?.answers?.length && record.answers.every(a=>{const pick=EnglishStore.get('choice:'+a.id);return (pick?.key||null)===a.key && (pick?.at||null)===a.selectedAt;});}
 function submission(paper,group,mode=getMode()){const record=EnglishStore.get(key(paper,group,mode));return valid(record)?record:null;}
 function questions(paper,group,mode=getMode()){return (mode==='paper'?objectiveGroups(paper):[group]).flatMap(g=>g.questions.filter(q=>q.type==='objective').map(q=>({q,g})));}
 function missing(paper,group,mode=getMode()){return questions(paper,group,mode).filter(({q})=>!EnglishStore.get('choice:'+q.id)?.key).map(({q})=>q.number);}
 function submit(paper,group,mode=getMode()){
  const answers=questions(paper,group,mode).map(({q,g})=>{const pick=EnglishStore.get('choice:'+q.id),correct=!!pick&&pick.key===q.answer;return {id:q.id,number:q.number,groupId:g.id,kind:g.kind,label:g.label,key:pick?.key||null,selectedAt:pick?.at||null,answer:q.answer,correct,score:correct?q.maxScore:0,maxScore:q.maxScore};});
  const record={mode,paperId:paper.id,groupId:mode==='practice'?group.id:null,submittedAt:new Date().toISOString(),answers};EnglishStore.set(key(paper,group,mode),record);window.dispatchEvent(new Event('english:progress'));return record;
 }
 function result(paper,group,q){return submission(paper,group)?.answers.find(a=>a.id===q.id)||null;}
 function results(paperId,mode=getMode()){return EnglishStore.list('submission:'+mode+':'+paperId+(mode==='practice'?':':'')).map(r=>r.value).filter(r=>r?.paperId===paperId&&valid(r)).flatMap(r=>r.answers);}
 function totals(answers){return {right:answers.filter(a=>a.correct).length,count:answers.length,score:answers.reduce((n,a)=>n+a.score,0),max:answers.reduce((n,a)=>n+a.maxScore,0),missing:answers.filter(a=>!a.key).length};}
 window.EnglishObjective={getMode,setMode,submission,questions,missing,submit,result,results,totals,objectiveGroups};
})();
