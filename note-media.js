/* Private image chunks use the existing authenticated settings RPC. */
(function(){'use strict';
 const prefix='settings:note-image.',cache=new Map();let owner='',request=null;
 function account(){const id=window.OpticsAuth?.user?.id;if(!id)throw Error('请先登录后添加图片。');if(owner!==id){owner=id;cache.clear();request=null;}return id;}
 async function rows(){const id=account();if(!request)request=OpticsAuth.client.rpc('english_sync',{changes:[]}).then(r=>{if(r.error)throw r.error;if(account()!==id)throw Error('登录账号已改变');return r.data.rows;}).catch(e=>{request=null;throw e;});return request;}
 async function load(id){const who=account(),key=who+':'+id;if(!/^[a-f0-9-]{36}$/.test(id))throw Error('图片编号无效');if(cache.has(key))return cache.get(key);const all=await rows();if(account()!==who)throw Error('登录账号已改变');const values=new Map(all.filter(r=>r.key.startsWith(prefix+id+'.')).map(r=>[r.key,JSON.parse(r.value)])),meta=values.get(prefix+id+'.meta');if(!meta||!Number.isInteger(meta.count)||meta.count<1||meta.count>24)throw Error('图片暂未读取成功');let url='';for(let i=0;i<meta.count;i++){const part=values.get(prefix+id+'.'+i);if(typeof part!=='string')throw Error('图片暂未完整同步');url+=part;}if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)||url.length>2400000)throw Error('图片格式无效');cache.set(key,url);return url;}
 async function upload(file){
  const who=account();if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请使用 PNG、JPEG 或 WebP 图片。');if(file.size>20000000)throw Error('图片超过 20 MB，请先缩小。');
  const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),scale=Math.min(1,1800/bitmap.width,1800/bitmap.height);canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  let data=canvas.toDataURL('image/png');if(data.length>1200000)data=canvas.toDataURL('image/jpeg',.88);if(data.length>2400000)throw Error('图片过大，请裁剪后再添加。');if(account()!==who)throw Error('登录账号已改变');
  const id=crypto.randomUUID(),parts=data.match(/.{1,100000}/g),values=parts.map((v,i)=>({key:prefix+id+'.'+i,value:JSON.stringify(v),base:0,op:crypto.randomUUID()}));values.push({key:prefix+id+'.meta',value:JSON.stringify({count:parts.length,width:canvas.width,height:canvas.height}),base:0,op:crypto.randomUUID()});
  const result=await OpticsAuth.client.rpc('english_sync',{changes:values});if(result.error||result.data?.acknowledged?.length!==values.length)throw Error('图片上传失败，请重试；原有笔记已保留。');if(account()!==who)throw Error('登录账号已改变');cache.set(who+':'+id,data);request=null;return 'optics-image:'+id;
 }
 function image(id,img){const who=window.OpticsAuth?.user?.id;img.alt='正在读取笔记图片…';load(id).then(url=>{if(OpticsAuth.user?.id!==who)return;img.src=url;img.alt='笔记图片';}).catch(()=>{if(img.isConnected)img.alt='图片未加载，恢复网络后重新打开笔记';});}
 window.OpticsNoteMedia={upload,image};
})();
