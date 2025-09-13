(function(){
  const { loadState, exportICS, listAllItems, getClientAuth, googleApi, getGcalService } = window.RSM;
  const fType=$('#fType'), fStatus=$('#fStatus'), showTasks=$('#showTasks'), timeline=$('#timeline');
  let tokenClient;

  function filtered(){
    let projects = [...loadState().projects];
    if(fType.value) projects=projects.filter(p=>p.type===fType.value);
    if(fStatus.value) projects=projects.filter(p=>p.status===fStatus.value);
    
    let list = projects.map(p => ({
      ...p,
      type: 'project',
      deadline: p.deadline
    }));

    if(showTasks.checked){
      projects.forEach(p => {
        listAllItems(p).tasks.forEach(t => {
          if (t.deadline) {
            list.push({
              name: `${p.name} — Tâche : ${t.label}`,
              client: p.client,
              deadline: t.deadline,
              id: t.id,
              type: 'task',
              project_id: p.id
            });
          }
        });
      });
    }

    list.sort((a,b)=>a.deadline.localeCompare(b.deadline));
    return list;
  }

  function render(){
    const list = filtered();
    timeline.innerHTML = list.map(item=>{
      const { name, client, deadline, type, project_id } = item;
      const href = type === 'project' ? `project.html?id=${item.id}` : `project.html?id=${project_id}`;
      return `<div class="item" role="listitem">
        <span class="dot" aria-hidden="true"></span>
        <div class="flex-grow-1">
          <div class="fw-semibold">${deadline} — ${name} <span class="text-muted">• ${client}</span></div>
          <div class="small"><span class="badge badge-type">${type === 'project' ? 'Projet' : 'Tâche'}</span></div>
        </div>
        <a href="${href}" class="btn btn-sm btn-primary">Ouvrir</a>
      </div>`;
    }).join('') || '<div class="text-muted">Aucun projet ou tâche</div>';
  }

  $('#btnICS').onclick = ()=> exportICS(filtered());
  
  // Google Calendar Integration
  if (window.RSM.ENABLE_GCAL) {
    const CLIENT_ID = '1015292311250-hm61abo648ogm9drvthm0ducg6ijetc2.apps.googleusercontent.com';
    const SCOPES = 'https://www.googleapis.com/auth/calendar.events';
    
    tokenClient = getClientAuth(CLIENT_ID, SCOPES);

    $('#btnGAuth').onclick = () => {
        tokenClient.requestAccessToken();
    };

    window.gapiLoaded = () => {
        google.gapi.load('client', async () => {
            await google.gapi.client.init({
                apiKey: 'YOUR_API_KEY', // À remplacer par une clé API si nécessaire pour d'autres appels
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
            });
            console.log('Google API client loaded.');
        });
    };

    window.gisLoaded = () => {
        console.log('Google Identity Services loaded.');
    };

    $('#syncGcal')?.addEventListener('click', async () => {
        const calendarId = 'primary';
        const events = filtered().map(item => {
            const date = item.deadline;
            return {
                summary: `${item.name} (${item.client})`,
                description: `Deadline pour le projet. Géré avec RSM.`,
                start: { date: date },
                end: { date: date },
                colorId: 5, // Jaune pour les délais
            };
        });

        const service = getGcalService();
        for (const event of events) {
            try {
                await service.events.insert({ calendarId, resource: event });
                console.log('Event created:', event.summary);
            } catch (error) {
                console.error('Error creating event:', error);
            }
        }
        alert('Synchronisation Google Calendar terminée.');
    });
  } else {
    $('#btnGAuth').remove();
  }


  [fType,fStatus,showTasks].forEach(el=>el.addEventListener('input', render));
  render();
})();