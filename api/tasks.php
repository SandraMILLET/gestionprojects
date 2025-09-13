<?php
require __DIR__.'/config.php';
$method = $_SERVER['REQUEST_METHOD'];

if($method==='GET'){
  $phid = $_GET['phase_id'] ?? '';
  $stmt = $pdo->prepare("SELECT * FROM tasks WHERE phase_id=? ORDER BY sort ASC"); $stmt->execute([$phid]);
  ok($stmt->fetchAll(PDO::FETCH_ASSOC)); exit;
}
if($method==='POST'){
  $in = json_input();
  $sql="INSERT INTO tasks(id,phase_id,label,done,est_h,tools,sort,deadline) VALUES(:id,:phase_id,:label,:done,:est_h,:tools,:sort,:deadline)
       ON DUPLICATE KEY UPDATE label=VALUES(label), done=VALUES(done), est_h=VALUES(est_h), tools=VALUES(tools), sort=VALUES(sort), deadline=VALUES(deadline)";
  $stmt=$pdo->prepare($sql);
  $in['id'] = $in['id'] ?? uniqid('t_',true);
  $stmt->execute([
    ':id'=>$in['id'], ':phase_id'=>$in['phase_id'], ':label'=>$in['label']??'',
    ':done'=>!empty($in['done'])?1:0, ':est_h'=>$in['est_h']??0, ':tools'=>$in['tools']??'', ':sort'=>$in['sort']??0,
    ':deadline'=>$in['deadline']??null
  ]);
  ok(['id'=>$in['id']]); exit;
}
if($method==='DELETE'){
  $id = $_GET['id'] ?? '';
  $stmt=$pdo->prepare("DELETE FROM tasks WHERE id=?"); $stmt->execute([$id]);
  ok(['deleted'=>$id]); exit;
}
http_response_code(405); ok(['error'=>'Method not allowed']);
?>