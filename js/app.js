import { app, db, storage } from "./firebase-config.js";
import { collection, addDoc, getDocs, query, orderBy, limit, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

const ZONAS = ['Centro de Sullana','El Chilcal','La Banda','Querecotillo','Bellavista','San Jacinto','Nuevo Horizonte','Los Algarrobos','San Martín','Villa La Primavera','Pedro Ruiz Gallo','San Isidro','Otra zona'];
let cachedReports = [];

const $ = id => document.getElementById(id);
const localReports = () => { try { return JSON.parse(localStorage.getItem('sullana_reportes') || '[]'); } catch { return []; } };
const saveLocalReports = reports => localStorage.setItem('sullana_reportes', JSON.stringify(reports));
const newId = () => `SUL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
const dateText = value => new Date(value).toLocaleString('es-PE',{dateStyle:'medium',timeStyle:'short'});
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function showModal(title, message, reportId='') {
  let overlay = $('modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div'); overlay.id='modal-overlay'; overlay.className='modal-overlay';
    overlay.innerHTML='<div class="modal"><h3 id="modal-title"></h3><p id="modal-message"></p><div class="report-id-display" id="modal-report-id"></div><button class="btn btn-primary" id="modal-close">Entendido</button></div>';
    document.body.appendChild(overlay); $('modal-close').onclick=()=>overlay.classList.remove('active');
  }
  $('modal-title').textContent=title; $('modal-message').textContent=message;
  const id=$('modal-report-id'); id.textContent=reportId; id.style.display=reportId?'block':'none'; overlay.classList.add('active');
}

async function addReportToFirebase(report, file) {
  let photoUrl = null;
  if (file && storage) {
    const fileRef = ref(storage, `reportes/${report.id}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`);
    await uploadBytes(fileRef, file);
    photoUrl = await getDownloadURL(fileRef);
  }
  const payload = {...report, foto: photoUrl};
  await addDoc(collection(db,'reportes'), payload);
  return payload;
}

async function loadReports() {
  if (!db) return localReports();
  try {
    const snap = await getDocs(query(collection(db,'reportes'), orderBy('fecha','desc'), limit(30)));
    return snap.docs.map(d => ({firestoreId:d.id,...d.data()}));
  } catch (error) {
    console.error('Firestore:', error); showModal('Firebase', 'No se pudieron leer los reportes. Revisa Firestore Rules y que la colección reportes esté disponible.');
    return localReports();
  }
}

async function submitReport(event) {
  event.preventDefault();
  const form=event.currentTarget, data=new FormData(form), file=$('evidencia').files[0];
  if (file && file.size > 5*1024*1024) return showModal('Foto demasiado grande','Selecciona una imagen de máximo 5 MB.');
  const report={id:newId(),nombre:data.get('nombre'),telefono:data.get('telefono'),tipo:data.get('tipo'),severidad:data.get('severidad'),zona:data.get('zona'),direccion:data.get('direccion'),latitud:data.get('latitud')||null,longitud:data.get('longitud')||null,descripcion:data.get('descripcion'),fecha:new Date().toISOString(),estado:'pendiente'};
  try {
    if (db) await addReportToFirebase(report,file); else { const reports=localReports(); reports.unshift({...report,foto:file?$('photo-preview').src:null}); saveLocalReports(reports); }
    form.reset(); $('photo-preview').style.display='none'; $('photo-preview').src=''; $('geo-btn').textContent='📍 Usar mi ubicación actual';
    showModal('¡Reporte enviado!','Tu reporte fue registrado correctamente. Guarda tu código de seguimiento:',report.id);
    await refreshReports();
  } catch (error) {
    console.error(error); showModal('No se pudo guardar','Revisa la configuración de Firebase, Firestore Rules y Storage Rules. Tu información no fue enviada.');
  }
}

async function trackReport(event) {
  event.preventDefault(); const id=$('track-id').value.trim().toUpperCase(); let found=null;
  if (db) {
    try { const snap=await getDocs(query(collection(db,'reportes'), limit(100))); found=snap.docs.map(d=>d.data()).find(r=>r.id===id); }
    catch(e){ console.error(e); }
  } else found=localReports().find(r=>r.id===id);
  const result=$('track-result'); result.className='track-result';
  if(found){ result.classList.add('found'); result.innerHTML=`<strong>Reporte encontrado</strong><br>Tipo: ${safe(found.tipo)} | Zona: ${safe(found.zona)}<br>Severidad: ${safe(found.severidad)} | Estado: ${safe(found.estado)}<br>Fecha: ${dateText(found.fecha)}<br><em>${safe(found.descripcion).slice(0,140)}</em>`; }
  else { result.classList.add('not-found'); result.textContent='No se encontró un reporte con ese código.'; }
}

function renderReports(reports) {
  cachedReports=reports; const container=$('reports-list');
  $('stat-total').textContent=reports.length; $('stat-high').textContent=reports.filter(r=>r.severidad==='alta').length; $('stat-pending').textContent=reports.filter(r=>r.estado==='pendiente').length;
  if(!reports.length){ container.innerHTML='<div class="empty-state"><img src="assets/icon-inundacion.svg" alt="Sin reportes"><p>No hay reportes registrados todavía.</p></div>'; return; }
  container.innerHTML=reports.map(r=>`<div class="report-card severity-${safe(r.severidad)}"> <div class="report-card-header"><span class="report-type">${safe(r.tipo)}</span><span class="report-severity">${safe(r.severidad)}</span></div>${r.foto?`<img src="${safe(r.foto)}" alt="Evidencia del reporte">`:''}<div class="report-card-body"><div class="report-location">📍 ${safe(r.zona)} — ${safe(r.direccion)}</div><p>${safe(r.descripcion)}</p></div><div class="report-meta"><span class="report-id">${safe(r.id)}</span><span>${dateText(r.fecha)}</span></div></div>`).join('');
  renderMapPoints(reports);
}

async function refreshReports(){ renderReports(await loadReports()); updateAlert(); }

function renderMapPoints(reports){
  const map=$('map-demo'); if(!map) return; map.querySelectorAll('.map-point').forEach(e=>e.remove());
  const withCoords=reports.filter(r=>r.latitud && r.longitud).slice(0,12);
  withCoords.forEach((r,i)=>{ const point=document.createElement('button'); point.className=`map-point ${r.severidad||'medium'}`; point.title=`${r.id} — ${r.zona}`; point.style.left=`${15+(i*17)%70}%`; point.style.top=`${20+(i*29)%60}%`; point.onclick=()=>showModal('Reporte '+r.id,`${r.zona}: ${r.descripcion}`); map.appendChild(point); });
}

function updateAlert(){ const banner=$('alert-banner'); const recent=cachedReports.filter(r=>r.tipo==='inundacion' || r.severidad==='alta').filter(r=>(Date.now()-new Date(r.fecha).getTime())<86400000); if(recent.length){ banner.classList.add('visible'); banner.innerHTML=`⚠ ALERTA: ${recent.length} reporte(s) reciente(s) requieren atención. <a href="#reportes">Ver reportes</a>`; } else banner.classList.remove('visible'); }

function initNavigation(){ const toggle=document.querySelector('.nav-toggle'), nav=document.querySelector('.nav-list'); if(toggle&&nav) toggle.onclick=()=>nav.classList.toggle('open'); nav?.querySelectorAll('a').forEach(a=>a.onclick=()=>nav.classList.remove('open')); }
function initZones(){ const select=$('zona'); ZONAS.forEach(z=>{const o=document.createElement('option');o.value=z;o.textContent=z;select.appendChild(o);}); }
function initPhoto(){ const area=$('file-upload-area'), input=$('evidencia'), preview=$('photo-preview'); area.onclick=()=>input.click(); input.onchange=()=>{const f=input.files[0]; if(!f)return; const reader=new FileReader();reader.onload=e=>{preview.src=e.target.result;preview.style.display='block'};reader.readAsDataURL(f);}; }
function initGeo(){ $('geo-btn').onclick=()=>{if(!navigator.geolocation)return showModal('Ubicación','Tu navegador no soporta geolocalización.'); $('geo-btn').textContent='Obteniendo ubicación...'; navigator.geolocation.getCurrentPosition(p=>{ $('latitud').value=p.coords.latitude.toFixed(6);$('longitud').value=p.coords.longitude.toFixed(6);$('geo-btn').textContent='✓ Ubicación obtenida'; },()=>{$('geo-btn').textContent='📍 Usar mi ubicación actual';showModal('Ubicación','No se pudo obtener tu ubicación. Ingresa la dirección manualmente.');},{enableHighAccuracy:true,timeout:10000});}; }

async function initContact(){ $('contacto-form').onsubmit=async e=>{e.preventDefault();const d=new FormData(e.currentTarget);try{if(db) await addDoc(collection(db,'mensajes'),{nombre:d.get('nombre'),email:d.get('email'),asunto:d.get('asunto'),mensaje:d.get('mensaje'),fecha:new Date().toISOString()});else{const m=JSON.parse(localStorage.getItem('sullana_mensajes')||'[]');m.unshift(Object.fromEntries(d.entries()));localStorage.setItem('sullana_mensajes',JSON.stringify(m));} e.currentTarget.reset();showModal('Mensaje enviado','Gracias por contactarnos. Tu mensaje fue registrado.');}catch(err){console.error(err);showModal('Error','No se pudo guardar el mensaje.');}}; }
function initSearch(){ $('search-btn').onclick=()=>{const term=prompt('¿Qué quieres buscar?'); if(!term)return; const text=document.body.innerText.toLowerCase(); showModal(text.includes(term.toLowerCase())?'Encontrado': 'Sin resultados', text.includes(term.toLowerCase())?`Se encontró información relacionada con “${term}”.`:`No se encontró “${term}” en esta página.`);}; }

(async function init(){
  initNavigation(); initZones(); initPhoto(); initGeo(); initSearch(); initContact(); $('reporte-form').addEventListener('submit',submitReport); $('track-form').addEventListener('submit',trackReport);
  await refreshReports();
})();
