(function(){
  const { loadState, computeProgress, fmtMoney, daysLeft, badgeForDays,
          uuid, upsertProject, apiFetch, ALL_TEMPLATES } = window.RSM;

  const q = $('#q'), fType=$('#fType'), fStatus=$('#fStatus'), sortBy=$('#sortBy');
  const grid = $('#projectsGrid'); const urg = $('#urgencies');

  async function render(){
    const st = await loadState();
    let list = [...st.projects];
    const term = (q.value||'').toLowerCase().trim();
    if(term) list = list.filter(p=> (p.name+p.client).toLowerCase().includes(term));
    if(fType.value) list = list.filter(p=> p.type===fType.value);
    if(fStatus.value) list = list.filter(p=> p.status===fStatus.value);
    switch(sortBy.value){
      case 'deadline_asc': list.sort((a,b)=>a.deadline.localeCompare(b.deadline)); break;
      case 'deadline_desc': list.sort((a,b)=>b.deadline.localeCompare(a.deadline)); break;
      case 'progress_asc': list.sort((a,b)=>computeProgress(a)-computeProgress(b)); break;
      case 'progress_desc': list.sort((a,b)=>computeProgress(b)-computeProgress(a)); break;
    }
    renderUrgencies(list);
    renderGrid(list);
  }

  function renderUrgencies(list){
    const cols = [
      {title:'En retard', filter:(p)=>daysLeft(p.deadline)<=0},
      {title:'0–7 j', filter:(p)=>{const d=daysLeft(p.deadline);return d>0&&d<=7;}},
      {title:'8–14 j', filter:(p)=>{const d=daysLeft(p.deadline);return d>=8&&d<=14;}},
      {title:'15–30 j', filter:(p)=>{const d=daysLeft(p.deadline);return d>=15&&d<=30;}},
      {title:'>30 j', filter:(p)=>daysLeft(p.deadline)>30},
    ];
    urg.innerHTML = cols.map(c=>{
      const items = list.filter(p => p.status === 'En cours' && c.filter(p)).slice(0,6).map(p=>{
        const d=daysLeft(p.deadline);
        return `<a role="listitem" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                  href="project.html?id=${p.id}" aria-label="${p.name}">
            <span class="text-truncate">${p.name} <span class="text-muted">— ${p.client}</span></span>
            <span class="badge ${badgeForDays(d)} deadline-pill">J-${d}</span>
        </a>`;
      }).join('') || '<div class="text-muted small px-2">Rien</div>';
      return `<div class="col-12 col-lg">
        <div class="card h-100">
          <div class="card-body">
            <h3 class="h6 mb-3">${c.title}</h3>
            <div class="list-group list-group-flush">${items}</div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function badgeStatus(s){ return `badge badge-status-${s.replaceAll(' ','\\ ')}`; }

  function renderGrid(list){
    grid.innerHTML = list.map(p=>{
      const prog = computeProgress(p);
      const d = daysLeft(p.deadline);
      const rest = (Number(p.amount||0)-Number(p.paid||0));
      return `<div class="col-12 col-md-6 col-xl-4" role="listitem">
        <div class="card h-100" aria-label="${p.name}">
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <h3 class="h6 mb-1 text-truncate" title="${p.name}">${p.name}</h3>
                <div class="text-muted small">${p.client}</div>
              </div>
              <div class="d-flex gap-1">
                <span class="badge badge-type">${p.type}</span>
                <span class="${badgeStatus(p.status)} badge">${p.status}</span>
              </div>
            </div>
            <div class="mt-2 small d-flex align-items-center gap-2">
              📅
              <span class="text-muted">Deadline</span>
              <strong>${p.deadline}</strong>
              <span class="badge ${badgeForDays(d)} deadline-pill ms-auto">J-${d}</span>
            </div>
            <div class="mt-2 small">
              💰
              <span>Montant</span> <strong>${fmtMoney(p.amount)}</strong> •
              <span>Payé</span> <strong>${fmtMoney(p.paid)}</strong> •
              <span>Reste</span> <strong>${fmtMoney(rest)}</strong>
            </div>
            <div class="mt-2">
              <div class="progress progress-thin" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${prog}">
                <div class="progress-bar ${prog<34?'bg-danger':prog<67?'bg-warning':'bg-success'}" style="width:${prog}%">${prog}%</div>
              </div>
            </div>
            <div class="mt-auto d-flex gap-2 pt-3">
              <a class="btn btn-primary btn-sm" href="project.html?id=${p.id}" aria-label="Ouvrir ${p.name}">Ouvrir</a>
              <button class="btn btn-outline-secondary btn-sm" data-action="edit" data-id="${p.id}">
                ✏️ Éditer
              </button>
              <button class="btn btn-outline-secondary btn-sm" data-action="dup" data-id="${p.id}">
                ➕ Dupliquer
              </button>
              <button class="btn btn-outline-danger btn-sm ms-auto" data-action="del" data-id="${p.id}">
                🗑️ Supprimer
              </button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  /* --------- Events --------- */
  [q,fType,fStatus,sortBy].forEach(el=>el && el.addEventListener('input', render));
  $('#btnNewProject')?.addEventListener('click', ()=>{
    const projectType = prompt('Type de projet (WooCommerce, Site vitrine, SEO, Maintenance, Tunnel de vente, Audit, Formation)', 'WooCommerce');
    if(!projectType) return;
    const projectTemplate = ALL_TEMPLATES[projectType];
    if(!projectTemplate) { alert('Type de projet invalide.'); return; }

    const projectName = prompt('Nom du projet', 'Nouveau projet'); if(!projectName) return;
    const clientName = prompt('Nom du client', 'Client'); if(!clientName) return;
    const deadline = prompt('Deadline (YYYY-MM-DD)', new Date().toISOString().slice(0,10)); if(!deadline) return;

    const p = projectTemplate(projectName, clientName, deadline);

    upsertProject(p);
    render();
    location.href=`project.html?id=${p.id}`;
  });

  grid.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-action]');
    if(!btn) return;
    const id = btn.dataset.id;
    const st = await loadState();
    const idx = st.projects.findIndex(p=>p.id===id);
    if(idx<0) return;
    if(btn.dataset.action==='del'){
      await apiFetch(`api/projects.php?id=${id}`,{method:'DELETE'});
      render();
      toast('Projet supprimé.');
    }
    if(btn.dataset.action==='dup'){
      const copy= JSON.parse(JSON.stringify(st.projects[idx])); copy.id=uuid(); copy.name=copy.name+' (copie)';
      upsertProject(copy); render(); toast('Projet dupliqué');
    }
    if(btn.dataset.action==='edit'){
      const p = st.projects[idx];
      const n = prompt('Nom du projet', p.name); if(n===null) return;
      p.name = n;
      const c = prompt('Client', p.client); if(c!==null) p.client=c;
      upsertProject(p); render();
    }
  });

  function toast(html){
    const el=document.createElement('div');
    el.className='toast align-items-center text-bg-dark border-0 show position-fixed bottom-0 end-0 m-3';
    el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
    el.innerHTML=`<div class="d-flex"><div class="toast-body">${html}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fermer"></button></div>`;
    document.body.appendChild(el);
    el.querySelector('button').onclick=()=>el.remove();
    setTimeout(()=>el.remove(),4000);
  }

  render();
})();