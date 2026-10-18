import {Children,useState,type ReactNode} from 'react';
import {PaginationBar,type RemotePaging} from './PagedTable';
export function PagedList({children,paging,className}:{children:ReactNode;paging?:RemotePaging;className?:string}){
 const [page,setPage]=useState(1),[size,setSize]=useState(20),rows=Children.toArray(children);const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(page,pages);
 const local={page:current,size,more:current<pages,onSize:(n:number)=>{setSize(n);setPage(1)},onPrevious:()=>setPage(current-1),onNext:()=>setPage(current+1)};
 return <div><div className={className}>{rows.map((row,index)=><div key={(row as {key?:string}).key??index} hidden={!paging&&(index<(current-1)*size||index>=current*size)}>{row}</div>)}</div><PaginationBar paging={paging||local} total={paging?undefined:rows.length}/></div>
}
