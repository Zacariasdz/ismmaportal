'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./security');
const {INSTITUTION:I}=require('./institution');
const {installAcademicSchema,seedAcademic}=require('./academic-db');

function openDatabase(location) {
  if (location !== ':memory:') fs.mkdirSync(path.dirname(location), { recursive: true });
  const db = new DatabaseSync(location, { timeout: 5000 });
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  if (location !== ':memory:') db.exec('PRAGMA journal_mode=WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('administrador','funcionario','estudante','candidato')),
      student_number TEXT, course TEXT, desired_course TEXT,
      is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '', email TEXT DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS department_staff (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id,department_id)
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY, department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      name TEXT NOT NULL, applies_to TEXT NOT NULL DEFAULT 'ambos' CHECK(applies_to IN ('ambos','estudante','candidato')),
      is_active INTEGER NOT NULL DEFAULT 1, UNIQUE(department_id,name)
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY, protocol TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL REFERENCES users(id),
      department_id INTEGER NOT NULL REFERENCES departments(id),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      subject TEXT NOT NULL, description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'aberto' CHECK(status IN ('aberto','em_analise','aguarda_utilizador','respondido','fechado')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('baixa','normal','alta')),
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT, first_answer_at TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, is_internal INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL, path TEXT NOT NULL, mime TEXT NOT NULL,
      size INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ticket_histories (
      id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL, from_value TEXT, to_value TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', category TEXT NOT NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      original_name TEXT NOT NULL, path TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'publico' CHECK(visibility IN ('publico','estudantes','candidatos','interno')),
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      published_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS reply_templates (
      id INTEGER PRIMARY KEY, department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      title TEXT NOT NULL, body TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, body TEXT NOT NULL, url TEXT NOT NULL DEFAULT '/',
      read_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL, subject_type TEXT NOT NULL, subject_id INTEGER,
      details TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mail_outbox (
      id INTEGER PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL,
      body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pendente',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status, updated_at);
    CREATE INDEX IF NOT EXISTS tickets_department_idx ON tickets(department_id, created_at);
    CREATE INDEX IF NOT EXISTS tickets_user_idx ON tickets(user_id, created_at);
    CREATE INDEX IF NOT EXISTS messages_ticket_idx ON messages(ticket_id,created_at);
    CREATE INDEX IF NOT EXISTS attachments_ticket_idx ON attachments(ticket_id);
    CREATE INDEX IF NOT EXISTS documents_visibility_idx ON documents(visibility,deleted_at);
    CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id,read_at);
  `);
  // Migrações seguras para bases de dados criadas em versões anteriores.
  function column(table, name, definition) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
  column('users', 'student_verified', 'INTEGER NOT NULL DEFAULT 0');
  column('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
  column('users', 'notify_email', 'INTEGER NOT NULL DEFAULT 1');
  column('users', 'notify_sms', 'INTEGER NOT NULL DEFAULT 0');
  column('mail_outbox', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
  column('mail_outbox', 'last_error', 'TEXT');
  column('mail_outbox', 'next_try_at', 'INTEGER NOT NULL DEFAULT 0');
  column('mail_outbox', 'channel', "TEXT NOT NULL DEFAULT 'email'");
  column('categories', 'sla_hours', 'INTEGER');
  column('documents', 'valid_until', 'TEXT');
  column('documents', 'replaces_note', 'TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK(purpose IN ('verify_email','reset_password','verify_phone')),
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS auth_tokens_purpose_idx ON auth_tokens(user_id,purpose,expires_at);
    CREATE INDEX IF NOT EXISTS mail_outbox_next_idx ON mail_outbox(status,next_try_at);
    CREATE TABLE IF NOT EXISTS student_roster (
      id INTEGER PRIMARY KEY,
      student_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, course TEXT NOT NULL,
      email_hint TEXT, phone_hint TEXT,
      status TEXT NOT NULL DEFAULT 'activo' CHECK(status IN ('activo','inactivo')),
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS document_versions (
      id INTEGER PRIMARY KEY,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      original_name TEXT NOT NULL, path TEXT NOT NULL,
      mime TEXT NOT NULL, size INTEGER NOT NULL,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      note TEXT DEFAULT '', UNIQUE(document_id, version)
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0,
      blocked_until INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS student_roster_state_idx ON student_roster(status, student_number);
    CREATE INDEX IF NOT EXISTS tickets_assigned_to_idx ON tickets(assigned_to, status);
    CREATE INDEX IF NOT EXISTS document_versions_document_idx ON document_versions(document_id, version);
    CREATE INDEX IF NOT EXISTS rate_limits_cleanup_idx ON rate_limits(window_start);
  `);
  // Bases antigas podem conter números repetidos; não impedir a abertura.
  // A aplicação rejeita novas associações duplicadas em todos os casos.
  if (!db.prepare(`SELECT 1 FROM users WHERE student_number IS NOT NULL GROUP BY student_number HAVING COUNT(*)>1 LIMIT 1`).get()) {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_student_number_unique_idx ON users(student_number) WHERE student_number IS NOT NULL`);
  }
  // Documentos existentes passam a ter a versão inicial, sem apagar ficheiros.
  db.exec(`INSERT OR IGNORE INTO document_versions
    (document_id,version,original_name,path,mime,size,uploaded_by,created_at,note)
    SELECT id,1,original_name,path,mime,size,uploaded_by,published_at,'Versão existente'
    FROM documents WHERE id NOT IN (SELECT document_id FROM document_versions)`);
  // Actualização idempotente: dados públicos sem substituir definições editadas pela instituição.
  const details={contact_phone:I.phone,contact_address:I.address,contact_hours:I.hours,institution_motto:I.motto,institution_website:I.website};
  for(const [key,value] of Object.entries(details))db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(key,value);
  db.prepare("UPDATE settings SET value=? WHERE key='contact_email' AND value='contacto@ismma.test'").run(I.email);
  installAcademicSchema(db);
  return db;
}
function one(db, sql, ...args) { return db.prepare(sql).get(...args); }
function all(db, sql, ...args) { return db.prepare(sql).all(...args); }
function run(db, sql, ...args) { return db.prepare(sql).run(...args); }
function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = callback(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function getSetting(db, key, fallback='') { return one(db,'SELECT value FROM settings WHERE key=?',key)?.value ?? fallback; }
function audit(db,user,action,type,id,details='') {
  run(db,'INSERT INTO activity_log (actor_id,action,subject_type,subject_id,details) VALUES (?,?,?,?,?)',user?.id ?? null,action,type,id,details);
}
function notify(db, userId, title, body, url, email=true) {
  if (!userId) return;
  run(db, 'INSERT INTO notifications(user_id,title,body,url) VALUES(?,?,?,?)',userId,title,body,url);
  if (email) {
    const user=one(db,'SELECT email,phone,notify_email,notify_sms FROM users WHERE id=?',userId);
    const link=(process.env.APP_URL||'http://localhost:3000').replace(/\/$/,'')+url;
    const message=`Há uma actualização no portal de atendimento do ISMMA. Consulte: ${link}`;
    if(user?.notify_email)run(db,"INSERT INTO mail_outbox(recipient,subject,body,channel) VALUES(?,?,?,'email')",user.email,'Actualização de atendimento ISMMA',message);
    if(user?.notify_sms&&user.phone)run(db,"INSERT INTO mail_outbox(recipient,subject,body,channel) VALUES(?,?,?,'sms')",user.phone,'ISMMA',message);
  }
}
function seedDatabase(db,{demo=true,password='Demonstracao@2026'}={}) {
  if (one(db,'SELECT COUNT(*) AS n FROM departments').n) { seedAcademic(db,{demo,password}); return; }
  transaction(db,()=>{
    const defs=[
      ['Secretaria','Informações gerais|ambos;Documentos necessários|ambos;Candidatura|candidato;Exames de admissão|candidato'],
      ['Registo Académico','Declaração de notas|estudante;Inscrição e matrícula|estudante;Calendário académico|ambos'],
      ['Coordenação','Horários e turmas|estudante;Cursos disponíveis|ambos'],
      ['Finanças','Propinas|estudante;Taxas de candidatura|candidato;Pagamentos|ambos'],
      ['Direção Científica','Pesquisa e projectos|estudante;Informações gerais|ambos']
    ];
    for(const [name, categories] of defs){
      const slug=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-');
      const id=Number(run(db,'INSERT INTO departments(name,slug,description,is_active) VALUES (?,?,?,1)',name,slug,`Atendimento de ${name}`).lastInsertRowid);
      for(const item of categories.split(';')){const [category,applies]=item.split('|');run(db,'INSERT INTO categories(department_id,name,applies_to) VALUES(?,?,?)',id,category,applies);}
    }
    const settings={institution_name:'Instituto Superior Maria Mãe de África',contact_email:I.email,contact_phone:I.phone,contact_address:I.address,contact_hours:I.hours,institution_motto:I.motto,institution_website:I.website,reopen_days:'7',overdue_days:'3',max_document_mb:'10',show_staff_name:'0'};
    for(const [k,v] of Object.entries(settings))run(db,'INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',k,v);
    if(!demo)return;
    const people=[
      ['Administrador de Demonstração','admin@ismma.test','administrador','+258 84 111 0001',null,null],
      ['Paulo Nhantumbo','secretaria@ismma.test','funcionario','+258 84 111 0002',null,null],
      ['Ana Macuácua','estudante@ismma.test','estudante','+258 84 111 0003','ISMMA2026001','Licenciatura em Gestão de Empresas'],
      ['Celso Mabunda','candidato@ismma.test','candidato','+258 84 111 0004',null,'Licenciatura em Contabilidade e Auditoria']
    ];
    // Os registos abaixo são exclusivamente de demonstração, nunca produção.
    run(db,"INSERT OR IGNORE INTO student_roster(student_number,name,course,status) VALUES (?,?,?,'activo')",
      'ISMMA2026001','Ana Macuácua','Licenciatura em Gestão de Empresas');
    for(const [name,email,role,phone,studentNumber,course] of people){
      const id=Number(run(db,`INSERT INTO users (name,email,phone,password_hash,role,student_number,course,desired_course) VALUES (?,?,?,?,?,?,?,?)`,name,email,phone,hashPassword(password),role,studentNumber,role==='estudante'?course:null,role==='candidato'?course:null).lastInsertRowid);
      if(role==='estudante')run(db,'UPDATE users SET student_verified=1 WHERE id=?',id);
      run(db,'UPDATE users SET email_verified=1 WHERE id=?',id);
      if(role==='funcionario') run(db,'INSERT INTO department_staff(user_id,department_id) VALUES (?,1)',id);
    }
    run(db,"INSERT INTO reply_templates(department_id,title,body) VALUES(1,'Recepção do pedido','Confirmamos a recepção do seu pedido. A nossa equipa irá analisar a sua solicitação.')");
    const initial=[
      [3,1,'Declaração de notas','Solicito informação sobre o levantamento de uma declaração de notas.','em_analise'],
      [4,1,'Documentos para candidatura','Gostaria de saber quais são os documentos necessários para a candidatura.','respondido'],
      [3,4,'Informação sobre propinas','Pretendo confirmar as modalidades de pagamento das propinas.','aberto']
    ];
    for(const [uid,dep,subject,description,status] of initial){
      const category=one(db,'SELECT id FROM categories WHERE department_id=? AND (applies_to=? OR applies_to=?) LIMIT 1',dep,uid===3?'estudante':'candidato','ambos');
      const id=Number(run(db,"INSERT INTO tickets(protocol,user_id,department_id,category_id,subject,description,status) VALUES (?,?,?,?,?,?,?)",`TEMP-${Date.now()}-${Math.random()}`,uid,dep,category.id,subject,description,status).lastInsertRowid);
      run(db,'UPDATE tickets SET protocol=? WHERE id=?',`ISMMA-${new Date().getFullYear()}-${String(id).padStart(6,'0')}`,id);
      run(db,'INSERT INTO ticket_histories(ticket_id,user_id,action,to_value) VALUES (?,?,?,?)',id,uid,'criado','aberto');
      if(status==='respondido')run(db,"INSERT INTO messages(ticket_id,user_id,body) VALUES (?,?,?)",id,2,'Agradecemos o contacto. Dirija-se à Secretaria com o BI, o certificado e as fotografias tipo passe. Confirme os requisitos actualizados junto do ISMMA.');
    }
  });
  seedAcademic(db,{demo,password});
}
module.exports={openDatabase,one,all,run,transaction,getSetting,audit,notify,seedDatabase};
