/* One official Supabase client; credentials are handled only by Auth. */
(function(){
'use strict';
const INTERNAL_AUTH_EMAIL='doc.muelsyse@rhine.invalid';
let client=null,session=null,initialized=false,expiryTimer;
const listeners=new Set();
function publish(next){
 session=next;clearTimeout(expiryTimer);
 if(session?.expires_at){expiryTimer=setTimeout(()=>publish(null),Math.max(0,session.expires_at*1000-Date.now()));}
 listeners.forEach(fn=>fn(session));
}
const api={
 get client(){return client;},get user(){return session?.user||null;},
 get displayName(){return session?.user?.user_metadata?.display_name??'Doc. Muelsyse';},
 get initialized(){return initialized;},
 subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
 async signIn(password){
  await api.ready;
  if(!client)throw Error('认证服务暂不可用，请刷新后重试');
  const {data,error}=await client.auth.signInWithPassword({email:INTERNAL_AUTH_EMAIL,password});
  if(error||!data?.session)throw Error(error?.status===400?'用户名或密码错误':'认证失败，请重试');
  publish(data.session);return data.user;
 },
 async signOut(){
  if(!client)return;
  const {error}=await client.auth.signOut();
  if(error)throw Error('退出失败，请重试');
  publish(null);
 }
};
api.ready=(async()=>{
 try{
  const cfg=window.OPTICS_CLOUD_CONFIG;
  client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  let revision=0;
  client.auth.onAuthStateChange((_event,next)=>{revision++;publish(next);});
  const before=revision;
  const {data,error}=await client.auth.getSession();
  if(error)throw error;
  if(before===revision)publish(data.session);
 }catch(_error){publish(null);}
 finally{initialized=true;}
})();
window.OpticsAuth=api;
})();
