/* Read the existing Markdown corpus. No second question or rubric database. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EnglishData=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const labels={cloze:'完形填空',reading:'阅读',new:'新题型',translation:'翻译',short:'小作文',long:'大作文'};
 const plain=s=>s.replace(/&nbsp;/g,' ').replace(/\\_/g,'_').replace(/\*\*/g,'').replace(/<\/?u>/g,'').trim();
 // Match translation targets while preserving the original paragraph and punctuation.
 function translationSegments(text,questions){
  const canonical=s=>s.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'');
  let folded='',starts=[],ends=[],offset=0;
  for(const char of text){const key=canonical(char);for(let i=0;i<key.length;i++){starts.push(offset);ends.push(offset+char.length);}folded+=key;offset+=char.length;}
  const ranges=[];
  for(const q of questions){
   const target=canonical(plain(q.prompt||''));if(!target)continue;
   const at=folded.indexOf(target);if(at<0)continue;
   const start=starts[at];let end=ends[at+target.length-1];
   if(/[.!?…]$/.test(plain(q.prompt||''))){const tail=text.slice(end).match(/^\s*[.!?…]/);if(tail)end+=tail[0].length;}
   ranges.push({start,end,number:q.number});
  }
  const segments=[];let cursor=0;
  ranges.sort((a,b)=>a.start-b.start).forEach(r=>{if(r.start<cursor)return;if(r.start>cursor)segments.push({text:text.slice(cursor,r.start)});segments.push({text:text.slice(r.start,r.end),number:r.number});cursor=r.end;});
  if(cursor<text.length)segments.push({text:text.slice(cursor)});
  return segments;
 }
 function sections(text){
  const blocks=[];let current=null,context='',kind='';
  text.split(/\r?\n/).forEach(line=>{
   const h=line.match(/^#{2,3}\s+(.+)/);
   if(h){
    const title=h[1];
    if(/Section I\s+Use/.test(title)){kind='cloze';context='cloze';}
    else if(/Reading Comprehension/.test(title)){context='reading';kind=/Part B/.test(title)?'new':/Part C/.test(title)?'translation':'reading';}
    else if(/Translation/.test(title)){context='translation';kind='translation';}
    else if(/Writing/.test(title)){context='writing';kind=/Part B/.test(title)?'long':'short';}
    else if(/^Part [ABC]/.test(title)){kind=context==='writing'?(/B/.test(title)?'long':'short'):/B/.test(title)?'new':/C/.test(title)?'translation':'reading';}
    else if(/^Text\s*\d/.test(title)){kind='reading';}
    else return;
    current={kind,title,raw:''};blocks.push(current);
   }else if(current)current.raw+=line+'\n';
  });
  return blocks.filter(b=>b.raw.trim());
 }
 function options(text){
  const pattern=/(?:^|\n|\s)(?:-\s*)?(?:\*\*)?([A-H])[.)](?:\*\*)?\s+/g;
  const clean=text.replace(/&nbsp;/g,' '),matches=[...clean.matchAll(pattern)];
  return matches.map((m,i)=>({key:m[1],text:plain(clean.slice(m.index+m[0].length,i+1<matches.length?matches[i+1].index:clean.length))}));
 }
 function numbered(raw,min,max){
  const pattern=/^\s*(?:-\s*)?(?:\*\*)?(\d{1,2})[.)](?:\*\*)?\s*(.*)/gm;
  const matches=[...raw.matchAll(pattern)].filter(m=>Number(m[1])>=min&&Number(m[1])<=max);
  return matches.map((m,i)=>({number:Number(m[1]),text:raw.slice(m.index+m[0].length-m[2].length,i+1<matches.length?matches[i+1].index:raw.length).trim(),index:m.index}));
 }
 function parse(text,{id,variant,year,url}={}){
  const parts=text.split(/^##\s+参考答案\s*$/m);if(parts.length!==2)throw Error('参考答案分区缺失：'+id);
  const body=sections(parts[0]),refs=sections(parts[1]),answers={};
  for(const m of parts[1].matchAll(/^\*\*(\d+)\.\*\*\s*([A-H])\s*·\s*(.*)$/gm))answers[Number(m[1])]={key:m[2],text:m[3]};
  for(const m of parts[1].matchAll(/\*\*(\d+)[–—-](\d+)\*\*\s*[：:]\s*([A-HT\s]+)/g)){const start=Number(m[1]),end=Number(m[2]),keys=m[3].trim().split(/\s+/);if(keys.length!==end-start+1)throw Error(id+'答案范围不完整');keys.forEach((key,i)=>answers[start+i]={key});}
  let reading=0;const groups=[];
  body.forEach(block=>{
   const kind=block.kind, reference=refs.find(r=>r.kind===kind)?.raw||'';
   const group={id:kind==='reading'?'text'+(++reading):kind,kind,label:kind==='reading'?'Text '+reading:labels[kind],passage:'',questions:[],source:url,reference};
   if(['cloze','reading'].includes(kind)){
    const rows=numbered(block.raw,kind==='cloze'?1:21,kind==='cloze'?20:40);
    if(!rows.length)return;
    group.passage=block.raw.slice(0,rows[0].index).trim();
    group.questions=rows.map(row=>{const opts=options(row.text);const first=row.text.search(/(?:^|\n|\s)(?:-\s*)?(?:\*\*)?[A-H][.)](?:\*\*)?\s+/);return {number:row.number,prompt:plain(first<0?row.text:row.text.slice(0,first))||'第 '+row.number+' 空',options:opts,answer:answers[row.number]?.key||'',answerText:answers[row.number]?.text||'',maxScore:kind==='cloze'?.5:2};});
   }else if(kind==='new'){
    group.passage=block.raw.trim();let opts=options(block.raw);
    // Match headings/options may precede or follow the numbered blanks.
    opts=opts.filter((o,i,a)=>a.findIndex(x=>x.key===o.key)===i);
    if(/Choose T if|true or false/i.test(block.raw))opts=[{key:'T',text:'True'},{key:'F',text:'False'}];
    group.questions=Array.from({length:5},(_,i)=>{const n=41+i;const row=numbered(block.raw,41,45).find(q=>q.number===n);return {number:n,prompt:row?plain(row.text.split('\n')[0]):'第 '+n+' 空 / 匹配项',options:opts,answer:answers[n]?.key||'',maxScore:2};});
   }else if(kind==='translation'){
    if(variant===1){
     let rows=numbered(block.raw,46,50);group.passage=rows.length?block.raw.slice(0,rows[0].index).trim():block.raw.trim();
     if(rows.length!==5){const under=[...block.raw.matchAll(/<u>([\s\S]*?)<\/u>/g)];if(under.length===5)rows=under.map((m,i)=>({number:46+i,text:m[1]}));else rows=[...block.raw.matchAll(/\((4[6-9]|50)\)\s*([\s\S]*?)(?=\((?:4[6-9]|50)\)|$)/g)].map(m=>({number:Number(m[1]),text:m[2].match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0]||m[2]}));}
     const refsByNumber=numbered(reference,46,50);
     group.questions=rows.map(row=>({number:row.number,prompt:plain(row.text),reference:refsByNumber.find(r=>r.number===row.number)?.text||'',maxScore:2,scoringPoints:refsByNumber.find(r=>r.number===row.number)?.text.match(/^>.*$/gm)?.join('\n')||''}));
    }else{
     group.passage=block.raw.trim();group.questions=[{number:46,prompt:plain(block.raw.replace(/^\s*(?:\*\*)?46\.(?:\*\*)?\s*/,'').replace(/^(?:>|Directions:|Translate the following.*|Write your translation.*).*$/gm,'')),reference,maxScore:15,scoringPoints:reference.match(/^>.*$/gm)?.join('\n')||''}];
    }
   }else{
    const n=variant===1?(kind==='short'?51:52):(kind==='short'?47:48);
    group.questions=[{number:n,prompt:block.raw.trim(),reference,maxScore:kind==='short'?10:variant===1?20:15}];
   }
   if(!group.questions.length)return;
   group.questions.forEach(q=>{q.id=id+'-q'+q.number;q.type=['translation','short','long'].includes(kind)?kind==='translation'?'translation':'writing':'objective';if(q.options&&!q.options.some(o=>o.key===q.answer))throw Error(id+' Q'+q.number+'答案对应选项缺失');});
   groups.push(group);
  });
  const paper={id,variant,year,url,groups,questionCount:groups.reduce((n,g)=>n+g.questions.length,0)};
  if(paper.questionCount!==(variant===1?52:48)||new Set(groups.flatMap(g=>g.questions.map(q=>q.id))).size!==paper.questionCount)throw Error(id+' 题目数或编号不完整：'+paper.questionCount);
  return paper;
 }
 function adapt(data,text,meta){
  const refs=sections(text.split(/^##\s+参考答案\s*$/m)[1]||'');let reading=0;
  const groups=[];
  data.sections.forEach(s=>s.groups.forEach(g=>{
   const kind=/Use of English/.test(s.title)?'cloze':/Writing/.test(s.title)?(/Part B/.test(s.title)?'long':'short'):/Translation|Part C/.test(s.title)?'translation':/Part B/.test(s.title)?'new':'reading';
   const reference=refs.find(r=>r.kind===kind)?.raw||'';
   const group={id:kind==='reading'?'text'+(++reading):kind,kind,label:kind==='reading'?'Text '+reading:labels[kind],passage:(g.passage||[]).join('\n\n').replace(/\{\{(\d+)\}\}/g,'___($1)___'),questions:[],source:meta.sourceUrl||meta.url,reference};
   if(kind==='new'){const sequence=g.order?.map(v=>v.given||('('+v.number+')')).join(' → ');group.passage=[s.instructions||'',sequence?'排列顺序：'+sequence:'',group.passage,...(!group.passage&&g.options?Object.entries(g.options).map(([key,value])=>key+'. '+value):[])].filter(Boolean).join('\n\n');}
   const refq=numbered(reference,46,50);
   group.questions=(g.questions||[]).map(q=>{
    const opts=q.options||g.options;
    const optionsList=opts?Object.entries(opts).map(([key,text])=>({key,text:typeof text==='string'?text:JSON.stringify(text)})):kind==='new'&&/true or false/i.test(s.instructions||'')?[{key:'T',text:'True'},{key:'F',text:'False'}]:[];
    const qref=kind==='translation'&&meta.variant===1?refq.find(r=>r.number===Number(q.number))?.text||'':reference;
    const images=[...(g.images||[]),...(q.images||[])];
    return {id:meta.id+'-q'+q.number,number:Number(q.number),type:kind==='translation'?'translation':['short','long'].includes(kind)?'writing':'objective',prompt:q.stem||q.question||('第 '+q.number+' 空 / 匹配项'),options:optionsList,answer:typeof q.answer==='string'?q.answer:'',maxScore:q.score||(['short','long','translation'].includes(kind)?s.score/s.groups.reduce((n,g)=>n+(g.questions||[]).length,0):(kind==='cloze'?.5:2)),reference:qref,paragraph:q.paragraph||q.paragraphIndex||null,scoringPoints:qref.match(/^>.*$/gm)?.join('\n')||'',images};
   });
   if(group.questions.length)groups.push(group);
  }));
  const paper={...meta,groups,questionCount:groups.reduce((n,g)=>n+g.questions.length,0)};
  if(paper.questionCount!==(meta.variant===1?52:48))throw Error(meta.id+'结构化题量异常');
  return paper;
 }
 const cache=new Map();let indexPromise;
 async function index(){return indexPromise||(indexPromise=fetch('data/english-index.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('英语索引加载失败');return r.json();}).catch(e=>{indexPromise=null;throw e;}));}
 async function load(id){if(cache.has(id))return cache.get(id);const data=await index(),meta=data.papers.find(p=>p.id===id);if(!meta)throw Error('年份不存在');let paper;if(meta.format==='json'){const responses=await Promise.all([fetch(meta.url,{cache:'no-store'}),fetch(meta.sourceUrl,{cache:'no-store'})]);if(responses.some(r=>!r.ok))throw Error('试卷加载失败');paper=adapt(await responses[0].json(),await responses[1].text(),meta);}else{const response=await fetch(meta.url,{cache:'no-store'});if(!response.ok)throw Error('试卷加载失败');paper=parse(await response.text(),meta);}cache.set(id,paper);return paper;}
 return {parse,adapt,index,load,plain,labels,translationSegments};
});
