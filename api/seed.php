<?php
// Assurez-vous d'avoir les fichiers de configuration disponibles
require __DIR__.'/config.php';

function runSeed($pdo) {
    echo "Démarrage du peuplement de la base de données...<br>";

    // Utilisation du chemin d'accès absolu pour éviter les erreurs de chemin relatif
    $json_data = file_get_contents('/Applications/MAMP/htdocs/www/gsetiondeprojet/seeds-long.json');

    $data = json_decode($json_data, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        die("Erreur de décodage JSON: " . json_last_error_msg());
    }

    // Efface les tables pour éviter les doublons
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");
    $pdo->exec("TRUNCATE TABLE subtasks;");
    $pdo->exec("TRUNCATE TABLE tasks;");
    $pdo->exec("TRUNCATE TABLE phases;");
    $pdo->exec("TRUNCATE TABLE projects;");
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");
    echo "Tables effacées.<br>";

    foreach ($data['projects'] as $project) {
        // Insérer le projet
        $sql_project = "INSERT INTO projects (id, name, client, type, deadline, amount, paid, status, notes, created_at, updated_at, email, first_name, last_name, phone)
                        VALUES (:id, :name, :client, :type, :deadline, :amount, :paid, :status, :notes, :created_at, :updated_at, :email, :first_name, :last_name, :phone)";
        $stmt_project = $pdo->prepare($sql_project);
        $stmt_project->execute([
            ':id' => $project['id'],
            ':name' => $project['name'],
            ':client' => $project['client'],
            ':type' => $project['type'],
            ':deadline' => $project['deadline'],
            ':amount' => $project['amount'],
            ':paid' => $project['paid'],
            ':status' => $project['status'],
            ':notes' => $project['notes'],
            ':created_at' => $project['createdAt'],
            ':updated_at' => $project['updatedAt'],
            ':email' => $project['contact']['email'] ?? null,
            ':first_name' => $project['contact']['firstName'] ?? null,
            ':last_name' => $project['contact']['lastName'] ?? null,
            ':phone' => $project['contact']['phone'] ?? null,
        ]);
        echo "Projet '{$project['name']}' inséré.<br>";

        // Insérer les phases, tâches et sous-tâches
        foreach ($project['phases'] as $phase) {
            $sql_phase = "INSERT INTO phases (id, project_id, name, sort) VALUES (:id, :project_id, :name, :sort)";
            $stmt_phase = $pdo->prepare($sql_phase);
            $stmt_phase->execute([
                ':id' => $phase['id'],
                ':project_id' => $project['id'],
                ':name' => $phase['name'],
                ':sort' => $phase['sort'] ?? 0,
            ]);

            foreach ($phase['tasks'] as $task) {
                $sql_task = "INSERT INTO tasks (id, phase_id, label, done, est_h, tools, sort, deadline)
                             VALUES (:id, :phase_id, :label, :done, :est_h, :tools, :sort, :deadline)";
                $stmt_task = $pdo->prepare($sql_task);
                $stmt_task->execute([
                    ':id' => $task['id'],
                    ':phase_id' => $phase['id'],
                    ':label' => $task['label'],
                    ':done' => $task['done'] ? 1 : 0,
                    ':est_h' => $task['est_h'],
                    ':tools' => $task['tools'] ?? null,
                    ':sort' => $task['sort'] ?? 0,
                    ':deadline' => $task['deadline'] ?? null,
                ]);

                foreach ($task['subs'] as $subtask) {
                    $sql_subtask = "INSERT INTO subtasks (id, task_id, label, done, sort) VALUES (:id, :task_id, :label, :done, :sort)";
                    $stmt_subtask = $pdo->prepare($sql_subtask);
                    $stmt_subtask->execute([
                        ':id' => $subtask['id'],
                        ':task_id' => $task['id'],
                        ':label' => $subtask['label'],
                        ':done' => $subtask['done'] ? 1 : 0,
                        ':sort' => $subtask['sort'] ?? 0,
                    ]);
                }
            }
        }
    }
    echo "Peuplement terminé. Vous pouvez maintenant retourner à l'application.";
}

// Exécution du peuplement
runSeed($pdo);
?>