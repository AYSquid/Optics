(function(){'use strict';
 function validate(result,max,type){
  if(!result||!Number.isFinite(result.score)||result.score<0||result.score>max||result.maxScore!==max||typeof result.summary!=='string'||typeof result.band!=='string'||typeof result.revisedAnswer!=='string'||!['points','dimensions','issues','revisions','improvements','remaining'].every(k=>Array.isArray(result[k])))throw Error('批改返回格式不完整，未计入完成记录');
  if(type==='writing'&&!Number.isInteger(result.score))throw Error('作文估分应为整数，批改返回格式不符合要求');
  return result;
 }
 async function grade(paper,group,q,answer,previous){
  const client=window.OpticsAuth?.client;if(!client)throw Error('请先登录');
  const body={type:q.type,paperId:paper.id,questionId:q.id,answer,apiKey:window.EnglishAPISettings?.getKey()||undefined,scoringPoints:q.scoringPoints||'',previous:previous?{answer:previous.answer,result:previous.result}:null};
  if(!client.functions?.invoke)throw Error('AI 批改尚未连接，草稿已保存在本机');
  const {data,error}=await client.functions.invoke(window.OPTICS_CLOUD_CONFIG?.englishGradeFunction||'english-grade',{body});
  if(error||data?.error){let message=data?.error;if(!message&&error?.context?.json){try{message=(await error.context.json()).error;}catch(e){}}throw Error(message||'AI 批改未连接，请确认后端已部署；草稿已保存在本机。');}
  return validate(data.result,q.maxScore,q.type);
 }
 window.EnglishGrader={grade,validate};
})();
