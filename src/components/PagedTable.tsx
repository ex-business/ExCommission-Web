import {Children, Fragment, cloneElement, isValidElement, useState, useRef, type HTMLAttributes, type ReactElement, type ReactNode} from 'react';
import './pagination.css';
const sizes=[20,50,100];
export type RemotePaging={page:number;size:number;more:boolean;busy?:boolean;onSize:(size:number)=>void;onNext:()=>void;onPrevious:()=>void};
export function PaginationBar({paging,total}:{paging:RemotePaging;total?:number}){return <nav className="table-pagination" aria-label="列表分页"><span>{total===undefined?'第 '+paging.page+' 页':'已加载 '+total+' 条'}</span><label>每页 <select aria-label="每页条数" value={paging.size} disabled={paging.busy} onChange={event=>paging.onSize(Number(event.target.value))}>{(sizes.includes(paging.size)?sizes:[paging.size,...sizes]).map(value=><option key={value} value={value}>{value} 条</option>)}</select></label><button type="button" disabled={paging.busy||paging.page<=1} onClick={paging.onPrevious}>上一页</button><span>{paging.page}</span><button type="button" disabled={paging.busy||!paging.more} onClick={paging.onNext}>下一页</button></nav>}

function flatten(nodes:ReactNode):ReactElement[] {
 return Children.toArray(nodes).flatMap(node=>isValidElement(node)?node.type===Fragment?flatten((node.props as {children?:ReactNode}).children):[node]:[]);
}
// 表格仅改变可见行，保留未显示行的组件和表单状态，换页不会丢弃未保存的编辑。
export function PagedTable({children,paging,...props}:HTMLAttributes<HTMLTableElement>&{paging?:RemotePaging}){
 const [page,setPage]=useState(1),[size,setSize]=useState(20);const invalidPending=useRef(false);
 const sections=flatten(children);const bodies=sections.filter(section=>section.type==='tbody');
 const total=bodies.reduce((n,body)=>n+flatten((body.props as {children?:ReactNode}).children).length,0);
 const pages=Math.max(1,Math.ceil(total/size)),current=Math.min(page,pages);let offset=0;
 const content=sections.map(section=>{
  if(section.type!=='tbody')return section;
  const rows=flatten((section.props as {children?:ReactNode}).children).map(row=>{
   const index=offset++;return cloneElement(row as ReactElement<HTMLAttributes<HTMLTableRowElement>>,{hidden:!paging&&(index<(current-1)*size||index>=current*size)});
  });
  return cloneElement(section as ReactElement<{children?:ReactNode}>,{},rows);
 });
 return <div className="paged-table" onInvalidCapture={event=>{
   const input=event.target as HTMLInputElement,row=input.closest('tr');
   // 隐藏页存在未完成的必填项时，先定位到对应页，再展示原生校验，不丢弃或跳过该字段。
   if(!paging&&row){
    if(invalidPending.current){if(row.hidden)event.preventDefault();return}
    invalidPending.current=true;const wasHidden=row.hidden;
    if(wasHidden){const all=[...event.currentTarget.querySelectorAll('tbody > tr')];const index=all.indexOf(row);event.preventDefault();if(index>=0)setPage(Math.floor(index/size)+1)}
    // 一次原生校验可能发现多页必填项，只定位第一个，避免多个焦点请求来回翻页。
    requestAnimationFrame(()=>{if(wasHidden){input.focus();input.reportValidity()}invalidPending.current=false})
   }
 }}><table {...props}>{content}</table>{paging?<PaginationBar paging={paging}/>:<nav className="table-pagination" aria-label="表格分页"><span>已加载 {total} 条</span><label>每页 <select aria-label="每页条数" value={size} onChange={event=>{setSize(Number(event.target.value));setPage(1)}}>{sizes.map(value=><option key={value} value={value}>{value} 条</option>)}</select></label><button type="button" disabled={current<=1} onClick={()=>setPage(current-1)}>上一页</button><span>{current} / {pages}</span><button type="button" disabled={current>=pages} onClick={()=>setPage(current+1)}>下一页</button></nav>}</div>;
}
