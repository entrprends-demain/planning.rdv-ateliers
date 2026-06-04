/* ── RDV Entreprends Demain · app.js ── */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore,
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, setDoc, writeBatch, query, orderBy }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const fbApp = initializeApp({
  apiKey:            'AIzaSyDcEFrfTfDOlgGy7e7JzZjeGXMsr5O4LIY',
  authDomain:        'rdv-perso-entreprends-demain.firebaseapp.com',
  projectId:         'rdv-perso-entreprends-demain',
  storageBucket:     'rdv-perso-entreprends-demain.firebasestorage.app',
  messagingSenderId: '303753000581',
  appId:             '1:303753000581:web:ef789f95513debcfac1bec',
});

const db = getFirestore(fbApp);

/* ── Mode de la plateforme ────────────────────────────────────── */
// Modes : 'lecture' | 'preinscription' | 'inscription'
let PLATFORM_MODE = 'inscription'; // valeur par défaut, rechargée depuis Firebase

async function loadPlatformMode() {
  try {
    const snap = await getDocs(collection(db, 'config'));
    const cfg = snap.docs.find(d => d.id === 'platform');
    if (cfg) {
      PLATFORM_MODE = cfg.data().mode || 'inscription';
      DATA.config.mode = PLATFORM_MODE;
      DATA.config.lectureDate = cfg.data().lectureDate || '1er juillet 2026';
    } else {
      // Créer le doc config avec valeur par défaut
      await setDoc(doc(db,'config','platform'), { mode: 'inscription', updatedAt: Date.now() });
      PLATFORM_MODE = 'inscription';
    }
  } catch(e) { console.error(e); }
}

async function setPlatformMode(mode) {
  try {
    await setDoc(doc(db, 'config', 'platform'), { mode, updatedAt: Date.now() });
    PLATFORM_MODE = mode;
    DATA.config.mode = mode;
    console.log('Mode saved:', mode);
  } catch(e) { console.error(e); toast('Erreur sauvegarde mode.'); }
}

/* ── Créneaux RDV ─────────────────────────────────────────────── */
function fmt(h, m) { return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); }
function buildRdvSlots(sh, sm, eh, em) {
  const list = []; let h=sh, m=sm;
  while(h*60+m+20 <= eh*60+em) {
    const start=fmt(h,m); m+=20; if(m>=60){h+=Math.floor(m/60);m%=60;}
    list.push({start, end:fmt(h,m)}); m+=10; if(m>=60){h+=Math.floor(m/60);m%=60;}
  }
  return list;
}
const MATIN_SLOTS = buildRdvSlots(10,0,13,0);
const APREM_SLOTS = buildRdvSlots(14,0,17,0);
function slotsForPeriod(period) {
  const ms = period!=='aprem' ? MATIN_SLOTS.map(s=>({...s,period:'matin'})) : [];
  const ps = period!=='matin' ? APREM_SLOTS.map(s=>({...s,period:'aprem'})) : [];
  return [...ms,...ps];
}

/* ── Créneaux Ateliers ────────────────────────────────────────── */
const ATELIERS_SLOTS = [
  {value:'10:00-10:45', start:'10:00', end:'10:45', period:'matin'},
  {value:'11:00-11:45', start:'11:00', end:'11:45', period:'matin'},
  {value:'12:00-12:45', start:'12:00', end:'12:45', period:'matin'},
  {value:'14:00-14:45', start:'14:00', end:'14:45', period:'aprem'},
  {value:'15:00-15:45', start:'15:00', end:'15:45', period:'aprem'},
  {value:'16:00-16:45', start:'16:00', end:'16:45', period:'aprem'},
];

const ALL_CATS = [
  'Droit immobilier, architecture, aménagement',
  'E-commerce, développement web',
  'Marketing, communication, image',
  'Stratégie et développement commercial',
  'Droit des affaires et des sociétés',
  'Conseil financier, expertise comptable, direction financière',
  'Courtier, banque, assurance',
  "Développement personnel de l'entrepreneur",
];

/* ── État ─────────────────────────────────────────────────────── */
const DATA = {
  exposants: [], slots: {}, bookings: [],
  visitors: [], ateliers: [], inscriptions: [],
};
let selId=null, periodFilter='', atPeriodFilter='';
let pendingExp=null, pendingSlot=null, pendingAtelierId=null;
let editAtelier=null;

function initials(n) { return n.trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function getBooking(expId,start) { return DATA.bookings.find(b=>b.exposantId===expId&&b.slotStart===start); }
function getSlots(expId) { return (DATA.slots[expId]||[]).slice().sort((a,b)=>a.start.localeCompare(b.start)); }
function el(id) { return document.getElementById(id); }
function loader(on) { const l=el('loader'); if(l){if(on)l.classList.add('on');else l.classList.remove('on');} }
let toastT;
function toast(msg) {
  const t=el('toast'); if(!t)return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2800);
}

/* ── Chargement Firebase ──────────────────────────────────────── */
async function loadAll() {
  loader(true);
  try {
    const [eS,sS,bS,vS,aS,iS,wS,cS] = await Promise.all([
      getDocs(query(collection(db,'exposants'), orderBy('createdAt'))),
      getDocs(query(collection(db,'slots'),     orderBy('start'))),
      getDocs(query(collection(db,'bookings'),  orderBy('slotStart'))),
      getDocs(collection(db,'visitors')),
      getDocs(query(collection(db,'ateliers'),  orderBy('start'))),
      getDocs(collection(db,'inscriptions')),
      getDocs(query(collection(db,'waitlist'),  orderBy('createdAt'))),
      getDocs(collection(db,'config')),
    ]);
    DATA.exposants    = eS.docs.map(d=>({id:d.id,...d.data()}));
    DATA.bookings     = bS.docs.map(d=>({id:d.id,...d.data()}));
    DATA.visitors     = vS.docs.map(d=>({id:d.id,...d.data()}));
    DATA.ateliers     = aS.docs.map(d=>({id:d.id,...d.data()}));
    DATA.inscriptions = iS.docs.map(d=>({id:d.id,...d.data()}));
    DATA.waitlist     = wS.docs.map(d=>({id:d.id,...d.data()}));
    const cfgDoc = cS.docs.find(d=>d.id==='siteConfig');
    if(cfgDoc){ const c=cfgDoc.data(); PLATFORM_MODE=c.mode||'inscription'; DATA.config={mode:PLATFORM_MODE,lectureDate:c.lectureDate||'1er juillet 2026'}; } else { DATA.config={mode:'inscription',lectureDate:'1er juillet 2026'}; }
    DATA.slots = {};
    sS.docs.forEach(d=>{ const s={id:d.id,...d.data()}; if(!DATA.slots[s.exposantId])DATA.slots[s.exposantId]=[]; DATA.slots[s.exposantId].push(s); });
  } catch(e) { console.error(e); toast('Erreur de connexion Firebase.'); }
  loader(false);
}

/* ── Auth admin ───────────────────────────────────────────────── */
const PWD='Fredtunousmanques', SK='rdv-admin-ok';
function initLogin() {
  async function doUnlock() {
    el('login-screen').style.display='none';
    el('admin-app').style.display='block';
    await loadAll();
    renderAdminExpList(); renderStats();
    updateBadges();
    renderModeAdmin();
  }
  if(sessionStorage.getItem(SK)==='1'){doUnlock();return;}
  el('pwd-btn').addEventListener('click',async()=>{
    if((el('pwd')?.value||'')===PWD){sessionStorage.setItem(SK,'1');await doUnlock();}
    else{el('pwd-error')?.classList.add('show');if(el('pwd')){el('pwd').value='';el('pwd').focus();}}
  });
  el('pwd').addEventListener('keydown',e=>{if(e.key==='Enter')el('pwd-btn').click();});
  el('logout-btn').addEventListener('click',()=>{sessionStorage.removeItem(SK);location.reload();});
}

function updateBadges() {
  const rb=el('rdv-badge'); if(rb)rb.textContent=DATA.bookings.length||'';
  const ab=el('at-badge');  if(ab)ab.textContent=DATA.ateliers.length||'';
  const vb=el('vis-badge'); if(vb)vb.textContent=DATA.visitors.length||'';
  updateWaitBadges();
}

/* ── Stats sidebar ────────────────────────────────────────────── */
function renderStats() {
  const e=el('stats'); if(!e)return;
  const total=Object.values(DATA.slots).flat().filter(s=>s.enabled).length;
  e.innerHTML=
    `<div class="stat"><div class="stat-v">${DATA.exposants.length}</div><div class="stat-l">Experts</div></div>`+
    `<div class="stat"><div class="stat-v">${total}</div><div class="stat-l">Créneaux</div></div>`+
    `<div class="stat"><div class="stat-v">${DATA.bookings.length}</div><div class="stat-l">RDV</div></div>`;
}

/* ── Admin tabs ───────────────────────────────────────────────── */

/* ── Listes d'attente admin ──────────────────────────────────── */

function updateWaitBadges() {
  const rdvWaits = DATA.waitlist.filter(w=>w.expId&&!w.atelierId).length;
  const atWaits  = DATA.waitlist.filter(w=>w.atelierId&&!w.expId).length;
  const wb1=el('wrdv-badge'); if(wb1)wb1.textContent=rdvWaits||'';
  const wb2=el('wat-badge');  if(wb2)wb2.textContent=atWaits||'';
}

async function renderWaitlistRdvs() {
  const listEl=el('waitlist-rdvs-list'); if(!listEl)return;
  try{const wS=await getDocs(query(collection(db,'waitlist'),orderBy('createdAt')));DATA.waitlist=wS.docs.map(d=>({id:d.id,...d.data()}));}catch(e){console.error(e);}
  updateWaitBadges();
  const waits=DATA.waitlist.filter(w=>w.expId&&!w.atelierId).sort((a,b)=>a.createdAt-b.createdAt);
  if(!waits.length){
    listEl.innerHTML=`<div class="empty-state"><i class="ti ti-clock" style="color:#B85C1A"></i><p>Aucune liste d'attente pour les RDV.</p></div>`;
    return;
  }
  const groups={};
  waits.forEach(w=>{
    const key=w.expId+'__'+w.slotStart;
    if(!groups[key])groups[key]={expId:w.expId,slotStart:w.slotStart,slotEnd:w.slotEnd,period:w.period,list:[]};
    groups[key].list.push(w);
  });
  listEl.innerHTML=Object.values(groups).map(g=>{
    const exp=DATA.exposants.find(e=>e.id===g.expId);
    const isPm=g.period==='aprem';
    return`<div style="background:#fff;border:1.5px solid #F0C8A0;border-radius:var(--rl);margin-bottom:1rem;overflow:hidden">
      <div style="background:#FEF3EB;padding:.9rem 1.1rem;display:flex;align-items:center;gap:12px;border-bottom:1px solid #F0C8A0">
        <div style="font-family:monospace;font-size:16px;font-weight:700;color:#B85C1A;min-width:110px">${g.slotStart}–${g.slotEnd}</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700;color:var(--ink)">${exp?.name||'–'}</div>
          <div style="font-size:12px;color:var(--ink3)">${exp?.cat||''}${exp?.expertise?' · '+exp.expertise:''}</div>
        </div>
        <span style="font-size:11px;padding:3px 10px;border-radius:100px;font-weight:700;background:${isPm?'#FFD82B':'var(--cyan)'};color:${isPm?'var(--ink)':'#fff'}">${isPm?'Ap-m':'Matin'}</span>
        <span style="font-size:12px;font-weight:700;color:#B85C1A;background:#FEE0C8;padding:3px 10px;border-radius:100px">${g.list.length} en attente</span>
      </div>
      <table class="rdv-table" style="border:none;border-radius:0">
        <thead><tr>
          <th style="background:#FEF3EB;color:#B85C1A">#</th>
          <th style="background:#FEF3EB;color:#B85C1A">Visiteur</th>
          <th style="background:#FEF3EB;color:#B85C1A">Email</th>
          <th style="background:#FEF3EB;color:#B85C1A">Société</th>
          <th style="background:#FEF3EB;color:#B85C1A">Problématique</th>
          <th style="background:#FEF3EB;color:#B85C1A">Inscrit le</th>
          <th style="background:#FEF3EB;color:#B85C1A"></th>
        </tr></thead>
        <tbody>${g.list.map((w,i)=>`<tr>
          <td><strong style="color:#B85C1A">#${i+1}</strong></td>
          <td><strong>${w.prenom} ${w.nom}</strong></td>
          <td>${w.email||'–'}</td>
          <td>${w.societe||'–'}</td>
          <td style="font-size:12px;max-width:180px">${w.problematique||'–'}</td>
          <td style="font-size:11px;color:var(--ink3)">${w.createdAt?new Date(w.createdAt).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'–'}</td>
          <td><button class="del-booking-btn" data-wid="${w.id}" title="Retirer"><i class="ti ti-trash"></i></button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }).join('');
  listEl.querySelectorAll('[data-wid]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm(`Retirer ce visiteur de la liste d'attente ?`))return;
    loader(true);
    try{await deleteDoc(doc(db,'waitlist',btn.dataset.wid));DATA.waitlist=DATA.waitlist.filter(w=>w.id!==btn.dataset.wid);renderWaitlistRdvs();updateWaitBadges();}
    catch(e){console.error(e);toast('Erreur.');}
    loader(false);
  }));
}

async function renderWaitlistAteliers() {
  const listEl=el('waitlist-ateliers-list'); if(!listEl)return;
  try{const wS=await getDocs(query(collection(db,'waitlist'),orderBy('createdAt')));DATA.waitlist=wS.docs.map(d=>({id:d.id,...d.data()}));}catch(e){console.error(e);}
  updateWaitBadges();
  const waits=DATA.waitlist.filter(w=>w.atelierId&&!w.expId).sort((a,b)=>a.createdAt-b.createdAt);
  if(!waits.length){
    listEl.innerHTML=`<div class="empty-state"><i class="ti ti-clock" style="color:#B85C1A"></i><p>Aucune liste d'attente pour les ateliers.</p></div>`;
    return;
  }
  const groups={};
  waits.forEach(w=>{
    if(!groups[w.atelierId])groups[w.atelierId]={atelierId:w.atelierId,list:[]};
    groups[w.atelierId].list.push(w);
  });
  listEl.innerHTML=Object.values(groups).map(g=>{
    const at=DATA.ateliers.find(a=>a.id===g.atelierId);
    const isPm=at?.period==='aprem';
    const inscrits=DATA.inscriptions.filter(i=>i.atelierId===g.atelierId).length;
    return`<div style="background:#fff;border:1.5px solid #F0C8A0;border-radius:var(--rl);margin-bottom:1rem;overflow:hidden">
      <div style="background:#FEF3EB;padding:.9rem 1.1rem;display:flex;align-items:center;gap:12px;border-bottom:1px solid #F0C8A0">
        <div style="font-family:monospace;font-size:16px;font-weight:700;color:#B85C1A;min-width:110px">${at?.start||'–'}–${at?.end||''}</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700;color:var(--ink)">${at?.titre||'–'}</div>
          <div style="font-size:12px;color:var(--ink3)"><i class="ti ti-map-pin" style="font-size:11px"></i> ${at?.salle||''} · ${inscrits}/${at?.places||'∞'} inscrits</div>
        </div>
        <span style="font-size:11px;padding:3px 10px;border-radius:100px;font-weight:700;background:${isPm?'#FFD82B':'var(--cyan)'};color:${isPm?'var(--ink)':'#fff'}">${isPm?'Ap-m':'Matin'}</span>
        <span style="font-size:12px;font-weight:700;color:#B85C1A;background:#FEE0C8;padding:3px 10px;border-radius:100px">${g.list.length} en attente</span>
      </div>
      <table class="rdv-table" style="border:none;border-radius:0">
        <thead><tr>
          <th style="background:#FEF3EB;color:#B85C1A">#</th>
          <th style="background:#FEF3EB;color:#B85C1A">Visiteur</th>
          <th style="background:#FEF3EB;color:#B85C1A">Email</th>
          <th style="background:#FEF3EB;color:#B85C1A">Société</th>
          <th style="background:#FEF3EB;color:#B85C1A">Inscrit le</th>
          <th style="background:#FEF3EB;color:#B85C1A"></th>
        </tr></thead>
        <tbody>${g.list.map((w,i)=>`<tr>
          <td><strong style="color:#B85C1A">#${i+1}</strong></td>
          <td><strong>${w.prenom} ${w.nom}</strong></td>
          <td>${w.email||'–'}</td>
          <td>${w.societe||'–'}</td>
          <td style="font-size:11px;color:var(--ink3)">${w.createdAt?new Date(w.createdAt).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'–'}</td>
          <td><button class="del-booking-btn" data-wid="${w.id}" title="Retirer"><i class="ti ti-trash"></i></button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }).join('');
  listEl.querySelectorAll('[data-wid]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm(`Retirer ce visiteur de la liste d'attente ?`))return;
    loader(true);
    try{await deleteDoc(doc(db,'waitlist',btn.dataset.wid));DATA.waitlist=DATA.waitlist.filter(w=>w.id!==btn.dataset.wid);renderWaitlistAteliers();updateWaitBadges();}
    catch(e){console.error(e);toast('Erreur.');}
    loader(false);
  }));
}

function switchAdminTab(tab) {
  document.querySelectorAll('.atab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  ['exposants','ateliers-admin','rdvs','visiteurs','waitlist-rdvs','waitlist-ateliers','parametres'].forEach(t=>{
    const el2=el('tab-'+t); if(el2)el2.style.display=t===tab?(t==='exposants'?'flex':'block'):'none';
  });
  if(tab==='rdvs')             renderRdvList();
  if(tab==='visiteurs')        renderVisiteursList();
  if(tab==='ateliers-admin')   renderAteliersAdmin();
  if(tab==='waitlist-rdvs')    renderWaitlistRdvs();
  if(tab==='waitlist-ateliers')renderWaitlistAteliers();
  if(tab==='parametres') { initParametres(); renderModeAdmin(); }
}

/* ── Admin exposants ──────────────────────────────────────────── */
function renderAdminExpList() {
  const listEl=el('exp-list'); if(!listEl)return;
  if(!DATA.exposants.length){listEl.innerHTML='<div style="padding:1rem;font-size:12px;color:var(--ink3);text-align:center">Aucun exposant. Cliquez + pour ajouter.</div>';return;}
  listEl.innerHTML=DATA.exposants.map(exp=>`
    <div class="exp-item${selId===exp.id?' active':''}" data-id="${exp.id}">
      <div class="avatar" style="font-size:12px">${initials(exp.name)}</div>
      <div style="flex:1"><div class="ei-name">${exp.name}</div><div class="ei-cat">${exp.cat||''}</div></div>
      <button class="edit-exp-btn" data-id="${exp.id}" title="Modifier"><i class="ti ti-pencil" style="font-size:13px"></i></button>
      <button class="del-exp-btn"  data-id="${exp.id}" title="Supprimer"><i class="ti ti-trash"  style="font-size:13px"></i></button>
    </div>`).join('');
  listEl.querySelectorAll('.exp-item').forEach(item=>{
    item.addEventListener('click',e=>{
      if(e.target.closest('.del-exp-btn')||e.target.closest('.edit-exp-btn'))return;
      selId=item.dataset.id; renderAdminExpList();
      el('cal-empty').style.display='none'; el('cal-panel').style.display='block'; el('edit-panel').style.display='none';
      renderCal();
    });
  });
  listEl.querySelectorAll('.del-exp-btn').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();deleteExposant(btn.dataset.id);}));
  listEl.querySelectorAll('.edit-exp-btn').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openEditPanel(btn.dataset.id);}));
}

function toggleAddForm(){ el('add-form').classList.toggle('open'); }

async function addExposant() {
  const name=el('f-name').value.trim(), email=el('f-email').value.trim(),
    website=el('f-website')?.value.trim()||'', cat=el('f-cat').value,
    expertise=el('f-expertise').value.trim(), period=el('f-period').value;
  if(!name){toast('Merci de saisir un nom.');return;}
  loader(true);
  try {
    const ref=await addDoc(collection(db,'exposants'),{name,email,website,cat,expertise,period,createdAt:Date.now()});
    const exp={id:ref.id,name,email,website,cat,expertise,period};
    DATA.exposants.push(exp);
    const created=[];
    if(period!=='aucun') for(const s of slotsForPeriod(period)){
      const r=await addDoc(collection(db,'slots'),{exposantId:exp.id,start:s.start,end:s.end,period:s.period,enabled:true});
      created.push({id:r.id,exposantId:exp.id,...s,enabled:true});
    }
    if(period==='aucun'){} // pas de slots
    DATA.slots[exp.id]=created;
    ['f-name','f-email','f-website','f-expertise'].forEach(id=>{if(el(id))el(id).value='';});
    toggleAddForm(); renderAdminExpList(); renderStats();
    toast(name+' ajouté !');
  } catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

async function deleteExposant(expId) {
  if(!confirm('Supprimer cet exposant et tous ses RDV ?'))return;
  loader(true);
  try {
    const batch=writeBatch(db);
    (DATA.slots[expId]||[]).forEach(s=>batch.delete(doc(db,'slots',s.id)));
    DATA.bookings.filter(b=>b.exposantId===expId).forEach(b=>batch.delete(doc(db,'bookings',b.id)));
    batch.delete(doc(db,'exposants',expId));
    await batch.commit();
    DATA.exposants=DATA.exposants.filter(e=>e.id!==expId);
    DATA.bookings=DATA.bookings.filter(b=>b.exposantId!==expId);
    delete DATA.slots[expId];
    if(selId===expId){selId=null;el('cal-empty').style.display='block';el('cal-panel').style.display='none';}
    renderAdminExpList();renderStats();toast('Exposant supprimé.');
  } catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

function openEditPanel(expId) {
  const exp=DATA.exposants.find(e=>e.id===expId); if(!exp)return;
  selId=expId; renderAdminExpList();
  el('cal-panel').style.display='none'; el('cal-empty').style.display='none'; el('edit-panel').style.display='block';
  el('edit-panel').innerHTML=`<div class="edit-panel-inner">
    <div class="edit-panel-title"><i class="ti ti-pencil"></i> Modifier — ${exp.name}</div>
    <div class="edit-form">
      <div class="field"><label>Nom</label><input id="e-name" value="${exp.name||''}" /></div>
      <div class="field"><label>Email</label><input id="e-email" type="email" value="${exp.email||''}" /></div>
      <div class="field"><label>Site internet</label><input id="e-website" value="${exp.website||''}" placeholder="https://..." /></div>
      <div class="field"><label>Catégorie</label><select id="e-cat">${ALL_CATS.slice(0,7).map(c=>`<option value="${c}"${exp.cat===c?' selected':''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Expertise</label><input id="e-expertise" value="${exp.expertise||''}" /></div>
      <div class="field"><label>Disponibilité</label><select id="e-period">
        <option value="jour"${exp.period==='jour'?' selected':''}>Journée complète</option>
        <option value="matin"${exp.period==='matin'?' selected':''}>Matin uniquement</option>
        <option value="aprem"${exp.period==='aprem'?' selected':''}>Après-midi uniquement</option>
      </select></div>
      <div class="edit-actions">
        <button id="edit-cancel" class="btn-ghost"><i class="ti ti-x"></i> Annuler</button>
        <button id="edit-save" class="btn-primary"><i class="ti ti-check"></i> Enregistrer</button>
      </div>
    </div></div>`;
  el('edit-cancel').addEventListener('click',()=>{el('edit-panel').style.display='none';el('cal-empty').style.display='block';});
  el('edit-save').addEventListener('click',()=>saveEditExposant(expId));
}

async function saveEditExposant(expId) {
  const exp=DATA.exposants.find(e=>e.id===expId);
  const name=el('e-name').value.trim(), email=el('e-email').value.trim(),
    website=el('e-website')?.value.trim()||'', cat=el('e-cat').value,
    expertise=el('e-expertise').value.trim(), period=el('e-period').value;
  if(!name){toast('Merci de saisir un nom.');return;}
  loader(true);
  try {
    const changed=period!==exp.period;
    await updateDoc(doc(db,'exposants',expId),{name,email,website,cat,expertise,period});
    Object.assign(exp,{name,email,website,cat,expertise,period});
    if(changed){
      const batch=writeBatch(db);
      (DATA.slots[expId]||[]).forEach(s=>batch.delete(doc(db,'slots',s.id)));
      await batch.commit();
      const created=[];
      for(const s of slotsForPeriod(period)){
        const r=await addDoc(collection(db,'slots'),{exposantId:expId,start:s.start,end:s.end,period:s.period,enabled:true});
        created.push({id:r.id,exposantId:expId,...s,enabled:true});
      }
      DATA.slots[expId]=created;
    }
    el('edit-panel').style.display='none';el('cal-empty').style.display='block';
    renderAdminExpList();renderStats();toast(name+' mis à jour !');
  } catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

/* ── Calendrier admin ─────────────────────────────────────────── */
function renderCal() {
  const exp=DATA.exposants.find(e=>e.id===selId); if(!exp)return;
  el('cal-name').textContent=exp.name;
  el('cal-meta').textContent=exp.cat+(exp.expertise?' · '+exp.expertise:'')+'  · 22 sept. 2026';
  const opts=[{val:'matin',label:'Matin',cls:'active-matin'},{val:'aprem',label:'Après-midi',cls:'active-aprem'},{val:'jour',label:'Journée',cls:'active-jour'}];
  el('cal-periods').innerHTML=opts.map(o=>`<button class="psw${exp.period===o.val?' '+o.cls:''}" data-p="${o.val}">${o.label}</button>`).join('');
  el('cal-periods').querySelectorAll('.psw').forEach(b=>b.addEventListener('click',()=>setPeriod(b.dataset.p)));
  const slots=getSlots(exp.id), ms=slots.filter(s=>s.period==='matin'), ps=slots.filter(s=>s.period==='aprem');
  function block(list,cls){
    if(!list.length)return '';
    const free=list.filter(s=>s.enabled&&!getBooking(exp.id,s.start)).length;
    const head=cls==='am'?'Matin · 10h–13h':'Après-midi · 14h–17h';
    const btns=list.map(s=>{
      const b=getBooking(exp.id,s.start); let c,icon='';
      if(b){c='aslot aslot-booked'+(cls==='pm'?' pm':'');icon='<i class="ti ti-user" style="font-size:10px"></i> ';}
      else if(s.enabled){c='aslot aslot-on-'+cls;}
      else{c='aslot aslot-off';icon='<i class="ti ti-minus" style="font-size:10px"></i> ';}
      const label=b?`${icon}${b.prenom} ${b.nom}`:`${icon}${s.start}–${s.end}`;
      return`<button class="${c}" data-sid="${s.id}" data-start="${s.start}" data-bid="${b?b.id:''}" title="${b?b.prenom+' '+b.nom+(b.email?' · '+b.email:''):(s.enabled?'Désactiver':'Activer')}">${label}</button>`;
    }).join('');
    return`<div class="cal-block"><div class="cal-block-head ${cls}">${head}<span class="hcount">${free} libre${free>1?'s':''}</span></div><div class="cal-slots">${btns}</div></div>`;
  }
  el('cal-body').innerHTML=block(ms,'am')+block(ps,'pm')||'<div style="padding:1rem;font-size:13px;color:var(--ink3)">Aucun créneau.</div>';
  el('cal-body').querySelectorAll('.aslot').forEach(btn=>{
    btn.addEventListener('click',()=>{if(btn.dataset.bid)deleteBooking(btn.dataset.bid);else toggleSlot(btn.dataset.sid,btn.dataset.start);});
  });
}

async function toggleSlot(slotId,start){
  const slot=(DATA.slots[selId]||[]).find(s=>s.id===slotId);
  if(!slot||getBooking(selId,start))return;
  const next=!slot.enabled; slot.enabled=next; renderCal();renderStats();
  try{await updateDoc(doc(db,'slots',slotId),{enabled:next});}
  catch(e){slot.enabled=!next;renderCal();toast('Erreur.');}
}

async function setPeriod(period){
  const exp=DATA.exposants.find(e=>e.id===selId); if(!exp)return;
  loader(true);
  try{
    await updateDoc(doc(db,'exposants',exp.id),{period});exp.period=period;
    const batch=writeBatch(db);(DATA.slots[exp.id]||[]).forEach(s=>batch.delete(doc(db,'slots',s.id)));await batch.commit();
    const created=[];
    if(period!=='aucun') for(const s of slotsForPeriod(period)){
      const r=await addDoc(collection(db,'slots'),{exposantId:exp.id,start:s.start,end:s.end,period:s.period,enabled:true});
      created.push({id:r.id,exposantId:exp.id,...s,enabled:true});
    }
    if(period==='aucun'){} // pas de slots
    DATA.slots[exp.id]=created; renderCal();renderStats();toast('Disponibilité mise à jour');
  }catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

async function deleteBooking(bookingId){
  if(!confirm(`Supprimer ce RDV et promouvoir le premier en liste d'attente si applicable ?`))return;
  loader(true);
  try{
    const item=DATA.bookings.find(b=>b.id===bookingId);
    await deleteDoc(doc(db,'bookings',bookingId));
    DATA.bookings=DATA.bookings.filter(b=>b.id!==bookingId);
    // Supprimer aussi les entrées de liste d'attente liées à ce visiteur pour ce créneau ? Non — on promeut
    if(item) await promoteWaitlistRdv(item.exposantId, item.slotStart);
    renderCal();renderRdvList();renderStats();updateWaitBadges();
    toast('RDV supprimé.');
  }
  catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

/* ── Admin RDV list ───────────────────────────────────────────── */
function renderRdvList(){
  const expF=el('rdv-filter-exp')?.value||'', perF=el('rdv-filter-period')?.value||'';
  const expSel=el('rdv-filter-exp');
  if(expSel){const cur=expSel.value;expSel.innerHTML='<option value="">Tous les exposants</option>'+DATA.exposants.map(e=>`<option value="${e.id}"${e.id===cur?' selected':''}>${e.name}</option>`).join('');}
  const rb=el('rdv-badge');if(rb)rb.textContent=DATA.bookings.length||'';
  let list=[...DATA.bookings].sort((a,b)=>a.slotStart.localeCompare(b.slotStart));
  if(expF)list=list.filter(b=>b.exposantId===expF);
  if(perF)list=list.filter(b=>b.period===perF);
  const listEl=el('rdv-list');if(!listEl)return;
  if(!list.length){listEl.innerHTML='<div class="empty-state"><i class="ti ti-calendar-off"></i><p>Aucun RDV.</p></div>';return;}
  listEl.innerHTML=`<table class="rdv-table"><thead><tr><th>Horaire</th><th>Période</th><th>Exposant</th><th>Visiteur</th><th>Email</th><th>Société</th><th>Problématique</th><th></th></tr></thead><tbody>
  ${list.map(b=>{const exp=DATA.exposants.find(e=>e.id===b.exposantId);const pm=b.period==='aprem';
    return`<tr><td><strong>${b.slotStart}–${b.slotEnd}</strong></td><td><span class="${pm?'tag-pm':'tag-am'}">${pm?'Ap-m':'Matin'}</span></td><td>${exp?.name||'–'}</td><td>${b.prenom} ${b.nom}</td><td>${b.email||'–'}</td><td>${b.societe||'–'}</td><td style="font-size:12px;max-width:160px">${b.problematique||'–'}</td><td><button class="del-booking-btn" data-id="${b.id}"><i class="ti ti-user-minus"></i></button></td></tr>`;
  }).join('')}</tbody></table>`;
  listEl.querySelectorAll('.del-booking-btn').forEach(btn=>btn.addEventListener('click',()=>deleteBooking(btn.dataset.id)));
}

function exportCsv(){
  const rows=[['Horaire','Période','Exposant','Prénom','Nom','Email','Société','Problématique']];
  DATA.bookings.forEach(b=>{const exp=DATA.exposants.find(e=>e.id===b.exposantId);rows.push([`${b.slotStart}–${b.slotEnd}`,b.period==='aprem'?'Après-midi':'Matin',exp?.name||'',b.prenom,b.nom,b.email||'',b.societe||'',b.problematique||'']);});
  const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='rdv.csv';a.click();
}

/* ── Ateliers admin ───────────────────────────────────────────── */
function renderAteliersAdmin(){
  // Populate animateurs checkboxes
  const animDiv=el('at-animateurs-check');
  if(animDiv)animDiv.innerHTML=DATA.exposants.map(exp=>`<label class="cat-check"><input type="checkbox" value="${exp.id}" /> ${exp.name}</label>`).join('');
  const ab=el('at-badge');if(ab)ab.textContent=DATA.ateliers.length||'';
  renderAteliersAdminList();
}

function renderAteliersAdminList(){
  const listEl=el('ateliers-admin-list');if(!listEl)return;
  if(!DATA.ateliers.length){listEl.innerHTML='<div class="empty-state"><i class="ti ti-school"></i><p>Aucun atelier. Créez-en un.</p></div>';return;}
  const sorted=[...DATA.ateliers].sort((a,b)=>a.start.localeCompare(b.start));
  listEl.innerHTML=sorted.map(at=>{
    const inscrits=DATA.inscriptions.filter(i=>i.atelierId===at.id).length;
    const animNames=(at.animateurs||[]).map(id=>DATA.exposants.find(e=>e.id===id)?.name||'').filter(Boolean).join(', ');
    const full=at.places&&inscrits>=at.places;
    const cats=(at.categories||[]).map(c=>`<span class="at-cat-tag">${c.split(',')[0].trim()}</span>`).join(' ');
    return`<div class="atelier-card">
      <div class="at-header">
        <div class="at-time-badge${at.start>='14:00'?' pm':''}">${at.start}–${at.end}</div>
        <div style="flex:1">
          <div class="at-title">${at.titre}</div>
          <div class="at-salle"><i class="ti ti-map-pin" style="font-size:11px"></i> ${at.salle}</div>
        </div>
        <button class="edit-exp-btn" data-atid="${at.id}" title="Modifier"><i class="ti ti-pencil" style="font-size:13px"></i></button>
        <button class="del-exp-btn"  data-atid="${at.id}" title="Supprimer"><i class="ti ti-trash"  style="font-size:13px"></i></button>
      </div>
      ${at.description?`<div class="at-desc">${at.description}</div>`:''}
      ${animNames?`<div class="at-animateurs"><i class="ti ti-user-star" style="font-size:12px"></i> ${animNames}</div>`:''}
      <div class="at-cats">${cats}</div>
      <div class="at-footer">
        <div class="at-places${full?' full':''}">
          <strong>${inscrits}</strong> / ${at.places||'∞'} inscrits${full?' · COMPLET':''}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-ghost" style="padding:4px 10px;font-size:12px" data-atid-view="${at.id}"><i class="ti ti-users"></i> Inscrits</button>
        </div>
      </div>
    </div>`;
  }).join('');
  listEl.querySelectorAll('[data-atid-view]').forEach(btn=>btn.addEventListener('click',()=>showAtelierInscrits(btn.dataset.atidView)));
  listEl.querySelectorAll('.del-exp-btn[data-atid]').forEach(btn=>btn.addEventListener('click',()=>deleteAtelier(btn.dataset.atid)));
  listEl.querySelectorAll('.del-exp-btn[data-atid]').forEach(btn=>btn.addEventListener('click',()=>deleteAtelier(btn.dataset.atid)));
  listEl.querySelectorAll('.edit-exp-btn[data-atid]').forEach(btn=>btn.addEventListener('click',()=>openAtelierForm(btn.dataset.atid)));
}

function showAtelierInscrits(atId){
  const at=DATA.ateliers.find(a=>a.id===atId);if(!at)return;
  const ins=DATA.inscriptions.filter(i=>i.atelierId===atId);

  // Créer une modal d'affichage
  const existing=document.getElementById('inscrits-modal');
  if(existing)existing.remove();

  const overlay=document.createElement('div');
  overlay.id='inscrits-modal';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:800;display:flex;align-items:center;justify-content:center;padding:1rem';

  const rows = ins.length
    ? ins.map((i,idx)=>`<tr>
        <td>${idx+1}</td>
        <td><strong>${i.prenom} ${i.nom}</strong></td>
        <td>${i.email||'–'}</td>
        <td>${i.societe||'–'}</td>
        <td><button class="del-booking-btn del-inscrit-btn" data-iid="${i.id}" data-atid="${atId}" title="Supprimer"><i class="ti ti-user-minus"></i></button></td>
      </tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--ink3);padding:1rem">Aucun inscrit</td></tr>`;

  overlay.innerHTML=`<div style="background:#fff;border-radius:16px;width:100%;max-width:600px;max-height:80vh;display:flex;flex-direction:column;border:2px solid var(--brd2);overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:1.1rem 1.25rem;background:var(--cyan-l);border-bottom:1.5px solid var(--brd2)">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--ink)">${at.titre}</div>
        <div style="font-size:12px;color:var(--ink3)">${at.start}–${at.end} · ${at.salle} · ${ins.length}/${at.places||'∞'} inscrits</div>
      </div>
      <button onclick="document.getElementById('inscrits-modal').remove()" class="icon-btn"><i class="ti ti-x"></i></button>
    </div>
    <div style="overflow-y:auto;flex:1;padding:1rem">
      <table class="rdv-table">
        <thead><tr><th>#</th><th>Visiteur</th><th>Email</th><th>Société</th><th></th></tr></thead>
        <tbody id="inscrits-tbody">${rows}</tbody>
      </table>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});

  // Brancher les boutons supprimer
  overlay.querySelectorAll('.del-inscrit-btn').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      if(!confirm('Supprimer cette inscription ?'))return;
      loader(true);
      try{
        const iid=btn.dataset.iid, aid=btn.dataset.atid;
        await deleteDoc(doc(db,'inscriptions',iid));
        DATA.inscriptions=DATA.inscriptions.filter(i=>i.id!==iid);
        // Promouvoir le 1er en liste d'attente
        await promoteWaitlistAtelier(aid);
        toast('Inscription supprimée.');
        overlay.remove();
        renderAteliersAdmin();
        renderWaitlistAteliers();
        updateWaitBadges();
      }catch(e){console.error(e);toast('Erreur.');}
      loader(false);
    });
  });
}

function openAtelierForm(atId=null){
  const form=el('atelier-form');
  form.classList.add('open');
  editAtelier=atId;
  if(atId){
    const at=DATA.ateliers.find(a=>a.id===atId);if(!at)return;
    el('at-titre').value=at.titre||'';el('at-salle').value=at.salle||'';
    el('at-desc').value=at.description||'';el('at-creneau').value=at.value||at.start+'-'+at.end;
    el('at-places').value=at.places||'';
    form.querySelectorAll('#at-cats-check input[type=checkbox]').forEach(cb=>{cb.checked=(at.categories||[]).includes(cb.value);});
    form.querySelectorAll('#at-animateurs-check input[type=checkbox]').forEach(cb=>{cb.checked=(at.animateurs||[]).includes(cb.value);});
  } else {
    el('at-titre').value='';el('at-salle').value='';el('at-desc').value='';el('at-places').value='';
    form.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.checked=false);
  }
  form.scrollIntoView({behavior:'smooth',block:'start'});
}

async function saveAtelier(){
  const titre=el('at-titre').value.trim(),salle=el('at-salle').value.trim(),creneau=el('at-creneau').value,places=parseInt(el('at-places').value)||0;
  if(!titre||!salle||!creneau){toast('Merci de remplir titre, salle et créneau.');return;}
  const slotDef=ATELIERS_SLOTS.find(s=>s.value===creneau);if(!slotDef){toast('Créneau invalide.');return;}
  const categories=[...document.querySelectorAll('#at-cats-check input:checked')].map(c=>c.value);
  const animateurs=[...document.querySelectorAll('#at-animateurs-check input:checked')].map(c=>c.value);
  const description=el('at-desc').value.trim();
  const data={titre,salle,description,start:slotDef.start,end:slotDef.end,period:slotDef.period,value:creneau,places,categories,animateurs,createdAt:Date.now()};
  loader(true);
  try{
    if(editAtelier){
      await updateDoc(doc(db,'ateliers',editAtelier),data);
      const idx=DATA.ateliers.findIndex(a=>a.id===editAtelier);
      if(idx>=0)DATA.ateliers[idx]={id:editAtelier,...data};
      toast('Atelier mis à jour !');
    } else {
      const ref=await addDoc(collection(db,'ateliers'),data);
      DATA.ateliers.push({id:ref.id,...data});
      toast('Atelier créé !');
    }
    el('atelier-form').classList.remove('open');editAtelier=null;
    renderAteliersAdminList();updateBadges();
  }catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

async function deleteAtelier(atId){
  if(!confirm('Supprimer cet atelier et toutes ses inscriptions ?'))return;
  loader(true);
  try{
    const batch=writeBatch(db);
    DATA.inscriptions.filter(i=>i.atelierId===atId).forEach(i=>batch.delete(doc(db,'inscriptions',i.id)));
    batch.delete(doc(db,'ateliers',atId));await batch.commit();
    DATA.ateliers=DATA.ateliers.filter(a=>a.id!==atId);
    DATA.inscriptions=DATA.inscriptions.filter(i=>i.atelierId!==atId);
    renderAteliersAdminList();updateBadges();toast('Atelier supprimé.');
  }catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

/* ── Visiteurs admin ──────────────────────────────────────────── */
async function renderVisiteursList(){
  const listEl=el('visiteurs-list');if(!listEl)return;
  // Recharger visitors depuis Firebase à chaque fois
  try{
    const vS=await getDocs(collection(db,'visitors'));
    DATA.visitors=vS.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){console.error(e);}

  const search=(el('vis-admin-search')?.value||'').toLowerCase();
  const vb=el('vis-badge');if(vb)vb.textContent=DATA.visitors.length||'';

  // Construire la liste depuis visitors + bookings/inscriptions sans code
  const emailsWithCode = new Set(DATA.visitors.map(v=>v.email.toLowerCase()));

  // Visiteurs avec code
  const withCode = DATA.visitors.map(v=>{
    const bk=DATA.bookings.filter(b=>(b.email||'').toLowerCase()===v.email).sort((a,b)=>a.slotStart.localeCompare(b.slotStart));
    const ins=DATA.inscriptions.filter(i=>(i.email||'').toLowerCase()===v.email);
    const first=bk[0]||ins[0];
    return{...v,bookings:bk,inscriptions:ins,prenom:first?.prenom||'',nom:first?.nom||'',societe:first?.societe||''};
  });

  // Visiteurs sans code (ont des bookings/inscriptions mais pas dans visitors)
  const allEmails = new Set([
    ...DATA.bookings.map(b=>(b.email||'').toLowerCase()),
    ...DATA.inscriptions.map(i=>(i.email||'').toLowerCase()),
  ]);
  const withoutCode = [...allEmails].filter(e=>e&&!emailsWithCode.has(e)).map(emailLow=>{
    const bk=DATA.bookings.filter(b=>(b.email||'').toLowerCase()===emailLow).sort((a,b)=>a.slotStart.localeCompare(b.slotStart));
    const ins=DATA.inscriptions.filter(i=>(i.email||'').toLowerCase()===emailLow);
    const first=bk[0]||ins[0];
    return{id:'nocode-'+emailLow,email:emailLow,code:'–',bookings:bk,inscriptions:ins,prenom:first?.prenom||'',nom:first?.nom||'',societe:first?.societe||''};
  });

  const visiteurs=[...withCode,...withoutCode]
    .filter(v=>!search||(v.prenom+' '+v.nom+' '+v.email).toLowerCase().includes(search))
    .sort((a,b)=>(a.nom||'').localeCompare(b.nom||''));

  if(!visiteurs.length){listEl.innerHTML='<div class="empty-state"><i class="ti ti-users"></i><p>Aucun visiteur.</p></div>';return;}
  listEl.innerHTML=`<table class="rdv-table"><thead><tr><th>Visiteur</th><th>Email</th><th>Société</th><th>Code</th><th>RDV</th><th>Ateliers</th><th></th></tr></thead><tbody>
  ${visiteurs.map(v=>`<tr>
    <td><strong>${v.prenom} ${v.nom}</strong></td><td>${v.email}</td><td>${v.societe||'–'}</td>
    <td><span style="font-family:monospace;font-size:15px;font-weight:700;color:var(--cyan);background:var(--cyan-l);padding:3px 10px;border-radius:6px;letter-spacing:.1em">${v.code}</span></td>
    <td><strong style="color:var(--cyan)">${v.bookings.length}</strong></td>
    <td><strong style="color:#3B6D11">${v.inscriptions.length}</strong></td>
    <td style="display:flex;gap:6px">
      <button class="btn-primary" style="padding:5px 12px;font-size:12px" data-vid="${v.id}"><i class="ti ti-eye"></i> Planning</button>
      <button class="del-booking-btn" style="padding:5px 10px" data-del-vid="${v.id}" data-del-email="${v.email}" title="Supprimer ce visiteur et toutes ses données"><i class="ti ti-trash"></i></button>
    </td>
  </tr>`).join('')}</tbody></table>`;
  listEl.querySelectorAll('[data-vid]').forEach(btn=>{
    const v=visiteurs.find(x=>x.id===btn.dataset.vid);
    if(v)btn.addEventListener('click',()=>openVisiteurDetail(v));
  });
  listEl.querySelectorAll('[data-del-vid]').forEach(btn=>{
    btn.addEventListener('click',()=>deleteVisiteur(btn.dataset.delVid, btn.dataset.delEmail));
  });
}

async function deleteVisiteur(visitorId, email) {
  // Si pas de vrai ID visitor (visiteur sans code), pas de doc à supprimer dans visitors
  const emailLow = (email||'').toLowerCase();
  const bkCount  = DATA.bookings.filter(b=>(b.email||'').toLowerCase()===emailLow).length;
  const insCount = DATA.inscriptions.filter(i=>(i.email||'').toLowerCase()===emailLow).length;
  const wCount   = DATA.waitlist.filter(w=>(w.email||'').toLowerCase()===emailLow).length;
  if(!confirm(`Supprimer ce visiteur et toutes ses données ?

• ${bkCount} RDV
• ${insCount} inscription${insCount>1?'s':''} atelier
• ${wCount} liste${wCount>1?'s':""} d'attente

Cette action est irréversible.`))return;
  loader(true);
  try{
    const batch=writeBatch(db);
    // Supprimer bookings
    DATA.bookings.filter(b=>(b.email||'').toLowerCase()===emailLow).forEach(b=>batch.delete(doc(db,'bookings',b.id)));
    // Supprimer inscriptions
    DATA.inscriptions.filter(i=>(i.email||'').toLowerCase()===emailLow).forEach(i=>batch.delete(doc(db,'inscriptions',i.id)));
    // Supprimer waitlist
    DATA.waitlist.filter(w=>(w.email||'').toLowerCase()===emailLow).forEach(w=>batch.delete(doc(db,'waitlist',w.id)));
    // Supprimer visitor si existe
    if(!visitorId.startsWith('nocode-')) batch.delete(doc(db,'visitors',visitorId));
    await batch.commit();
    // Mettre à jour DATA
    DATA.bookings     = DATA.bookings.filter(b=>(b.email||'').toLowerCase()!==emailLow);
    DATA.inscriptions = DATA.inscriptions.filter(i=>(i.email||'').toLowerCase()!==emailLow);
    DATA.waitlist     = DATA.waitlist.filter(w=>(w.email||'').toLowerCase()!==emailLow);
    DATA.visitors     = DATA.visitors.filter(v=>v.id!==visitorId&&v.email.toLowerCase()!==emailLow);
    el('visiteur-detail')?.style && (el('visiteur-detail').style.display='none');
    renderVisiteursList();renderStats();updateBadges();
    toast('Visiteur et toutes ses données supprimés.');
  }catch(e){console.error(e);toast('Erreur lors de la suppression.');}
  loader(false);
}

function openVisiteurDetail(v){
  const detail=el('visiteur-detail');if(!detail)return;
  el('vd-title').innerHTML=`<i class="ti ti-user-circle" style="color:var(--cyan);font-size:20px;vertical-align:-3px;margin-right:6px"></i>${v.prenom} ${v.nom}`;
  const allItems=[
    ...v.bookings.map(b=>{const exp=DATA.exposants.find(e=>e.id===b.exposantId);return{time:b.slotStart,end:b.slotEnd,title:exp?.name||'–',sub:exp?.cat||'',prob:b.problematique||'',type:'rdv',period:b.period};}),
    ...v.inscriptions.map(i=>{const at=DATA.ateliers.find(a=>a.id===i.atelierId);return{time:at?.start||'',end:at?.end||'',title:at?.titre||'–',sub:at?.salle||'',type:'atelier',period:at?.period||''};}),
  ].sort((a,b)=>a.time.localeCompare(b.time));
  el('vd-body').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:1.25rem">
      <div style="background:var(--surf2);border-radius:10px;padding:.9rem">
        <div style="font-size:11px;font-weight:600;color:var(--ink3);text-transform:uppercase;margin-bottom:.4rem">Informations</div>
        <div style="font-size:13px;margin-bottom:3px"><strong>Email :</strong> ${v.email}</div>
        <div style="font-size:13px;margin-bottom:3px"><strong>Société :</strong> ${v.societe||'–'}</div>
        <div style="font-size:13px"><strong>RDV :</strong> ${v.bookings.length} · <strong>Ateliers :</strong> ${v.inscriptions.length}</div>
      </div>
      <div style="background:var(--cyan-l);border:1.5px solid var(--brd2);border-radius:10px;padding:.9rem;text-align:center">
        <div style="font-size:11px;font-weight:600;color:var(--cyan-d);text-transform:uppercase;margin-bottom:.4rem">Code personnel</div>
        <div style="font-size:36px;font-weight:700;color:var(--cyan);font-family:monospace;letter-spacing:.15em">${v.code}</div>
      </div>
    </div>
    <div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:.6rem">Planning complet — 22 septembre 2026</div>
    ${buildPlanningHTML(allItems)||'<div style="font-size:13px;color:var(--ink3);text-align:center;padding:1rem">Aucun élément.</div>'}`;
  detail.style.display='block';detail.scrollIntoView({behavior:'smooth',block:'nearest'});
  el('vd-close').onclick=()=>{detail.style.display='none';};
}

function buildPlanningHTML(items){
  return items.map(item=>{
    const isAt=item.type==='atelier', isPm=item.period==='aprem';
    const isWait=item.isWait||false;
    const cls=isWait?'wait-item-red':(isAt?(isPm?'at-pm':'at-am'):(isPm?'rdv-pm':'rdv-am'));
    const typeTag=isWait
      ?`<span class="pi-type" style="background:var(--am);color:#fff">Attente #${item.waitPos}</span>`
      :(isAt?'<span class="pi-type type-at">Atelier</span>':'<span class="pi-type type-rdv">RDV</span>');
    const cancelBtn=item.canCancel?`<button class="cancel-rdv-btn" data-id="${item.id}" data-type="${isWait?'wait-'+(isAt?'atelier':'rdv'):item.type}" data-title="${item.title}" data-time="${item.time}"><i class="ti ti-trash"></i></button>`:'';
    return`<div class="planning-item ${cls}">
      <div class="pi-time" style="color:${isWait?'var(--am)':(isAt?'#3B6D11':(isPm?'#B8940A':'var(--cyan)'))}">
        ${item.time}–${item.end}
      </div>
      <div class="pi-info">
        <div class="pi-title">${item.title}${isWait?' <span style="font-size:11px;color:var(--am)">(liste d\'attente)</span>':''}</div>
        <div class="pi-sub">${item.sub}${item.prob?` · "${item.prob}"`:''}</div>
      </div>
      ${typeTag}
      ${cancelBtn}
    </div>`;
  }).join('');
}

/* ── Visiteur : grille exposants ──────────────────────────────── */
function renderGrid(){
  const search=(el('vis-search')?.value||'').toLowerCase();
  const catF=el('vis-cat')?.value||'', expertF=el('vis-expertise')?.value||'';
  const catSel=el('vis-cat');
  if(catSel){const cur=catSel.value;const cats=[...new Set(DATA.exposants.map(e=>e.cat))].sort();catSel.innerHTML='<option value="">Toutes catégories</option>'+cats.map(c=>`<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');}
  const expSel=el('vis-expertise');
  if(expSel){const cur=expSel.value;const xs=[...new Set(DATA.exposants.map(e=>e.expertise).filter(Boolean))].sort();expSel.innerHTML='<option value="">Toutes expertises</option>'+xs.map(x=>`<option value="${x}"${x===cur?' selected':''}>${x}</option>`).join('');}
  const grid=el('grid');if(!grid)return;
  if(!DATA.exposants.length){grid.innerHTML='<div class="empty-state"><i class="ti ti-calendar-off"></i><p>Aucun expert disponible.</p></div>';return;}
  // Exclure les exposants sans RDV (period='aucun')
  const list=DATA.exposants.filter(exp=>{
    if(exp.period==='aucun') return false;
    const ms=!search||exp.name.toLowerCase().includes(search)||exp.cat.toLowerCase().includes(search)||(exp.expertise||'').toLowerCase().includes(search);
    const mc=!catF||exp.cat===catF, me=!expertF||exp.expertise===expertF;
    const mp=!periodFilter||exp.period===periodFilter||exp.period==='jour';
    return ms&&mc&&me&&mp;
  });
  if(!list.length){grid.innerHTML='<div class="empty-state"><i class="ti ti-search"></i><p>Aucun expert trouvé.</p></div>';return;}
  grid.innerHTML=list.map(exp=>{
    const slots=getSlots(exp.id);
    const amFree=slots.filter(s=>s.period==='matin'&&s.enabled&&!getBooking(exp.id,s.start)).length;
    const pmFree=slots.filter(s=>s.period==='aprem'&&s.enabled&&!getBooking(exp.id,s.start)).length;
    const pills=[amFree>0?`<span class="pill pill-am">${amFree} matin</span>`:'',pmFree>0?`<span class="pill pill-pm">${pmFree} ap-m</span>`:'',amFree===0&&pmFree===0?'<span class="pill pill-none">Complet</span>':''].filter(Boolean).join('');
    return`<div class="exp-card" data-id="${exp.id}">
      <div class="exp-card-top">
        <div class="avatar">${initials(exp.name)}</div>
        <div><div class="exp-name">${exp.name}</div><div class="exp-cat">${exp.cat}${exp.expertise?' · '+exp.expertise:''}</div></div>
        <i class="ti ti-chevron-right exp-arrow"></i>
      </div>
      <div class="pills">${pills}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.exp-card').forEach(c=>c.addEventListener('click',()=>openDrawer(c.dataset.id)));
}

/* ── Helpers liste d'attente ─────────────────────────────────── */

function getWaitRdv(expId, start, email) {
  return DATA.waitlist.find(w => w.expId===expId && w.slotStart===start && !w.atelierId && (email?(w.email||'').toLowerCase()===email.toLowerCase():true));
}
function getWaitAtelier(atId, email) {
  return DATA.waitlist.find(w => w.atelierId===atId && !w.expId && (email?(w.email||'').toLowerCase()===email.toLowerCase():true));
}
function waitPosRdv(expId, start) {
  return DATA.waitlist.filter(w=>w.expId===expId&&w.slotStart===start&&!w.atelierId).sort((a,b)=>a.createdAt-b.createdAt);
}
function waitPosAtelier(atId) {
  return DATA.waitlist.filter(w=>w.atelierId===atId&&!w.expId).sort((a,b)=>a.createdAt-b.createdAt);
}

async function promoteWaitlistRdv(expId, slotStart) {
  const queue = waitPosRdv(expId, slotStart);
  if (!queue.length) return;
  const next = queue[0];
  loader(true);
  try {
    // Créer la réservation pour le premier en liste
    const ref = await addDoc(collection(db,'bookings'), {
      exposantId: expId, slotStart, slotEnd: next.slotEnd||'', period: next.period||'',
      prenom: next.prenom, nom: next.nom, email: next.email, societe: next.societe||'',
      problematique: next.problematique||'', structure: next.structure||'',
      consentRgpd: true, consentDate: new Date().toISOString(), createdAt: Date.now(),
      promotedFromWaitlist: true,
    });
    DATA.bookings.push({id:ref.id, exposantId:expId, slotStart, slotEnd:next.slotEnd, period:next.period, prenom:next.prenom, nom:next.nom, email:next.email, societe:next.societe, problematique:next.problematique});
    // Supprimer de la liste d'attente
    await deleteDoc(doc(db,'waitlist',next.id));
    DATA.waitlist = DATA.waitlist.filter(w=>w.id!==next.id);
    toast(`${next.prenom} ${next.nom} promu(e) depuis la liste d'attente !`);
  } catch(e) { console.error(e); }
  loader(false);
}

async function promoteWaitlistAtelier(atId) {
  const queue = waitPosAtelier(atId);
  if (!queue.length) return;
  const next = queue[0];
  const at = DATA.ateliers.find(a=>a.id===atId);
  loader(true);
  try {
    const ref = await addDoc(collection(db,'inscriptions'), {
      atelierId: atId, prenom: next.prenom, nom: next.nom, email: next.email,
      societe: next.societe||'', consentRgpd: true, consentDate: new Date().toISOString(), createdAt: Date.now(),
      promotedFromWaitlist: true,
    });
    DATA.inscriptions.push({id:ref.id, atelierId:atId, prenom:next.prenom, nom:next.nom, email:next.email});
    await deleteDoc(doc(db,'waitlist',next.id));
    DATA.waitlist = DATA.waitlist.filter(w=>w.id!==next.id);
    toast(`${next.prenom} ${next.nom} promu(e) depuis la liste d'attente !`);
  } catch(e) { console.error(e); }
  loader(false);
}

/* ── Drawer RDV ───────────────────────────────────────────────── */
async function openDrawer(expId){
  if(PLATFORM_MODE === 'lecture'){
    // Mode lecture : afficher infos sans bouton d'inscription
    const exp=DATA.exposants.find(e=>e.id===expId);
    const slots=getSlots(expId);
    el('d-name').textContent=exp?.name||'–';
    el('d-cat').textContent=(exp?.cat||'')+(exp?.expertise?' · '+exp.expertise:'');
    el('d-confirm').innerHTML='';
    const ms=slots.filter(s=>s.period==='matin'), ps=slots.filter(s=>s.period==='aprem');
    const fill=(list,cid)=>{const c=el(cid);if(!list.length){c.innerHTML='';return;}c.innerHTML=list.map(s=>`<span class="slot-btn ${s.period==='matin'?'slot-free-am':'slot-free-pm'}" style="cursor:default;opacity:.7">${s.start}–${s.end}</span>`).join('');};
    el('d-am-count').textContent=ms.length?ms.length+` créneau${ms.length>1?'x':''}`:'' ;
    el('d-pm-count').textContent=ps.length?ps.length+` créneau${ps.length>1?'x':''}`:'' ;
    el('d-matin').style.display=ms.length?'flex':'none';
    el('d-aprem').style.display=ps.length?'flex':'none';
    fill(ms,'d-am-slots');fill(ps,'d-pm-slots');
    el('overlay').classList.add('open');el('drawer').classList.add('open');document.body.style.overflow='hidden';
    return;
  }
  // Recharger les bookings pour avoir l'état le plus récent
  try{
    const bS=await getDocs(query(collection(db,'bookings'),orderBy('slotStart')));
    DATA.bookings=bS.docs.map(d=>({id:d.id,...d.data()}));
    const wS=await getDocs(query(collection(db,'waitlist'),orderBy('createdAt')));
    DATA.waitlist=wS.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){console.error(e);}
  pendingExp=expId;
  const exp=DATA.exposants.find(e=>e.id===expId);
  const slots=getSlots(expId), ms=slots.filter(s=>s.period==='matin'), ps=slots.filter(s=>s.period==='aprem');
  el('d-name').textContent=exp.name; el('d-cat').textContent=exp.cat+(exp.expertise?' · '+exp.expertise:'');
  el('d-confirm').innerHTML='';
  function fillSlots(list,cid,fcls){
    const c=el(cid);if(!list.length){c.innerHTML='<span style="font-size:12px;color:var(--ink3)">Non disponible</span>';return;}
    c.innerHTML=list.map(s=>{
      const b=getBooking(expId,s.start);
      const myWait=getWaitRdv(expId,s.start,null); // on check après avec email
      const free=s.enabled&&!b;
      const waitCount=waitPosRdv(expId,s.start).length;
      if(free) return`<button class="slot-btn ${fcls}" data-start="${s.start}" data-end="${s.end}">${s.start}–${s.end}</button>`;
      if(b) return`<button class="slot-btn slot-booked" data-start="${s.start}" data-end="${s.end}" data-waitcount="${waitCount}">${s.start}–${s.end}<span class="slot-tag">Pris</span>${waitCount?`<span class="slot-wait-badge">${waitCount} att.</span>`:''}</button>`;
      return`<button class="slot-btn slot-disabled" disabled>${s.start}–${s.end}<span class="slot-tag">Indispo</span></button>`;
    }).join('');
    // Slots libres → réserver
    c.querySelectorAll('.slot-btn.'+fcls).forEach(btn=>btn.addEventListener('click',()=>openModal(btn.dataset.start,btn.dataset.end)));
    // Slots pris → liste d'attente
    c.querySelectorAll('.slot-btn.slot-booked').forEach(btn=>btn.addEventListener('click',()=>openModalWait('rdv',btn.dataset.start,btn.dataset.end,expId,null)));
  }
  const amFree=ms.filter(s=>s.enabled&&!getBooking(expId,s.start)).length;
  const pmFree=ps.filter(s=>s.enabled&&!getBooking(expId,s.start)).length;
  el('d-am-count').textContent=amFree?`${amFree} libre${amFree>1?'s':''}`:'Complet';
  el('d-pm-count').textContent=pmFree?`${pmFree} libre${pmFree>1?'s':''}`:'Complet';
  el('d-matin').style.display=ms.length?'flex':'none';
  el('d-aprem').style.display=ps.length?'flex':'none';
  fillSlots(ms,'d-am-slots','slot-free-am');fillSlots(ps,'d-pm-slots','slot-free-pm');
  el('overlay').classList.add('open');el('drawer').classList.add('open');document.body.style.overflow='hidden';
}
function closeDrawer(){el('overlay')?.classList.remove('open');el('drawer')?.classList.remove('open');document.body.style.overflow='';}

/* ── Code visiteur ────────────────────────────────────────────── */
function genCode(){return String(Math.floor(100000+Math.random()*900000));}
async function getOrCreateVisitorCode(email){
  const emailLow=email.toLowerCase();
  const existing=DATA.visitors.find(v=>v.email===emailLow);
  if(existing)return{code:existing.code,isNew:false};
  const code=genCode();
  const ref=await addDoc(collection(db,'visitors'),{email:emailLow,code,createdAt:Date.now()});
  DATA.visitors.push({id:ref.id,email:emailLow,code});
  return{code,isNew:true};
}

function showCodeModal(code,prenom,expName,start,end,isPreinscription=false){
  navigator.clipboard.writeText(code).catch(()=>{});
  const overlay=document.createElement('div');
  overlay.id='code-modal';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:800;display:flex;align-items:center;justify-content:center;padding:1rem';
  overlay.innerHTML=`<div style="background:#fff;border-radius:20px;padding:2rem;max-width:440px;width:100%;text-align:center;border:2px solid var(--cyan);box-shadow:0 20px 60px rgba(0,0,0,.2)">
    <i class="ti ti-circle-check" style="font-size:40px;color:var(--cyan);display:block;margin-bottom:.75rem"></i>
    <div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:.25rem">${isPreinscription?'Préinscription enregistrée !':'Inscription confirmée !'}</div>
    <div style="font-size:13px;color:var(--ink3);margin-bottom:1.5rem">${start}–${end} chez ${expName}</div>
    <div style="background:var(--cyan-l);border:2px solid var(--cyan);border-radius:14px;padding:1.25rem;margin-bottom:1rem">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--cyan-d);margin-bottom:.5rem">🔑 Votre code personnel</div>
      <div style="font-size:52px;font-weight:700;color:var(--cyan);letter-spacing:.2em;font-family:monospace">${code}</div>
      <div style="font-size:12px;color:#2E6B12;margin-top:.5rem;font-weight:600">✓ Copié automatiquement dans votre presse-papier</div>
    </div>
    <div style="background:#FFF8E6;border:2px solid #FFD82B;border-radius:12px;padding:1rem;margin-bottom:1.25rem;text-align:left">
      <div style="font-size:12px;font-weight:700;color:#B8940A;margin-bottom:.5rem">⚠️ Notez ce code — il ne pourra pas être modifié</div>
      <div style="font-size:12px;color:#5A4A00;line-height:1.6">
        Avec ce code, vous pouvez :<br>• Accéder rapidement à votre planning<br>• <strong>Annuler vos RDV et inscriptions</strong><br>• <strong>Pré-remplir vos informations</strong> lors de vos prochaines réservations<br><br>
        <strong>Sans ce code</strong> : consultation uniquement. Pour modification, contactez l'équipe PIE.
      </div>
    </div>
    ${isPreinscription?`<div style="background:#EAF3DE;border:1.5px solid #6BAA38;border-radius:10px;padding:.9rem;margin-bottom:1rem;font-size:12px;color:#2E5A00;text-align:left;line-height:1.6">
      <strong><i class="ti ti-pencil"></i> Préinscription</strong> — Votre inscription est enregistrée mais reste provisoire. Elle sera confirmée définitivement à l'ouverture officielle des inscriptions.
    </div>`:''}
    <button id="code-ok-btn" style="background:var(--cyan);color:#fff;border:none;border-radius:10px;padding:12px 24px;font-family:var(--font);font-size:14px;font-weight:700;cursor:pointer;width:100%">J'ai noté mon code → Continuer</button>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById('code-ok-btn').addEventListener('click',()=>{overlay.remove();if(pendingExp)openDrawer(pendingExp);});
}

async function applyQuickCode(codeInputId,statusId,fieldPrefix){
  const code=(el(codeInputId)?.value||'').trim();
  const status=el(statusId);
  if(!/^\d{6}$/.test(code)){if(status){status.textContent='⚠️ Le code doit contenir 6 chiffres.';status.style.color='var(--red)';}return;}
  if(status){status.textContent='Recherche…';status.style.color='var(--ink3)';}
  let visitor=DATA.visitors.find(v=>v.code===code);
  if(!visitor){
    try{const snap=await getDocs(collection(db,'visitors'));DATA.visitors=snap.docs.map(d=>({id:d.id,...d.data()}));visitor=DATA.visitors.find(v=>v.code===code);}catch(e){console.error(e);}
  }
  if(!visitor){if(status){status.textContent='❌ Code introuvable.';status.style.color='var(--red)';}return;}
  let prev=DATA.bookings.find(b=>(b.email||'').toLowerCase()===visitor.email);
  if(!prev){try{const snap=await getDocs(query(collection(db,'bookings'),orderBy('slotStart')));DATA.bookings=snap.docs.map(d=>({id:d.id,...d.data()}));prev=DATA.bookings.find(b=>(b.email||'').toLowerCase()===visitor.email);}catch(e){console.error(e);}}
  if(!prev){const ins=DATA.inscriptions.find(i=>(i.email||'').toLowerCase()===visitor.email);if(ins)prev=ins;}
  function fillLock(prenom,nom,email,societe,structure){
    ['prenom','nom','email','societe'].forEach(f=>{
      const e=el(fieldPrefix+'-'+f);
      if(e){e.value=f==='prenom'?prenom:f==='nom'?nom:f==='email'?email:societe;e.readOnly=true;e.style.background='var(--cyan-l)';e.style.color='var(--cyan-d)';e.style.fontWeight='600';}
    });
    // Préremplir le champ structure si société renseignée
    if(societe && structure){
      const sw=el(fieldPrefix+'-structure-wrap');
      const ss=el(fieldPrefix+'-structure-search');
      const sh=el(fieldPrefix+'-structure');
      if(sw) sw.style.display='block';
      if(ss){ ss.value=structure; ss.readOnly=true; ss.style.background='var(--cyan-l)'; ss.style.color='var(--cyan-d)'; ss.style.fontWeight='600'; }
      if(sh) sh.value=structure;
    }
    if(status){status.textContent='✓ Informations pré-remplies.';status.style.color='#2E6B12';}
    setTimeout(()=>{
      const focus = fieldPrefix==='m' ? el('m-problematique') : el(fieldPrefix+'-prenom');
      if(focus&&!focus.value) focus.focus();
    },100);
  }
  if(prev){fillLock(prev.prenom||'',prev.nom||'',prev.email||visitor.email,prev.societe||'',prev.structure||'');}
  else{const e=el(fieldPrefix+'-email');if(e){e.value=visitor.email;e.readOnly=true;}if(status){status.textContent='✓ Code reconnu.';status.style.color='#2E6B12';}}
  setTimeout(()=>el(fieldPrefix==='m'?'m-problematique':fieldPrefix+'-prenom')?.focus(),100);
}

/* ── Modal RDV ────────────────────────────────────────────────── */
function openModal(start,end){
  pendingSlot=start;
  const exp=DATA.exposants.find(e=>e.id===pendingExp);
  el('m-info').textContent=`${exp.name} · ${start}–${end} · ${start>='14:00'?'Après-midi':'Matin'} · 22 sept. 2026`;
  ['m-prenom','m-nom','m-email','m-societe','m-problematique','m-code-rapide','m-structure-search'].forEach(id=>{const e=el(id);if(e){e.value='';e.readOnly=false;e.style.background='';e.style.color='';e.style.fontWeight='';}});
  if(el('m-rgpd'))el('m-rgpd').checked=false;
  if(el('m-structure-search'))el('m-structure-search').value='';
  if(el('m-structure'))el('m-structure').value='';
  if(el('m-structure-wrap'))el('m-structure-wrap').style.display='none';
  if(el('m-code-status')){el('m-code-status').textContent='Vos informations seront pré-remplies automatiquement.';el('m-code-status').style.color='var(--ink3)';}
  el('modal').classList.add('open');
  el('m-code-apply').onclick=()=>applyQuickCode('m-code-rapide','m-code-status','m');
  el('m-code-rapide').onkeydown=e=>{if(e.key==='Enter')applyQuickCode('m-code-rapide','m-code-status','m');};
  setTimeout(()=>el('m-code-rapide')?.focus(),80);
}
/* ── Modal liste d'attente ────────────────────────────────────── */

function openModalWait(type, slotStart, slotEnd, expId, atId) {
  // Réutilise le modal existant en changeant le titre
  const at = atId ? DATA.ateliers.find(a=>a.id===atId) : null;
  const exp = expId ? DATA.exposants.find(e=>e.id===expId) : null;
  const waitQueue = type==='rdv' ? waitPosRdv(expId,slotStart) : waitPosAtelier(atId);

  pendingSlot = slotStart;
  if(expId) pendingExp = expId;
  if(atId) pendingAtelierId = atId;

  const infoText = type==='rdv'
    ? `${exp?.name} · ${slotStart}–${slotEnd} · Créneau complet`
    : `${at?.titre} · ${at?.start}–${at?.end} · Atelier complet`;

  el('m-info').innerHTML = `<span style="color:var(--am);font-weight:600"><i class="ti ti-clock" style="font-size:12px"></i> Liste d'attente — position ${waitQueue.length+1}</span><br><span style="font-size:11px">${infoText}</span>`;
  document.querySelector('#modal .modal-title').textContent = "S'inscrire en liste d'attente";
  document.querySelector('#modal-confirm').innerHTML = '<i class="ti ti-clock"></i> Rejoindre la liste d\'attente';
  document.querySelector('#modal-confirm').style.background = '#B85C1A';
  document.querySelector('#modal-confirm').style.border = 'none';
  document.querySelector('#modal-confirm').style.fontSize = '14px';
  document.querySelector('#modal-confirm').style.padding = '12px 20px';

  ['m-prenom','m-nom','m-email','m-societe','m-problematique','m-code-rapide','m-structure-search'].forEach(id=>{const e=el(id);if(e){e.value='';e.readOnly=false;e.style.background='';e.style.color='';e.style.fontWeight='';}});
  if(el('m-rgpd'))el('m-rgpd').checked=false;
  if(el('m-structure-search'))el('m-structure-search').value='';
  if(el('m-structure'))el('m-structure').value='';
  if(el('m-structure-wrap'))el('m-structure-wrap').style.display='none';

  // Surcharger le confirm pour liste d'attente
  el('modal-confirm').onclick = () => confirmWaitlist(type, expId, atId, slotStart, slotEnd);
  el('modal').classList.add('open');
  setTimeout(()=>el('m-code-rapide')?.focus(),80);
  el('m-code-apply').onclick=()=>applyQuickCode('m-code-rapide','m-code-status','m');
  el('m-code-rapide').onkeydown=e=>{if(e.key==='Enter')applyQuickCode('m-code-rapide','m-code-status','m');};
}

async function confirmWaitlist(type, expId, atId, slotStart, slotEnd) {
  const prenom=el('m-prenom').value.trim(), nom=el('m-nom').value.trim();
  const email=el('m-email').value.trim(), societe=el('m-societe').value.trim();
  const problematique=el('m-problematique')?.value.trim()||'';
  const structure=el('m-structure')?.value||'';
  if(!prenom||!nom){toast('Merci de renseigner prénom et nom.');return;}
  if(!email){toast('Merci de renseigner votre email.');return;}
  if(!el('m-rgpd')?.checked){toast(`Merci d'accepter la politique de confidentialité.`);return;}

  // Vérifier pas déjà en liste d'attente
  const alreadyWait = type==='rdv'
    ? getWaitRdv(expId, slotStart, email)
    : getWaitAtelier(atId, email);
  if(alreadyWait){toast(`Vous êtes déjà sur la liste d'attente pour ce créneau.`);closeModal();return;}

  // Vérifier pas déjà inscrit
  if(type==='rdv'){
    const already=DATA.bookings.find(b=>b.exposantId===expId&&b.slotStart===slotStart&&(b.email||'').toLowerCase()===email.toLowerCase());
    if(already){toast('Vous avez déjà ce RDV.');closeModal();return;}
  } else {
    const already=DATA.inscriptions.find(i=>i.atelierId===atId&&(i.email||'').toLowerCase()===email.toLowerCase());
    if(already){toast('Vous êtes déjà inscrit à cet atelier.');closeModal();return;}
  }

  const slot = type==='rdv' ? getSlots(expId).find(s=>s.start===slotStart) : null;
  loader(true);
  try {
    const {code,isNew} = await getOrCreateVisitorCode(email);
    const ref = await addDoc(collection(db,'waitlist'),{
      ...(type==='rdv' ? {expId, slotStart, slotEnd: slotEnd||slot?.end||'', period: slot?.period||''} : {atelierId: atId}),
      type, prenom, nom, email, societe, problematique, structure,
      consentRgpd: true, consentDate: new Date().toISOString(), createdAt: Date.now(),
    });
    DATA.waitlist.push({id:ref.id, ...(type==='rdv'?{expId,slotStart,slotEnd:slot?.end,period:slot?.period}:{atelierId:atId}), type, prenom, nom, email, societe});

    // Reset le bouton confirm
    el('modal-confirm').onclick = confirmBooking;
    el('modal-confirm').innerHTML = '<i class="ti ti-calendar-check"></i> Confirmer';
    el('modal-confirm').style.background = '';
    document.querySelector('#modal .modal-title').textContent = 'Confirmer votre RDV';
    closeModal();

    const pos = type==='rdv' ? waitPosRdv(expId,slotStart).length : waitPosAtelier(atId).length;
    const name = type==='rdv' ? DATA.exposants.find(e=>e.id===expId)?.name : DATA.ateliers.find(a=>a.id===atId)?.titre;

    if(isNew) showCodeModal(code,prenom,name,slotStart||'',slotEnd||'');
    else {
      // Afficher confirmation liste d'attente
      const overlay=document.createElement('div');
      overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:800;display:flex;align-items:center;justify-content:center;padding:1rem';
      overlay.innerHTML=`<div style="background:#fff;border-radius:20px;padding:2rem;max-width:400px;width:100%;text-align:center;border:2px solid var(--am);box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <i class="ti ti-clock" style="font-size:40px;color:var(--am);display:block;margin-bottom:.75rem"></i>
        <div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:.5rem">Inscrit en liste d'attente !</div>
        <div style="font-size:13px;color:var(--ink3);margin-bottom:1rem">${name} · Position <strong style="color:var(--am);font-size:18px">${pos}</strong></div>
        <div style="background:#FEF3EB;border:1.5px solid var(--am-brd);border-radius:10px;padding:.9rem;margin-bottom:1.25rem;font-size:12px;color:#5A2D00;text-align:left;line-height:1.6">
          En cas de désistement, vous serez automatiquement inscrit(e) et votre place confirmée. Vous pouvez retrouver et annuler votre inscription en liste d'attente depuis "Mon Planning".
        </div>
        <button onclick="this.closest('div[style]').remove()" style="background:var(--am);color:#fff;border:none;border-radius:10px;padding:10px 24px;font-family:var(--font);font-size:14px;font-weight:700;cursor:pointer;width:100%">Compris !</button>
      </div>`;
      document.body.appendChild(overlay);
    }
    if(type==='rdv') openDrawer(expId);
    else renderAteliersGrid();
  } catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

function closeModal(){
  el('modal')?.classList.remove('open');
  // Remettre le bouton confirm à son état normal
  const btn=el('modal-confirm');
  if(btn){
    btn.onclick=confirmBooking;
    btn.innerHTML='<i class="ti ti-calendar-check"></i> Confirmer';
    btn.style.background='';
    btn.style.border='';
    btn.style.fontSize='';
    btn.style.padding='';
  }
  const title=document.querySelector('#modal .modal-title');
  if(title)title.textContent='Confirmer votre RDV';
}

async function confirmBooking(){
  const prenom=el('m-prenom').value.trim(),nom=el('m-nom').value.trim(),email=el('m-email').value.trim();
  const societe=el('m-societe').value.trim(),problematique=el('m-problematique').value.trim();
  if(!prenom||!nom){toast('Merci de renseigner prénom et nom.');return;}
  if(!email){toast('Merci de renseigner votre email.');return;}
  if(!problematique){toast('Merci de décrire votre problématique.');return;}
  if(!el('m-rgpd')?.checked){toast('Merci d\'accepter la politique de confidentialité.');return;}
  const structure = el('m-structure')?.value || '';
  if(el('m-societe')?.value.trim() && !structure){ toast('Merci de sélectionner le type de structure.'); return; }
  const doublon=DATA.bookings.find(b=>b.exposantId===pendingExp&&(b.email||'').toLowerCase()===email.toLowerCase());
  if(doublon){toast(`Vous avez déjà un RDV avec cet expert à ${doublon.slotStart}.`);closeModal();return;}
  // Vérif conflits ateliers
  const slot=getSlots(pendingExp).find(s=>s.start===pendingSlot);
  const conflict=DATA.inscriptions.find(i=>(i.email||'').toLowerCase()===email.toLowerCase()&&checkTimeConflict(pendingSlot,slot?.end,i.atelierId));
  if(conflict){const at=DATA.ateliers.find(a=>a.id===conflict.atelierId);toast(`Conflit d'horaire avec l'atelier "${at?.titre}" à ${at?.start}.`);return;}
  loader(true);
  try{
    const{code,isNew}=await getOrCreateVisitorCode(email);
    const ref=await addDoc(collection(db,'bookings'),{exposantId:pendingExp,slotStart:pendingSlot,slotEnd:slot?.end||'',period:slot?.period||'',prenom,nom,email,societe,structure,problematique,mode:PLATFORM_MODE,consentRgpd:true,consentDate:new Date().toISOString(),createdAt:Date.now()});
    DATA.bookings.push({id:ref.id,exposantId:pendingExp,slotStart:pendingSlot,slotEnd:slot?.end,period:slot?.period,prenom,nom,email,societe,problematique});
    closeModal();
    if(isNew){showCodeModal(code,prenom,DATA.exposants.find(e=>e.id===pendingExp)?.name,pendingSlot,slot?.end,PLATFORM_MODE==='preinscription');}
    else{el('d-confirm').innerHTML=`<div class="confirm-ok"><i class="ti ti-circle-check"></i><div>RDV confirmé — ${prenom} ${nom}<br><span style="font-weight:400;font-size:12px">${pendingSlot}–${slot?.end}</span></div></div>`;openDrawer(pendingExp);}
    toast(PLATFORM_MODE==='preinscription'?`Préinscription enregistrée !`:`RDV confirmé !`);
  }catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

function checkTimeConflict(start,end,atelierId){
  const at=DATA.ateliers.find(a=>a.id===atelierId);if(!at)return false;
  const toMin=t=>{const[h,m]=t.split(':').map(Number);return h*60+m;};
  const s1=toMin(start),e1=toMin(end||start),s2=toMin(at.start),e2=toMin(at.end);
  return s1<e2&&s2<e1;
}

/* ── Ateliers visiteur ────────────────────────────────────────── */
function renderAteliersGrid(){
  const search=(el('at-search')?.value||'').toLowerCase();
  const catF=el('at-cat')?.value||'';
  const catSel=el('at-cat');
  if(catSel){const cur=catSel.value;catSel.innerHTML='<option value="">Toutes catégories</option>'+ALL_CATS.map(c=>`<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');}
  const grid=el('ateliers-grid');if(!grid)return;
  if(!DATA.ateliers.length){grid.innerHTML='<div class="empty-state"><i class="ti ti-school"></i><p>Aucun atelier disponible pour le moment.</p></div>';return;}
  const list=DATA.ateliers.filter(at=>{
    const ms=!search||at.titre.toLowerCase().includes(search)||(at.description||'').toLowerCase().includes(search);
    const mc=!catF||(at.categories||[]).includes(catF);
    const mp=!atPeriodFilter||at.period===atPeriodFilter;
    return ms&&mc&&mp;
  }).sort((a,b)=>a.start.localeCompare(b.start));
  if(!list.length){grid.innerHTML='<div class="empty-state"><i class="ti ti-search"></i><p>Aucun atelier trouvé.</p></div>';return;}
  grid.innerHTML=list.map(at=>{
    const inscrits=DATA.inscriptions.filter(i=>i.atelierId===at.id).length;
    const full=at.places>0&&inscrits>=at.places;
    const animNames=(at.animateurs||[]).map(id=>DATA.exposants.find(e=>e.id===id)?.name||'').filter(Boolean).join(', ');
    const cats=(at.categories||[]).map(c=>`<span class="at-cat-tag">${c.split(',')[0].trim()}</span>`).join(' ');
    const isPm=at.period==='aprem';
    return`<div class="atelier-card">
      <div class="at-header">
        <div class="at-time-badge${isPm?' pm':''}">${at.start}–${at.end}</div>
        <div style="flex:1"><div class="at-title">${at.titre}</div><div class="at-salle"><i class="ti ti-map-pin" style="font-size:11px"></i> ${at.salle}</div></div>
      </div>
      ${at.description?`<div class="at-desc">${at.description}</div>`:''}
      ${animNames?`<div class="at-animateurs"><i class="ti ti-user-star" style="font-size:12px"></i> ${animNames}</div>`:''}
      <div class="at-cats">${cats}</div>
      <div class="at-footer">
        <div class="at-places${full?' full':`}`}"><strong>${inscrits}</strong>${at.places>0?` / ${at.places} places`:' inscrits'}${full?' · COMPLET':''}</div>
        ${full
          ? `<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
               <span style="font-size:12px;color:var(--red);font-weight:600">Complet</span>
               <button class="btn-ghost" style="padding:4px 12px;font-size:12px;border-color:var(--am-brd);color:var(--am)" data-atid-wait="${at.id}"><i class="ti ti-clock" style="font-size:11px"></i> Liste d'attente (${waitPosAtelier(at.id).length})</button>
             </div>`
          : `<button class="btn-primary" style="padding:6px 14px;font-size:12px" data-atid="${at.id}"><i class="ti ti-plus"></i> S'inscrire</button>`}
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-atid]').forEach(btn=>btn.addEventListener('click',()=>openModalAtelier(btn.dataset.atid)));
  grid.querySelectorAll('[data-atid-wait]').forEach(btn=>btn.addEventListener('click',()=>openModalWait('atelier',null,null,null,btn.dataset.atidWait)));
}

function openModalAtelier(atId){
  if(PLATFORM_MODE === 'lecture'){ toast(`Inscriptions disponibles à partir du ${DATA.config.lectureDate||'1er juillet 2026'}.`); return; }
  pendingAtelierId=atId;
  const at=DATA.ateliers.find(a=>a.id===atId);if(!at)return;
  el('ma-info').textContent=`${at.titre} · ${at.start}–${at.end} · ${at.salle} · 22 sept. 2026`;
  ['ma-prenom','ma-nom','ma-email','ma-societe','ma-code-rapide','ma-structure-search'].forEach(id=>{const e=el(id);if(e){e.value='';e.readOnly=false;e.style.background='';e.style.color='';e.style.fontWeight='';}});
  if(el('ma-rgpd'))el('ma-rgpd').checked=false;
  if(el('ma-structure-search'))el('ma-structure-search').value='';
  if(el('ma-structure'))el('ma-structure').value='';
  if(el('ma-structure-wrap'))el('ma-structure-wrap').style.display='none';
  if(el('ma-code-status')){el('ma-code-status').textContent='Vos informations seront pré-remplies automatiquement.';el('ma-code-status').style.color='var(--ink3)';}
  el('modal-atelier').classList.add('open');
  el('ma-code-apply').onclick=()=>applyQuickCode('ma-code-rapide','ma-code-status','ma');
  el('ma-code-rapide').onkeydown=e=>{if(e.key==='Enter')applyQuickCode('ma-code-rapide','ma-code-status','ma');};
  setTimeout(()=>el('ma-code-rapide')?.focus(),80);
}

async function confirmAtelier(){
  const prenom=el('ma-prenom').value.trim(),nom=el('ma-nom').value.trim(),email=el('ma-email').value.trim(),societe=el('ma-societe').value.trim();
  if(!prenom||!nom){toast('Merci de renseigner prénom et nom.');return;}
  if(!email){toast('Merci de renseigner votre email.');return;}
  if(!el('ma-rgpd')?.checked){toast('Merci d\'accepter la politique de confidentialité.');return;}
  const structureAt = el('ma-structure')?.value || '';
  if(el('ma-societe')?.value.trim() && !structureAt){ toast('Merci de sélectionner le type de structure.'); return; }
  const at=DATA.ateliers.find(a=>a.id===pendingAtelierId);
  const alreadyIn=DATA.inscriptions.find(i=>i.atelierId===pendingAtelierId&&(i.email||'').toLowerCase()===email.toLowerCase());
  if(alreadyIn){toast('Vous êtes déjà inscrit à cet atelier.');return;}
  const inscrits=DATA.inscriptions.filter(i=>i.atelierId===pendingAtelierId).length;
  if(at.places>0&&inscrits>=at.places){toast('Cet atelier est complet.');return;}
  // Vérif conflits RDV
  const conflictRdv=DATA.bookings.find(b=>(b.email||'').toLowerCase()===email.toLowerCase()&&checkTimeConflict(at.start,at.end,null));
  // check manual for RDV
  const toMin=t=>{const[h,m]=t.split(':').map(Number);return h*60+m;};
  const s2=toMin(at.start),e2=toMin(at.end);
  const rdvConflict=DATA.bookings.find(b=>{if((b.email||'').toLowerCase()!==email.toLowerCase())return false;const s1=toMin(b.slotStart),e1=toMin(b.slotEnd||b.slotStart);return s1<e2&&s2<e1;});
  if(rdvConflict){const exp=DATA.exposants.find(e=>e.id===rdvConflict.exposantId);toast(`Conflit avec votre RDV chez ${exp?.name} à ${rdvConflict.slotStart}.`);return;}
  const atConflict=DATA.inscriptions.find(i=>{if((i.email||'').toLowerCase()!==email.toLowerCase())return false;const oa=DATA.ateliers.find(a=>a.id===i.atelierId);if(!oa)return false;const s1=toMin(oa.start),e1=toMin(oa.end);return s1<e2&&s2<e1;});
  if(atConflict){const oa=DATA.ateliers.find(a=>a.id===atConflict.atelierId);toast(`Conflit avec l'atelier "${oa?.titre}" à ${oa?.start}.`);return;}
  loader(true);
  try{
    const{code,isNew}=await getOrCreateVisitorCode(email);
    const ref=await addDoc(collection(db,'inscriptions'),{atelierId:pendingAtelierId,prenom,nom,email,societe,structure:structureAt,consentRgpd:true,consentDate:new Date().toISOString(),createdAt:Date.now()});
    DATA.inscriptions.push({id:ref.id,atelierId:pendingAtelierId,prenom,nom,email,societe});
    el('modal-atelier').classList.remove('open');
    if(isNew)showCodeModal(code,prenom,at.titre,at.start,at.end,PLATFORM_MODE==='preinscription');
    else toast(PLATFORM_MODE==='preinscription'?`Préinscription enregistrée — ${at.titre} !`:`Inscription confirmée — ${at.titre} !`);
    renderAteliersGrid();
  }catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

/* ── Mon planning ─────────────────────────────────────────────── */
async function searchMonPlanning(){
  const input=(el('mes-search-input')?.value||'').trim();
  const result=el('mes-result');if(!result||!input)return;
  if(!input){result.innerHTML='<div class="rdv-empty"><i class="ti ti-id-badge"></i><p>Saisissez votre code ou email.</p></div>';return;}
  const isCode=/^\d{6}$/.test(input);
  const emailLow=input.toLowerCase();
  let email,hasCode=false;
  if(isCode){
    let visitor=DATA.visitors.find(v=>v.code===input);
    if(!visitor){try{const s=await getDocs(collection(db,'visitors'));DATA.visitors=s.docs.map(d=>({id:d.id,...d.data()}));visitor=DATA.visitors.find(v=>v.code===input);}catch(e){}}
    if(!visitor){result.innerHTML='<div class="rdv-empty"><i class="ti ti-x"></i><p>Code introuvable.</p></div>';return;}
    email=visitor.email;hasCode=true;
  } else {email=emailLow;}
  const bk=DATA.bookings.filter(b=>(b.email||'').toLowerCase()===email);
  const ins=DATA.inscriptions.filter(i=>(i.email||'').toLowerCase()===email);
  if(!bk.length&&!ins.length){result.innerHTML='<div class="rdv-empty"><i class="ti ti-calendar-off"></i><p>Aucun élément trouvé.</p></div>';return;}
  const first=bk[0]||ins[0];
  // Recharger waitlist depuis Firebase si vide (données fraîches)
  if(!DATA.waitlist.length){
    try{const ws=await getDocs(query(collection(db,'waitlist'),orderBy('createdAt')));DATA.waitlist=ws.docs.map(d=>({id:d.id,...d.data()}));}catch(e){console.error(e);}
  }
  // Recharger la waitlist fraîche depuis Firebase
  try{const ws=await getDocs(query(collection(db,'waitlist'),orderBy('createdAt')));DATA.waitlist=ws.docs.map(d=>({id:d.id,...d.data()}));}catch(e){console.error(e);}

  const waits=DATA.waitlist.filter(w=>(w.email||'').toLowerCase()===email);

  // 3 listes séparées triées chronologiquement
  const rdvItems = bk.map(b=>{
    const exp=DATA.exposants.find(e=>e.id===b.exposantId);
    return{id:b.id,time:b.slotStart,end:b.slotEnd,title:exp?.name||'–',sub:(exp?.cat||'')+(exp?.expertise?' · '+exp.expertise:''),prob:b.problematique||'',type:'rdv',period:b.period,canCancel:hasCode};
  }).sort((a,b)=>a.time.localeCompare(b.time));

  const atelierItems = ins.map(i=>{
    const at=DATA.ateliers.find(a=>a.id===i.atelierId);
    return{id:i.id,time:at?.start||'',end:at?.end||'',title:at?.titre||'–',sub:at?.salle||'',type:'atelier',period:at?.period||'',canCancel:hasCode};
  }).sort((a,b)=>a.time.localeCompare(b.time));

  const waitItems = waits.map(w=>{
    const exp=w.expId?DATA.exposants.find(e=>e.id===w.expId):null;
    const at=w.atelierId?DATA.ateliers.find(a=>a.id===w.atelierId):null;
    const queue=w.expId?waitPosRdv(w.expId,w.slotStart):waitPosAtelier(w.atelierId);
    const pos=queue.findIndex(x=>x.id===w.id)+1;
    return{id:w.id,time:w.slotStart||at?.start||'',end:w.slotEnd||at?.end||'',title:exp?.name||at?.titre||'–',sub:exp?(exp.cat+(exp.expertise?' · '+exp.expertise:'')):(at?.salle||''),subType:exp?'RDV':'Atelier',type:w.expId?'rdv':'atelier',period:w.period||at?.period||'',canCancel:hasCode,waitPos:pos};
  }).sort((a,b)=>a.time.localeCompare(b.time));

  function planItem(item, isWait=false){
    const isPm=item.period==='aprem', isAt=item.type==='atelier';
    const cls=isWait?'wait-item-red':(isAt?(isPm?'at-pm':'at-am'):(isPm?'rdv-pm':'rdv-am'));
    const timeColor=isWait?'#B85C1A':(isAt?'#3B6D11':(isPm?'#B8940A':'var(--cyan)'));
    const badge=isWait
      ?`<span class="pi-type" style="background:#B85C1A;color:#fff">Att. #${item.waitPos}</span>`
      :(isAt?'<span class="pi-type type-at">Atelier</span>':'<span class="pi-type type-rdv">RDV</span>');
    const dataType=isWait?('wait-'+(isAt?'atelier':'rdv')):item.type;
    const cancelBtn=item.canCancel
      ?`<button class="cancel-rdv-btn" data-id="${item.id}" data-type="${dataType}" data-title="${item.title}" data-time="${item.time}"><i class="ti ti-trash"></i></button>`:'';
    return`<div class="planning-item ${cls}">
      <div class="pi-time" style="color:${timeColor}">${item.time}–${item.end}</div>
      <div class="pi-info">
        <div class="pi-title">${item.title}${isWait?` <span style="font-size:11px;font-weight:400;color:#B85C1A">(${item.subType})</span>`:''}</div>
        <div class="pi-sub">${item.sub}${!isWait&&item.prob?' · "'+item.prob+'"':''}</div>
      </div>
      ${badge}${cancelBtn}
    </div>`;
  }

  const sectionTitle = (icon, label, count, color='var(--cyan)') =>
    `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${color};display:flex;align-items:center;gap:6px;margin:1.25rem 0 .5rem;padding-bottom:.4rem;border-bottom:2px solid ${color}22">
      <i class="ti ${icon}"></i> ${label} <span style="font-weight:400;font-size:11px;opacity:.7">${count}</span>
    </div>`;

  const hasAnything = rdvItems.length||atelierItems.length||waitItems.length;
  if(!hasAnything){result.innerHTML='<div class="rdv-empty"><i class="ti ti-calendar-off"></i><p>Aucun élément trouvé.</p></div>';return;}

  result.innerHTML=`
    <div class="mes-rdv-header">
      <div style="font-size:15px;font-weight:700">${first?.prenom||''} ${first?.nom||''}</div>
      <div style="font-size:13px;color:var(--ink3);margin-top:2px">${rdvItems.length} RDV · ${atelierItems.length} atelier${atelierItems.length>1?'s':''} · ${waitItems.length?waitItems.length+' en attente · ':''}22 septembre 2026</div>
      ${!hasCode
        ?'<div style="font-size:12px;color:#B8940A;background:#FFF8E6;border:1px solid #FFD82B;border-radius:6px;padding:6px 10px;margin-top:8px"><i class="ti ti-lock"></i> Mode lecture seule — saisissez votre code pour annuler.</div>'
        :'<div style="font-size:12px;color:#2E6B12;background:#EAF3DE;border:1px solid #6BAA38;border-radius:6px;padding:6px 10px;margin-top:8px"><i class="ti ti-lock-open"></i> Accès complet — vous pouvez annuler.</div>'}
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--brd);font-size:11px;color:var(--ink3)">
        Conformément au RGPD, vous pouvez demander la suppression de vos données en contactant
        <a href="mailto:communication@paris-initiative.org" style="color:var(--cyan)">communication@paris-initiative.org</a> ·
        <a href="rgpd.html" style="color:var(--cyan)">Politique de confidentialité</a>
      </div>
    </div>

    ${rdvItems.length?sectionTitle('ti-users','RDV Individuels',rdvItems.length,'var(--cyan)')+rdvItems.map(i=>planItem(i,false)).join(''):''}
    ${atelierItems.length?sectionTitle('ti-school','Ateliers',atelierItems.length,'#3B6D11')+atelierItems.map(i=>planItem(i,false)).join(''):''}
    ${waitItems.length?sectionTitle("ti-clock","Liste d'attente",waitItems.length,"#B85C1A")+waitItems.map(i=>planItem(i,true)).join(''):''}
  `;

  result.querySelectorAll('.cancel-rdv-btn').forEach(btn=>{
    const t=btn.dataset.type;
    if(t==='wait-rdv'||t==='wait-atelier'){
      btn.addEventListener('click',async()=>{
        if(!confirm(`Quitter la liste d'attente pour "${btn.dataset.title}" ?`))return;
        loader(true);
        try{
          await deleteDoc(doc(db,'waitlist',btn.dataset.id));
          DATA.waitlist=DATA.waitlist.filter(w=>w.id!==btn.dataset.id);
          toast(`Retiré de la liste d'attente.`);searchMonPlanning();
        }catch(e){console.error(e);toast('Erreur.');}
        loader(false);
      });
    } else {
      btn.addEventListener('click',()=>cancelItem(btn.dataset.id,btn.dataset.type,btn.dataset.title,btn.dataset.time));
    }
  });
}

async function cancelItem(id,type,title,time){
  if(!confirm(`Annuler ${type==='rdv'?'votre RDV':'votre inscription à l\'atelier'} "${title}" à ${time} ?`))return;
  loader(true);
  try{
    const item = type==='rdv'
      ? DATA.bookings.find(b=>b.id===id)
      : DATA.inscriptions.find(i=>i.id===id);
    await deleteDoc(doc(db,type==='rdv'?'bookings':'inscriptions',id));
    if(type==='rdv'){
      DATA.bookings=DATA.bookings.filter(b=>b.id!==id);
      // Promouvoir le premier de la liste d'attente
      if(item) await promoteWaitlistRdv(item.exposantId, item.slotStart);
    } else {
      DATA.inscriptions=DATA.inscriptions.filter(i=>i.id!==id);
      if(item) await promoteWaitlistAtelier(item.atelierId);
    }
    toast('Annulé.');searchMonPlanning();renderAteliersGrid();
    if(type==='rdv'&&item)openDrawer(item.exposantId);
  }catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

/* ── Profil exposant public ───────────────────────────────────── */
async function searchExposantPlanning(){
  const emailInput=(el('exp-email-input')?.value||'').trim().toLowerCase();
  const result=el('exp-result');if(!result||!emailInput)return;
  loader(true);
  // Reload to get fresh data
  try{
    const[bS,aS,iS]=await Promise.all([getDocs(query(collection(db,'bookings'),orderBy('slotStart'))),getDocs(query(collection(db,'ateliers'),orderBy('start'))),getDocs(collection(db,'inscriptions'))]);
    DATA.bookings=bS.docs.map(d=>({id:d.id,...d.data()}));
    DATA.ateliers=aS.docs.map(d=>({id:d.id,...d.data()}));
    DATA.inscriptions=iS.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){console.error(e);}
  const exp=DATA.exposants.find(e=>(e.email||'').toLowerCase()===emailInput);
  if(!exp){result.innerHTML='<div class="rdv-empty"><i class="ti ti-search"></i><p>Aucun exposant trouvé avec cet email.</p></div>';loader(false);return;}
  const rdvs=DATA.bookings.filter(b=>b.exposantId===exp.id).sort((a,b)=>a.slotStart.localeCompare(b.slotStart));
  const ateliers=DATA.ateliers.filter(at=>(at.animateurs||[]).includes(exp.id)).sort((a,b)=>a.start.localeCompare(b.start));
  result.innerHTML=`<div class="mes-rdv-header" style="margin-bottom:1rem">
    <div style="font-size:16px;font-weight:700;color:var(--cyan)">${exp.name}</div>
    <div style="font-size:13px;color:var(--ink3)">${exp.cat}${exp.expertise?' · '+exp.expertise:''}</div>
    ${exp.adresse?`<div style="font-size:12px;color:var(--ink3);margin-top:4px"><i class="ti ti-map-pin" style="font-size:12px"></i> ${exp.adresse}</div>`:''}
    <div style="font-size:13px;margin-top:8px"><strong>${rdvs.length}</strong> RDV · <strong>${ateliers.length}</strong> atelier${ateliers.length>1?'s':''} animé${ateliers.length>1?'s':''}</div>
  </div>
  ${rdvs.length?`<div class="planning-section-title">RDV individuels</div>`+rdvs.map(b=>{const isPm=b.period==='aprem';return`<div class="planning-item ${isPm?'rdv-pm':'rdv-am'}"><div class="pi-time" style="color:${isPm?'#B8940A':'var(--cyan)'}">${b.slotStart}–${b.slotEnd}</div><div class="pi-info"><div class="pi-title">${b.prenom} ${b.nom}</div><div class="pi-sub">${b.email||''}</div></div><span class="pi-type type-rdv">${isPm?'Ap-m':'Matin'}</span></div>`;}).join(''):''}
  ${ateliers.length?`<div class="planning-section-title">Ateliers animés</div>`+ateliers.map(at=>{const isPm=at.period==='aprem';const inscrits=DATA.inscriptions.filter(i=>i.atelierId===at.id).length;return`<div class="planning-item ${isPm?'at-pm':'at-am'}"><div class="pi-time" style="color:${isPm?'#B8940A':'#3B6D11'}">${at.start}–${at.end}</div><div class="pi-info"><div class="pi-title">${at.titre}</div><div class="pi-sub">${at.salle} · ${inscrits} inscrit${inscrits>1?'s':''}</div></div><span class="pi-type type-at">Atelier</span></div>`;}).join(''):''}`;
  loader(false);
}

/* ── Mode visiteur ───────────────────────────────────────────── */

function applyModeUI() {
  // Supprimer bannière existante
  document.querySelector('.mode-banner')?.remove();

  // Bandeau code personnel — visible en inscription et préinscription
  const codeBanner = el('code-info-banner');
  if(codeBanner) {
    codeBanner.style.display = (PLATFORM_MODE === 'lecture') ? 'none' : 'block';
  }

  if(PLATFORM_MODE === 'inscription') return; // rien à faire pour le mode banner

  const banner = document.createElement('div');

  if(PLATFORM_MODE === 'lecture') {
    banner.className = 'mode-banner lecture';
    banner.innerHTML = `<i class="ti ti-eye"></i>
      <span><strong>Consultation uniquement</strong> — Les inscriptions ne sont pas encore ouvertes.
      Elles seront disponibles à partir du <strong>${DATA.config.lectureDate||'1er juillet 2026'}</strong>.
      Vous pouvez dès maintenant découvrir les experts et les ateliers proposés.</span>`;
  } else if(PLATFORM_MODE === 'preinscription') {
    banner.className = 'mode-banner preinscription';
    banner.innerHTML = `<i class="ti ti-pencil"></i>
      <span><strong>Préinscriptions ouvertes</strong> — Vos inscriptions sont enregistrées mais restent provisoires.
      Elles seront confirmées définitivement à l'ouverture officielle des inscriptions.</span>`;
  }

  // Insérer après la nav
  const nav = document.querySelector('.nav');
  if(nav && nav.nextSibling) nav.parentNode.insertBefore(banner, nav.nextSibling);
}

/* ── Navigation visiteur ──────────────────────────────────────── */
function switchVisitorTab(tab){
  applyModeUI();
  ['accueil','rdvs','ateliers','planning','exposant','exposants-list'].forEach(t=>{const e=el('tab-'+t);if(e)e.style.display=t===tab?'block':'none';});
  document.querySelectorAll('.vtab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  if(tab==='ateliers')renderAteliersGrid();
  if(tab==='rdvs')renderGrid();
  if(tab==='exposants-list')renderExposantsList();
  applyModeUI();
  if(tab==='accueil')renderAccueil();
}

/* ── Répertoire exposants ───────────────────────────────────────── */
function renderExposantsList() {
  const search = (el('el-search')?.value||'').toLowerCase();
  const catF   = el('el-cat')?.value||'';
  const grid   = el('exposants-list-grid'); if(!grid) return;

  // Populer filtre catégorie
  const catSel = el('el-cat');
  if(catSel){
    const cur  = catSel.value;
    const cats = [...new Set(DATA.exposants.map(e=>e.cat).filter(Boolean))].sort();
    catSel.innerHTML = '<option value="">Toutes catégories</option>' +
      cats.map(c=>`<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');
  }

  const list = DATA.exposants
    .filter(exp => {
      const ms = !search || (exp.name+' '+exp.cat+' '+(exp.expertise||'')).toLowerCase().includes(search);
      const mc = !catF || exp.cat === catF;
      return ms && mc;
    })
    .sort((a,b)=>(a.name||'').localeCompare(b.name||''));

  if(!list.length){
    grid.innerHTML='<div class="empty-state"><i class="ti ti-building-community"></i><p>Aucun exposant trouvé.</p></div>';
    return;
  }

  grid.innerHTML = list.map(exp=>{
    const hasRdv = exp.period !== 'aucun';
    const slots  = hasRdv ? getSlots(exp.id) : [];
    const free   = slots.filter(s=>s.enabled&&!getBooking(exp.id,s.start)).length;
    return`<div class="exposant-list-card">
      <div class="elc-header">
        <div class="avatar" style="width:48px;height:48px;font-size:15px;flex-shrink:0">${initials(exp.name)}</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:700;color:var(--ink)">${exp.name}</div>
          <div style="font-size:12px;color:var(--cyan-d);font-weight:500">${exp.cat||''}</div>
          ${exp.expertise?`<div style="font-size:12px;color:var(--ink3)">${exp.expertise}</div>`:''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          ${hasRdv?`<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:var(--cyan-l);color:var(--cyan-d);font-weight:600">${free} créneau${free>1?'x':''} libre${free>1?'s':''}</span>`:'<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:#f5f5f5;color:var(--ink3)">Présence seule</span>'}
        </div>
      </div>
      <div class="elc-footer">
        ${exp.website?`<a href="${exp.website.startsWith('http')?exp.website:'https://'+exp.website}" target="_blank" rel="noopener" class="btn-ghost" style="padding:5px 12px;font-size:12px;text-decoration:none"><i class="ti ti-world"></i> Site web</a>`:''}
        ${hasRdv?`<button class="btn-primary" data-exp-id="${exp.id}" style="padding:5px 12px;font-size:12px"><i class="ti ti-calendar-plus"></i> Prendre RDV</button>`:''}
      </div>
    </div>`;
  }).join('');

  // Brancher boutons RDV
  grid.querySelectorAll('[data-exp-id]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      switchVisitorTab('rdvs');
      setTimeout(()=>openDrawer(btn.dataset.expId),300);
    });
  });
}

/* ── Page d'accueil ─────────────────────────────────────────────── */
function renderAccueil(){
  const rdvNum=el('rdv-count-num'), atNum=el('at-count-num');
  if(rdvNum) rdvNum.textContent=DATA.exposants.length;
  if(atNum)  atNum.textContent=DATA.ateliers.length;
  // Brancher les boutons des cartes
  document.querySelectorAll('.accueil-card-btn, [data-goto]').forEach(btn=>{
    btn.onclick=()=>switchVisitorTab(btn.dataset.goto);
  });
}

/* ── Logique mode plateforme ─────────────────────────────────── */


function renderModeAdmin() {
  // Surligner la carte active
  ['lecture','preinscription','inscription'].forEach(m => {
    const card = el('mc-'+m);
    if(!card) return;
    card.className = 'mode-card' + (PLATFORM_MODE===m ? (m==='preinscription'?' active-mode-pre':m==='inscription'?' active-mode-ins':' active-mode') : '');
    const btn = card.querySelector('.mode-btn');
    if(btn) btn.textContent = PLATFORM_MODE===m ? '✓ Actif' : 'Activer';
    if(btn) btn.disabled = PLATFORM_MODE===m;
  });

  const cur = el('mode-current');
  if(cur){
    const labels={'lecture':'👁️ Lecture seule','preinscription':'📋 Préinscription','inscription':'✅ Inscription définitive'};
    cur.textContent = `Mode actuel : ${labels[PLATFORM_MODE]||PLATFORM_MODE}`;
  }

  // Stats validation
  const preRdv  = DATA.bookings.filter(b=>b.mode==='preinscription'&&!b.confirmed).length;
  const preAt   = DATA.inscriptions.filter(i=>i.mode==='preinscription'&&!i.confirmed).length;
  const confRdv = DATA.bookings.filter(b=>b.mode==='preinscription'&&b.confirmed).length;
  const vs = el('validation-stats');
  if(vs) vs.innerHTML = `${preRdv} RDV préinscrits non confirmés · ${preAt} ateliers préinscrits non confirmés · ${confRdv} RDV confirmés`;
}

async function launchValidation() {
  const preRdv = DATA.bookings.filter(b=>b.mode==='preinscription'&&!b.confirmed);
  const preAt  = DATA.inscriptions.filter(i=>i.mode==='preinscription'&&!i.confirmed);
  if(!preRdv.length&&!preAt.length){toast('Aucune préinscription à valider.');return;}
  if(!confirm(`Lancer la validation pour ${preRdv.length} RDV et ${preAt.length} ateliers préinscrits ? Les visiteurs auront 24h pour confirmer depuis "Mon Planning".`))return;
  loader(true);
  try{
    // Marquer la date limite de validation dans config
    await setDoc(doc(db,'config','validation'),{
      launchedAt: Date.now(),
      deadlineAt: Date.now() + 24*60*60*1000,
    });
    toast('Demande de validation lancée ! Les visiteurs sont informés à leur prochaine connexion.');
    renderModeAdmin();
  }catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

async function cancelUnconfirmed() {
  const preRdv = DATA.bookings.filter(b=>b.mode==='preinscription'&&!b.confirmed);
  const preAt  = DATA.inscriptions.filter(i=>i.mode==='preinscription'&&!i.confirmed);
  if(!confirm(`Annuler ${preRdv.length} RDV et ${preAt.length} ateliers non confirmés ? Les créneaux seront redistribués aux listes d'attente.`))return;
  loader(true);
  try{
    const batch=writeBatch(db);
    preRdv.forEach(b=>batch.delete(doc(db,'bookings',b.id)));
    preAt.forEach(i=>batch.delete(doc(db,'inscriptions',i.id)));
    await batch.commit();
    // Redistribuer
    for(const b of preRdv){DATA.bookings=DATA.bookings.filter(x=>x.id!==b.id);await promoteWaitlistRdv(b.exposantId,b.slotStart);}
    for(const i of preAt){DATA.inscriptions=DATA.inscriptions.filter(x=>x.id!==i.id);await promoteWaitlistAtelier(i.atelierId);}
    renderModeAdmin();renderStats();updateBadges();
    toast(`${preRdv.length} RDV et ${preAt.length} ateliers annulés et redistribués.`);
  }catch(e){console.error(e);toast('Erreur.');}
  loader(false);
}

/* ── Init ─────────────────────────────────────────────────────── */
/* ── Statuts juridiques ───────────────────────────────────────── */
const STATUTS = [
  { label: 'Auto-entrepreneur / Micro-entreprise',   cat: 'Entreprise individuelle' },
  { label: 'Entreprise Individuelle (EI)',            cat: 'Entreprise individuelle' },
  { label: 'EIRL',                                    cat: 'Entreprise individuelle' },
  { label: 'EURL',                                    cat: 'Société unipersonnelle' },
  { label: 'SASU',                                    cat: 'Société unipersonnelle' },
  { label: 'SARL',                                    cat: 'Société à responsabilité limitée' },
  { label: 'SAS',                                     cat: 'Société par actions' },
  { label: 'SA',                                      cat: 'Société par actions' },
  { label: 'SNC',                                     cat: 'Société en nom collectif' },
  { label: 'SCS',                                     cat: 'Société en commandite' },
  { label: 'SCA',                                     cat: 'Société en commandite' },
  { label: 'SCOP (Société Coopérative)',              cat: 'Coopérative' },
  { label: "SCIC (Société Coopérative d'Intérêt Collectif)", cat: 'Coopérative' },
  { label: "CAE (Coopérative d'Activité et d'Emploi)", cat: 'Coopérative' },
  { label: 'Association loi 1901',                    cat: 'Association' },
  { label: "Association reconnue d'utilité publique", cat: 'Association' },
  { label: 'Fondation',                               cat: 'Association' },
  { label: 'TPE (Très Petite Entreprise)', cat: "Taille d'entreprise" },
  { label: 'PME (Petite et Moyenne Entreprise)', cat: "Taille d'entreprise" },
  { label: 'ETI (Entreprise de Taille Intermédiaire)', cat: "Taille d'entreprise" },
  { label: "GIE (Groupement d'Intérêt Économique)", cat: 'Groupement' },
  { label: 'GEIE',                                    cat: 'Groupement' },
  { label: 'SCI (Société Civile Immobilière)',        cat: 'Société civile' },
  { label: 'SCM',                                     cat: 'Société civile' },
  { label: 'SCP',                                     cat: 'Société civile' },
  { label: 'Établissement public',                    cat: 'Secteur public' },
  { label: 'Collectivité territoriale',               cat: 'Secteur public' },
  { label: 'Projet en cours de création',             cat: 'Projet' },
  { label: 'Autre',                                   cat: 'Autre' },
];

function initStructureField(searchId, dropdownId, hiddenId, wrapId, societyId) {
  const searchEl   = el(searchId);
  const dropEl     = el(dropdownId);
  const hiddenEl   = el(hiddenId);
  const wrapEl     = el(wrapId);
  const societyEl  = el(societyId);
  if (!searchEl || !dropEl || !hiddenEl) return;

  function renderDropdown(filter) {
    const q = filter.toLowerCase();
    const filtered = STATUTS.filter(s => !q || s.label.toLowerCase().includes(q) || s.cat.toLowerCase().includes(q));
    if (!filtered.length) { dropEl.innerHTML = '<div class="structure-opt">Aucun résultat</div>'; }
    else {
      dropEl.innerHTML = filtered.map(s =>
        `<div class="structure-opt" data-val="${s.label}">${s.label}<span class="opt-cat">${s.cat}</span></div>`
      ).join('');
      dropEl.querySelectorAll('.structure-opt').forEach(opt => {
        opt.addEventListener('mousedown', e => {
          e.preventDefault();
          searchEl.value  = opt.dataset.val;
          hiddenEl.value  = opt.dataset.val;
          dropEl.classList.remove('open');
        });
      });
    }
    dropEl.classList.add('open');
  }

  searchEl.addEventListener('input', () => renderDropdown(searchEl.value));
  searchEl.addEventListener('focus', () => renderDropdown(searchEl.value));
  searchEl.addEventListener('blur',  () => setTimeout(() => dropEl.classList.remove('open'), 150));

  // Afficher/masquer le champ structure selon si société est remplie
  if (societyEl) {
    societyEl.addEventListener('input', () => {
      if (wrapEl) wrapEl.style.display = societyEl.value.trim() ? 'block' : 'none';
      if (!societyEl.value.trim()) { searchEl.value = ''; hiddenEl.value = ''; }
    });
  }
}

/* ── Paramètres admin ─────────────────────────────────────────── */

function initParametres() {
  // Sélectionner le bon radio
  const radio = document.querySelector(`input[name="site-mode"][value="${DATA.config.mode}"]`);
  if(radio) radio.checked = true;
  const dateInput = el('lecture-date');
  if(dateInput) dateInput.value = DATA.config.lectureDate || '1er juillet 2026';
  updateLecturePreview();
  updateModeLabel();

  el('lecture-date')?.addEventListener('input', updateLecturePreview);
  el('save-mode-btn')?.addEventListener('click', saveMode);
  el('save-lecture-btn')?.addEventListener('click', saveLectureDate);
}

function updateLecturePreview() {
  const date = el('lecture-date')?.value || '1er juillet 2026';
  const prev = el('lecture-preview');
  if(prev) prev.innerHTML = `Les inscriptions seront ouvertes à partir du <strong>${date}</strong>. En attendant, vous pouvez consulter les experts et ateliers disponibles.`;
}

function updateModeLabel() {
  const labels = { lecture: 'Lecture seule', preinscription: 'Préinscription', inscription: 'Inscription définitive' };
  const el2 = el('mode-current-label');
  if(el2) el2.textContent = labels[DATA.config.mode] || '–';
}

async function saveMode() {
  const selected = document.querySelector('input[name="site-mode"]:checked')?.value;
  if(!selected) { toast('Choisissez un mode.'); return; }
  loader(true);
  try {
    const cfgRef = doc(db,'config','siteConfig');
    await setDoc(cfgRef, { mode: selected, lectureDate: DATA.config.lectureDate || '1er juillet 2026' });
    PLATFORM_MODE = selected;
    DATA.config.mode = selected;
    updateModeLabel();
    toast(`Mode "${selected}" activé !`);
  } catch(e) { console.error(e); toast('Erreur.'); }
  loader(false);
}

async function saveLectureDate() {
  const date = el('lecture-date')?.value.trim();
  if(!date) { toast('Saisissez une date.'); return; }
  loader(true);
  try {
    const cfgRef = doc(db,'config','siteConfig');
    await setDoc(cfgRef, { mode: DATA.config.mode, lectureDate: date });
    DATA.config.lectureDate = date;
    updateLecturePreview();
    toast('Date enregistrée !');
  } catch(e) { console.error(e); toast('Erreur.'); }
  loader(false);
}

const IS_ADMIN=!!el('admin-app'), IS_VISITOR=!!el('grid');

if(IS_ADMIN){
  el('add-btn').addEventListener('click',toggleAddForm);
  el('form-cancel').addEventListener('click',toggleAddForm);
  el('form-submit').addEventListener('click',addExposant);
  el('add-atelier-btn')?.addEventListener('click',()=>openAtelierForm());
  el('atelier-form-cancel')?.addEventListener('click',()=>{el('atelier-form').classList.remove('open');editAtelier=null;});
  el('atelier-form-submit')?.addEventListener('click',saveAtelier);
  document.querySelectorAll('.atab').forEach(btn=>btn.addEventListener('click',()=>switchAdminTab(btn.dataset.tab)));
  el('rdv-filter-exp')?.addEventListener('change',renderRdvList);
  el('rdv-filter-period')?.addEventListener('change',renderRdvList);
  el('export-csv')?.addEventListener('click',exportCsv);
  el('vis-admin-search')?.addEventListener('input',renderVisiteursList);
  // Onglet mode
  document.querySelectorAll('.mode-btn').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const m=btn.dataset.mode;
      loader(true);
      await setPlatformMode(m);
      renderModeAdmin();
      toast(`Mode "${m}" activé.`);
      loader(false);
    });
  });
  el('btn-launch-validation')?.addEventListener('click',launchValidation);
  el('btn-cancel-unconfirmed')?.addEventListener('click',cancelUnconfirmed);
  initLogin();
}

if(IS_VISITOR){
  document.querySelectorAll('.vtab').forEach(btn=>btn.addEventListener('click',()=>switchVisitorTab(btn.dataset.tab)));
  // Accueil actif par défaut
  switchVisitorTab('accueil');
  el('vis-search').addEventListener('input',renderGrid);
  el('vis-cat').addEventListener('change',renderGrid);
  el('vis-expertise')?.addEventListener('change',renderGrid);
  document.querySelectorAll('.pf').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.pf').forEach(b=>b.classList.remove('active'));btn.classList.add('active');periodFilter=btn.dataset.p;renderGrid();}));
  document.querySelectorAll('.at-pf').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.at-pf').forEach(b=>b.classList.remove('active'));btn.classList.add('active');atPeriodFilter=btn.dataset.p;renderAteliersGrid();}));
  el('at-search')?.addEventListener('input',renderAteliersGrid);
  el('el-search')?.addEventListener('input',renderExposantsList);
  el('el-cat')?.addEventListener('change',renderExposantsList);
  el('at-cat')?.addEventListener('change',renderAteliersGrid);
  el('overlay').addEventListener('click',closeDrawer);
  el('drawer-close').addEventListener('click',closeDrawer);
  el('modal-close').addEventListener('click',closeModal);
  el('modal-cancel').addEventListener('click',closeModal);
  el('modal-confirm').addEventListener('click',confirmBooking);
  el('modal').addEventListener('click',e=>{if(e.target===el('modal'))closeModal();});
  el('ma-close').addEventListener('click',()=>el('modal-atelier').classList.remove('open'));
  el('ma-cancel').addEventListener('click',()=>el('modal-atelier').classList.remove('open'));
  el('ma-confirm').addEventListener('click',confirmAtelier);
  el('modal-atelier').addEventListener('click',e=>{if(e.target===el('modal-atelier'))el('modal-atelier').classList.remove('open');});
  // Sélecteurs de structure
  initStructureField('m-structure-search',  'm-structure-dropdown',  'm-structure',  'm-structure-wrap',  'm-societe');
  initStructureField('ma-structure-search', 'ma-structure-dropdown', 'ma-structure', 'ma-structure-wrap', 'ma-societe');

  el('mes-search-btn').addEventListener('click',searchMonPlanning);
  el('mes-search-input').addEventListener('keydown',e=>{if(e.key==='Enter')searchMonPlanning();});
  el('exp-search-btn')?.addEventListener('click',searchExposantPlanning);
  el('exp-email-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchExposantPlanning();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeDrawer();el('modal-atelier')?.classList.remove('open');}});
  loadAll().then(()=>{applyModeUI();renderAccueil();renderGrid();renderAteliersGrid();});
}