<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/config.php';
require __DIR__ . '/mailer.php';

$lock=fopen(sys_get_temp_dir().DIRECTORY_SEPARATOR.'reckoner-timesheet-monthly-backup.lock','c');
if(!$lock||!flock($lock,LOCK_EX|LOCK_NB)){fwrite(STDERR,"Another backup is already running.\n");exit(2);}

$options=getopt('',['month::']);
$month=(string)($options['month']??date('Y-m',strtotime('first day of last month')));
if(!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/',$month)){fwrite(STDERR,"Use --month=YYYY-MM.\n");exit(2);}
$start=$month.'-01';$end=(new DateTimeImmutable($start))->modify('last day of this month')->format('Y-m-d');
$fileName='timesheets-'.$month.'.csv';$path=(GRAPH_SHAREPOINT_BACKUP_FOLDER!==''?GRAPH_SHAREPOINT_BACKUP_FOLDER.'/':'').$fileName;
$pdo=db();
$pdo->exec("CREATE TABLE IF NOT EXISTS sharepoint_backups (backup_month CHAR(7) PRIMARY KEY,file_name VARCHAR(255) NOT NULL,row_count INT UNSIGNED NOT NULL,graph_item_id VARCHAR(255) NOT NULL DEFAULT '',status ENUM('completed','failed') NOT NULL,error_message VARCHAR(500) NOT NULL DEFAULT '',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB");
try{
    $stmt=$pdo->prepare("SELECT te.id,u.id employee_no,u.name employee_name,u.pod,u.job_title,COALESCE(b.id,u.id) billing_to_no,COALESCE(b.name,u.name) billing_to_name,te.work_date,te.start_time,te.end_time,te.hours,te.entity,te.charge_type,te.client_name,te.assignment,te.work_area,te.work_done,te.source,te.created_at,te.updated_at FROM timesheet_entries te JOIN users u ON u.id=te.person_id LEFT JOIN users b ON b.id=te.billing_to_id WHERE te.work_date BETWEEN ? AND ? ORDER BY te.work_date,u.name,te.start_time,te.id");
    $stmt->execute([$start,$end]);$rows=$stmt->fetchAll();
    $stream=fopen('php://temp','w+b');fwrite($stream,"\xEF\xBB\xBF");
    fputcsv($stream,['Entry ID','Employee No','Employee Name','Pod','Designation','Billing To No','Billing To Name','Date','Start','End','Hours','Entity','Type','Client','Assignment','Work Area','Work Done','Source','Created At','Updated At']);
    foreach($rows as $row)fputcsv($stream,array_values($row));rewind($stream);$csv=(string)stream_get_contents($stream);fclose($stream);
    $item=graphUploadContent(GRAPH_SHAREPOINT_SITE_ID,GRAPH_SHAREPOINT_DRIVE_ID,$path,$csv,'text/csv; charset=utf-8');
    $save=$pdo->prepare("INSERT INTO sharepoint_backups (backup_month,file_name,row_count,graph_item_id,status,error_message) VALUES (?,?,?,?,'completed','') ON DUPLICATE KEY UPDATE file_name=VALUES(file_name),row_count=VALUES(row_count),graph_item_id=VALUES(graph_item_id),status='completed',error_message='',updated_at=CURRENT_TIMESTAMP");
    $save->execute([$month,$fileName,count($rows),(string)($item['id']??'')]);
    fwrite(STDOUT,"Uploaded {$fileName} with ".count($rows)." row(s).\n");
}catch(Throwable $error){
    $message=substr($error->getMessage(),0,500);$save=$pdo->prepare("INSERT INTO sharepoint_backups (backup_month,file_name,row_count,graph_item_id,status,error_message) VALUES (?,?,0,'','failed',?) ON DUPLICATE KEY UPDATE file_name=VALUES(file_name),status='failed',error_message=VALUES(error_message),updated_at=CURRENT_TIMESTAMP");$save->execute([$month,$fileName,$message]);fwrite(STDERR,"Backup failed: {$message}\n");exit(1);
}finally{flock($lock,LOCK_UN);fclose($lock);}
