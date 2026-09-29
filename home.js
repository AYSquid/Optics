/* Adapter for the user's supplied rhine-lab.html; quiz data stays in the host. */
(function(){'use strict';
let ready=false,frame=null,seen=false;
function update(){if(!frame)return;const counts={known:0,unknown:0,shaky:0};DATA.questions.forEach(q=>{const k=getStatus(q.statusKey||q.id);if(k in counts)counts[k]++;});const cloud=window.OpticsCloud?.summary()||{};
const state=cloud.connected?(cloud.pending?'云端待同步 '+cloud.pending+' 条':'云端已同步'):(cloud.configured?'云端待连接':'本地记录');
frame.contentWindow?.postMessage({type:'optics-summary',text:'题库 '+DATA.questions.length+' 题 · 会做 '+counts.known+' · 不熟练 '+counts.shaky+' · 不会做 '+counts.unknown+' ｜ '+state},'*');}
function mount(replay=false){if(frame)frame.remove();frame=document.createElement('iframe');frame.id='rhine-portal';frame.title='莱茵生命 · 工程光学学习入口';frame.setAttribute('sandbox','allow-scripts allow-forms');frame.src='rhine-lab.html'+(seen&&!replay?'?resume=1':'');document.body.append(frame);}
function route(){if(!ready)return;const home=!location.hash||location.hash==='#/home';$('app').hidden=home;$('app').inert=home;document.body.classList.toggle('portal-open',home);if(home){if(!frame)mount();}else if(frame){frame.remove();frame=null;}}
function attach(){if(ready)return;ready=true;$('home-return').onclick=()=>{location.hash='/home';};
window.addEventListener('message',e=>{if(!frame||e.source!==frame.contentWindow||e.origin!=='null'||e.data?.type!=='optics-portal')return;
switch(e.data.action){case 'ready':seen=true;update();break;case 'replay':mount(true);break;case 'cloud':$('cloud-open').click();break;case 'bank':location.hash='/bank';openBank();route();break;case 'exams':location.hash='/exams';openExamHome();route();break;case 'resume':if(ui.scope.type==='exams')openBank();location.hash=ui.scope.type==='exam'?'/year/'+ui.scope.paperId:'/resume';route();break;}});
window.addEventListener('hashchange',route);window.addEventListener('optics:progress',update);window.addEventListener('optics:sync-status',update);route();}
window.OpticsHome={attach,update};
})();

