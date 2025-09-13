/* ========= RSM Core (state, utils, seeds) ========= */
const THEME = {primary:'#412e7e', accent:'#9b5dc9', blue:'#6e84de', blue2:'#a6c2f4', lav:'#b687e2'};
const STORAGE_KEY = 'rsm_projects_v1';
const URGENCY_THRESHOLDS = { orange: 7, yellow: 14 };
const ENABLE_PHP_DEFAULT = true;
const ENABLE_GCAL = true;
const DEFAULT_EVENT_HOUR = 9;

let ENABLE_PHP = ENABLE_PHP_DEFAULT;

/* ---------- Utils ---------- */
const $ = (sel, ctx=document)=>ctx.querySelector(sel);
const $$ = (sel, ctx=document)=>Array.from(ctx.querySelectorAll(sel));
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'id-'+Math.random().toString(36).slice(2);
const fmtMoney = (n)=> (Number(n)||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const todayISO = ()=> new Date().toISOString();
const daysLeft = (deadline)=>{
  const d = new Date(deadline);
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.ceil((d - now)/(1000*60*60*24));
  return diff;
};
const badgeForDays = (d)=>{
  if (d<=0) return 'deadline-red';
  if (d<=URGENCY_THRESHOLDS.orange) return 'deadline-orange';
  if (d<=URGENCY_THRESHOLDS.yellow) return 'deadline-yellow';
  return 'deadline-green';
};
/* ---------- SVG Sprite Loader (inline for cross-browser) ---------- */
(async function loadSvgSprite(){
  try{
    const res = await fetch('./assets/icons.svg', {cache:'no-store'});
    const svg = await res.text();
    const holder = document.createElement('div');
    holder.setAttribute('aria-hidden','true');
    holder.style.position='absolute'; holder.style.width='0'; holder.style.height='0'; holder.style.overflow='hidden';
    holder.innerHTML = svg;
    document.body.prepend(holder);
  }catch(e){ console.warn('SVG sprite not loaded', e); }
})();

function listAllItems(project){
  let total=0, done=0, estTotal=0, estDone=0, tasksWithDeadline=[];
  (project.phases||[]).forEach(ph=>{
    (ph.tasks||[]).forEach(t=>{
      if (t.deadline) tasksWithDeadline.push(t);
      total++; estTotal += Number(t.est_h||0);
      if(t.done){ done++; estDone += Number(t.est_h||0); }
      (t.subs||[]).forEach(s=>{
        total++;
        if(s.done) done++;
      });
    });
  });
  return {total, done, estTotal, estDone, tasksWithDeadline};
}
const computeProgress = (project)=>{
  const { estTotal, estDone } = listAllItems(project);
  return estTotal > 0 ? Math.round(estDone * 100 / estTotal) : 0;
};

/* ---------- Burndown ---------- */
function computeBurndown(project){
  const {estTotal, estDone} = listAllItems(project);
  const dLeft = Math.max(1, daysLeft(project.deadline));
  const days = [];
  for(let i=0;i<=dLeft;i++){ days.push(i); }
  const ideal = days.map((d,i)=> Math.max(0, Math.round(estTotal - (estTotal/dLeft)*i)));
  const realStart = Math.max(0, Math.round(estTotal - estDone));
  const real = days.map((d,i)=> {
    // Correction : Utilisation de l'opérateur de chaînage optionnel `?.`
    const progressToday = project.metrics?.burndown?.find(j=>j.date===new Date().toISOString().slice(0,10))?.remaining;
    if (i===0 && progressToday !== undefined) return progressToday;
    return Math.max(0, realStart - Math.round((estDone/dLeft)*i));
  });
  return {labels: days.map(d=>'J-'+(dLeft-d)), ideal, real};
}

function updateBurndownJournal(project){
  if(!project.metrics) project.metrics={};
  if(!project.metrics.burndown) project.metrics.burndown=[];
  const {estTotal, estDone} = listAllItems(project);
  const remaining = Math.max(0, Math.round(estTotal - estDone));
  const yyyyMMdd = new Date().toISOString().slice(0,10);
  const existing = project.metrics.burndown.find(x=>x.date===yyyyMMdd);
  if(existing) existing.remaining = remaining;
  else project.metrics.burndown.push({date: yyyyMMdd, remaining});
}

/* ---------- Storage ---------- */
async function loadState(){
  if(ENABLE_PHP){
    try {
      const projects = await apiFetch('api/projects.php');
      const hydratedProjects = await Promise.all(projects.map(async p=>{
        const phases = await apiFetch(`api/phases.php?project_id=${p.id}`);
        p.phases = await Promise.all(phases.map(async ph=>{
          const tasks = await apiFetch(`api/tasks.php?phase_id=${ph.id}`);
          ph.tasks = await Promise.all(tasks.map(async t=>{
            const subs = await apiFetch(`api/substacks.php?task_id=${t.id}`);
            t.subs = subs;
            return t;
          }));
          return ph;
        }));
        return p;
      }));
      return { projects: hydratedProjects };
    } catch(e) {
      console.error('API load failed, falling back to local storage', e);
      return { projects:[] };
    }
  }
  return { projects:[] };
}
function loadLocalState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    try { return JSON.parse(raw); } catch { return seed(); }
  }
  const s = seed(); saveState(s); return s;
}
function saveState(state){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
async function getProject(id){
    const state = await loadState();
    return state.projects.find(p=>p.id===id);
}
async function upsertProject(p){
  p.updatedAt = todayISO();
  if(ENABLE_PHP){
    try{
      await apiFetch('api/projects.php',{method:'POST', body:JSON.stringify(p)});
    } catch(e){ console.error('API save failed', e); }
  }
}
/* ---------- Import/Export ---------- */
function exportMarkdown(project){
  const lines=[];
  lines.push(`# ${project.name} — ${project.client}`);
  lines.push(`**Type**: ${project.type}  `);
  lines.push(`**Statut**: ${project.status}  `);
  lines.push(`**Deadline**: ${project.deadline} (J-${daysLeft(project.deadline)})  `);
  lines.push(`**Montants**: ${fmtMoney(project.amount)} | Payé: ${fmtMoney(project.paid)} | Reste: ${fmtMoney((project.amount||0)-(project.paid||0))}`);
  if(project.contact?.email) lines.push(`**Email**: ${project.contact.email}`);
  if(project.contact?.phone) lines.push(`**Téléphone**: ${project.contact.phone}`);
  lines.push('');
  (project.phases||[]).forEach(ph=>{
    lines.push(`## ${ph.name}`);
    (ph.tasks||[]).forEach(t=>{
      lines.push(`- [${t.done?'x':' '}] ${t.label} ${t.est_h?`(${t.est_h}h)`:''}${t.deadline?` — Deadline: ${t.deadline}`:''}`);
      (t.subs||[]).forEach(s=>{
        lines.push(`  - [${s.done?'x':' '}] ${s.label}`);
      });
    });
    lines.push('');
  });
  const blob = new Blob([lines.join('\n')], {type:'text/markdown'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${project.name.replace(/\s+/g,'_')}.md`; a.click();
}
function exportICS(items){
  const pad=v=>String(v).padStart(2,'0');
  const dt=(d,h)=>{ const x=new Date(d); x.setHours(h,0,0,0);
    const y=x.getUTCFullYear(), m=pad(x.getUTCMonth()+1), da=pad(x.getUTCDate()), hh=pad(x.getUTCHours()), mm=pad(x.getUTCMinutes()), ss='00';
    return `${y}${m}${da}T${hh}${mm}${ss}Z`;
  };
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//RSM//Deadlines//FR"];
  items.forEach(item=>{
    const start=dt(item.deadline, DEFAULT_EVENT_HOUR);
    const end=dt(item.deadline, DEFAULT_EVENT_HOUR+1);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${item.id}@rsm`);
    lines.push(`DTSTAMP:${dt(new Date().toISOString().slice(0,10),12)}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${item.name} – ${item.client}`);
    lines.push(`DESCRIPTION:${location.origin}/project.html?id=${item.project_id||item.id}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join('\n')],{type:'text/calendar'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='rsm-deadlines.ics'; a.click();
}

/* ---------- Page Templates ---------- */
const PAGE_TEMPLATES_COMMON = (title)=>({
  id: uuid(), label:`Page : ${title}`, done:false, est_h: 3, tools:'WP/Elementor', deadline:'',
  subs:[
    {id:uuid(), label:'Contenu', done:false},
    {id:uuid(), label:'Design', done:false},
    {id:uuid(), label:'Build', done:false},
    {id:uuid(), label:'SEO', done:false},
    {id:uuid(), label:'A11y/Perf', done:false},
    {id:uuid(), label:'QA/Tracking', done:false},
  ]
});

const WOOCOMMERCE_TEMPLATE = (name, client, deadline) => ({
  id: uuid(), name, client, type: 'WooCommerce', status: 'En cours', deadline, amount: 0, paid: 0,
  notes: "Modèle de projet détaillé pour un site e-commerce avec WooCommerce.",
  phases: [
    { id: uuid(), name: 'Phase 1 – Cadrage & Fondations', sort: 0, tasks: [
      { id: uuid(), label: '1.1 Atelier de cadrage', done: false, est_h: 8, tools: '', deadline: '', sort: 0, subs: [
        { id: uuid(), label: 'Préparer ordre du jour (0,25 j)', done: false, sort: 0 },
        { id: uuid(), label: 'Réunion avec cliente (0,5 j)', done: false, sort: 1 },
        { id: uuid(), label: 'Formaliser objectifs business (0,25 j)', done: false, sort: 2 },
        { id: uuid(), label: 'Définir contraintes (budget, délais, charte) (0,25 j)', done: false, sort: 3 }
      ] },
      { id: uuid(), label: '1.2 Arborescence & user-flows', done: false, est_h: 4, tools: '', deadline: '', sort: 1, subs: [
        { id: uuid(), label: 'Lister pages e-commerce nécessaires (0,25 j)', done: false, sort: 0 },
        { id: uuid(), label: 'Définir structure (Accueil > Catégories > Produits > Checkout) (0,25 j)', done: false, sort: 1 },
        { id: uuid(), label: 'Dessiner parcours utilisateur (fiche > panier > paiement) (0,25 j)', done: false, sort: 2 }
      ] },
      { id: uuid(), label: '1.3 Stack & environnements', done: false, est_h: 4, tools: '', deadline: '', sort: 2, subs: [
        { id: uuid(), label: 'Choisir thème (FSE ou Hello+builder) (0,25 j)', done: false, sort: 0 },
        { id: uuid(), label: 'Créer staging chez Ionos (0,25 j)', done: false, sort: 1 },
        { id: uuid(), label: 'Installer WP + WooCommerce (0,25 j)', done: false, sort: 2 },
        { id: uuid(), label: 'Configurer Git/dépôt versionning (0,25 j)', done: false, sort: 3 },
        { id: uuid(), label: 'Mettre en place sauvegarde auto (UpdraftPlus) (0,25 j)', done: false, sort: 4 }
      ] },
      { id: uuid(), label: '1.4 Design tokens', done: false, est_h: 2, tools: '', deadline: '', sort: 3, subs: [
        { id: uuid(), label: 'Palette couleurs validée (rouge pampille + vert sauge) (0,25 j)', done: false, sort: 0 },
        { id: uuid(), label: 'Typographies fixées (Playfair/Lora + sans-serif) (0,25 j)', done: false, sort: 1 },
        { id: uuid(), label: 'Boutons & icônes standards définis (0,25 j)', done: false, sort: 2 }
      ] },
      { id: uuid(), label: '1.5 Catalogue – cadrage', done: false, est_h: 2, tools: '', deadline: '', sort: 4, subs: [
        { id: uuid(), label: 'Confirmer volume (140 BO)', done: false, sort: 0 },
        { id: uuid(), label: 'Définir attributs (matière, couleur, finition, attache) (0,25 j)', done: false, sort: 1 },
        { id: uuid(), label: 'Définir règle SKU (BO-MAT-COL-FIN-ATT-###) (0,25 j)', done: false, sort: 2 },
        { id: uuid(), label: 'Créer modèle CSV (colonnes min + variations) (0,25 j)', done: false, sort: 3 }
      ] },
      { id: uuid(), label: '1.6 RACI + plan sprints', done: false, est_h: 2, tools: '', deadline: '', sort: 5, subs: [
        { id: uuid(), label: 'Attribuer rôles (CP, Dev, UX, Client, Photographe, SEO)', done: false, sort: 0 },
        { id: uuid(), label: 'Publier roadmap', done: false, sort: 1 }
      ] }
    ] },
    { id: uuid(), name: 'Phase 2 – UX/UI & Thème', sort: 1, tasks: [
      { id: uuid(), label: '2.1 Wireframes', done: false, est_h: 12, tools: '', deadline: '', sort: 0, subs: [
        { id: uuid(), label: 'Croquis rapides Accueil/Boutique/Produit (0,5 j)', done: false, sort: 0 },
        { id: uuid(), label: 'Wireframes détaillés (desktop + mobile) (1 j)', done: false, sort: 1 }
      ] },
      { id: uuid(), label: '2.2 Maquettes UI', done: false, est_h: 16, tools: '', deadline: '', sort: 1, subs: [
        { id: uuid(), label: 'Créer maquette Accueil (0,5 j)', done: false, sort: 0 },
        { id: uuid(), label: 'Créer maquette Boutique (0,5 j)', done: false, sort: 1 },
        { id: uuid(), label: 'Créer maquette Page Produit (0,5 j)', done: false, sort: 2 },
        { id: uuid(), label: 'Créer maquette Checkout (0,5 j)', done: false, sort: 3 }
      ] },
      { id: uuid(), label: '2.3 Intégration thème', done: false, est_h: 6, tools: '', deadline: '', sort: 2, subs: [
        { id: uuid(), label: 'Créer thème enfant (0,25 j)', done: false, sort: 0 },
        { id: uuid(), label: 'Importer typos, couleurs, boutons (0,25 j)', done: false, sort: 1 },
        { id: uuid(), label: 'Créer patterns Gutenberg (Accueil, Catégorie, Produit) (0,5 j)', done: false, sort: 2 },
        { id: uuid(), label: 'Accessibilité (contrastes, ARIA, labels) (0,25 j)', done: false, sort: 3 }
      ] }
    ] },
    { id: uuid(), name: 'Phase 3 – Catalogue & Contenus', sort: 2, tasks: [
      { id: uuid(), label: '3.1 Fiche produit type', done: false, est_h: 4, tools: '', deadline: '', sort: 0, subs: [
        { id: uuid(), label: 'Définir structure fiche', done: false, sort: 0 },
        { id: uuid(), label: 'Créer modèle texte', done: false, sort: 1 }
      ] },
      { id: uuid(), label: '3.2 Photos produits', done: false, est_h: 48, tools: '', deadline: '', sort: 1, subs: [
        { id: uuid(), label: 'Rédiger guidelines photo', done: false, sort: 0 },
        { id: uuid(), label: 'Planifier shooting', done: false, sort: 1 },
        { id: uuid(), label: 'Shooting test (10 produits)', done: false, sort: 2 },
        { id: uuid(), label: 'Shooting complet 140 produits', done: false, sort: 3 },
        { id: uuid(), label: 'Retouche/photos WebP', done: false, sort: 4 }
      ] },
      { id: uuid(), label: '3.3 Textes & SEO', done: false, est_h: 40, tools: '', deadline: '', sort: 2, subs: [
        { id: uuid(), label: 'Rédiger 140 titres optimisés', done: false, sort: 0 },
        { id: uuid(), label: 'Rédiger 140 desc courtes', done: false, sort: 1 },
        { id: uuid(), label: 'Rédiger 140 desc longues', done: false, sort: 2 },
        { id: uuid(), label: 'Créer FAQ générale + spécifique BO', done: false, sort: 3 }
      ] },
      { id: uuid(), label: '3.4 Import CSV', done: false, est_h: 24, tools: '', deadline: '', sort: 3, subs: [
        { id: uuid(), label: 'Construire CSV échantillon (10 BO)', done: false, sort: 0 },
        { id: uuid(), label: 'Importer test WooCommerce', done: false, sort: 1 },
        { id: uuid(), label: 'Corriger éventuelles erreurs', done: false, sort: 2 },
        { id: uuid(), label: 'Construire CSV complet (140 BO)', done: false, sort: 3 },
        { id: uuid(), label: 'Importer complet', done: false, sort: 4 },
        { id: uuid(), label: 'Vérifier variations & images', done: false, sort: 5 }
      ] }
    ] },
    { id: uuid(), name: 'Phase 4 – Paiements & Checkout', sort: 3, tasks: [
      { id: uuid(), label: '4.1 WooCommerce réglages', done: false, est_h: 3, tools: '', deadline: '', sort: 0, subs: [
        { id: uuid(), label: 'Devise EUR + TVA TTC', done: false, sort: 0 },
        { id: uuid(), label: 'Pages Woo auto-générées', done: false, sort: 1 },
        { id: uuid(), label: 'Personnalisation e-mails Woo', done: false, sort: 2 }
      ] },
      { id: uuid(), label: '4.2 Stripe', done: false, est_h: 2, tools: '', deadline: '', sort: 1, subs: [
        { id: uuid(), label: 'Installer module Stripe', done: false, sort: 0 },
        { id: uuid(), label: 'Configurer clés test', done: false, sort: 1 },
        { id: uuid(), label: 'Test paiement CB/Apple Pay', done: false, sort: 2 }
      ] },
      { id: uuid(), label: '4.3 PayPal', done: false, est_h: 2, tools: '', deadline: '', sort: 2, subs: [
        { id: uuid(), label: 'Installer module PayPal', done: false, sort: 0 },
        { id: uuid(), label: 'Configurer sandbox', done: false, sort: 1 },
        { id: uuid(), label: 'Test paiement', done: false, sort: 2 }
      ] },
      { id: uuid(), label: '4.4 Checkout UX', done: false, est_h: 2, tools: '', deadline: '', sort: 3, subs: [
        { id: uuid(), label: 'Optimiser champs', done: false, sort: 0 },
        { id: uuid(), label: 'Ajouter mentions légales au checkout', done: false, sort: 1 },
        { id: uuid(), label: 'Tester parcours complet', done: false, sort: 2 }
      ] },
      { id: uuid(), label: '4.5 Coupons & cartes cadeaux', done: false, est_h: 2, tools: '', deadline: '', sort: 4, subs: [
        { id: uuid(), label: 'Créer coupon test', done: false, sort: 0 },
        { id: uuid(), label: 'Vérifier applicabilité', done: false, sort: 1 }
      ] }
    ] },
    { id: uuid(), name: 'Phase 5 – Expédition & Légal', sort: 4, tasks: [
      { id: uuid(), label: '5.1 Expédition La Poste', done: false, est_h: 4, tools: '', deadline: '', sort: 0, subs: [
        { id: uuid(), label: 'Lettre suivie (<100g)', done: false, sort: 0 },
        { id: uuid(), label: 'Colissimo (>100g)', done: false, sort: 1 },
        { id: uuid(), label: 'Vérifier tarifs', done: false, sort: 2 }
      ] },
      { id: uuid(), label: '5.2 Expédition Mondial Relay', done: false, est_h: 3, tools: '', deadline: '', sort: 1, subs: [
        { id: uuid(), label: 'Plugin officiel Woo MR', done: false, sort: 0 },
        { id: uuid(), label: 'Sélection point relais', done: false, sort: 1 },
        { id: uuid(), label: 'Test étiquette', done: false, sort: 2 }
      ] },
      { id: uuid(), label: '5.3 Pages légales', done: false, est_h: 8, tools: '', deadline: '', sort: 2, subs: [
        { id: uuid(), label: 'Mentions légales', done: false, sort: 0 },
        { id: uuid(), label: 'CGV (14 j rétractation, frais retour client)', done: false, sort: 1 },
        { id: uuid(), label: 'Politique de confidentialité RGPD', done: false, sort: 2 },
        { id: uuid(), label: 'Politique cookies (CNIL)', done: false, sort: 3 }
      ] },
      { id: uuid(), label: '5.4 Factures PDF & e-mails', done: false, est_h: 4, tools: '', deadline: '', sort: 3, subs: [
        { id: uuid(), label: 'Plugin factures PDF', done: false, sort: 0 },
        { id: uuid(), label: 'Vérification TVA & infos légales', done: false, sort: 1 }
      ] }
    ] },
    { id: uuid(), name: 'Phase 6 – SEO / Perfs / Tracking', sort: 5, tasks: [
      { id: uuid(), label: '6.1 SEO on-site', done: false, est_h: 4, tools: '', deadline: '', sort: 0, subs: [
        { id: uuid(), label: 'Installer Rank Math', done: false, sort: 0 },
        { id: uuid(), label: 'Configurer sitemap + robots.txt', done: false, sort: 1 },
        { id: uuid(), label: 'Ajouter schéma Product', done: false, sort: 2 },
        { id: uuid(), label: 'Vérifier titles/metas', done: false, sort: 3 },
        { id: uuid(), label: 'Vérifier maillage', done: false, sort: 4 }
      ] },
      { id: uuid(), label: '6.2 Performance', done: false, est_h: 4, tools: '', deadline: '', sort: 1, subs: [
        { id: uuid(), label: 'Config LiteSpeed Cache', done: false, sort: 0 },
        { id: uuid(), label: 'Convertir images WebP', done: false, sort: 1 },
        { id: uuid(), label: 'Activer lazyload', done: false, sort: 2 },
        { id: uuid(), label: 'Tester Core Web Vitals mobile', done: false, sort: 3 }
      ] },
      { id: uuid(), label: '6.3 Tracking', done: false, est_h: 4, tools: '', deadline: '', sort: 2, subs: [
        { id: uuid(), label: 'Installer GA4', done: false, sort: 0 },
        { id: uuid(), label: 'Activer Enhanced Ecommerce', done: false, sort: 1 },
        { id: uuid(), label: 'Installer Meta Pixel', done: false, sort: 2 },
        { id: uuid(), label: 'Configurer CAPI', done: false, sort: 3 }
      ] },
      { id: uuid(), label: '6.4 Consentement CNIL', done: false, est_h: 4, tools: '', deadline: '', sort: 3, subs: [
        { id: uuid(), label: 'Installer Complianz/Axeptio', done: false, sort: 0 },
        { id: uuid(), label: 'Test consent mode V2', done: false, sort: 1 }
      ] }
    ] },
    { id: uuid(), name: 'Phase 7 – QA & Recette', sort: 6, tasks: [
      { id: uuid(), label: '7.1 Tests fonctionnels', done: false, est_h: 8, tools: '', deadline: '', sort: 0, subs: [
        { id: uuid(), label: 'Parcours invité (fiche → panier → checkout → paiement)', done: false, sort: 0 },
        { id: uuid(), label: 'Parcours client inscrit', done: false, sort: 1 },
        { id: uuid(), label: 'Coupons/cartes cadeaux', done: false, sort: 2 },
        { id: uuid(), label: 'E-mails WooCommerce', done: false, sort: 3 }
      ] },
      { id: uuid(), label: '7.2 Tests compatibilité', done: false, est_h: 4, tools: '', deadline: '', sort: 1, subs: [
        { id: uuid(), label: 'Chrome, Safari, Firefox, Edge', done: false, sort: 0 },
        { id: uuid(), label: 'iOS, Android', done: false, sort: 1 }
      ] },
      { id: uuid(), label: '7.3 Tests perfs & a11y', done: false, est_h: 4, tools: '', deadline: '', sort: 2, subs: [
        { id: uuid(), label: 'LCP mobile < 3s', done: false, sort: 0 },
        { id: uuid(), label: 'Contrastes/ARIA OK', done: false, sort: 1 }
      ] },
      { id: uuid(), label: '7.4 Recette cliente', done: false, est_h: 4, tools: '', deadline: '', sort: 3, subs: [
        { id: uuid(), label: 'Scénarios réels (commande test)', done: false, sort: 0 },
        { id: uuid(), label: 'PV de recette signé', done: false, sort: 1 }
      ] }
    ] },
    { id: uuid(), name: 'Phase 8 – Pré-lancement & Lancement', sort: 7, tasks: [
      { id: uuid(), label: '8.1 Pré-lancement (J-30 → J-1)', done: false, est_h: 8, tools: '', deadline: '', sort: 0, subs: [
        { id: uuid(), label: 'Vérifier DNS préparés, SSL actif', done: false, sort: 0 },
        { id: uuid(), label: 'Vérifier redirections anciennes URLs', done: false, sort: 1 },
        { id: uuid(), label: 'Sauvegarde complète prod', done: false, sort: 2 },
        { id: uuid(), label: 'Communication lancement (posts IG/FB prêts)', done: false, sort: 3 }
      ] },
      { id: uuid(), label: '8.2 Go-live (Jour J)', done: false, est_h: 4, tools: '', deadline: '', sort: 1, subs: [
        { id: uuid(), label: 'Bascule DNS vers prod', done: false, sort: 0 },
        { id: uuid(), label: 'Test commande réelle', done: false, sort: 1 },
        { id: uuid(), label: 'Monitoring logs', done: false, sort: 2 }
      ] }
    ] },
    { id: uuid(), name: 'Phase 9 – Post-lancement', sort: 8, tasks: [
      { id: uuid(), label: '9.1 Monitoring', done: false, est_h: 8, tools: '', deadline: '', sort: 0, subs: [
        { id: uuid(), label: 'Vérifier ventes réelles / remboursements', done: false, sort: 0 },
        { id: uuid(), label: 'Corriger anomalies mineures', done: false, sort: 1 },
        { id: uuid(), label: 'Analyse KPI (J+7 & J+14)', done: false, sort: 2 }
      ] },
      { id: uuid(), label: '9.2 Roadmap V2', done: false, est_h: 4, tools: '', deadline: '', sort: 1, subs: [
        { id: uuid(), label: 'Ajuster UX/SEO', done: false, sort: 0 },
        { id: uuid(), label: 'Proposer extensions (newsletter, CRM, abandon panier)', done: false, sort: 1 },
        { id: uuid(), label: 'Idées V2 (nouvelles catégories)', done: false, sort: 2 }
      ] }
    ] }
  ]
});

const VITRINE_TEMPLATE = (name, client, deadline) => ({
    id: uuid(), name, client, type: 'Site vitrine', status: 'En cours', deadline, amount: 0, paid: 0, notes: "Modèle de projet pour un site vitrine.",
    phases: [
        { id: uuid(), name: 'Cadrage & Contenus', sort: 0, tasks: [
            { id: uuid(), label: 'Atelier de cadrage & objectifs', done: false, est_h: 4, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Arborescence du site', done: false, est_h: 2, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Rédaction des contenus des pages', done: false, est_h: 12, tools: '', deadline: '', subs: [] }
        ] },
        { id: uuid(), name: 'Design & Maquettes', sort: 1, tasks: [
            { id: uuid(), label: 'Création du moodboard et de la charte graphique', done: false, est_h: 4, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Réalisation des maquettes des pages', done: false, est_h: 8, tools: '', deadline: '', subs: [] }
        ] },
        { id: uuid(), name: 'Développement', sort: 2, tasks: [
            { id: uuid(), label: 'Intégration du thème et des pages', done: false, est_h: 20, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Optimisation des performances (WebP, cache)', done: false, est_h: 5, tools: '', deadline: '', subs: [] }
        ] },
        { id: uuid(), name: 'Lancement', sort: 3, tasks: [
            { id: uuid(), label: 'Tests de recette', done: false, est_h: 4, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Mise en ligne et monitoring', done: false, est_h: 3, tools: '', deadline: '', subs: [] }
        ] }
    ]
});

const SEO_TEMPLATE = (name, client, deadline) => ({
    id: uuid(), name, client, type: 'SEO', status: 'En cours', deadline, amount: 0, paid: 0, notes: "Modèle de projet pour l'optimisation SEO.",
    phases: [
        { id: uuid(), name: 'Audit technique & sémantique', sort: 0, tasks: [
            { id: uuid(), label: 'Audit technique (robots.txt, sitemap, crawl)', done: false, est_h: 8, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Audit sémantique (mots-clés, intentions)', done: false, est_h: 12, tools: '', deadline: '', subs: [] }
        ] },
        { id: uuid(), name: 'Stratégie & plan d\'action', sort: 1, tasks: [
            { id: uuid(), label: 'Plan de contenu (pillars, clusters)', done: false, est_h: 6, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Définition des balises (Title, Meta, Hn)', done: false, est_h: 4, tools: '', deadline: '', subs: [] }
        ] },
        { id: uuid(), name: 'Implémentation & suivi', sort: 2, tasks: [
            { id: uuid(), label: 'Optimisation on-page', done: false, est_h: 15, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Création de contenus', done: false, est_h: 20, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Suivi des positions & rapport mensuel', done: false, est_h: 5, tools: '', deadline: '', subs: [] }
        ] }
    ]
});

const MAINTENANCE_TEMPLATE = (name, client, deadline) => ({
    id: uuid(), name, client, type: 'Maintenance', status: 'En cours', deadline, amount: 0, paid: 0, notes: "Modèle de projet pour un contrat de maintenance mensuel.",
    phases: [
        { id: uuid(), name: 'Maintenance régulière (mensuelle)', sort: 0, tasks: [
            { id: uuid(), label: 'Sauvegarde complète (BDD + fichiers)', done: false, est_h: 1, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Mise à jour des plugins & thème', done: false, est_h: 2, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Nettoyage de la base de données', done: false, est_h: 1, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Vérification de la sécurité (scan)', done: false, est_h: 1, tools: '', deadline: '', subs: [] }
        ] },
        { id: uuid(), name: 'Support client', sort: 1, tasks: [
            { id: uuid(), label: 'Gestion des tickets de support (3 tickets)', done: false, est_h: 5, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Rapport mensuel des interventions', done: false, est_h: 2, tools: '', deadline: '', subs: [] }
        ] }
    ]
});

const TUNNEL_VENTE_TEMPLATE = (name, client, deadline) => ({
    id: uuid(), name, client, type: 'Tunnel de vente', status: 'En cours', deadline, amount: 0, paid: 0, notes: "Modèle de projet pour un tunnel de vente.",
    phases: [
        { id: uuid(), name: 'Stratégie & Copywriting', sort: 0, tasks: [
            { id: uuid(), label: 'Définition de l\'offre et des bonus', done: false, est_h: 6, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Rédaction des pages (landing, checkout, merci)', done: false, est_h: 12, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Création de la séquence email', done: false, est_h: 8, tools: '', deadline: '', subs: [] }
        ] },
        { id: uuid(), name: 'Design & Intégration', sort: 1, tasks: [
            { id: uuid(), label: 'Maquettes des pages', done: false, est_h: 10, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Intégration du tunnel (FunnelKit, Systeme.io)', done: false, est_h: 15, tools: '', deadline: '', subs: [] }
        ] },
        { id: uuid(), name: 'Tracking & Lancement', sort: 2, tasks: [
            { id: uuid(), label: 'Configuration des événements (GA4, Pixel)', done: false, est_h: 5, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Tests fonctionnels du tunnel', done: false, est_h: 4, tools: '', deadline: '', subs: [] }
        ] }
    ]
});

const AUDIT_TEMPLATE = (name, client, deadline) => ({
    id: uuid(), name, client, type: 'Audit', status: 'En cours', deadline, amount: 0, paid: 0, notes: "Modèle de projet pour un audit technique ou SEO.",
    phases: [
        { id: uuid(), name: 'Collecte de données', sort: 0, tasks: [
            { id: uuid(), label: 'Accès Google Search Console, Analytics', done: false, est_h: 2, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Crawling du site (Screaming Frog)', done: false, est_h: 4, tools: '', deadline: '', subs: [] }
        ] },
        { id: uuid(), name: 'Analyse & Rapport', sort: 1, tasks: [
            { id: uuid(), label: 'Analyse technique (Core Web Vitals, performance)', done: false, est_h: 8, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Analyse sémantique (mots-clés, maillage)', done: false, est_h: 8, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Rédaction du rapport d\'audit et des recommandations', done: false, est_h: 10, tools: '', deadline: '', subs: [] }
        ] },
        { id: uuid(), name: 'Présentation & Plan d\'action', sort: 2, tasks: [
            { id: uuid(), label: 'Présentation du rapport au client', done: false, est_h: 4, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Définition d\'un plan d\'action priorisé', done: false, est_h: 4, tools: '', deadline: '', subs: [] }
        ] }
    ]
});

const FORMATION_TEMPLATE = (name, client, deadline) => ({
    id: uuid(), name, client, type: 'Formation', status: 'En cours', deadline, amount: 0, paid: 0, notes: "Modèle de projet pour une formation client.",
    phases: [
        { id: uuid(), name: 'Préparation', sort: 0, tasks: [
            { id: uuid(), label: 'Besoins du client', done: false, est_h: 2, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Création du programme de formation', done: false, est_h: 4, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Préparation du support de formation', done: false, est_h: 8, tools: '', deadline: '', subs: [] }
        ] },
        { id: uuid(), name: 'Session de formation', sort: 1, tasks: [
            { id: uuid(), label: 'Animation de la session', done: false, est_h: 6, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Questions/réponses et mise en pratique', done: false, est_h: 2, tools: '', deadline: '', subs: [] }
        ] },
        { id: uuid(), name: 'Suivi post-formation', sort: 2, tasks: [
            { id: uuid(), label: 'Envoi du support et de l\'enregistrement', done: false, est_h: 1, tools: '', deadline: '', subs: [] },
            { id: uuid(), label: 'Session de suivi (optionnelle)', done: false, est_h: 2, tools: '', deadline: '', subs: [] }
        ] }
    ]
});

const ALL_TEMPLATES = {
    'WooCommerce': WOOCOMMERCE_TEMPLATE,
    'Site vitrine': VITRINE_TEMPLATE,
    'SEO': SEO_TEMPLATE,
    'Maintenance': MAINTENANCE_TEMPLATE,
    'Tunnel de vente': TUNNEL_VENTE_TEMPLATE,
    'Audit': AUDIT_TEMPLATE,
    'Formation': FORMATION_TEMPLATE
};


/* ---------- Seeds (7 projets) ---------- */
function seedProject({name, client, type, status, deadline, amount=0, paid=0, phases}){
  return {
    id: uuid(), name, client, type, deadline, amount, paid, status, notes:"",
    phases, createdAt: todayISO(), updatedAt: todayISO(), metrics:{burndown:[]}
  };
}
function simplePhase(name, tasks){ return {id:uuid(), name, tasks}; }
function t(label, est=1, subs=[]){ return {id:uuid(), label, done:false, est_h: est, tools:'', subs, deadline:''}; }

function seed(){
  const projects=[
    seedProject({
      name:'Pampilles & Cie', client:'Sandhra', type:'WooCommerce', status:'En cours', deadline:addDaysISO(28),
      amount:2500, paid:500,
      phases:[
        simplePhase('Cadrage',[t('Objectifs & KPI',1), t('Arborescence',2)]),
        simplePhase('UX/UI',[t('Moodboard',2), t('Maquettes',6,[{id:uuid(),label:'Accueil',done:false}])]),
        simplePhase('Catalogue',[t('Attributs produits',2), t('Importer 140 BO',6)]),
        simplePhase('Paiements',[t('Stripe',1), t('PayPal',1)]),
        simplePhase('SEO/Perf/Tracking',[t('Title/Meta',3), t('PageSpeed perf',3), t('GA4 + events',2)]),
        simplePhase('QA',[t('Scénarios achat',3)]),
        simplePhase('Lancement',[t('DNS/HTTPS',1), t('Checklist finale',1)]),
        simplePhase('Post-lancement',[t('Monitoring',1)]),
        simplePhase('Pages',[PAGE_TEMPLATES_COMMON('Accueil')])
      ]
    }),
    seedProject({
      name:'Réussir mon BTS – Tunnel', client:'Projet BTS', type:'Tunnel de vente', status:'En cours', deadline:addDaysISO(21),
      amount:1800, paid:600,
      phases:[
        simplePhase('Funnels',[t('FunnelKit config',3), t('Order bump',1)]),
        simplePhase('Emailing',[t('Séquence follow-up',4)]),
        simplePhase('Tracking',[t('GA4 + thankyou',2)]),
        simplePhase('Pages',[PAGE_TEMPLATES_COMMON('Landing principale')])
      ]
    }),
    seedProject({
      name:'Atelier Mer’elle', client:'Stéphanie', type:'WooCommerce', status:'En cours', deadline:addDaysISO(35),
      amount:3200, paid:300,
      phases:[
        simplePhase('Cadrage',[t('Cahier des charges',2)]),
        simplePhase('Design',[t('UI Kit',3)]),
        simplePhase('Pages',[PAGE_TEMPLATES_COMMON('Accueil'), PAGE_TEMPLATES_COMMON('Catégorie produits')])
      ]
    }),
    seedProject({
      name:'NLW — Nathalie Longefay Wedding', client:'NLW', type:'SEO', status:'En cours', deadline:addDaysISO(18),
      amount:1200, paid:700,
      phases:[
        simplePhase('SEO On-page',[t('Plan balises',2), t('Schema.org',2)]),
        simplePhase('Contenu',[t('2 articles pilotes',4)])
      ]
    }),
    seedProject({
      name:'La Vieille Italie', client:'LVI', type:'Site vitrine', status:'En pause', deadline:addDaysISO(50),
      amount:1500, paid:0,
      phases:[
        simplePhase('Design',[t('Wireframes',3)]),
        simplePhase('Build',[t('Intégration',6)]),
      ]
    }),
    seedProject({
      name:'RSM — Site & Contenu', client:'Interne', type:'SEO', status:'Prospection', deadline:addDaysISO(60),
      amount:0, paid:0,
      phases:[
        simplePhase('SEO Interne',[t('Cluster pages services',3)]),
      ]
    }),
    seedProject({
      name:'Stéphanie couture — Tunnel', client:'Stéphanie', type:'Tunnel de vente', status:'En cours', deadline:addDaysISO(26),
      amount:1400, paid:200,
      phases:[
        simplePhase('Tunnel',[t('Offre & pages',3)]),
        simplePhase('Emailing',[t('Séquence 5j',3)]),
      ]
    }),
  ];
  projects.forEach(p=>updateBurndownJournal(p));
  return { projects };
}
function addDaysISO(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }

/* ---------- PHP API (optional) ---------- */
async function apiFetch(path, options={}){
  const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '').replace('project.html', '').replace('calendar.html', '');
  const res = await fetch(baseUrl + path, {headers:{'Content-Type':'application/json'}, ...options});
  if(!res.ok) throw new Error('API error');
  return res.json();
}

/* ---------- Google Calendar API (optional) ---------- */
function getClientAuth(clientId, scopes) {
  return google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: scopes,
    callback: (tokenResponse) => {
      if (tokenResponse && tokenResponse.access_token) {
        google.gapi.client.setToken(tokenResponse);
        alert('Connexion Google réussie ! Vous pouvez maintenant synchroniser votre calendrier.');
      }
    },
  });
}
function getGcalService() {
  return google.gapi.client.calendar;
}

/* ---------- Diagnostics (auto-tests) ---------- */
(function diagnostics(){
  const demo = {phases:[{tasks:[
    {done:false, est_h:2, subs:[{done:true},{done:false}]},
  ]}]};
  const prog = computeProgress({phases:[{tasks:[{done:true, subs:[{done:false},{done:true}]}]}]});
  const ok1 = computeProgress({phases:[{tasks:[{est_h:10,done:false, subs:[{done:true},{done:false}]}]}]})===0;
  const ok2 = computeProgress({phases:[{tasks:[{est_h:10,done:true}]}]})===100;
  const pageTask = WOOCOMMERCE_TEMPLATE('Test', 'Test', '2025-01-01').phases[0].tasks[0];
  const ok3 = (pageTask.subs||[]).length>=3;
  const idealReal = computeBurndown(seed().projects[0]);
  const ok4 = idealReal.labels.length === idealReal.ideal.length && idealReal.ideal.length === idealReal.real.length;
  console.log('Diagnostics:', {ok1, ok2, ok3, ok4, pg:prog});
  if(ok1&&ok2&&ok3&&ok4) console.log('Diagnostics OK');
})();

/* ---------- Expose minimal API to other scripts ---------- */
window.RSM = {
  THEME, STORAGE_KEY, URGENCY_THRESHOLDS, ENABLE_GCAL, DEFAULT_EVENT_HOUR,
  loadState, saveState, getProject, upsertProject, computeProgress, computeBurndown,
  updateBurndownJournal, exportMarkdown, exportICS,
  PAGE_TEMPLATES_COMMON, ALL_TEMPLATES, uuid, fmtMoney, daysLeft, badgeForDays,
  apiFetch,
  getClientAuth, getGcalService, listAllItems
};
window.gapiLoaded = ()=>{};
window.gisLoaded = ()=>{};