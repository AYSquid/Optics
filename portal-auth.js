/* Authentication gate installed before the original presentation handlers. */
(function(){'use strict';
if(parent===window){location.replace('./index.html#/login');return;}
const parentOrigin=new URL(location.href).origin;
// Never trust a referrer to select where credentials are sent.
if(document.referrer&&new URL(document.referrer).origin!==parentOrigin)return;
let authenticated=false,busy=false,formReady=false;
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
new MutationObserver(prepare).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('message',e=>{
 if(e.source!==parent||e.origin!==parentOrigin)return;
 if(e.data?.type==='optics-auth-error'){busy=false;const b=document.querySelector('.login-button');if(b)b.disabled=false;error(['用户名或密码错误','退出失败，请重试'].includes(e.data.message)?e.data.message:'认证失败，请重试');}
 if(e.data?.type==='optics-auth-state'&&e.data.authenticated===true){
  authenticated=true;
  // A verified parent session alone enables the existing welcome animation.
  document.documentElement.classList.add('session-restoring');
  let attempts=0;const timer=setInterval(()=>{
   if(document.querySelector('.optics-links.is-ready')){clearInterval(timer);document.documentElement.classList.remove('session-restoring');return;}
   const b=document.querySelector('.login-button');if(b)b.click();
   if(++attempts>120)clearInterval(timer);
  },250);
 }
});
})();
