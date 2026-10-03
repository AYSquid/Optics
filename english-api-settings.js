/* BYOK preferences are device-local and never enter any sync/export payload. */
(function(){'use strict';
 const memory=new Map(),by=id=>document.getElementById(id),storageKey=()=>window.OpticsCloud?OpticsCloud.localKey('gopt.deepseek.key.v1'):'gopt.deepseek.key.v1';
 function getKey(){const key=storageKey();if(memory.has(key))return memory.get(key);try{return localStorage.getItem(key)||'';}catch(e){return '';}}
 function status(text){by('english-api-status').textContent=text;}
 function update(){by('english-api-key').value='';try{by('english-api-remember').checked=!!localStorage.getItem(storageKey());}catch(e){}status(getKey()?'已配置密钥 · 模型 deepseek-flash':'尚未填写个人密钥；如管理员已配置服务端密钥，可直接批改。');}
 by('english-api-save').onclick=()=>{const input=by('english-api-key'),value=input.value.trim();if(!value){status('请输入 API Key，或点击清除密钥。');return;}if(value.length<10||value.length>300||/\s/.test(value)){status('密钥格式不正确，请重新填写。');return;}const key=storageKey();try{if(by('english-api-remember').checked)localStorage.setItem(key,value);else localStorage.removeItem(key);memory.set(key,value);input.value='';status('已保存 · DeepSeek V4.1 Flash · '+(by('english-api-remember').checked?'仅此设备记住':'仅本次网页会话'));}catch(e){status('设备无法保存设置，请取消记住密钥后重试。');}};
 by('english-api-clear').onclick=()=>{memory.delete(storageKey());try{localStorage.removeItem(storageKey());}catch(e){}by('english-api-key').value='';by('english-api-remember').checked=false;status('个人密钥已清除。');};
 by('cloud-open').addEventListener('click',update);by('cloud-dialog').addEventListener('close',()=>{by('english-api-key').value='';});update();
 window.EnglishAPISettings={getKey};
})();
