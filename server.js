'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {openDatabase,seedDatabase}=require('./src/db');
const {makeApp}=require('./src/app');
const {deliverPending}=require('./src/notifier');
function loadEnv(){const file=path.join(__dirname,'.env');if(!fs.existsSync(file))return;for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;const match=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');}}
loadEnv();
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
const dbFile=path.resolve(__dirname,process.env.DB_FILE||'./data/ismma.sqlite');
const uploads=path.resolve(__dirname,process.env.UPLOAD_DIR||'./uploads');
const db=openDatabase(dbFile);
seedDatabase(db,{demo:process.env.DEMO_SEED!=='false'&&process.env.NODE_ENV!=='production',password:process.env.DEMO_PASSWORD||'Demonstracao@2026'});
if(process.env.NODE_ENV==='production'&&!db.prepare('SELECT id FROM users LIMIT 1').get())console.warn('Nenhum utilizador configurado. Crie o administrador inicial com: npm run criar-admin');
const maintenance=setInterval(()=>{try{db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());db.prepare('DELETE FROM rate_limits WHERE window_start < ?').run(Date.now()-2*86400000);}catch(error){console.error('Falha de manutenção:',error.message);}},3600000);
maintenance.unref();
let delivering=false;const dispatcher=setInterval(async()=>{if(delivering)return;delivering=true;try{await deliverPending(db);}catch(e){console.error('Falha no envio de notificações:',e.message);}finally{delivering=false;}},15000);dispatcher.unref();
const app=makeApp({db,uploadDir:uploads,environment:process.env.NODE_ENV||'development',sessionHours:Number(process.env.SESSION_HOURS||12)});
app.listen(port,host,()=>{console.log(`\n  ISMMA - Portal Académico\n  Aceder: http://${host==='0.0.0.0'?'localhost':host}:${port}\n  Base de dados: ${dbFile}\n  Ctrl + C para parar\n`);});
function stop(){clearInterval(maintenance);clearInterval(dispatcher);app.close(()=>{db.close();process.exit(0);});}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
