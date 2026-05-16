(function(){
'use strict';

function getReactFiber(el){
  if(!el)return null;
  const key=Object.keys(el).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));
  return key?el[key]:null;
}

function findSpritesListProps(buttonEl){
  let fiber=getReactFiber(buttonEl);
  let attempts=0;
  while(fiber&&attempts++<80){
    const p=fiber.memoizedProps||fiber.pendingProps;
    if(p&&typeof p.onSpriteUpdated==='function'&&p.direction&&typeof p.direction.addSprite==='function'){
      return p;
    }
    fiber=fiber.return;
  }
  return null;
}

function findGd(){
  if(window.gd&&window.gd.Sprite)return window.gd;
  return null;
}

function addSpriteFromArchive(fileUrl, filename){
  const gd=findGd();
  if(!gd){console.error('[Archive] gd not found');alert('Ошибка: gd не найден');return;}

  // Всегда ищем кнопку заново (не используем устаревшую ссылку)
  const addBtn=Array.from(document.querySelectorAll('button')).find(b=>{
    const t=b.textContent.trim();
    return t==='Add a sprite'||t==='Добавить спрайт';
  });
  if(!addBtn){console.error('[Archive] Add sprite button not found');alert('Ошибка: кнопка "Добавить спрайт" не найдена');return;}

  const props=findSpritesListProps(addBtn);
  if(!props){console.error('[Archive] SpritesList props not found');alert('Ошибка: не найдены props анимации');return;}

  const {direction,project,onSpriteUpdated}=props;
  try{
    const rm=project.getResourcesManager();
    if(!rm.hasResource(filename)){
      const res=new gd.ImageResource();
      res.setName(filename);
      res.setFile(fileUrl);
      rm.addResource(res);
      res.delete();
    }
    const sprite=new gd.Sprite();
    sprite.setImageName(filename);
    direction.addSprite(sprite);
    sprite.delete();
    // Вызываем дважды: сразу и через setTimeout для flush React-обновлений
    onSpriteUpdated();
    setTimeout(()=>onSpriteUpdated(),50);
    console.log('[Archive] Спрайт добавлен:',filename,'→',fileUrl);
  }catch(e){
    console.error('[Archive] Ошибка добавления спрайта:',e);
    alert('Ошибка: '+e.message);
  }
}

async function fetchFolder(folder){
  const url='/gdevelop-resources/list'+(folder?'?folder='+encodeURIComponent(folder):'');
  const r=await fetch(url);
  return await r.json();
}

function showArchiveDialog(onSelect){
  let currentFolder='';
  let allFiles=[];
  let allFolders=[];

  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center';

  const box=document.createElement('div');
  box.style.cssText='background:#1a1a2e;border-radius:12px;width:820px;max-width:96vw;height:80vh;display:flex;flex-direction:column;border:2px solid #6c3fc5;overflow:hidden';

  box.innerHTML=`
    <div style="padding:12px 16px;background:#16213e;display:flex;align-items:center;gap:10px;border-bottom:1px solid #2a2a4a;flex-shrink:0">
      <span style="font-size:18px;font-weight:bold;color:#fff">📦 Архив ресурсов</span>
      <div id="arc-bc" style="font-size:13px;color:#a78bfa;display:flex;align-items:center;gap:4px;margin-left:8px"></div>
      <input id="arc-search" placeholder="Поиск..." style="margin-left:auto;padding:6px 10px;border-radius:6px;border:1px solid #444;background:#0f1b30;color:#eee;font-size:13px;width:180px">
      <button id="arc-close" style="background:none;border:none;color:#aaa;font-size:22px;cursor:pointer;line-height:1;padding:0 4px">✕</button>
    </div>
    <div style="display:flex;flex:1;overflow:hidden">
      <div id="arc-sidebar" style="width:180px;background:#0f1b30;border-right:1px solid #2a2a4a;overflow-y:auto;flex-shrink:0;display:flex;flex-direction:column"></div>
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
        <div id="arc-grid" style="flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;padding:12px;align-content:start"></div>
        <div id="arc-status" style="padding:6px 12px;font-size:12px;color:#666;border-top:1px solid #2a2a4a;flex-shrink:0"></div>
      </div>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const searchEl=box.querySelector('#arc-search');
  const gridEl=box.querySelector('#arc-grid');
  const sidebarEl=box.querySelector('#arc-sidebar');
  const statusEl=box.querySelector('#arc-status');
  const bcEl=box.querySelector('#arc-bc');

  box.querySelector('#arc-close').onclick=()=>overlay.remove();
  // Закрываем только при клике на фон (не на контент диалога)
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};

  function renderBreadcrumb(){
    if(!currentFolder){bcEl.innerHTML='';return;}
    bcEl.innerHTML='';
    const home=document.createElement('span');
    home.textContent='🏠';home.style.cssText='cursor:pointer;color:#888';
    home.onclick=()=>openFolder('');
    const sep=document.createElement('span');
    sep.textContent=' / ';sep.style.color='#555';
    const cur=document.createElement('span');
    cur.textContent=currentFolder;cur.style.color='#a78bfa';
    bcEl.appendChild(home);bcEl.appendChild(sep);bcEl.appendChild(cur);
  }

  function renderSidebar(rootFolders){
    sidebarEl.innerHTML='<div style="padding:8px 10px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px">Папки</div>';
    const rootItem=document.createElement('div');
    rootItem.textContent='🏠 Корень';
    rootItem.style.cssText='padding:8px 12px;cursor:pointer;font-size:13px;border-left:3px solid '+(currentFolder===''?'#6c3fc5':'transparent')+';color:'+(currentFolder===''?'#a78bfa':'#aaa');
    rootItem.onclick=()=>openFolder('');
    sidebarEl.appendChild(rootItem);
    rootFolders.forEach(f=>{
      const item=document.createElement('div');
      item.textContent='📁 '+f.name;
      item.style.cssText='padding:8px 12px;cursor:pointer;font-size:13px;border-left:3px solid '+(currentFolder===f.name?'#6c3fc5':'transparent')+';color:'+(currentFolder===f.name?'#a78bfa':'#aaa');
      item.onclick=()=>openFolder(f.name);
      sidebarEl.appendChild(item);
    });
  }

  function renderGrid(){
    const q=searchEl.value.toLowerCase();
    gridEl.innerHTML='';
    const filtered=allFiles.filter(f=>f.filename.toLowerCase().includes(q));
    statusEl.textContent=filtered.length+' файлов'+(currentFolder?' в "'+currentFolder+'"':'');

    // Папки в гриде (если не в подпапке)
    if(!currentFolder){
      allFolders.forEach(f=>{
        const card=document.createElement('div');
        card.style.cssText='background:#16213e;border-radius:8px;border:2px solid #2a2a4a;cursor:pointer;padding:14px 8px;text-align:center;transition:border-color .2s;user-select:none';
        card.innerHTML='<div style="font-size:36px">📁</div><div style="font-size:11px;color:#aaa;margin-top:6px;word-break:break-all">'+f.name+'</div>';
        card.onmouseenter=()=>card.style.borderColor='#6c3fc5';
        card.onmouseleave=()=>card.style.borderColor='#2a2a4a';
        card.onclick=()=>openFolder(f.name);
        gridEl.appendChild(card);
      });
    }

    if(!filtered.length&&!allFolders.length){
      const em=document.createElement('div');
      em.style.cssText='color:#555;padding:40px;text-align:center;grid-column:1/-1';
      em.textContent='Нет файлов';
      gridEl.appendChild(em);
      return;
    }

    filtered.forEach(f=>{
      const card=document.createElement('div');
      card.style.cssText='background:#16213e;border-radius:8px;border:2px solid #2a2a4a;overflow:hidden;cursor:pointer;transition:border-color .2s;user-select:none';
      const img=document.createElement('img');
      img.src=f.url;img.loading='lazy';
      img.style.cssText='width:100%;height:95px;object-fit:contain;background:#0d0d1a;display:block;pointer-events:none';
      const label=document.createElement('div');
      label.textContent=f.filename;
      label.style.cssText='padding:5px 6px;font-size:10px;color:#aaa;word-break:break-all;pointer-events:none';
      card.appendChild(img);card.appendChild(label);
      card.onmouseenter=()=>card.style.borderColor='#6c3fc5';
      card.onmouseleave=()=>card.style.borderColor='#2a2a4a';
      card.onclick=()=>{
        overlay.remove();
        onSelect(f.url,f.filename);
      };
      gridEl.appendChild(card);
    });
  }

  async function openFolder(name){
    currentFolder=name;
    gridEl.innerHTML='<div style="color:#555;padding:30px;text-align:center;grid-column:1/-1">Загрузка...</div>';
    const data=await fetchFolder(name);
    allFiles=data.files||[];
    allFolders=data.folders||[];
    let rootFolders=allFolders;
    if(name){const rd=await fetchFolder('');rootFolders=rd.folders||[];}
    renderBreadcrumb();
    renderSidebar(rootFolders);
    renderGrid();
  }

  searchEl.addEventListener('input',renderGrid);
  openFolder('');
}

function injectArchiveButton(addBtn){
  if(addBtn.parentElement&&addBtn.parentElement.querySelector('.gd-archive-btn'))return;
  const btn=document.createElement('button');
  btn.className='gd-archive-btn';
  btn.textContent='📦 Из архива';
  btn.style.cssText='margin-left:8px;padding:4px 12px;background:#6c3fc5;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold';
  btn.onmouseenter=()=>btn.style.background='#7c4fd5';
  btn.onmouseleave=()=>btn.style.background='#6c3fc5';
  btn.onclick=e=>{
    e.preventDefault();e.stopPropagation();
    showArchiveDialog((url,filename)=>addSpriteFromArchive(url,filename));
  };
  const parent=addBtn.parentElement;
  if(parent)parent.insertBefore(btn,addBtn.nextSibling);
}

let lastMs=0;
const obs=new MutationObserver(()=>{
  const now=Date.now();if(now-lastMs<300)return;lastMs=now;
  if(document.querySelector('.gd-archive-btn'))return;
  document.querySelectorAll('button').forEach(el=>{
    const t=el.textContent.trim();
    if(t==='Add a sprite'||t==='Добавить спрайт'){
      if(!el.parentElement||el.parentElement.querySelector('.gd-archive-btn'))return;
      injectArchiveButton(el);
    }
  });
});
obs.observe(document.body,{childList:true,subtree:true});
console.info('[GDevelop Archive Helper] v3.0 загружен');
})();
