import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors({ origin: true, credentials: false }));
app.use(express.json());

function safePath(...parts) {
  const resolved = path.resolve(uploadDir, ...parts.map(p => p || ''));
  if (!resolved.startsWith(path.resolve(uploadDir))) throw new Error('Invalid path');
  return resolved;
}
function sanitize(name) {
  return (name || '').replace(/[^a-zA-Z0-9а-яёА-ЯЁ._\- ]/g, '_').trim().substring(0, 100);
}

// Multer: загрузка в папку
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = sanitize(req.query.folder || '');
    const dir = folder ? safePath(folder) : uploadDir;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const orig = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const folder = sanitize(req.query.folder || '');
    const dir = folder ? safePath(folder) : uploadDir;
    const target = path.join(dir, orig);
    cb(null, fs.existsSync(target) ? `${Date.now()}_${orig}` : orig);
  },
});
const upload = multer({ storage });

// Список файлов и папок
app.get('/list', (req, res) => {
  const folder = sanitize(req.query.folder || '');
  const dir = folder ? safePath(folder) : uploadDir;
  if (!fs.existsSync(dir)) return res.json({ files: [], folders: [], current: folder });
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const folders = entries.filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name)).map(e => ({ name: e.name }));
  const files = entries.filter(e => e.isFile() && /\.(png|jpg|gif|jpeg|webp)$/i.test(e.name))
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(e => ({ filename: e.name, url: `/gdevelop-resources/files/${folder ? folder+'/' : ''}${e.name}` }));
  res.json({ files, folders, current: folder });
});

// Создать папку
app.post('/folder', (req, res) => {
  const name = sanitize(req.body.name || '');
  if (!name) return res.status(400).json({ error: 'Имя не может быть пустым' });
  const dir = safePath(name);
  if (fs.existsSync(dir)) return res.status(409).json({ error: 'Папка уже существует' });
  fs.mkdirSync(dir);
  res.json({ ok: true, name });
});

// Удалить папку
app.delete('/folder/:name', (req, res) => {
  const name = sanitize(req.params.name);
  const dir = safePath(name);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Папка не найдена' });
  fs.rmSync(dir, { recursive: true });
  res.json({ ok: true });
});

// Загрузка файлов
app.post('/upload', upload.array('files', 50), (req, res) => {
  const folder = sanitize(req.query.folder || '');
  const files = (req.files || []).map(file => ({
    filename: file.originalname,
    url: `/gdevelop-resources/files/${folder ? folder+'/' : ''}${path.basename(file.path)}`,
  }));
  res.json({ files });
});

// Удалить файл
app.delete('/delete', (req, res) => {
  const folder = sanitize(req.query.folder || '');
  const filename = path.basename(req.query.filename || '');
  if (!filename) return res.status(400).json({ error: 'Имя файла не указано' });
  const filepath = folder ? safePath(folder, filename) : safePath(filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Файл не найден' });
  fs.unlinkSync(filepath);
  res.json({ ok: true });
});

// Переместить файл в другую папку
app.post('/move', (req, res) => {
  const fromFolder = sanitize(req.body.fromFolder || '');
  const toFolder = sanitize(req.body.toFolder || '');
  const filename = path.basename(req.body.filename || '');
  if (!filename) return res.status(400).json({ error: 'Имя файла не указано' });
  const src = fromFolder ? safePath(fromFolder, filename) : safePath(filename);
  const destDir = toFolder ? safePath(toFolder) : uploadDir;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'Файл не найден' });
  fs.renameSync(src, dest);
  res.json({ ok: true, url: `/gdevelop-resources/files/${toFolder ? toFolder+'/' : ''}${filename}` });
});

app.use('/files', express.static(uploadDir));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/admin', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Архив ресурсов</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:sans-serif;background:#1a1a2e;color:#eee;height:100vh;display:flex;flex-direction:column}
header{background:#16213e;padding:12px 20px;display:flex;align-items:center;gap:12px;border-bottom:2px solid #6c3fc5;flex-shrink:0}
header h1{font-size:18px}
.stats{margin-left:auto;color:#aaa;font-size:13px}
.layout{display:flex;flex:1;overflow:hidden}
.sidebar{width:220px;background:#0f1b30;border-right:1px solid #2a2a4a;display:flex;flex-direction:column;flex-shrink:0;overflow-y:auto}
.sidebar-header{padding:10px 14px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #2a2a4a}
.folder-item{padding:9px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:14px;border-left:3px solid transparent}
.folder-item:hover{background:#1a2a4a}
.folder-item.active{background:#1a2a4a;border-left-color:#6c3fc5;color:#a78bfa}
.folder-item .del-f{margin-left:auto;opacity:0;color:#c0392b;cursor:pointer;font-size:16px;line-height:1}
.folder-item:hover .del-f{opacity:1}
.root-item{padding:9px 14px;cursor:pointer;font-size:14px;border-left:3px solid transparent;color:#aaa}
.root-item:hover{background:#1a2a4a}
.root-item.active{background:#1a2a4a;border-left-color:#6c3fc5;color:#a78bfa}
.new-folder-btn{margin:10px;padding:7px;background:#6c3fc5;border:none;color:white;border-radius:6px;cursor:pointer;font-size:13px}
.new-folder-btn:hover{background:#7c4fd5}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden}
.toolbar{padding:10px 16px;background:#0f3460;display:flex;gap:10px;align-items:center;flex-shrink:0;flex-wrap:wrap}
.breadcrumb{font-size:13px;color:#aaa;display:flex;align-items:center;gap:4px}
.breadcrumb span{cursor:pointer;color:#a78bfa}.breadcrumb span:hover{text-decoration:underline}
.search{flex:1;min-width:150px;padding:7px 10px;border-radius:6px;border:1px solid #444;background:#1a1a2e;color:#eee;font-size:13px}
.upload-btn{background:#6c3fc5;color:white;border:none;padding:7px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;white-space:nowrap}
.upload-btn:hover{background:#7c4fd5}
.grid{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:16px;align-content:start}
.card{background:#16213e;border-radius:8px;overflow:hidden;border:1px solid #2a2a4a;transition:border-color 0.2s}
.card:hover{border-color:#6c3fc5}
.card img{width:100%;height:110px;object-fit:contain;background:#0d0d1a;display:block}
.card-body{padding:7px}
.card-name{font-size:10px;color:#aaa;word-break:break-all;margin-bottom:5px;line-height:1.3}
.card-btns{display:flex;gap:4px}
.del-btn{flex:1;background:#c0392b;color:white;border:none;padding:4px;border-radius:4px;cursor:pointer;font-size:11px}
.del-btn:hover{background:#e74c3c}
.move-btn{flex:1;background:#2980b9;color:white;border:none;padding:4px;border-radius:4px;cursor:pointer;font-size:11px}
.move-btn:hover{background:#3498db}
.empty{color:#555;font-size:16px;padding:40px;text-align:center;grid-column:1/-1}
.drop-overlay{display:none;position:fixed;inset:0;background:rgba(108,63,197,.4);z-index:999;align-items:center;justify-content:center;font-size:28px;font-weight:bold}
.drop-overlay.on{display:flex}
.toast{position:fixed;bottom:20px;right:20px;padding:10px 18px;border-radius:8px;font-size:13px;display:none;z-index:1000;background:#27ae60;color:#fff}
.toast.err{background:#c0392b}
.modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:500;align-items:center;justify-content:center}
.modal-bg.on{display:flex}
.modal{background:#16213e;border-radius:10px;padding:24px;min-width:300px;border:1px solid #6c3fc5}
.modal h3{margin-bottom:14px;font-size:16px}
.modal input{width:100%;padding:8px 10px;border-radius:6px;border:1px solid #444;background:#1a1a2e;color:#eee;font-size:14px;margin-bottom:14px}
.modal-btns{display:flex;gap:8px;justify-content:flex-end}
.modal-btns button{padding:7px 18px;border-radius:6px;border:none;cursor:pointer;font-size:13px}
.btn-ok{background:#6c3fc5;color:white}.btn-ok:hover{background:#7c4fd5}
.btn-cancel{background:#444;color:#eee}.btn-cancel:hover{background:#555}
</style>
</head>
<body>
<div class="drop-overlay" id="drop">📂 Отпусти для загрузки</div>
<div class="toast" id="toast"></div>
<div class="modal-bg" id="modalBg">
  <div class="modal">
    <h3 id="modalTitle">Создать папку</h3>
    <input id="modalInput" placeholder="Название папки">
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal()">Отмена</button>
      <button class="btn-ok" id="modalOk">Создать</button>
    </div>
  </div>
</div>
<header>
  <h1>📦 Архив ресурсов GDevelop</h1>
  <span class="stats" id="stats">—</span>
</header>
<div class="layout">
  <div class="sidebar">
    <div class="sidebar-header">Папки</div>
    <div class="root-item active" id="rootItem" onclick="openFolder('')">🏠 Корень</div>
    <div id="folderList"></div>
    <button class="new-folder-btn" onclick="showCreateFolder()">+ Новая папка</button>
  </div>
  <div class="main">
    <div class="toolbar">
      <div class="breadcrumb" id="breadcrumb"><span onclick="openFolder('')">🏠 Корень</span></div>
      <input class="search" id="search" placeholder="Поиск..." oninput="render()">
      <label class="upload-btn">⬆ Загрузить <input type="file" multiple accept="image/*" style="display:none" id="fileIn" onchange="onFileSelect(this)"></label>
    </div>
    <div class="grid" id="grid"></div>
  </div>
</div>
<script>
let currentFolder='', allFiles=[], allFolders=[], allFolderNames=[];

function toast(msg,err){const t=document.getElementById('toast');t.textContent=msg;t.className='toast'+(err?' err':'');t.style.display='block';setTimeout(()=>t.style.display='none',3000)}

async function loadAll() {
  const r = await fetch('/gdevelop-resources/list?folder='+encodeURIComponent(currentFolder));
  const d = await r.json();
  allFiles = d.files||[];
  allFolders = d.folders||[];
  // load root folders for sidebar
  const rf = await fetch('/gdevelop-resources/list');
  const rd = await rf.json();
  allFolderNames = (rd.folders||[]).map(f=>f.name);
  document.getElementById('stats').textContent = allFiles.length+' файлов';
  renderSidebar();
  render();
}

function renderSidebar() {
  const list = document.getElementById('folderList');
  list.innerHTML = allFolderNames.map(name=>\`
    <div class="folder-item \${currentFolder===name?'active':''}" onclick="openFolder('\${esc(name)}')">
      📁 \${name}
      <span class="del-f" onclick="event.stopPropagation();deleteFolder('\${esc(name)}')" title="Удалить">✕</span>
    </div>
  \`).join('');
  document.getElementById('rootItem').className='root-item'+(currentFolder===''?' active':'');
}

function render() {
  const q=document.getElementById('search').value.toLowerCase();
  const grid=document.getElementById('grid');
  const filtered=allFiles.filter(f=>f.filename.toLowerCase().includes(q));
  // show subfolders if in root
  let foldersHtml='';
  if(!currentFolder) {
    // folders shown in sidebar, not in grid
  } else {
    // show subfolder navigation back
  }
  if(!filtered.length && !allFolders.length){grid.innerHTML='<div class="empty">Нет файлов</div>';return;}
  const folderCards = currentFolder ? '' : '';
  grid.innerHTML = folderCards + filtered.map(f=>\`
    <div class="card">
      <img src="\${f.url}" loading="lazy" alt="\${f.filename}">
      <div class="card-body">
        <div class="card-name">\${f.filename}</div>
        <div class="card-btns">
          <button class="del-btn" onclick="deleteFile('\${esc(f.filename)}')">🗑</button>
          <button class="move-btn" onclick="moveFile('\${esc(f.filename)}')">↪</button>
        </div>
      </div>
    </div>
  \`).join('');
}

function esc(s){return s.replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'")}

function openFolder(name) {
  currentFolder=name;
  const bc=document.getElementById('breadcrumb');
  bc.innerHTML = name
    ? \`<span onclick="openFolder('')">🏠 Корень</span> / <span>\${name}</span>\`
    : \`<span onclick="openFolder('')">🏠 Корень</span>\`;
  document.getElementById('search').value='';
  loadAll();
}

async function deleteFile(filename) {
  if(!confirm('Удалить '+filename+'?'))return;
  const url='/gdevelop-resources/delete?filename='+encodeURIComponent(filename)+(currentFolder?'&folder='+encodeURIComponent(currentFolder):'');
  const r=await fetch(url,{method:'DELETE'});
  if(r.ok){toast('Удалено: '+filename);await loadAll();}else toast('Ошибка',true);
}

async function deleteFolder(name) {
  if(!confirm('Удалить папку "'+name+'" со всем содержимым?'))return;
  const r=await fetch('/gdevelop-resources/folder/'+encodeURIComponent(name),{method:'DELETE'});
  if(r.ok){if(currentFolder===name)currentFolder='';toast('Папка удалена');await loadAll();}else toast('Ошибка',true);
}

async function moveFile(filename) {
  const opts=allFolderNames.filter(n=>n!==currentFolder);
  const choices=['(корень)',...opts];
  const choice=prompt('Переместить в папку:\\n'+choices.map((c,i)=>i+': '+c).join('\\n')+'\\n\\nВведите номер:');
  if(choice===null)return;
  const idx=parseInt(choice);
  if(isNaN(idx)||idx<0||idx>=choices.length)return toast('Неверный номер',true);
  const toFolder=idx===0?'':opts[idx-1];
  const r=await fetch('/gdevelop-resources/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fromFolder:currentFolder,toFolder,filename})});
  if(r.ok){toast('Перемещено');await loadAll();}else toast('Ошибка',true);
}

let modalOkCb=null;
function showCreateFolder(){
  document.getElementById('modalTitle').textContent='Создать папку';
  document.getElementById('modalInput').value='';
  document.getElementById('modalBg').classList.add('on');
  document.getElementById('modalOk').onclick=async()=>{
    const name=document.getElementById('modalInput').value.trim();
    if(!name)return;
    const r=await fetch('/gdevelop-resources/folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    const d=await r.json();
    if(r.ok){closeModal();toast('Папка создана: '+name);await loadAll();}else toast(d.error||'Ошибка',true);
  };
  setTimeout(()=>document.getElementById('modalInput').focus(),50);
}
function closeModal(){document.getElementById('modalBg').classList.remove('on')}
document.getElementById('modalInput').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('modalOk').click()});

async function uploadFiles(files,folder){
  const fd=new FormData();
  for(const f of files)fd.append('files',f);
  toast('Загружаем '+files.length+' файл(ов)...');
  const r=await fetch('/gdevelop-resources/upload?folder='+encodeURIComponent(folder||currentFolder),{method:'POST',body:fd});
  const d=await r.json();
  toast('Загружено: '+(d.files||[]).length);
  await loadAll();
}

function onFileSelect(inp){if(inp.files.length)uploadFiles(Array.from(inp.files));inp.value='';}

document.addEventListener('dragover',e=>{e.preventDefault();document.getElementById('drop').classList.add('on')});
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.getElementById('drop').classList.remove('on')});
document.addEventListener('drop',e=>{
  e.preventDefault();document.getElementById('drop').classList.remove('on');
  const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'));
  if(files.length)uploadFiles(files);
});

loadAll();
</script>
</body>
</html>`);
});

app.listen(port, () => console.log(`Resource upload server listening on port ${port}`));
