import {useState} from 'react';
// 保存已经访问过的游标；上一页复用已有游标，不自行计算或伪造服务端快照。
export function useCursorPages(){
 const [size,setSize]=useState(20),[history,setHistory]=useState(['']);
 return {size,setSize,page:history.length,previous:history.length>1?history[history.length-2]:'',record:(cursor='')=>setHistory(old=>{const index=old.indexOf(cursor);return index>=0?old.slice(0,index+1):[...old,cursor]})};
}
