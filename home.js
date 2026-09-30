/* The host owns authentication; the sandboxed portal owns presentation only. */
(function(){'use strict';
let ready=false,frame=null,initialized=false,signingIn=false;
const auth=()=>window.OpticsAuth;
// 本次会话是否已看过开场动画（沿用旧版的 sessionStorage 记忆）
function introSeen(){try{return !!sessionStorage.getItem('optics.entry.seen.v3');}catch(e){return false;}}
function update(){if(!frame||!auth().user||!ready)return;const counts={known:0,unknown:0,shaky:0};DATA.questions.forEach(q=>{const k=getStatus(q.statusKey||q.id);if(k in counts)counts[k]++;});const cloud=window.OpticsCloud?.summary()||{};
const state=cloud.connected?(cloud.pending?'云端待同步 '+cloud.pending+' 条':'云端已同步'):'云端待连接';
frame.contentWindow?.postMessage({type:'optics-summary',text:auth().displayName+' · 题库 '+DATA.questions.length+' 题 · 会做 '+counts.known+' · 不熟练 '+counts.shaky+' · 不会做 '+counts.unknown+' ｜ '+state},'*');}
function reply(message){frame?.contentWindow?.postMessage(message,'*');}
function mount(replay){
 if(frame){frame.remove();frame=null;}
 const resume=!!(auth().user&&introSeen()&&!replay);
 frame=document.createElement('iframe');
 frame.id='rhine-portal';
 frame.title='RHINE LAB · 学习系统';
 frame.setAttribute('sandbox','allow-scripts allow-forms');
 const params=new URLSearchParams();
 if(auth().user)params.set('authenticated','1');
 if(resume)params.set('resume','1');
 frame.src='rhine-lab.html'+(params.size?'?'+params:'');
 document.body.append(frame);
}
function route(){
 const signed=!!auth().user;
 if(!signed&&location.hash!=='#/login')history.replaceState(null,'',location.pathname+location.search+'#/login');
 if(signed&&(!location.hash||location.hash==='#/login'))history.replaceState(null,'',location.pathname+location.search+'#/home');
 const home=!signed||location.hash==='#/home';
 $('app').hidden=home||!ready;$('app').inert=home||!ready;
 document.body.classList.toggle('portal-open',home);
 if(home){if(!frame)mount();else frame.hidden=false;}
 else if(frame){frame.hidden=true;}   // 复用 iframe：返回主页时不重建，避免重播/卡死
}
function initialize(){if(initialized)return;initialized=true;
 let activeUser=auth().user?.id;
 auth().subscribe(()=>{
  const nextUserId=auth().user?.id;
  if(nextUserId===activeUser){update();return;}
  const previousUserId=activeUser;
  activeUser=nextUserId;
  // A login initiated by this portal must keep the iframe alive so the
  // left-to-center logo transition can finish continuously.
  if(signingIn&&!previousUserId&&nextUserId){
   history.replaceState(null,'',location.pathname+location.search+'#/home');
   route();update();return;
  }
  if(!auth().user){document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('app').hidden=true;$('app').inert=true;}
  // Cross-tab account changes / sign-out still reinitialize per-user stores.
  location.hash=auth().user?'/home':'/login';location.reload();
 });
 window.addEventListener('message',async e=>{
  if(!frame||e.source!==frame.contentWindow||e.origin!=='null'||e.data?.type!=='optics-portal')return;
  const action=e.data.action;
  if(action==='auth-state'){reply({type:'optics-auth-state',authenticated:!!auth().user,displayName:auth().displayName});return;}
  if(action==='login'){
   if(signingIn||auth().user)return;signingIn=true;
   try{
    if(typeof e.data.password!=='string'||!e.data.password)throw Error('请输入密码');
    await auth().signIn(e.data.password);
    reply({type:'optics-auth-state',authenticated:true,displayName:auth().displayName});
   }
   catch(error){reply({type:'optics-auth-error',message:error.message==='用户名或密码错误'?'用户名或密码错误':'认证失败，请重试'});}
   finally{signingIn=false;}return;
  }
  if(!auth().user)return;
  if(!ready&&['cloud','bank','exams','resume'].includes(action))return;
  switch(action){case 'ready':try{sessionStorage.setItem('optics.entry.seen.v3','1');}catch(e){}update();break;case 'replay':mount(true);break;case 'logout':try{await auth().signOut();}catch(_error){reply({type:'optics-auth-error',message:'退出失败，请重试'});}break;case 'cloud':$('cloud-open').click();break;case 'bank':location.hash='/bank';openBank();route();break;case 'exams':location.hash='/exams';openExamHome();route();break;case 'resume':if(ui.scope.type==='exams')openBank();location.hash=ui.scope.type==='exam'?'/year/'+ui.scope.paperId:'/resume';route();break;}
 });
 window.addEventListener('hashchange',route);window.addEventListener('optics:progress',update);window.addEventListener('optics:sync-status',update);route();
}
function attach(){if(ready)return;ready=true;$('home-return').onclick=()=>{location.hash='/home';};route();}
window.OpticsHome={initialize,attach,update};
})();
