/*
 * 用真实 Chrome（无头模式 + CDP）实际操作刷题网页，验证答案重审后的真实浏览器展示，不写生产云端。
 * 只依赖 Node 内置模块（fetch / WebSocket）。
 *
 * evalBody(code) 会把 code 当作函数体执行，因此 code 里可以直接写 return / var / for。
 *
 * 用法: node tools/verify-answer-audit-ui.mjs [baseUrl] [runDir]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDir=path.resolve(import.meta.dirname,'..');
const BASE = process.argv[2] || 'http://127.0.0.1:8410/';
// Let the OS choose a free CDP port so separate QA runs cannot share a page.
const PORT = 0;
let debugPort;
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
      if (!debugPort) debugPort = Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);
      const r = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
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
await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');
const requests=[],errors=[];
cdp.ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
const fixture=()=>{
 const user={id:'00000000-0000-4000-8000-000000000099',user_metadata:{display_name:'Electronic notes QA'}};
 const session={user,expires_at:Math.floor(Date.now()/1000)+3600};
 const client={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async()=>({data:{rows:[],acknowledged:[],conflicts:[]},error:null}),from(){const query={select(){return this},eq(){return this},order(){return this},range(){return this},maybeSingle(){this.single=true;return this},then(resolve,reject){return Promise.resolve({data:this.single?null:[],count:0,error:null}).then(resolve,reject)}};return query}};
 Object.defineProperty(window,'supabase',{get:()=>({createClient:()=>client}),set:()=>{},configurable:true});
};
await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${fixture.toString()})();`});
const wait=async expr=>{for(let i=0;i<200;i++){if(await cdp.evalExpr(expr))return;await sleep(100);}throw Error('Timeout '+expr)};
const checks=[];
const assert=async(expr,label)=>{if(!await cdp.evalExpr(expr))throw Error(label);checks.push(label);console.log('PASS '+label)};
const click=sel=>cdp.evalExpr(`document.querySelector(${JSON.stringify(sel)}).click()`);
const shot=async name=>{const r=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(rootDir,'.qa',name+'.png'),Buffer.from(r.data,'base64'))};
const rendered=n=>wait(`!document.querySelector('.electronic-reader-sheet').hidden&&document.querySelector('.electronic-reader-sheet').dataset.page==='${n}'&&document.querySelector('.electronic-reader-message').hidden&&!!document.querySelector('.textLayer span')`);
try{
 await cdp.send('Page.navigate',{url:BASE+'?theme=lonetrail#/bank'});await wait(`typeof DATA!=='undefined'&&DATA.questions.length===510&&!document.querySelector('#app').hidden`);
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await sleep(350);
 if(requests.some(u=>/\.pdf(?:\?|$)/.test(u)))throw Error('PDF eagerly requested at boot');console.log('PASS no PDF requested at boot');checks.push('no PDF requested at boot');
 await cdp.evalExpr(`document.querySelector('.option').click();document.querySelector('#btn-answer').click();document.querySelector('#btn-analysis').click();document.querySelector('#scroller').scrollTop=160;window.noteState=JSON.stringify({q:currentQuestion().id,scope:ui.scope,index:ui.index,filter:ui.statusFilter,choice:ui.choicePick,answer:ui.answerOpen,analysis:ui.analysisOpen,scroll:document.querySelector('#scroller').scrollTop,prefs:store.prefs});`);
 await click('#electronic-notes-open');await wait(`document.querySelectorAll('.electronic-note-chapter').length===12`);
 if(requests.some(u=>/\.pdf(?:\?|$)/.test(u)))throw Error('PDF eagerly requested for chapter list');console.log('PASS chapter list loads no PDF');checks.push('chapter list loads no PDF');await shot('electronic-notes-chapters-desktop');
 await click('[data-chapter="geom-ch1"]');await rendered(1);
 await assert(`document.querySelector('#app').classList.contains('electronic-reading')&&getComputedStyle(document.querySelector('#scroller')).display==='none'&&getComputedStyle(document.querySelector('.actionbar')).display==='none'`,'PDF replaces practice area');
 if(requests.filter(u=>/assets\/notes\/.*\.pdf/.test(u)).some(u=>!u.includes('geom-ch1.pdf')))throw Error('Unselected chapter requested');checks.push('only selected chapter fetched');console.log('PASS only selected chapter fetched');
 await assert(`document.querySelector('.textLayer').textContent.includes('几何光学')&&document.querySelector('canvas').width>200`,'Chinese text and PDF canvas rendered');await shot('electronic-notes-reader-desktop');
 await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});await rendered(2);
 await assert(`currentQuestion().id===JSON.parse(noteState).q&&ui.index===JSON.parse(noteState).index`,'reader arrow changes PDF, not question');
 await click('.electronic-reader-head button');
 await assert(`noteState===JSON.stringify({q:currentQuestion().id,scope:ui.scope,index:ui.index,filter:ui.statusFilter,choice:ui.choicePick,answer:ui.answerOpen,analysis:ui.analysisOpen,scroll:document.querySelector('#scroller').scrollTop,prefs:store.prefs})`,'return restores exact question, choice, reveal, filters and scroll');
 const manifest=await cdp.evalExpr(`fetch('data/electronic-notes.json').then(r=>r.json())`);
 for(const ch of manifest.chapters){await click('#electronic-notes-open');await wait(`!!document.querySelector('[data-chapter="${ch.id}"]')`);await click(`[data-chapter="${ch.id}"]`);await rendered(ch.id==='geom-ch1'?2:1);await assert(`document.querySelector('#electronic-page-input').max==='${ch.pages}'&&document.querySelector('.textLayer').textContent.length>100`,'actual PDF opens '+ch.id);await click('.electronic-reader-head button');}
 await click('#electronic-notes-open');await wait(`!!document.querySelector('[data-section="inst-c5"]')`);await click('[data-section="inst-c5"]');await rendered(26);await assert(`document.querySelector('.textLayer').textContent.includes('显微镜')`,'instrument practice section maps to original PDF page');
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await sleep(450);await rendered(26);await assert(`document.documentElement.scrollWidth<=390&&document.querySelector('.electronic-reader-sheet').getBoundingClientRect().width<=document.querySelector('.electronic-reader-viewport').clientWidth`,'mobile fit width without page overflow');await shot('electronic-notes-reader-mobile');
 await click('.electronic-reader-head button');await click('#nav-toggle');await click('#electronic-notes-open');await wait(`document.querySelectorAll('.electronic-note-chapter').length===12`);await shot('electronic-notes-chapters-mobile');await click('[data-chapter="phys-ch13"]');await rendered(1);await assert(`!document.querySelector('#app').classList.contains('nav-open')`,'mobile chapter opens reader and closes directory');
 await click('.electronic-reader-head button');
 for(const theme of ['blue','rhine-terminal']){await cdp.evalExpr(`document.querySelector('[data-set-theme="${theme}"]').click()`);await click('#electronic-notes-open');await wait(`document.querySelectorAll('.electronic-note-chapter').length===12`);await click('[data-chapter="geom-ch2"]');await rendered(1);await assert(`document.documentElement.scrollWidth<=390`,'reader fits theme '+theme);await shot('electronic-notes-'+theme);await click('.electronic-reader-head button');}
 await cdp.send('Network.setBlockedURLs',{urls:['*assets/notes/phys-ch12.pdf*']});await click('#electronic-notes-open');await wait(`!!document.querySelector('[data-chapter="phys-ch12"]')`);await click('[data-chapter="phys-ch12"]');await wait(`document.querySelector('.electronic-reader-message').dataset.error==='true'`);await assert(`document.querySelector('.electronic-reader-message').textContent.includes('重新加载')`,'PDF failure offers retry');await cdp.send('Network.setBlockedURLs',{urls:[]});await click('.electronic-reader-message button');await rendered(1);await click('.electronic-reader-head button');
 await click('#electronic-notes-open');await wait(`!!document.querySelector('[data-chapter="phys-ch10"]')`);await click('[data-chapter="phys-ch10"]');await click('.electronic-reader-head button');await sleep(1000);await assert(`!document.querySelector('#app').classList.contains('electronic-reading')&&document.querySelector('#electronic-reader').hidden`,'return during loading cancels stale PDF');
 if(errors.length)throw Error('Uncaught browser errors: '+errors.join('\n'));
 fs.writeFileSync(path.join(rootDir,'.qa','electronic-notes-checks.json'),JSON.stringify({checks,uncaughtErrors:errors,pdfRequests:requests.filter(u=>/assets\/notes\/.*\.pdf/.test(u))},null,2));console.log('ALL '+checks.length+' ELECTRONIC NOTE CHECKS PASSED');
}finally{cdp.ws.close();chrome.kill();}
