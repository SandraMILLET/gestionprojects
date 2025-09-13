<?php
require __DIR__.'/config.php';

$method = $_SERVER['REQUEST_METHOD'];
if($method==='GET'){
  $stmt = $pdo->query("SELECT * FROM projects ORDER BY deadline ASC");
  ok($stmt->fetchAll(PDO::FETCH_ASSOC)); exit;
}
if($method==='POST'){
  $in = json_input();
  $sql="INSERT INTO projects(id,name,client,type,deadline,amount,paid,status,notes,email,first_name,last_name,phone,created_at,updated_at)
        VALUES(:id,:name,:client,:type,:deadline,:amount,:paid,:status,:notes,:email,:first_name,:last_name,:phone,NOW(),NOW())
        ON DUPLICATE KEY UPDATE name=VALUES(name), client=VALUES(client), type=VALUES(type), deadline=VALUES(deadline),
        amount=VALUES(amount), paid=VALUES(paid), status=VALUES(status), notes=VALUES(notes), email=VALUES(email), first_name=VALUES(first_name), last_name=VALUES(last_name), phone=VALUES(phone), updated_at=NOW()";
  $stmt=$pdo->prepare($sql);
  $in['id'] = $in['id'] ?? uniqid('p_',true);
  $stmt->execute([
    ':id'=>$in['id'], ':name'=>$in['name']??'', ':client'=>$in['client']??'', ':type'=>$in['type']??'',
    ':deadline'=>$in['deadline']??date('Y-m-d'), ':amount'=>$in['amount']??0, ':paid'=>$in['paid']??0,
    ':status'=>$in['status']??'Prospection', ':notes'=>$in['notes']??'',
    ':email'=>$in['email']??null, ':first_name'=>$in['first_name']??null, ':last_name'=>$in['last_name']??null, ':phone'=>$in['phone']??null,
  ]);
  ok(['id'=>$in['id']]); exit;
}
if($method==='DELETE'){
  parse_str($_SERVER['QUERY_STRING']??'', $q);
  if(empty($q['id'])){ http_response_code(400); ok(['error'=>'id required']); exit; }
  $stmt=$pdo->prepare("DELETE FROM projects WHERE id=?"); $stmt->execute([$q['id']]);
  ok(['deleted'=>$q['id']]); exit;
}

http_response_code(405); ok(['error'=>'Method not allowed']);
?>