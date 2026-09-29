/* Authentication gate installed before the original presentation handlers. */
(function(){'use strict';
if(parent===window){location.replace('./index.html#/login');return;}
const parentOrigin=new URL(location.href).origin;
// Never trust a referrer to select where credentials are sent.
if(document.referrer&&new URL(document.referrer).origin!==parentOrigin)return;
const resume=new URLSearchParams(location.search).has('resume');
let authenticated=resume,busy=false,formReady=false;
const send=(action,extra={})=>parent.postMessage({type:'optics-portal',action,...extra},parentOrigin);
function error(text){if(authenticated){const status=document.getElementById('optics-status');if(status){status.textContent=text;status.setAttribute('role','alert');return;}}let p=document.getElementById('auth-message');if(!p){p=document.createElement('p');p.id='auth-message';p.setAttribute('role','alert');p.style.cssText='color:#874c40;font:12px/1.5 sans-serif;margin:8px 0 0';document.querySelector('#login-form')?.append(p);}p.textContent=text;}
function submit(){
 if(busy)return;
 const input=document.querySelector('input[type="password"]');
 if(!input?.value){error('请输入密码');input?.focus();return;}
 busy=true;const button=document.querySelector('.login-button');if(button)button.disabled=true;
 error('正在认证…');send('login',{password:input.value});
 input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));
}
document.addEventListener('click',e=>{
 const target=e.target.closest?.('.login-button,#completeButton,.form-element a');
 if(!target)return;
 if(target.matches('.form-element a')){e.preventDefault();e.stopImmediatePropagation();return;}
 if(!authenticated){e.preventDefault();e.stopImmediatePropagation();if(target.matches('.login-button'))submit();}
},true);
document.addEventListener('submit',e=>{if(e.target.id==='login-form'&&!authenticated){e.preventDefault();e.stopImmediatePropagation();submit();}},true);
function prepare(){
 const form=document.querySelector('#login-form');if(!form||formReady)return;formReady=true;
 const inputs=form.querySelectorAll('input');
 inputs.forEach(input=>{
  if(input.type==='password'){input.readOnly=false;input.value='';input.removeAttribute('value');input.autocomplete='current-password';input.required=true;input.setAttribute('aria-label','密码');input.dispatchEvent(new Event('input',{bubbles:true}));}
  else{input.value='Doc. Muelsyse';input.readOnly=true;input.autocomplete='username';input.setAttribute('aria-label','用户名');}
 });
 form.querySelectorAll('a').forEach(a=>{a.setAttribute('aria-disabled','true');a.tabIndex=-1;});
 send('auth-state');
}
// resume：父页面已确认登录且本会话看过开场，直接推进到主页，避免重播与卡死。
if(resume){
 document.documentElement.classList.add('session-restoring','session-resume');
 let tries=0,loginAdvanced=false,completeAdvanced=false,loginAt=0;
 const tick=function(){
  try{
   if(document.querySelector('.optics-links.is-ready')){document.documentElement.classList.remove('session-restoring');return;}
   if(!loginAdvanced){
    const b=document.querySelector('.login-button');
    if(b){
     loginAdvanced=true;loginAt=performance.now();
     try{b.click();}catch(e){}
    }
   }else if(!completeAdvanced&&performance.now()-loginAt>1100){
    const c=document.querySelector('#completeButton');
    if(c){completeAdvanced=true;try{c.click();}catch(e){}}
   }
  }catch(e){}
  if(++tries<180){setTimeout(tick,100);}
  else{document.documentElement.classList.remove('session-restoring');}
 };
 tick();
}
new MutationObserver(prepare).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('message',e=>{
 if(e.source!==parent||e.origin!==parentOrigin)return;
 if(e.data?.type==='optics-auth-error'){busy=false;const b=document.querySelector('.login-button');if(b)b.disabled=false;error(['用户名或密码错误','退出失败，请重试'].includes(e.data.message)?e.data.message:'认证失败，请重试');}
 if(e.data?.type==='optics-auth-state'&&e.data.authenticated===true){
  authenticated=true;
  // Fresh login: keep the current scene alive. The original LOGIN handler
  // is invoked exactly once; repeatedly clicking it restarts continueLoading().
  document.documentElement.classList.remove('session-restoring');
  document.documentElement.classList.add('auth-completing');
  window.dispatchEvent(new CustomEvent('optics:authenticated'));
  let attempts=0,clicked=false;
  const advanceOnce=function(){
   if(clicked)return;
   const b=document.querySelector('.login-button');
   if(b){
    clicked=true;
    try{b.click();}catch(e){}
    return;
   }
   if(++attempts<100)setTimeout(advanceOnce,100);
  };
  advanceOnce();
  const cleanup=setInterval(()=>{
   if(document.querySelector('.optics-links.is-ready')){
    clearInterval(cleanup);
    document.documentElement.classList.remove('auth-completing');
   }
  },250);
  setTimeout(()=>{clearInterval(cleanup);document.documentElement.classList.remove('auth-completing');},20000);
 }
});
})();
