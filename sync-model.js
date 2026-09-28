/* Pure per-record optimistic concurrency. Null is a deletion tombstone. */
(function(root){
 'use strict';
 function edit(records,key,value,op){
  var old=records[key]||{value:null,revision:0};
  records[key]=Object.assign({},old,{pending:{key:key,value:value,base:old.revision,op:op},conflict:null});
 }
 function reconcile(records,response,sent){
  var ack=new Map(response.acknowledged.map(function(a){return[a.key,a];}));
  var conflicts=new Set(response.conflicts);
  response.rows.forEach(function(row){
   var local=records[row.key]||{},pending=local.pending,a=ack.get(row.key);
   if(pending&&a){
    if(pending.op===a.op)pending=null;
    else if(sent[row.key]&&sent[row.key].op===a.op)pending=Object.assign({},pending,{base:a.revision});
   }
   var conflict=pending&&(conflicts.has(row.key)||pending.base!==row.revision)?row:null;
   records[row.key]={value:row.value,revision:row.revision,pending:pending||null,conflict:conflict};
  });
 }
 function visible(r){return r.pending?r.pending.value:r.value;}
 var api={edit:edit,reconcile:reconcile,visible:visible};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.OpticsSyncModel=api;
})(typeof window==='object'?window:this);
