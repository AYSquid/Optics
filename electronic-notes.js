/* Chapter PDF reader. Keep the practice DOM and state alive underneath. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),app=$('app'),main=app.querySelector('.main');
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn,cls='btn btn-outline')=>{const b=node('button',cls,text);b.type='button';b.onclick=fn;return b;};
 let catalogPromise=null,pdfPromise=null,chapter=null,pdf=null,loadTask=null,renderTask=null,textTask=null;
 let active=false,immersive=false,revision=0,renderRevision=0,pageNumber=1,zoom=1,resizeTimer,lastFocus,listFocus;
 const positions=new Map();
 const dialog=node('dialog','question-notes-dialog electronic-notes-dialog');dialog.id='electronic-notes-dialog';dialog.setAttribute('aria-labelledby','electronic-notes-title');
 const listHead=node('div','notes-head'),listTitle=node('h2',null,'电子笔记');listTitle.id='electronic-notes-title';
 const closeList=button('×',()=>dialog.close(),'notes-close');closeList.setAttribute('aria-label','关闭电子笔记目录');
 listHead.append(listTitle,closeList);const listBody=node('div','notes-body');dialog.append(listHead,listBody);document.body.append(dialog);
 const reader=node('section','electronic-reader');reader.id='electronic-reader';reader.hidden=true;reader.setAttribute('aria-labelledby','electronic-reader-title');
 const heading=node('div','electronic-reader-head'),back=button('← 返回刷题',closeReader),titles=node('div','electronic-reader-titles');
 const title=node('h2',null,'电子笔记');title.id='electronic-reader-title';const detail=node('p','electronic-reader-detail');titles.append(title,detail);
 const directory=button('章节列表',openLibrary),immerse=button('沉浸模式',()=>setImmersive(true));immerse.id='electronic-immersive-open';immerse.setAttribute('aria-pressed','false');heading.append(back,titles,directory,immerse);
 const toolbar=node('div','electronic-reader-toolbar');toolbar.setAttribute('aria-label','PDF 阅读控制');
 const prev=button('上一页',()=>turn(-1)),next=button('下一页',()=>turn(1)),pageLabel=node('label','electronic-page-jump','第 '),pageInput=node('input'),total=node('span');
 pageInput.id='electronic-page-input';pageInput.type='number';pageInput.min='1';pageInput.inputMode='numeric';pageInput.setAttribute('aria-label','PDF 页码');pageLabel.append(pageInput,total);
 const minus=button('−',()=>setZoom(zoom-.25)),plus=button('+',()=>setZoom(zoom+.25)),fit=button('适宽',()=>setZoom(1));minus.setAttribute('aria-label','缩小 PDF');plus.setAttribute('aria-label','放大 PDF');
 const scale=node('span','electronic-zoom'),download=node('a','btn btn-ghost','下载本章');download.setAttribute('download','');
 toolbar.append(prev,pageLabel,next,minus,scale,plus,fit,download);
 const message=node('div','electronic-reader-message');message.id='electronic-reader-message';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const viewport=node('div','electronic-reader-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label','PDF 内容，放大后可横向滚动');
 const sheet=node('div','electronic-reader-sheet'),canvas=node('canvas'),textLayer=node('div','textLayer');sheet.append(canvas,textLayer);sheet.hidden=true;viewport.append(sheet);
 const floating=node('div','electronic-immersive-controls');floating.hidden=true;floating.setAttribute('aria-label','沉浸阅读控制');
 const floatPrev=button('←',()=>turn(-1)),floatNext=button('→',()=>turn(1)),floatPage=node('span','electronic-immersive-page'),exitImmersive=button('退出沉浸',()=>setImmersive(false));
 floatPrev.setAttribute('aria-label','PDF 上一页');floatNext.setAttribute('aria-label','PDF 下一页');exitImmersive.id='electronic-immersive-close';floating.append(floatPrev,floatPage,floatNext,exitImmersive);
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
 function remember(){if(chapter&&pdf)positions.set(chapter.id,{page:pageNumber,zoom,scroll:viewport.scrollTop,left:viewport.scrollLeft});}
 function dispose(){
  renderRevision++;renderTask?.cancel();textTask?.cancel();renderTask=null;textTask=null;
  const old=loadTask;loadTask=null;pdf=null;if(old)old.destroy().catch(()=>{});
 }
 function showMessage(text,error=false){message.replaceChildren(node('span',null,text));message.dataset.error=String(error);message.hidden=!text;}
 function reflect(){
  pageInput.value=String(pageNumber);pageInput.max=String(pdf?.numPages||chapter?.pages||1);total.textContent=' / '+(pdf?.numPages||chapter?.pages||'—')+' 页';
  prev.disabled=!pdf||pageNumber<=1;next.disabled=!pdf||pageNumber>=pdf.numPages;pageInput.disabled=!pdf;
  minus.disabled=!pdf||zoom<=.75;plus.disabled=!pdf||zoom>=3;fit.disabled=!pdf;scale.textContent=Math.round(zoom*100)+'%';
  floatPrev.disabled=prev.disabled;floatNext.disabled=next.disabled;floatPage.textContent=pageNumber+' / '+(pdf?.numPages||chapter?.pages||'—');
 }
 function setImmersive(value){
  if(!active)return;immersive=!!value;app.classList.toggle('electronic-immersive',immersive);floating.hidden=!immersive;
  immerse.setAttribute('aria-pressed',String(immersive));
  (immersive?exitImmersive:immerse).focus({preventScroll:true});
  // The ResizeObserver re-fits the same PDF page without fetching a new chapter.
 }
 async function openChapter(c,startPage){
  remember();if(!active)lastFocus=$('electronic-notes-open');
  if(dialog.open)dialog.close();closeDirectory();dispose();const token=++revision;
  chapter=c;active=true;app.classList.add('electronic-reading');reader.hidden=false;
  $('scroller').inert=true;main.querySelector('.question-nav').inert=true;main.querySelector('.actionbar').inert=true;
  const saved=positions.get(c.id);pageNumber=startPage||saved?.page||1;zoom=saved?.zoom||1;
  title.textContent=(c.id==='instruments'?'':c.label+' ')+c.title;detail.textContent=`${c.source} · 原 PDF 第 ${c.sourceStart}–${c.sourceEnd} 页`;
  download.href=c.url;sheet.hidden=true;reflect();back.focus({preventScroll:true});showMessage('正在加载本章 PDF…');
  try{
   const lib=await library();if(token!==revision||!active)return;
   const task=lib.getDocument({url:c.url,cMapUrl:new URL('vendor/pdfjs/cmaps/',document.baseURI).href,cMapPacked:true,standardFontDataUrl:new URL('vendor/pdfjs/standard_fonts/',document.baseURI).href,wasmUrl:new URL('vendor/pdfjs/wasm/',document.baseURI).href,disableAutoFetch:true,isEvalSupported:false});loadTask=task;
   task.onProgress=progress=>{if(token===revision&&progress.total)showMessage('正在加载本章 PDF… '+Math.min(100,Math.round(progress.loaded/progress.total*100))+'%');};
   const doc=await task.promise;if(token!==revision||!active){await task.destroy();return;}
   pdf=doc;pageNumber=Math.min(pageNumber,doc.numPages);await draw();
   if(token===revision&&!startPage&&saved){viewport.scrollTop=saved.scroll;viewport.scrollLeft=saved.left;}
  }catch(e){if(token!==revision||!active)return;sheet.hidden=true;showMessage('本章 PDF 加载失败，请检查网络后重试。',true);message.append(button('重新加载',()=>openChapter(c,startPage)));reflect();}
 }
 async function draw(resetScroll=true){
  if(!pdf||!active)return;const doc=pdf,number=pageNumber,token=++renderRevision;
  renderTask?.cancel();textTask?.cancel();reflect();sheet.hidden=true;showMessage('正在渲染第 '+number+' 页…');
  try{
   const page=await doc.getPage(number);if(token!==renderRevision||!active)return;
   const base=page.getViewport({scale:1}),padding=window.innerWidth<=560?16:40;
   const available=Math.min(viewport.clientWidth-padding,immersive&&innerWidth>900?1100:Infinity);
   const factor=Math.max(.1,available/base.width)*zoom,v=page.getViewport({scale:factor});
   // Cap pixel density for large zooms; CSS size stays accurate on desktop/mobile.
   const density=Math.min(window.devicePixelRatio||1,2,4096/Math.max(v.width,v.height));
   const fresh=document.createElement('canvas');fresh.width=Math.ceil(v.width*density);fresh.height=Math.ceil(v.height*density);
   const task=page.render({canvasContext:fresh.getContext('2d'),viewport:v,transform:[density,0,0,density,0,0]});renderTask=task;await task.promise;
   if(token!==renderRevision||!active)return;
   canvas.width=fresh.width;canvas.height=fresh.height;canvas.getContext('2d').drawImage(fresh,0,0);canvas.style.width=v.width+'px';canvas.style.height=v.height+'px';
   sheet.style.width=v.width+'px';sheet.style.height=v.height+'px';sheet.style.setProperty('--total-scale-factor',factor);
   textLayer.replaceChildren();sheet.hidden=false;showMessage('');sheet.dataset.page=String(number);if(resetScroll){viewport.scrollTop=0;viewport.scrollLeft=0;}
   const lib=await library();if(token!==renderRevision)return;
   const content=await page.getTextContent();if(token!==renderRevision)return;
   const layer=new lib.TextLayer({textContentSource:content,container:textLayer,viewport:v});textTask=layer;await layer.render();
   canvas.setAttribute('aria-label',title.textContent+'，第 '+number+' 页');reflect();
  }catch(e){if(token!==renderRevision||e?.name==='RenderingCancelledException'||!active)return;showMessage('这一页暂时无法显示，可重试或下载本章阅读。',true);message.append(button('重试本页',()=>draw()));}
 }
 function turn(delta){if(pdf){remember();pageNumber=Math.max(1,Math.min(pdf.numPages,pageNumber+delta));draw();}}
 function setZoom(value){if(pdf){zoom=Math.max(.75,Math.min(3,value));draw();}}
 pageInput.addEventListener('change',()=>{const n=Number(pageInput.value);if(pdf&&Number.isInteger(n)&&n>=1&&n<=pdf.numPages){pageNumber=n;draw();}else reflect();});
 pageInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();pageInput.dispatchEvent(new Event('change'));}});
 function closeReader(){
  if(!active)return;remember();if(immersive)setImmersive(false);active=false;revision++;dispose();reader.hidden=true;app.classList.remove('electronic-reading');
  $('scroller').inert=false;main.querySelector('.question-nav').inert=false;main.querySelector('.actionbar').inert=false;
  lastFocus?.focus({preventScroll:true});
 }
 // Practice shortcuts must not turn a hidden question while reading.
 document.addEventListener('keydown',e=>{
  if(!active||dialog.open||e.target.closest('dialog'))return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(immersive)setImmersive(false);else closeReader();return;}
  if(['ArrowLeft','ArrowRight','PageUp','PageDown'].includes(e.key)&&!e.target.matches('input,textarea,select,[contenteditable]')&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();e.stopImmediatePropagation();turn(['ArrowLeft','PageUp'].includes(e.key)?-1:1);}
 },true);
 // Explicit practice navigation exits the reader, then follows its existing handler.
 app.querySelector('.sidebar').addEventListener('click',e=>{if(active&&e.target.closest('.tree-btn,.tree-kn-btn,.filter-btn,.exam-year-nav button,#module-bank,#module-exams,#home-return'))closeReader();},true);
 window.addEventListener('hashchange',closeReader);
 new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(active&&pdf)draw(false);},180);}).observe(viewport);
 window.OpticsAuth?.subscribe(()=>{if(!window.OpticsAuth.user){closeReader();if(dialog.open)dialog.close();positions.clear();}});
 $('electronic-notes-open').onclick=openLibrary;
 window.OpticsElectronicNotes={openLibrary,close:closeReader};
})();
