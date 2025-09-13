<?php
require __DIR__.'/config.php';
$method = $_SERVER['REQUEST_METHOD'];

if($method==='GET'){
  $tid = $_GET['task_id'] ?? '';
  $stmt = $pdo->prepare("SELECT * FROM subtasks WHERE task_id=? ORDER BY sort ASC"); $stmt->execute([$tid]);
  ok($stmt->fetchAll(PDO::FETCH_ASSOC)); exit;
}
if($method==='POST'){
  $in = json_input();
  $sql="INSERT INTO subtasks(id,task_id,label,done,sort) VALUES(:id,:task_id,:label,:done,:sort)
       ON DUPLICATE KEY UPDATE label=VALUES(label), done=VALUES(done), sort=VALUES(sort)";
  $stmt=$pdo->prepare($sql);
  $in['id'] = $in['id'] ?? uniqid('s_',true);
  $stmt->execute([
    ':id'=>$in['id'], ':task_id'=>$in['task_id'], ':label'=>$in['label']??'', ':done'=>!empty($in['done'])?1:0, ':sort'=>$in['sort']??0
  ]);
  ok(['id'=>$in['id']]); exit;
}
if($method==='DELETE'){
  $id = $_GET['id'] ?? '';
  $stmt=$pdo->prepare("DELETE FROM subtasks WHERE id=?"); $stmt->execute([$id]);
  ok(['deleted'=>$id]); exit;
}
http_response_code(405); ok(['error'=>'Method not allowed']);
