/* Authentication gate installed before the original presentation handlers. */
(function(){'use strict';
if(parent===window){location.replace('./index.html#/login');return;}
const parentOrigin=new URL(location.href).origin;
// Never trust a referrer to select where credentials are sent.
if(document.referrer&&new URL(document.referrer).origin!==parentOrigin)return;
const resume=new URLSearchParams(location.search).has('resume');
// Presentation hint from the host; authentication still requires its reply.
const restoredSession=new URLSearchParams(location.search).get('authenticated')==='1'||resume;
if(restoredSession)document.documentElement.classList.add('session-authenticated');
let authenticated=resume,busy=false,formReady=false,authHandled=false;
const send=(action,extra={})=>parent.postMessage({type:'optics-portal',action,...extra},parentOrigin);
function error(text){if(authenticated){const status=document.getElementById('optics-status');if(status){status.textContent=text;status.setAttribute('role','alert');return;}}let p=document.getElementById('auth-message');if(!p){p=document.createElement('p');p.id='auth-message';p.setAttribute('role','alert');p.style.cssText='color:#874c40;font:12px/1.5 sans-serif;margin:8px 0 0';document.querySelector('#login-form')?.append(p);}p.textContent=text;}
function submit(){
 if(busy)return;
 const input=document.querySelector('input[type="password"]');
 const username=document.querySelector('#login-form input:not([type="password"])');
 if(!username?.value.trim()){error('请输入邮箱或用户名');username?.focus();return;}
 if(!input?.value){error('请输入密码');input?.focus();return;}
 busy=true;const button=document.querySelector('.login-button');if(button)button.disabled=true;
 error('正在认证…');send('login',{password:input.value,email:username.value.trim()});
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
  else{input.value='Doc. Muelsyse';input.readOnly=false;input.autocomplete='username';input.required=true;input.setAttribute('aria-label','用户名或邮箱');input.placeholder='Doc. Muelsyse 或邮箱';}
 });
 form.querySelectorAll('a').forEach(a=>{a.setAttribute('aria-disabled','true');a.tabIndex=-1;});
 send('auth-state');
}
// resume：父页面已确认登录且本会话看过开场。
if(resume){
 document.documentElement.classList.add('session-restoring','session-resume');
}
new MutationObserver(prepare).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('message',e=>{
 if(e.source!==parent||e.origin!==parentOrigin)return;
 if(e.data?.type==='optics-auth-error'){busy=false;const b=document.querySelector('.login-button');if(b)b.disabled=false;error(['用户名或密码错误','退出失败，请重试','请输入邮箱或用户名','请输入有效的邮箱地址'].includes(e.data.message)?e.data.message:'认证失败，请重试');}
 if(e.data?.type==='optics-auth-state'&&e.data.authenticated===true){
  if(authHandled)return;
  authHandled=true;
  authenticated=true;

  if(resume){
   document.documentElement.classList.add('session-restoring','session-resume');
  }else{
   document.documentElement.classList.remove('session-restoring');
   document.documentElement.classList.add('auth-completing');
  }

  window.dispatchEvent(new CustomEvent('optics:authenticated',{detail:{resume}}));

  const cleanup=setInterval(()=>{
   if(document.querySelector('.optics-links.is-ready')){
    clearInterval(cleanup);
    document.documentElement.classList.remove('auth-completing','session-restoring');
   }
  },250);
  setTimeout(()=>{
   clearInterval(cleanup);
   document.documentElement.classList.remove('auth-completing','session-restoring');
  },20000);
 }
});
})();
