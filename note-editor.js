/* Markdown is stored as text in the existing private note row. No HTML from a
 * note is inserted into the document; legacy plain text remains readable. */
(function(){
 'use strict';
 const prefix='optics-note/v2\n';
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 function read(content=''){if(content.startsWith(prefix)){try{const d=JSON.parse(content.slice(prefix.length));if(typeof d.body==='string'&&Array.isArray(d.tags))return {body:d.body,tags:d.tags.filter(t=>typeof t==='string').slice(0,12)};}catch(_){}}return {body:content,tags:[]};}
 function pack(body,tags=[]){return tags.length?prefix+JSON.stringify({body,tags:[...new Set(tags)].slice(0,12)}):body;}
 function safeURL(url,image=false){if(image&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)&&url.length<50000)return url;try{const parsed=new URL(url,location.href);if(['https:','http:'].includes(parsed.protocol)||!image&&parsed.protocol==='mailto:')return parsed.href;}catch(_){}return '';}
 function inline(text,host){
  const re=/(!\[[^\]]*\]\([^)]+\)|\[[^\]]*\]\([^)]+\)|\*\*[^*]+\*\*|==[^=]+==|`[^`]+`|\*[^*]+\*)/g;let index=0,m;
  while((m=re.exec(text))){plain(text.slice(index,m.index),host);const x=m[0];
   if(x.startsWith('![')){const a=/!\[([^\]]*)\]\(([^)]+)\)/.exec(x),media=/^optics-image:([a-f0-9-]{36})$/.exec(a[2]),url=media?a[2]:safeURL(a[2],true);if(url){const img=node('img');if(media)window.OpticsNoteMedia.image(media[1],img);else img.src=url;img.alt=a[1]||'笔记图片';img.loading='lazy';img.className='note-inline-image';img.tabIndex=0;const zoom=()=>{const d=node('dialog');d.className='note-image-zoom';const close=node('button','关闭图片');const large=node('img');large.src=img.src;large.alt=img.alt;close.onclick=()=>d.close();d.append(close,large);d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();};img.onclick=zoom;img.onkeydown=e=>{if(e.key==='Enter')zoom();};host.append(img);}else plain(x,host);}
   else if(x.startsWith('[')){const a=/\[([^\]]*)\]\(([^)]+)\)/.exec(x),url=safeURL(a[2]);if(url){const link=node('a',a[1]);link.href=url;link.target='_blank';link.rel='noopener noreferrer';host.append(link);}else plain(x,host);}
   else{const tag=x.startsWith('**')?'strong':x.startsWith('==')?'mark':x.startsWith('`')?'code':'em',trim=['strong','mark'].includes(tag)?2:1;const n=node(tag);plain(x.slice(trim,-trim),n);host.append(n);}index=re.lastIndex;
  }plain(text.slice(index),host);
 }
 function plain(text,host){if(typeof window.renderInline==='function')window.renderInline(text,host);else host.append(document.createTextNode(text));}
 function render(body,host){
  host.replaceChildren();host.classList.add('note-markdown');const lines=body.split('\n');let pre=null,math=null,list=null;
  for(const line of lines){
   if(line.trim().startsWith('```')){if(pre){host.append(pre);pre=null;}else pre=node('pre');list=null;continue;}
   if(pre){pre.textContent+=(pre.textContent?'\n':'')+line;continue;}
   if(line.trim()==='$$'){if(math!==null){const box=node('div');box.className='note-math-block';try{window.katex.render(math,box,{displayMode:true,throwOnError:false,trust:false});}catch(_){box.textContent=math;}host.append(box);math=null;}else math='';list=null;continue;}
   if(math!==null){math+=(math?'\n':'')+line;continue;}
   const li=/^\s*(?:[-*]\s+|\d+\.\s+)(.*)$/.exec(line);
   if(li){const tag=/^\s*\d/.test(line)?'ol':'ul';if(!list||list.tagName.toLowerCase()!==tag){list=node(tag);host.append(list);}const n=node('li');inline(li[1],n);list.append(n);continue;}list=null;
   if(!line.trim()){host.append(node('br'));continue;}
   const h=/^(#{1,3})\s+(.*)$/.exec(line),quote=/^>\s?(.*)$/.exec(line);const n=node(h?'h'+(h[1].length+1):quote?'blockquote':'p');inline(h?h[2]:quote?quote[1]:line,n);host.append(n);
  }if(pre)host.append(pre);if(math!==null)host.append(node('p','$$\n'+math));
 }
 function editor(input,change,tags=[]){
  const wrap=node('div');wrap.className='note-editor';const toolbar=node('div');toolbar.className='note-editor-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','笔记工具栏');
  const preview=node('div');preview.className='notes-content note-editor-preview';preview.hidden=true;
  let history=[input.value],cursor=0,remembered=[0,0];
  input.addEventListener('select',()=>remembered=[input.selectionStart,input.selectionEnd]);
  input.addEventListener('input',()=>{history=history.slice(0,cursor+1);if(history.at(-1)!==input.value){history.push(input.value);cursor=history.length-1;}if(history.length>60){history.shift();cursor--;}change();});
  const action=(text,fn)=>{const b=node('button',text);b.type='button';b.onmousedown=e=>e.preventDefault();b.onclick=fn;toolbar.append(b);return b;};
  function insert(before,after='',example='文字',replace=false){const [a,b]=[input.selectionStart,input.selectionEnd],text=replace?example:input.value.slice(a,b)||example;input.setRangeText(before+text+after,a,b,'end');input.focus({preventScroll:true});input.dispatchEvent(new Event('input',{bubbles:true}));}
  [['重点','==','=='],['加粗','**','**'],['斜体','*','*'],['标题','## ',''],['步骤','\n1. ',''],['列表','\n- ',''],['引用','\n> ',''],['代码','`','`']].forEach(([label,a,b])=>action(label,()=>insert(a,b)));
  function dialog(kind){remembered=[input.selectionStart,input.selectionEnd];const d=node('dialog');d.className='note-insert-dialog';const title=node('h2',kind==='math'?'插入公式':'插入链接'),field=node('textarea'),sample=node('div');field.setAttribute('aria-label',kind==='math'?'LaTeX 公式':'链接地址');field.placeholder=kind==='math'?'\\frac{a}{b}':'https://';const feedback=node('p');
   field.oninput=()=>{sample.replaceChildren();if(kind==='math')try{window.katex.render(field.value,sample,{displayMode:true,throwOnError:true,trust:false});feedback.textContent='';}catch(_){feedback.textContent='请输入有效的 LaTeX 公式。';}};
   const check=node('label'),box=node('input');box.type='checkbox';check.append(box,document.createTextNode('独立公式块'));
   const cancel=node('button','取消'),apply=node('button','插入');cancel.type=apply.type='button';cancel.onclick=()=>d.close();apply.onclick=()=>{if(kind==='math'){try{window.katex.renderToString(field.value,{throwOnError:true,trust:false});}catch(_){feedback.textContent='公式格式有误，请检查。';return;}input.setSelectionRange(...remembered);insert(box.checked?'\n$$\n':'$',box.checked?'\n$$\n':'$',field.value,true);}else{if(!safeURL(field.value)){feedback.textContent='请输入完整的 http、https 或 mailto 链接。';return;}input.setSelectionRange(...remembered);insert('[',']('+field.value+')','链接文字');}d.close();};d.append(title,field);if(kind==='math')d.append(check,sample);d.append(feedback,cancel,apply);d.addEventListener('close',()=>{d.remove();input.focus({preventScroll:true});});document.body.append(d);d.showModal();field.focus();}
  action('公式',()=>dialog('math'));action('链接',()=>dialog('link'));
  const image=node('input');image.type='file';image.accept='image/png,image/jpeg,image/webp';image.hidden=true;
  const imageButton=action('图片',()=>image.click()),imageStatus=node('span');imageStatus.setAttribute('role','status');toolbar.append(imageStatus);
  async function addImage(file){if(imageButton.disabled)return;const user=window.OpticsAuth?.user?.id,selection=[input.selectionStart,input.selectionEnd];imageButton.disabled=true;imageStatus.textContent='图片上传中…';try{const url=await window.OpticsNoteMedia.upload(file);if(!input.isConnected||window.OpticsAuth?.user?.id!==user)return;input.focus({preventScroll:true});input.setSelectionRange(Math.min(selection[0],input.value.length),Math.min(selection[1],input.value.length));insert('\n![笔记图片](',')\n',url,true);imageStatus.textContent='图片已保存';}catch(e){imageStatus.textContent=e.message||'图片上传失败，请重试。';}finally{imageButton.disabled=false;image.value='';}}
  image.onchange=()=>{if(image.files[0])addImage(image.files[0]);};wrap.append(image);
  input.addEventListener('paste',e=>{const file=Array.from(e.clipboardData?.files||[]).find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();addImage(file);}});
  input.addEventListener('dragover',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files'))e.preventDefault();});input.addEventListener('drop',e=>{const file=Array.from(e.dataTransfer?.files||[]).find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();addImage(file);}});
  action('撤销',()=>{if(cursor>0){input.value=history[--cursor];change();}});action('重做',()=>{if(cursor<history.length-1){input.value=history[++cursor];change();}});
  const toggle=action('预览',()=>{const show=preview.hidden;if(show)render(input.value,preview);preview.hidden=!show;input.hidden=show;toggle.textContent=show?'继续编辑':'预览';});
  const tagsBar=node('div');tagsBar.className='note-tags';const tagInput=node('input');tagInput.placeholder='添加标签';tagInput.setAttribute('aria-label','添加笔记标签');
  const chipRow=node('span');function chips(){chipRow.replaceChildren();tags.forEach((t,i)=>{const b=node('button',t+' ×');b.type='button';b.onclick=()=>{tags.splice(i,1);chips();change();};chipRow.append(b);});}
  const add=node('button','添加标签');add.type='button';add.onclick=()=>{const tag=tagInput.value.trim().slice(0,30);if(tag&&!tags.includes(tag)&&tags.length<12){tags.push(tag);tagInput.value='';chips();change();}};tagInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add.click();}};tagsBar.append(chipRow,tagInput,add);chips();
  wrap.append(toolbar,tagsBar,input,preview);return {element:wrap,tags};
 }
 window.OpticsNoteFormat={read,pack,render,editor};
})();
