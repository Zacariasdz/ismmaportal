'use strict';
const {loadEnv,resolveConfig}=require('./src/config');
const {createPortal}=require('./src/bootstrap');
const {run}=require('./src/db');
const {deliverPending}=require('./src/notifier');

(async()=>{
  loadEnv();
  const config=resolveConfig();
  if(!config.databaseUrl){
    console.error('ERRO: configure DATABASE_URL (PostgreSQL do Supabase) em .env antes de iniciar.');
    process.exitCode=1;
    return;
  }
  const {db,server}=await createPortal(config);
  const {uploadDir,port,host}=config;

  const maintenance=setInterval(async()=>{
    try{
      await run(db,'DELETE FROM sessions WHERE expires_at < ?',Date.now());
      await run(db,'DELETE FROM rate_limits WHERE window_start < ?',Date.now()-2*86400000);
    }catch(error){console.error('Falha de manutenção:',error.message);}
  },3600000);
  maintenance.unref();

  let delivering=false;
  const dispatcher=setInterval(async()=>{
    if(delivering)return;
    delivering=true;
    try{await deliverPending(db);}
    catch(error){console.error('Falha no envio de notificações:',error.message);}
    finally{delivering=false;}
  },15000);
  dispatcher.unref();

  server.listen(port,host,()=>{console.log(`\n  ISMMA - Portal Académico\n  Aceder: http://${host==='0.0.0.0'?'localhost':host}:${port}\n  Base de dados: PostgreSQL (Supabase)\n  Anexos: ${uploadDir}\n  Ctrl + C para parar\n`);});

  function stop(){clearInterval(maintenance);clearInterval(dispatcher);server.close(async()=>{await db.close();process.exit(0);});}
  process.once('SIGINT',stop);
  process.once('SIGTERM',stop);
})().catch(error=>{console.error('Não foi possível iniciar o portal:',error.message);process.exitCode=1;});
