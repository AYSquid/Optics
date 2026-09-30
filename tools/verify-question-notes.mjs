/*
 * 用真实 Chrome（无头模式 + CDP）实际操作刷题网页，验证题目笔记交互。Supabase 使用隔离测试数据，不写生产数据库。
 * 只依赖 Node 内置模块（fetch / WebSocket）。
 *
 * evalBody(code) 会把 code 当作函数体执行，因此 code 里可以直接写 return / var / for。
 *
 * 用法: node tools/verify-question-notes.mjs [baseUrl]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDir=path.resolve(import.meta.dirname,'..');
const BASE = process.argv[2] || 'http://127.0.0.1:8410/';
const PORT = 9339;
fs.mkdirSync(path.join(rootDir,'.qa'),{recursive:true});
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome / Edge'); process.exit(2); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'optics-notes-qa-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  // Auth 和笔记请求由下方隔离夹具接管。

  '--window-size=1440,960',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function firstTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const j = await r.json();
      const page = j.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (e) { /* retry */ }
    await sleep(250);
  }
  throw new Error('无法连接 Chrome 调试端口');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && c.pending.has(msg.id)) {
        const { res, rej } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  /** code 作为函数体执行 */
  async evalBody(code) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(function(){${code}})()`,
      returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error('页面脚本异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }
  /** code 作为表达式执行（需自带 return 或为表达式） */
  async evalExpr(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error('页面脚本异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }
}



const cdp=await CDP.connect((await firstTarget()).webSocketDebuggerUrl);
await cdp.send('Page.enable');await cdp.send('Runtime.enable');
const notesFixture=()=>{
 let user=JSON.parse(sessionStorage.getItem('qa-user')||'null')||{id:'00000000-0000-4000-8000-000000000001',user_metadata:{display_name:'Notes QA'}};
 sessionStorage.setItem('qa-user',JSON.stringify(user));let db=JSON.parse(sessionStorage.getItem('qa-notes-db')||'[]'),callbacks=[];
 window.notesQA={failWrite:false,missing:false,reads:0,writes:0,setUser(next){user=next;sessionStorage.setItem('qa-user',JSON.stringify(next));callbacks.forEach(f=>f('SIGNED_IN',session()));}};
 const session=()=>user?{user,expires_at:Math.floor(Date.now()/1000)+3600}:null;
 const client={auth:{getSession:async()=>({data:{session:session()},error:null}),onAuthStateChange:f=>{callbacks.push(f);return{data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({error:null})},rpc:async()=>({data:{rows:[],acknowledged:[],conflicts:[]},error:null}),from(table){
  let op='read',payload,fields='*',filters=[],opts={},start=0,end=100000,single=false;
  const builder={select(f,o={}){fields=f;opts=o;return this;},eq(k,v){filters.push([k,v]);return this;},order(){return this;},range(a,b){start=a;end=b;return this;},maybeSingle(){single=true;return this;},insert(x){op='insert';payload=x;return this;},update(x){op='update';payload=x;return this;},delete(){op='delete';return this;},then(resolve,reject){return Promise.resolve().then(()=>{
   if(table!=='question_notes')throw Error(table);if(window.notesQA.missing)return {error:{code:'PGRST205'}};
   if(!user)return {error:{code:'PGRST301'}};if(op!=='read'&&window.notesQA.failWrite)return {error:{message:'Network failure'}};
   const matching=r=>r.user_id===user.id&&filters.every(([k,v])=>r[k]===v);
   let rows=db.filter(matching).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));let count=rows.length;
   if(op==='read')window.notesQA.reads++;
   else{window.notesQA.writes++;if(op==='insert'){if(payload.user_id!==user.id)return {error:{code:'42501'}};if(db.some(r=>r.user_id===payload.user_id&&r.question_id===payload.question_id))return {error:{code:'23505'}};const now=new Date().toISOString();const row={...payload,id:crypto.randomUUID(),created_at:now,updated_at:now};db.push(row);rows=[row];}
    if(op==='update')rows.forEach(r=>{r.content=payload.content;r.updated_at=new Date(Math.max(Date.now(),Date.parse(r.updated_at)+1)).toISOString();});
    if(op==='delete')db=db.filter(r=>!matching(r));sessionStorage.setItem('qa-notes-db',JSON.stringify(db));}
   let data=rows.slice(start,end+1).map(r=>fields==='*'?{...r}:Object.fromEntries(fields.split(',').map(k=>[k,r[k]])));
   return {data:opts.head?null:single?data[0]||null:data,count:opts.count?count:null,error:null};
  }).then(resolve,reject);}};return builder;}
 };
 Object.defineProperty(window,'supabase',{get:()=>({createClient:()=>client}),set:()=>{},configurable:true});
};
await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${notesFixture.toString()})();`});
const assert=async(expr,label)=>{if(!await cdp.evalExpr(expr))throw Error(label);console.log('PASS '+label);};
const click=async(sel)=>cdp.evalExpr(`document.querySelector(${JSON.stringify(sel)}).click()`);
const wait=async(expr)=>{for(let i=0;i<80;i++){if(await cdp.evalExpr(expr))return;await sleep(100);}throw Error('Timeout: '+expr);};
const text=async(value)=>cdp.evalExpr(`(()=>{const t=document.querySelector('#notes-text');t.value=${JSON.stringify(value)};t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const snapshot=async(name)=>{const r=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(rootDir,'.qa',name+'.png'),Buffer.from(r.data,'base64'));};
const save=async()=>{await click('#notes-save');await wait(`!document.querySelector('#notes-save').disabled`);};
try{
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await cdp.send('Page.navigate',{url:BASE+'?theme=lonetrail#/bank'});await wait(`!!document.querySelector('.tree-btn')&&!document.querySelector('#app').hidden`);await sleep(300);
 await cdp.evalExpr(`document.querySelector('.option').click();document.querySelector('#scroller').scrollTop=80;window.qaQuestion=currentQuestion().id;window.qaChoice=ui.choicePick[qaQuestion];window.qaScroll=document.querySelector('#scroller').scrollTop`);
 await click('#btn-question-note');await wait(`!!document.querySelector('#notes-text')`);await assert(`document.querySelector('#notes-text').value===''`,'1: empty note editor');
 await text('垂直入射时注意振幅透射系数定义\n中文 English 123 α ≥ ≤\n<script>安全文本</script>');await save();await assert(`document.querySelector('#notes-message').textContent==='已保存'`,'2: save success');await snapshot('notes-editor-lonetrail');
 await click('.notes-close');await assert(`currentQuestion().id===qaQuestion&&ui.choicePick[qaQuestion]===qaChoice&&document.querySelector('#scroller').scrollTop===qaScroll`,'practice position and choice unchanged');
 await click('#btn-question-note');await wait(`!!document.querySelector('#notes-text')`);await assert(`document.querySelector('#notes-text').value.includes('English')`,'3: reopen persisted note');
 await text('修改后的理解\nα = 1');await save();await assert(`JSON.parse(sessionStorage.getItem('qa-notes-db')).length===1`,'4: update existing record');await click('.notes-close');
 await assert(`document.querySelector('#cloud-open').nextElementSibling.id==='notes-library-open'`,'5: sidebar entry after cloud');await click('#notes-library-open');await wait(`!!document.querySelector('.notes-list-item')`);await assert(`document.querySelectorAll('.notes-list-item').length===1&&!document.querySelector('.notes-list-item').textContent.includes('修改后的理解')`,'6: context-only list');
 await click('.notes-list-item');await wait(`!!document.querySelector('.notes-content')`);await assert(`document.querySelector('.notes-stem').textContent.length>0&&document.querySelectorAll('.notes-option').length===4&&document.querySelector('.notes-content').textContent===${JSON.stringify('修改后的理解\nα = 1')}`,'7: original question and same note');
 await click('#notes-save');await text('笔记库修改');await save();await click('.notes-close');await click('#btn-question-note');await wait(`!!document.querySelector('#notes-text')`);await assert(`document.querySelector('#notes-text').value==='笔记库修改'`,'8-9: library edit reflected in current question');
 await text('未保存草稿');await click('.notes-close');await click('#btn-question-note');await wait(`!!document.querySelector('#notes-text')`);await assert(`document.querySelector('#notes-text').value==='未保存草稿'`,'unsaved draft recovery');
 await cdp.evalExpr(`notesQA.failWrite=true`);await save();await assert(`document.querySelector('#notes-text').value==='未保存草稿'&&document.querySelector('#notes-message').dataset.error==='true'`,'failed save preserves editor');await cdp.evalExpr(`notesQA.failWrite=false`);await save();
 await text('并发前的草稿');await cdp.evalExpr(`OpticsAuth.client.from('question_notes').update({content:'其他窗口的新笔记'}).eq('question_id',qaQuestion).select('id')`);await click('.notes-close');await click('#btn-question-note');await wait(`!!document.querySelector('#notes-text')`);await text('继续编辑我的草稿');await save();await assert(`!!document.querySelector('#notes-conflict')&&JSON.parse(sessionStorage.getItem('qa-notes-db'))[0].content==='其他窗口的新笔记'`,'concurrent save cannot silently overwrite remote note');await click('#notes-conflict');await wait(`!!document.querySelector('.notes-confirm .notes-content')`);await assert(`document.querySelector('.notes-confirm .notes-content').textContent==='其他窗口的新笔记'&&document.querySelector('#notes-text').value==='继续编辑我的草稿'`,'conflict shows latest version and keeps draft');await click('.notes-confirm button');await text('未保存草稿');await save();await assert(`document.querySelector('#notes-message').textContent==='已保存'`,'explicit conflict resolution saves latest base');
 await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});await assert(`currentQuestion().id===qaQuestion`,'modal keys do not page questions');await click('.notes-close');
 const reads=await cdp.evalExpr(`notesQA.reads`);await cdp.evalExpr(`render();render();render()`);await assert(`notesQA.reads===${reads}`,'render uses count and current-note cache');
 await cdp.send('Page.reload');await wait(`!!document.querySelector('.tree-btn')&&!document.querySelector('#app').hidden`);await cdp.evalExpr(`document.querySelector('.option').click();window.qaQuestion=currentQuestion().id;window.qaChoice=ui.choicePick[qaQuestion]`);await click('#btn-question-note');await wait(`!!document.querySelector('#notes-text')`);await assert(`document.querySelector('#notes-text').value==='未保存草稿'`,'12: server fixture record survives reload');
 for(const theme of ['rhine','rhine-terminal','blue']){await cdp.evalExpr(`document.querySelector('[data-set-theme="${theme}"]').click()`);await assert(`(()=>{const probe=document.createElement('span');probe.style.color='var(--ink,var(--text))';document.body.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return getComputedStyle(document.querySelector('#question-notes-dialog')).color===expected})()`,'11: '+theme+' themed');await snapshot('notes-'+theme);}
 await text(('长笔记 α ≥ ≤\n').repeat(400));await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',modifiers:2});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',modifiers:2});await wait(`document.querySelector('#notes-message').textContent==='已保存'`);await assert(`JSON.parse(sessionStorage.getItem('qa-notes-db'))[0].content.length>3000`,'Ctrl+Enter saves long note');
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await assert(`document.querySelector('#question-notes-dialog').getBoundingClientRect().width<=390&&document.querySelector('#question-notes-dialog').scrollHeight>=document.querySelector('#question-notes-dialog').clientHeight`,'mobile and long modal bounded');await snapshot('notes-mobile');
 await click('.notes-delete');await assert(`!!document.querySelector('#notes-delete-confirm')&&JSON.parse(sessionStorage.getItem('qa-notes-db')).length===1`,'delete needs explicit confirmation');await click('#notes-delete-confirm button:last-child');await wait(`!!document.querySelector('.notes-empty')`);await assert(`JSON.parse(sessionStorage.getItem('qa-notes-db')).length===0&&DATA.byId[qaQuestion]&&ui.choicePick[qaQuestion]===qaChoice`,'10: delete only note');
 await click('.notes-close');await click('#crumb');await assert(`document.querySelector('#app').classList.contains('nav-open')`,'portrait chapter title opens directory');await click('#nav-toggle');await assert(`!document.querySelector('#app').classList.contains('nav-open')`,'original directory button retained');await cdp.evalExpr(`document.querySelector('#crumb').focus()`);await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await assert(`document.querySelector('#app').classList.contains('nav-open')`,'chapter title keyboard opens directory');await click('#nav-toggle');await click('#btn-question-note');await wait(`!!document.querySelector('#notes-text')`);await text('A 的私有笔记');await save();await click('.notes-close');
 await cdp.evalExpr(`notesQA.setUser({id:'00000000-0000-4000-8000-000000000002',user_metadata:{display_name:'User B'}})`);await sleep(500);await cdp.send('Page.navigate',{url:BASE+'?theme=lonetrail#/bank'});await wait(`!!document.querySelector('.tree-btn')&&!document.querySelector('#app').hidden`);await click('#notes-library-open');await wait(`!!document.querySelector('.notes-empty')`);await assert(`document.querySelector('#notes-count').textContent==='0'`,'13: account switch cannot show previous user notes');
 console.log('ALL NOTES UI CHECKS PASSED (isolated Supabase fixture, not production writes)');
}finally{cdp.ws.close();chrome.kill();}
