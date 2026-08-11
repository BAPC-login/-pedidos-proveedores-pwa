function stabilize(){const root=document.querySelector('#v30EditProducts.r52-supplier-master');if(!root)return;const directCards=[...root.children].some(node=>node.matches?.('[data-product]')),grouped=[...root.children].some(node=>node.classList?.contains('r52-edit-category'));if(directCards)root.dataset.r52Grouped='';else if(grouped)root.dataset.r52Grouped=String(root.childElementCount)}
new MutationObserver(records=>{if(records.some(record=>record.addedNodes.length||record.removedNodes.length))queueMicrotask(stabilize)}).observe(document.body,{subtree:true,childList:true});
window.addEventListener('pedidos:view-rendered',stabilize);setTimeout(stabilize,500);
import('./app-r53-native-actions.js').catch(error=>console.warn('native_actions_r53_load_failed',error));
