/* Chapter PDF reader. Keep the practice DOM and state alive underneath. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),app=$('app'),main=app.querySelector('.main');
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn,cls='btn btn-outline')=>{const b=node('button',cls,text);b.type='button';b.onclick=fn;return b;};
 let catalogPromise=null,pdfPromise=null,chapter=null,pdf=null,loadTask=null;
 let active=false,immersive=false,revision=0,layoutRevision=0,pageNumber=1,zoom=1,baseSize=null,pageViews=[],observer=null,resizeTimer,lastFocus,listFocus,pendingAnchor,layoutSignature;
 const positions=new Map(),tasks=new Map(),queue=new Set();
 const dialog=node('dialog','question-notes-dialog electronic-notes-dialog');dialog.id='electronic-notes-dialog';dialog.setAttribute('aria-labelledby','electronic-notes-title');
 const listHead=node('div','notes-head'),listTitle=node('h2',null,'电子笔记');listTitle.id='electronic-notes-title';
 const closeList=button('×',()=>dialog.close(),'notes-close');closeList.setAttribute('aria-label','关闭电子笔记目录');
 listHead.append(listTitle,closeList);const listBody=node('div','notes-body');dialog.append(listHead,listBody);document.body.append(dialog);
 const reader=node('section','electronic-reader');reader.id='electronic-reader';reader.hidden=true;reader.setAttribute('aria-labelledby','electronic-reader-title');
 const heading=node('div','electronic-reader-head'),back=button('← 返回刷题',closeReader),titles=node('div','electronic-reader-titles');
 const title=node('h2',null,'电子笔记');title.id='electronic-reader-title';const detail=node('p','electronic-reader-detail');titles.append(title,detail);
 const directory=button('章节列表',openLibrary),immerse=button('沉浸模式',()=>setImmersive(true));immerse.id='electronic-immersive-open';immerse.setAttribute('aria-pressed','false');heading.append(back,titles,directory,immerse);
 const toolbar=node('div','electronic-reader-toolbar');toolbar.setAttribute('aria-label','PDF 阅读控制');
 const pageInfo=node('span','electronic-page-info'),minus=button('−',()=>setZoom(zoom-.1)),plus=button('+',()=>setZoom(zoom+.1)),fit=button('适宽',()=>setZoom(1));
 minus.setAttribute('aria-label','缩小 PDF');plus.setAttribute('aria-label','放大 PDF');
 const scaleLabel=node('label','electronic-zoom-label','缩放 '),scaleInput=node('input');scaleInput.id='electronic-zoom-input';scaleInput.type='number';scaleInput.min='25';scaleInput.max='400';scaleInput.step='5';scaleInput.inputMode='numeric';scaleInput.setAttribute('aria-label','PDF 缩放百分比，25至400');scaleLabel.append(scaleInput,node('span',null,'%'));
 const download=node('a','btn btn-ghost','下载本章');download.setAttribute('download','');toolbar.append(pageInfo,minus,scaleLabel,plus,fit,download);
 const message=node('div','electronic-reader-message');message.id='electronic-reader-message';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const viewport=node('div','electronic-reader-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label','连续 PDF 内容；上下滚动阅读，Ctrl 加滚轮缩放，放大后可横向滚动');
 const pages=node('div','electronic-reader-pages');viewport.append(pages);
 const floating=node('div','electronic-immersive-controls');floating.hidden=true;floating.setAttribute('aria-label','沉浸阅读控制');
 const floatMinus=button('−',()=>setZoom(zoom-.1)),floatPlus=button('+',()=>setZoom(zoom+.1)),floatPage=node('span','electronic-immersive-page'),exitImmersive=button('退出沉浸',()=>setImmersive(false));
 floatMinus.setAttribute('aria-label','缩小 PDF');floatPlus.setAttribute('aria-label','放大 PDF');exitImmersive.id='electronic-immersive-close';floating.append(floatMinus,floatPage,floatPlus,exitImmersive);
 reader.append(heading,toolbar,message,viewport,floating);main.append(reader);
 function catalog(){
  if(!catalogPromise)catalogPromise=fetch('data/electronic-notes.json').then(r=>{if(!r.ok)throw Error('目录加载失败');return r.json();}).catch(e=>{catalogPromise=null;throw e;});
  return catalogPromise;
 }
 function library(){
  if(!pdfPromise)pdfPromise=import('./vendor/pdfjs/pdf.min.mjs').then(lib=>{lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.min.mjs',document.baseURI).href;return lib;}).catch(e=>{pdfPromise=null;throw e;});
  return pdfPromise;
 }
 function closeDirectory(){if(app.classList.contains('nav-open'))window.closeNav();}
 async function openLibrary(){
  if(!dialog.open){listFocus=document.activeElement;dialog.showModal();}
  listBody.replaceChildren(node('p','notes-description','正在读取章节目录…'));
  try{
   const data=await catalog();if(!dialog.open)return;
   listBody.replaceChildren(node('p','notes-description','按原 PDF 章节整理 · 打开章节后加载 · 返回保留刷题位置'));
   for(const group of ['几何光学','光学仪器','物理光学']){
    const section=node('section','electronic-notes-group'),h=node('h3',null,group),list=node('div','notes-list');section.append(h,list);
    data.chapters.filter(c=>c.group===group).forEach(c=>{
     const item=button('',()=>openChapter(c),'notes-list-item electronic-note-chapter');item.dataset.chapter=c.id;
     item.append(node('strong',null,(c.id==='instruments'?'':c.label+' ')+c.title),node('div','notes-meta',`${c.pages} 页 · ${c.source} · 原 PDF 第 ${c.sourceStart}–${c.sourceEnd} 页`));
     if(c.id==='instruments')item.append(node('div','notes-preview','包含人眼、放大镜、显微镜、摄影系统与望远镜；对应现有八个练习小节。'));
     list.append(item);
     if(c.id==='instruments'){
      const links=node('div','electronic-section-links');links.setAttribute('aria-label','按练习小节定位光学仪器笔记');
      c.relatedChapters.forEach(rel=>{const b=button(rel.label,()=>openChapter(c,rel.page),'btn btn-ghost');b.dataset.section=rel.id;links.append(b);});list.append(links);
     }
    });listBody.append(section);
   }
  }catch(e){if(dialog.open)listBody.replaceChildren(node('p','notes-description','章节目录加载失败，请检查网络后重试。'),button('重试',openLibrary));}
 }
 dialog.addEventListener('close',()=>{if(listFocus?.isConnected)listFocus.focus({preventScroll:true});});
 dialog.addEventListener('keydown',e=>e.stopPropagation());
 dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
 function topOf(v){return v.element.getBoundingClientRect().top-viewport.getBoundingClientRect().top+viewport.scrollTop;}
 function anchor(){const y=viewport.scrollTop+12;let v=pageViews[0];for(const x of pageViews){if(topOf(x)<=y)v=x;else break;}return v?{page:v.number,fraction:Math.max(0,Math.min(1,(viewport.scrollTop-topOf(v))/v.height)),left:viewport.scrollLeft/v.width}:{page:pageNumber,fraction:0,left:0};}
 function restore(a){const v=pageViews[(a?.page||1)-1];if(v){viewport.scrollTop=topOf(v)+(a.fraction||0)*v.height;viewport.scrollLeft=(a.left||0)*v.width;pageNumber=v.number;}}
 function remember(){if(chapter&&pdf)positions.set(chapter.id,{zoom,...anchor()});}
 function cancelRendering(){layoutRevision++;observer?.disconnect();observer=null;queue.clear();for(const t of tasks.values()){t.render?.cancel();t.layer?.cancel();}tasks.clear();}
 function dispose(){cancelRendering();const old=loadTask;loadTask=null;pdf=null;pageViews=[];layoutSignature=null;pages.replaceChildren();if(old)old.destroy().catch(()=>{});}
 function showMessage(text,error=false){message.replaceChildren(node('span',null,text));message.dataset.error=String(error);message.hidden=!text;}
 function reflect(){pageInfo.textContent=`第 ${pageNumber} / ${pdf?.numPages||chapter?.pages||'—'} 页 · 连续阅读`;if(document.activeElement!==scaleInput)scaleInput.value=String(Math.round(zoom*100));scaleInput.disabled=!pdf;minus.disabled=floatMinus.disabled=!pdf||zoom<=.25;plus.disabled=floatPlus.disabled=!pdf||zoom>=4;fit.disabled=!pdf;floatPage.textContent=pageNumber+' / '+(pdf?.numPages||chapter?.pages||'—')+' · '+Math.round(zoom*100)+'%';}
 function setImmersive(value){if(!active)return;pendingAnchor=anchor();immersive=!!value;app.classList.toggle('electronic-immersive',immersive);floating.hidden=!immersive;immerse.setAttribute('aria-pressed',String(immersive));(immersive?exitImmersive:immerse).focus({preventScroll:true});}
 async function openChapter(c,startPage){
  remember();if(!active)lastFocus=$('electronic-notes-open');if(dialog.open)dialog.close();closeDirectory();dispose();const token=++revision;
  chapter=c;active=true;app.classList.add('electronic-reading');reader.hidden=false;$('scroller').inert=true;main.querySelector('.question-nav').inert=true;main.querySelector('.actionbar').inert=true;
  const saved=positions.get(c.id);pageNumber=startPage||saved?.page||1;zoom=Math.max(.25,saved?.zoom||1);title.textContent=(c.id==='instruments'?'':c.label+' ')+c.title;detail.textContent=`${c.source} · 原 PDF 第 ${c.sourceStart}–${c.sourceEnd} 页`;download.href=c.url;reflect();back.focus({preventScroll:true});showMessage('正在加载本章 PDF…');
  try{
   const lib=await library();if(token!==revision||!active)return;
   const task=lib.getDocument({url:c.url,cMapUrl:new URL('vendor/pdfjs/cmaps/',document.baseURI).href,cMapPacked:true,standardFontDataUrl:new URL('vendor/pdfjs/standard_fonts/',document.baseURI).href,wasmUrl:new URL('vendor/pdfjs/wasm/',document.baseURI).href,disableAutoFetch:true,isEvalSupported:false});loadTask=task;
   task.onProgress=progress=>{if(token===revision&&progress.total)showMessage('正在加载本章 PDF… '+Math.min(100,Math.round(progress.loaded/progress.total*100))+'%');};
   const doc=await task.promise;if(token!==revision||!active){await task.destroy();return;}pdf=doc;
   const first=await doc.getPage(1);if(token!==revision||!active)return;baseSize=first.getViewport({scale:1});
   pageViews=Array.from({length:doc.numPages},(_,i)=>{const element=node('div','electronic-reader-sheet');element.dataset.page=String(i+1);element.setAttribute('role','group');element.setAttribute('aria-label','PDF 第 '+(i+1)+' 页');pages.append(element);return{number:i+1,element,base:baseSize,width:0,height:0};});
   layoutPages(startPage?{page:startPage}:saved||{page:1});showMessage('');
  }catch(e){if(token!==revision||!active)return;showMessage('本章 PDF 加载失败，请检查网络后重试。',true);message.append(button('重新加载',()=>openChapter(c,startPage)));reflect();}
 }
 function layoutPages(position=anchor()){
  if(!pdf||!active||!baseSize)return;
  const s=getComputedStyle(viewport),available=Math.min(viewport.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),immersive&&innerWidth>900?1100:Infinity);
  const signature=available.toFixed(2)+':'+zoom;if(signature===layoutSignature){restore(position);reflect();return;}layoutSignature=signature;cancelRendering();const token=layoutRevision;
  for(const v of pageViews){const factor=Math.max(.1,available/v.base.width)*zoom;v.width=v.base.width*factor;v.height=v.base.height*factor;v.factor=factor;v.element.style.width=v.width+'px';v.element.style.height=v.height+'px';v.element.style.setProperty('--total-scale-factor',factor);v.element.removeAttribute('data-rendered');v.element.removeAttribute('data-text-ready');v.element.replaceChildren(node('span','electronic-page-placeholder','第 '+v.number+' 页'));}
  observer=new IntersectionObserver(entries=>{if(token!==layoutRevision)return;for(const e of entries){const n=Number(e.target.dataset.page);if(e.isIntersecting)queue.add(n);else queue.delete(n);}pump();},{root:viewport,rootMargin:'700px 0px'});
  pageViews.forEach(v=>observer.observe(v.element));restore(position);reflect();queue.add(pageNumber);pump();
 }
 function pump(){if(!active||!pdf)return;while(tasks.size<2&&queue.size){const n=[...queue].sort((a,b)=>Math.abs(a-pageNumber)-Math.abs(b-pageNumber))[0];queue.delete(n);const v=pageViews[n-1];if(!v||v.element.dataset.rendered==='true'||tasks.has(n))continue;renderPage(v);}}
 async function renderPage(view){
  const token=layoutRevision,doc=pdf,record={};tasks.set(view.number,record);view.element.replaceChildren(node('span','electronic-page-placeholder','正在渲染第 '+view.number+' 页…'));
  try{
   const page=await doc.getPage(view.number);if(token!==layoutRevision||!active)return;
   const v=page.getViewport({scale:view.factor}),density=Math.min(devicePixelRatio||1,2,4096/Math.max(v.width,v.height));
   const canvas=node('canvas');canvas.width=Math.ceil(v.width*density);canvas.height=Math.ceil(v.height*density);canvas.style.width=v.width+'px';canvas.style.height=v.height+'px';canvas.setAttribute('aria-label',title.textContent+'，第 '+view.number+' 页');
   record.render=page.render({canvasContext:canvas.getContext('2d'),viewport:v,transform:[density,0,0,density,0,0]});await record.render.promise;if(token!==layoutRevision||!active)return;
   const textLayer=node('div','textLayer');view.element.replaceChildren(canvas,textLayer);view.element.dataset.rendered='true';const lib=await library(),content=await page.getTextContent();if(token!==layoutRevision||!active)return;
   record.layer=new lib.TextLayer({textContentSource:content,container:textLayer,viewport:v});await record.layer.render();if(token===layoutRevision&&active)view.element.dataset.textReady='true';
  }catch(e){if(token===layoutRevision&&active&&e?.name!=='RenderingCancelledException'){view.element.replaceChildren(node('span','electronic-page-placeholder','本页暂时无法显示'),button('重试本页',()=>{view.element.removeAttribute('data-rendered');queue.add(view.number);pump();}));}}
  finally{if(tasks.get(view.number)===record)tasks.delete(view.number);if(token===layoutRevision){evictDistant();pump();}}
 }
 function evictDistant(){const bounds=viewport.getBoundingClientRect();for(const v of pageViews){const r=v.element.getBoundingClientRect();if((r.bottom<bounds.top-700||r.top>bounds.bottom+700)&&!tasks.has(v.number)&&v.element.dataset.rendered==='true'){v.element.removeAttribute('data-rendered');v.element.removeAttribute('data-text-ready');v.element.replaceChildren(node('span','electronic-page-placeholder','第 '+v.number+' 页'));}}}
 let scrollFrame=0;
 viewport.addEventListener('scroll',()=>{if(scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;if(!active||!pdf)return;pageNumber=anchor().page;reflect();evictDistant();const v=pageViews[pageNumber-1];if(v&&v.element.dataset.rendered!=='true'){queue.add(pageNumber);pump();}});},{passive:true});
 function setZoom(value){if(!pdf)return;const a=anchor(),next=Math.max(.25,Math.min(4,Math.round(value*100)/100));if(next===zoom){reflect();return;}zoom=next;layoutPages(a);}
 function applyScale(){const n=Number(scaleInput.value);if(Number.isFinite(n)){setZoom(n/100);scaleInput.value=String(Math.round(zoom*100));}else reflect();}
 scaleInput.addEventListener('change',applyScale);scaleInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyScale();scaleInput.blur();}});
 viewport.addEventListener('wheel',e=>{if(!e.ctrlKey||!active)return;e.preventDefault();if(e.deltaY)setZoom(zoom+(e.deltaY<0?.1:-.1));},{passive:false});
 function closeReader(){if(!active)return;remember();if(immersive)setImmersive(false);active=false;revision++;dispose();reader.hidden=true;app.classList.remove('electronic-reading');$('scroller').inert=false;main.querySelector('.question-nav').inert=false;main.querySelector('.actionbar').inert=false;lastFocus?.focus({preventScroll:true});}
 document.addEventListener('keydown',e=>{
  if(!active||dialog.open||e.target.closest('dialog'))return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(immersive)setImmersive(false);else closeReader();return;}
  if(e.target.matches('input,textarea,select,[contenteditable]'))return;
  if(e.ctrlKey&&(e.key==='+'||e.key==='='||e.key==='-'||e.key==='0')){e.preventDefault();e.stopImmediatePropagation();setZoom(e.key==='0'?1:zoom+(e.key==='-'?-.1:.1));return;}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown'].includes(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();e.stopImmediatePropagation();viewport.scrollBy({left:e.key==='ArrowLeft'?-80:e.key==='ArrowRight'?80:0,top:e.key==='ArrowUp'?-80:e.key==='ArrowDown'?80:e.key==='PageUp'?-viewport.clientHeight*.85:e.key==='PageDown'?viewport.clientHeight*.85:0});}
 },true);
 app.querySelector('.sidebar').addEventListener('click',e=>{if(active&&e.target.closest('.tree-btn,.tree-kn-btn,.filter-btn,.exam-year-nav button,#module-bank,#module-exams,#home-return'))closeReader();},true);
 window.addEventListener('hashchange',closeReader);
 new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(active&&pdf){const a=pendingAnchor||anchor();pendingAnchor=null;layoutPages(a);}},160);}).observe(viewport);
 window.OpticsAuth?.subscribe(()=>{if(!window.OpticsAuth.user){closeReader();if(dialog.open)dialog.close();positions.clear();}});
 $('electronic-notes-open').onclick=openLibrary;window.OpticsElectronicNotes={openLibrary,close:closeReader};
})();
