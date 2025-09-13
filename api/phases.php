<?php
require __DIR__.'/config.php';
$method = $_SERVER['REQUEST_METHOD'];

if($method==='GET'){
  $pid = $_GET['project_id'] ?? '';
  $stmt = $pdo->prepare("SELECT * FROM phases WHERE project_id=? ORDER BY sort ASC"); $stmt->execute([$pid]);
  ok($stmt->fetchAll(PDO::FETCH_ASSOC)); exit;
}
if($method==='POST'){
  $in = json_input();
  $sql="INSERT INTO phases(id,project_id,name,sort) VALUES(:id,:project_id,:name,:sort)
       ON DUPLICATE KEY UPDATE name=VALUES(name), sort=VALUES(sort)";
  $stmt=$pdo->prepare($sql);
  $in['id'] = $in['id'] ?? uniqid('ph_',true);
  $stmt->execute([
    ':id'=>$in['id'], ':project_id'=>$in['project_id'], ':name'=>$in['name']??'', ':sort'=>$in['sort']??0
  ]);
  ok(['id'=>$in['id']]); exit;
}
if($method==='DELETE'){
  $id = $_GET['id'] ?? '';
  $stmt=$pdo->prepare("DELETE FROM phases WHERE id=?"); $stmt->execute([$id]);
  ok(['deleted'=>$id]); exit;
}
http_response_code(405); ok(['error'=>'Method not allowed']);
