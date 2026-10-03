export function releaseState(releaseDate,ctas=[],now=Date.now()){
 const date=Date.parse(releaseDate),valid=Number.isFinite(date);
 const future=valid&&date>now;
 const cart=ctas.some(x=>x.type==='ADD_TO_CART'&&x.price&&!x.price.isTiedToSubscription);
 const preorder=ctas.some(x=>/PRE.?ORDER/i.test(x.type||''));
 const confirmed=valid&&!future&&cart&&!preorder;
 return {upcoming:!confirmed,releasedConfirmed:confirmed,releaseNeedsVerification:!future&&!confirmed};
}
export function mergeUpcoming(previous,fresh,released){
 const releasedIds=new Set(released.filter(x=>x.releasedConfirmed).map(x=>x.productId));
 const result=new Map(fresh.filter(x=>!releasedIds.has(x.productId)).map(x=>[x.productId,x]));
 for(const x of previous)if(!releasedIds.has(x.productId)&&!result.has(x.productId))result.set(x.productId,{...x,upcoming:true,releasedConfirmed:false,releaseNeedsVerification:true,priceNeedsVerification:true});
 return [...result.values()];
}
