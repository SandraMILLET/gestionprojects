<?php
// api/config.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$env = [
  'DB_HOST' => getenv('DB_HOST') ?: 'localhost:8889',
  'DB_NAME' => getenv('DB_NAME') ?: 'productprojet',
  'DB_USER' => getenv('DB_USER') ?: 'root',
  'DB_PASS' => getenv('DB_PASS') ?: 'root',
  'DB_CHARSET' => 'utf8mb4'
];
try {
  $dsn = "mysql:host={$env['DB_HOST']};dbname={$env['DB_NAME']};charset={$env['DB_CHARSET']}";
  $pdo = new PDO($dsn, $env['DB_USER'], $env['DB_PASS'], [ PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION ]);
} catch(Exception $e){
  http_response_code(500); echo json_encode(['error'=>'DB connection failed']); exit;
}

function json_input(){
  $raw = file_get_contents('php://input');
  return $raw ? json_decode($raw,true) : [];
}
function ok($data){ echo json_encode($data); }
