/* Independent, per-user and per-paper stopwatch. No question progress mutations. */
(function(){'use strict';
 let activeId='',record=null,root=null,interval=null;
 const storageKey=()=>window.OpticsCloud?OpticsCloud.localKey('gopt.exam.timers.v1'):'gopt.exam.timers.v1';
 const read=()=>{try{return JSON.parse(localStorage.getItem(storageKey())||'{}');}catch(e){return {};}};
 function elapsed(){return Math.max(0,(record?.elapsed||0)+(record?.running?Math.max(0,Date.now()-record.startedAt):0));}
 function save(){if(!activeId||!record)return;try{const all=read();all[activeId]=record;localStorage.setItem(storageKey(),JSON.stringify(all));}catch(e){if(root)root.title='浏览器无法保存计时，当前页仍可使用';}}
 function pause(){if(!record)return;record={elapsed:elapsed(),running:false,startedAt:0};save();paint();}
 function resume(){if(!record||record.running)return;record.running=true;record.startedAt=Date.now();save();paint();}
 function reset(){if(!record)return;record={elapsed:0,running:false,startedAt:0};save();paint();}
 function paint(){if(!root)return;const s=Math.floor(elapsed()/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60);root.querySelector('output').textContent=[h,m,s%60].map(n=>String(n).padStart(2,'0')).join(':');root.querySelector('[data-action="toggle"]').textContent=record.running?'暂停':elapsed()?'继续':'开始';}
 function attach(id,into){
  if(activeId!==id){if(activeId)pause();activeId=id;const stored=read()[id];record=stored&&Number.isFinite(stored.elapsed)&&Number.isFinite(stored.startedAt)?stored:{elapsed:0,running:false,startedAt:0};}
  if(root?.parentNode===into){paint();return;}
  root?.remove();root=document.createElement('div');root.className='exam-timer';root.setAttribute('aria-label','真题计时');const label=document.createElement('span');label.textContent='TIMER / 计时';const out=document.createElement('output');out.setAttribute('aria-label','已用时间');root.append(label,out);
  [['toggle',()=>record.running?pause():resume()],['reset',reset]].forEach(([action,fn])=>{const b=document.createElement('button');b.type='button';b.className='btn btn-ghost';b.dataset.action=action;b.textContent=action==='reset'?'重置':'开始';b.onclick=fn;root.append(b);});into.append(root);paint();clearInterval(interval);interval=setInterval(paint,1000);
 }
 function detach(){if(activeId)pause();clearInterval(interval);root?.remove();root=null;activeId='';record=null;}
 window.addEventListener('pagehide',save);
 window.ExamTimer={attach,detach,pause,resume,reset,get elapsed(){return elapsed();},get running(){return !!record?.running;}};
})();
