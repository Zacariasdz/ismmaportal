'use strict';
const {loadEnv,resolveConfig}=require('./src/config');
const {createPortal}=require('./src/bootstrap');
const {deliverPending}=require('./src/notifier');

loadEnv();
const config=resolveConfig();
const {db,server}=createPortal(config);
const {dbFile,uploadDir,port,host}=config;
if(config.demoSeed&&config.environment==='production')console.warn('Atenção: dados de demonstração activos em produção. Defina DEMO_SEED=false.');

const maintenance=setInterval(()=>{try{db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());db.prepare('DELETE FROM rate_limits WHERE window_start < ?').run(Date.now()-2*86400000);}catch(error){console.error('Falha de manutenção:',error.message);}},3600000);
maintenance.unref();
let delivering=false;const dispatcher=setInterval(async()=>{if(delivering)return;delivering=true;try{await deliverPending(db);}catch(e){console.error('Falha no envio de notificações:',e.message);}finally{delivering=false;}},15000);dispatcher.unref();

server.listen(port,host,()=>{console.log(`\n  ISMMA - Portal Académico\n  Aceder: http://${host==='0.0.0.0'?'localhost':host}:${port}\n  Base de dados: ${dbFile}\n  Anexos: ${uploadDir}\n  Ctrl + C para parar\n`);});
function stop(){clearInterval(maintenance);clearInterval(dispatcher);server.close(()=>{db.close();process.exit(0);});}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
