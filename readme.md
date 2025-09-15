# RSM Project Tracker

## Lancer en mode statique (localStorage)
1. Ouvre `index.html` dans un navigateur moderne (Chrome/Edge/Safari/Firefox).
2. Les **7 projets seeds** sont chargés automatiquement.
3. Persistance via `localStorage` (`rsm_projects_v1`).

## Structure
- `index.html` : Dashboard (filtres, urgences, CRUD, import/export).
- `project.html?id=...` : page projet (notes, phases/tâches, burndown Chart.js).
- `calendar.html` : timeline deadlines, **Connecter Google Calendar** (placeholder) + export `.ics`.

## Thème & A11y
- Palette RSM (#412e7e, #9b5dc9, #6e84de, #a6c2f4, #b687e2).
- Focus visibles, roles/aria, AA contrast.

## Import/Export
- **JSON** : export global depuis le dashboard.
- **Markdown** : export par projet (lisible dans Notion).
- **ICS** : export de toutes les deadlines (fallback si pas de Google Calendar).

## Option serveur (PHP + MySQL)
1. Crée une base `rsm` (ou configurer variables d'env `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`).
2. Importer `db.sql` via phpMyAdmin.
3. Déployer le dossier `api/` sur le même hôte que l'appli.
4. Dans `assets/app.js`, laisse `ENABLE_PHP_DEFAULT=false`. (Les endpoints sont prêts : `/api/projects.php` etc.)
   > Les pages utilisent `localStorage` par défaut. L’intégration API est volontairement **douce** : active-la quand tu seras prête à mapper les appels.

## Tests auto
- Au chargement, la console loggue `Diagnostics OK` si les checks passent.

## Remarques
- Google Calendar : bouton non bloquant (OAuth client-side à brancher avec `google.accounts.oauth2`). L’export `.ics` fonctionne immédiatement.
- Aucune erreur console attendue sur les navigateurs modernes.
# gestionprojects
