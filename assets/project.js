(function(){
  const { getProject, upsertProject, computeProgress, fmtMoney, daysLeft,
          computeBurndown, updateBurndownJournal, PAGE_TEMPLATES_COMMON, uuid, exportMarkdown, apiFetch, listAllItems } = window.RSM;
  const url = new URL(location.href); const id = url.searchParams.get('id');
  
  let project;

  async function init() {
    project = await getProject(id);
    if(!project){ 
      document.body.innerHTML = '<main class="container py-5"><div class="alert alert-danger">Projet introuvable.</div></main>'; 
      throw new Error('No project'); 
    }
    renderHeader(); 
    renderMetrics(); 
    renderPhases();
    
    $('#notes').value = project.notes||'';
    $('#notes').addEventListener('input', e=>{ project.notes=e.target.value; save(); });
  }

  function renderHeader(){
    const prog = computeProgress(project);
    const d = daysLeft(project.deadline);
    $('#projectHeader').innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="d-flex flex-column flex-lg-row gap-3 justify-content-between">
            <div class="flex-grow-1">
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <h1 class="h4 mb-0" contenteditable="true" id="pName" aria-label="Nom du projet">${project.name}</h1>
                <span class="text-muted">—</span>
                <div class="fw-medium" contenteditable="true" id="pClient" aria-label="Nom du client">${project.client}</div>
                <span class="badge badge-type">${project.type}</span>
                <span class="badge badge-status-${project.status.replaceAll(' ','\\ ')}">${project.status}</span>
              </div>
              <div class="small mt-2 d-flex align-items-center gap-2 flex-wrap">
                <svg class="icon"><use href="assets/icons.svg#calendar"></use></svg>
                <label class="form-label m-0 me-1">Deadline</label>
                <input type="date" id="pDeadline" value="${project.deadline}" class="form-control form-control-sm" style="width:fit-content">
                <span class="badge ${window.RSM.badgeForDays(d)}">J-${d}</span>
              </div>
            </div>
            <div class="text-nowrap">
              <div class="small"><svg class="icon"><use href="assets/icons.svg#euro"></use></svg> Montant <strong>${fmtMoney(project.amount)}</strong></div>
              <div class="small">Payé <strong>${fmtMoney(project.paid)}</strong></div>
              <div class="small">Reste <strong>${fmtMoney((project.amount||0)-(project.paid||0))}</strong></div>
              <div class="mt-2 d-flex gap-2">
                <button class="btn btn-outline-secondary btn-sm" id="btnEditDetails">Éditer</button>
                <button class="btn btn-outline-secondary btn-sm" id="btnStatus">Statut</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    $('#pName').addEventListener('input', e=>{ project.name=e.target.innerText.trim(); save(); });
    $('#pClient').addEventListener('input', e=>{ project.client=e.target.innerText.trim(); save(); });
    $('#pDeadline').addEventListener('change', e=>{ project.deadline=e.target.value; save(); renderHeader(); renderMetrics(); });
    $('#btnEditDetails').onclick=()=>{
      const firstName = prompt('Prénom du client', project.contact?.firstName||''); if(firstName===null) return;
      const lastName = prompt('Nom du client', project.contact?.lastName||''); if(lastName===null) return;
      const email = prompt('Email du client', project.contact?.email||''); if(email===null) return;
      const phone = prompt('Téléphone du client', project.contact?.phone||''); if(phone===null) return;
      const amount = prompt('Montant total €', project.amount||0); if(amount===null) return;
      const paid = prompt('Montant payé €', project.paid||0); if(paid===null) return;
      if (!project.contact) project.contact = {};
      project.contact.firstName = firstName; project.contact.lastName = lastName;
      project.contact.email = email; project.contact.phone = phone;
      project.amount=Number(amount)||0; project.paid=Number(paid)||0;
      save(); renderHeader();
    };
    $('#btnStatus').onclick=()=>{ const s=prompt('Statut (Prospection, En cours, En pause, Livré, Facturé, Archivé)', project.status);
                                  if(s) { project.status=s; save(); renderHeader(); } };
  }

function renderMetrics(){
    const {labels, ideal, real} = computeBurndown(project);
    const {estTotal, estDone} = window.RSM.listAllItems(project);
    const prog = computeProgress(project);
    const approxDone = Math.round(estDone);
    $('#metricsList').innerHTML = `
      <li>Total estimé : <strong>${estTotal} h</strong></li>
      <li>Fait (selon avancement) : <strong>${approxDone} h</strong></li>
      <li>Restant (selon avancement) : <strong>${Math.max(0,estTotal-approxDone)} h</strong></li>`;
    const ctx = $('#burndown');
    if(window._bdChart) window._bdChart.destroy();
    window._bdChart = new Chart(ctx, {
      type:'line',
      data:{ labels, datasets:[
        { label:'Idéal', data:ideal, borderColor: window.RSM.THEME.blue, backgroundColor:'transparent' },
        { label:'Réel', data:real, borderColor: window.RSM.THEME.accent, backgroundColor:'transparent' }
      ]},
      options:{
        responsive:true,
        animation:false,
        plugins:{legend:{display:true}},
        scales:{ y:{ beginAtZero:true } }
      }
    });
}

  function renderPhases(){
    const acc = $('#phasesAcc');
    acc.innerHTML = '';
    (project.phases||[]).forEach((ph, i)=>{
      const pid = 'ph-'+ph.id;
      const phProg = window.RSM.computeProgress({phases:[ph]});
      const header = `
        <div class="accordion-item">
          <h2 class="accordion-header" id="h-${pid}">
            <button class="accordion-button ${i? 'collapsed':''}" type="button" data-bs-toggle="collapse" data-bs-target="#c-${pid}" aria-expanded="${!i}" aria-controls="c-${pid}">
              <span class="me-2">Phase ${i+1} — </span><strong contenteditable="true" data-phid="${ph.id}" class="ph-name">${ph.name}</strong>
              <span class="ms-auto badge ${phProg<34?'bg-danger':phProg<67?'bg-warning':'bg-success'}">${phProg}%</span>
            </button>
          </h2>
          <div id="c-${pid}" class="accordion-collapse collapse ${i? '':'show'}" data-bs-parent="#phasesAcc">
            <div class="accordion-body">
              <div class="d-flex gap-2 mb-2">
                <button class="btn btn-outline-secondary btn-sm" data-act="addTask" data-ph="${ph.id}"><svg class="icon"><use href="assets/icons.svg#plus"></use></svg> Tâche</button>
                <button class="btn btn-outline-danger btn-sm ms-auto" data-act="delPhase" data-ph="${ph.id}"><svg class="icon"><use href="assets/icons.svg#trash"></use></svg> Supprimer la phase</button>
              </div>
              <ul class="list-group" id="tasks-${ph.id}"></ul>
            </div>
          </div>
        </div>`;
      acc.insertAdjacentHTML('beforeend', header);
      renderTasks(ph);
    });
  }

  function renderTasks(ph){
    const ul = $('#tasks-'+ph.id);
    ul.innerHTML = (ph.tasks||[]).map(t=>{
      const subs = (t.subs||[]).map(s=>`
        <li class="list-group-item ps-5 d-flex align-items-center gap-2">
          <input type="checkbox" class="form-check-input me-2" data-sub="${s.id}" data-task="${t.id}" ${s.done?'checked':''} aria-label="Sous-tâche ${s.label}">
          <span class="flex-grow-1" contenteditable="true" data-edit-sub="${s.id}" data-task="${t.id}">${s.label}</span>
          <button class="btn btn-sm btn-outline-danger" data-act="delSub" data-sub="${s.id}" data-task="${t.id}" aria-label="Supprimer la sous-tâche"><svg class="icon"><use href="assets/icons.svg#trash"></use></svg></button>
        </li>`).join('');

      return `<li class="list-group-item">
        <div class="d-flex align-items-center gap-2">
          <input type="checkbox" class="form-check-input me-2" data-task="${t.id}" ${t.done?'checked':''} aria-label="Tâche ${t.label}">
          <span class="flex-grow-1" contenteditable="true" data-edit-task="${t.id}">${t.label}</span>
          <span class="badge text-bg-light" title="Estimation heures">⏱ ${Number(t.est_h||0)}h</span>
          <div class="input-group input-group-sm ms-2" style="width:120px;">
            <span class="input-group-text"><svg class="icon"><use href="assets/icons.svg#calendar"></use></svg></span>
            <input type="date" class="form-control" data-task-deadline="${t.id}" value="${t.deadline || ''}" aria-label="Date limite de la tâche">
          </div>
          <button class="btn btn-sm btn-outline-secondary" data-act="setEst" data-task="${t.id}" title="Définir estimation">⏱</button>
          <button class="btn btn-sm btn-outline-secondary" data-act="addSub" data-task="${t.id}"><svg class="icon"><use href="assets/icons.svg#plus"></use></svg></button>
          <button class="btn btn-sm btn-outline-danger" data-act="delTask" data-task="${t.id}"><svg class="icon"><use href="assets/icons.svg#trash"></use></svg></button>
        </div>
        ${subs ? `<ul class="list-unstyled mt-2">${subs}</ul>` : ''}
      </li>`;
    }).join('') || '<li class="list-group-item text-muted">Aucune tâche</li>';
    $$('[data-task-deadline]', ul).forEach(el => {
      el.addEventListener('change', (e) => {
        const t = findTask(e.target.dataset.taskDeadline);
        if (t) t.deadline = e.target.value;
        save();
      });
    });
  }

  $('#phasesAcc').addEventListener('click', async (e)=>{
    const btn = e.target.closest('[data-act]'); if(!btn) return;
    const act = btn.dataset.act;
    if(act==='addTask'){
      const ph = project.phases.find(x=>x.id===btn.dataset.ph);
      ph.tasks.push({id:uuid(), label:'Nouvelle tâche', done:false, est_h:1, tools:'', subs:[], deadline:''});
      save(); renderPhases(); renderHeader(); renderMetrics();
    }
    if(act==='delPhase'){
      project.phases = project.phases.filter(x=>x.id!==btn.dataset.ph);
      save(); renderPhases(); renderHeader(); renderMetrics();
    }
    if(act==='setEst'){
      const t = findTask(btn.dataset.task); const v=prompt('Estimation (h)', t.est_h||0); if(v!==null){ t.est_h=Number(v)||0; save(); renderPhases(); renderMetrics(); }
    }
    if(act==='addSub'){
      const t = findTask(btn.dataset.task);
      t.subs = t.subs||[]; t.subs.push({id:uuid(), label:'Sous-tâche', done:false});
      save(); renderPhases(); renderHeader(); renderMetrics();
    }
    if(act==='delTask'){
      project.phases.forEach(ph=>{ ph.tasks = ph.tasks.filter(t=>t.id!==btn.dataset.task); });
      save(); renderPhases(); renderHeader(); renderMetrics();
    }
    if(act==='delSub'){
      const t = findTask(btn.dataset.task);
      t.subs = (t.subs||[]).filter(s=>s.id!==btn.dataset.sub);
      save(); renderPhases(); renderHeader(); renderMetrics();
    }
  });

  $('#phasesAcc').addEventListener('change', async (e)=>{
  const tId = e.target.getAttribute('data-task');
  const sId = e.target.getAttribute('data-sub');
  if(tId && !sId){
    const t = findTask(tId); if(t) t.done = e.target.checked; save(); 
  } else if (tId && sId){
    const t = findTask(tId); const s = (t.subs||[]).find(x=>x.id===sId); if(s) s.done = e.target.checked; save(); 
  }
  renderHeader(); 
  renderMetrics(); 
  renderPhases();
});

  $('#phasesAcc').addEventListener('input', async (e)=>{
    const tId = e.target.getAttribute('data-edit-task');
    const sId = e.target.getAttribute('data-edit-sub');
    const phNameId = e.target.classList.contains('ph-name') ? e.target.dataset.phid : null;
    if(tId){ const t = findTask(tId); if(t) t.label = e.target.innerText.trim(); save(); }
    if(sId){ const t = findTask(e.target.getAttribute('data-task')); const s=(t.subs||[]).find(x=>x.id===sId); if(s) s.label=e.target.innerText.trim(); save(); }
    if(phNameId){ const ph = project.phases.find(x=>x.id===phNameId); if(ph) ph.name=e.target.innerText.trim(); save(); }
  });

  $('#btnAddPhase').onclick = ()=>{
    project.phases.push({id:uuid(), name:'Nouvelle phase', tasks:[]});
    save(); renderPhases();
  };
  $('#btnAddPageShortcut').onclick = ()=>{
    ensurePagesPhase();
    const name = prompt('Nom de la page (ex. Accueil)'); if(!name) return;
    const pages = project.phases.find(x=>x.name.toLowerCase()==='pages');
    pages.tasks.push(PAGE_TEMPLATES_COMMON(name));
    save(); renderPhases(); renderHeader(); renderMetrics();
  };

  // Correction: La zone de texte est maintenant initialisée dans la fonction init()
  $('#btnRecalc').onclick = ()=>{ updateBurndownJournal(project); save(); renderMetrics(); };
  $('#btnExportMd').onclick = ()=> exportMarkdown(project);

  function ensurePagesPhase(){
    if(!project.phases.find(x=>x.name.toLowerCase()==='pages')){
      project.phases.push({id:uuid(), name:'Pages', tasks:[]});
      save();
    }
  }
  function findTask(id){
    for(const ph of project.phases){
      const t = (ph.tasks||[]).find(t=>t.id===id);
      if(t) return t;
    }
    return null;
  }
  async function save(){ 
    await upsertProject(project); 
  }

  init();
})();