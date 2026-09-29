/* The host owns authentication; the sandboxed portal owns presentation only. */
(function(){'use strict';
let ready=false,frame=null,initialized=false,signingIn=false;
const auth=()=>window.OpticsAuth;
function update(){if(!frame||!auth().user||!ready)return;const counts={known:0,unknown:0,shaky:0};DATA.questions.forEach(q=>{const k=getStatus(q.statusKey||q.id);if(k in counts)counts[k]++;});const cloud=window.OpticsCloud?.summary()||{};
const state=cloud.connected?(cloud.pending?'云端待同步 '+cloud.pending+' 条':'云端已同步'):'云端待连接';
frame.contentWindow?.postMessage({type:'optics-summary',text:auth().displayName+' · 题库 '+DATA.questions.length+' 题 · 会做 '+counts.known+' · 不熟练 '+counts.shaky+' · 不会做 '+counts.unknown+' ｜ '+state},'*');}
function reply(message){frame?.contentWindow?.postMessage(message,'*');}
function mount(){if(frame)frame.remove();frame=document.createElement('iframe');frame.id='rhine-portal';frame.title='RHINE LAB · 学习系统';frame.setAttribute('sandbox','allow-scripts allow-forms');frame.src='rhine-lab.html';document.body.append(frame);}
function route(){
 const signed=!!auth().user;
 if(!signed&&location.hash!=='#/login')history.replaceState(null,'',location.pathname+location.search+'#/login');
 if(signed&&(!location.hash||location.hash==='#/login'))history.replaceState(null,'',location.pathname+location.search+'#/home');
 const home=!signed||location.hash==='#/home';
 $('app').hidden=home||!ready;$('app').inert=home||!ready;
 document.body.classList.toggle('portal-open',home);
 if(home){if(!frame)mount();}else if(frame){frame.remove();frame=null;}
}
function initialize(){if(initialized)return;initialized=true;
 let activeUser=auth().user?.id;
 auth().subscribe(()=>{
  if(auth().user?.id===activeUser){update();return;}
  activeUser=auth().user?.id;
  if(!auth().user){document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('app').hidden=true;$('app').inert=true;}
  // Reinitialize all per-user stores atomically, including changes from another tab.
  location.hash=auth().user?'/home':'/login';location.reload();
 });
 window.addEventListener('message',async e=>{
  if(!frame||e.source!==frame.contentWindow||e.origin!=='null'||e.data?.type!=='optics-portal')return;
  const action=e.data.action;
  if(action==='auth-state'){reply({type:'optics-auth-state',authenticated:!!auth().user,displayName:auth().displayName});return;}
  if(action==='login'){
   if(signingIn||auth().user)return;signingIn=true;
   try{if(typeof e.data.password!=='string'||!e.data.password)throw Error('请输入密码');await auth().signIn(e.data.password);}
   catch(error){reply({type:'optics-auth-error',message:error.message==='用户名或密码错误'?'用户名或密码错误':'认证失败，请重试'});}
   finally{signingIn=false;}return;
  }
  if(!auth().user)return;
  if(!ready&&['cloud','bank','exams','resume'].includes(action))return;
  switch(action){case 'ready':update();break;case 'replay':mount();break;case 'logout':try{await auth().signOut();}catch(_error){reply({type:'optics-auth-error',message:'退出失败，请重试'});}break;case 'cloud':$('cloud-open').click();break;case 'bank':location.hash='/bank';openBank();route();break;case 'exams':location.hash='/exams';openExamHome();route();break;case 'resume':if(ui.scope.type==='exams')openBank();location.hash=ui.scope.type==='exam'?'/year/'+ui.scope.paperId:'/resume';route();break;}
 });
 window.addEventListener('hashchange',route);window.addEventListener('optics:progress',update);window.addEventListener('optics:sync-status',update);route();
}
function attach(){if(ready)return;ready=true;$('home-return').onclick=()=>{location.hash='/home';};route();}
window.OpticsHome={initialize,attach,update};
})();
