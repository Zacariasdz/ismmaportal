'use strict';
const {hashPassword}=require('./security');
const one=(db,sql,...args)=>db.prepare(sql).get(...args);
const run=(db,sql,...args)=>db.prepare(sql).run(...args);
function transaction(db,callback){db.exec('BEGIN IMMEDIATE');try{const r=callback();db.exec('COMMIT');return r;}catch(error){db.exec('ROLLBACK');throw error;}}

const PROGRAMS=[
  ['Licenciatura em Gestão de Empresas','LGE'],
  ['Licenciatura em Direito','LDIR'],
  ['Licenciatura em Contabilidade e Auditoria','LCA'],
  ['Licenciatura em Gestão de Recursos Humanos','LGRH'],
  ['Licenciatura em Serviço Social','LSS'],
  ['Licenciatura em Filosofia e Ética','LFE'],
  ['Licenciatura em Psicologia Social e do Trabalho','LPST'],
  ['Licenciatura em Administração Pública e Autárquica','LAPA'],
  ['Licenciatura em Gestão Ambiental, com Habilitação em Turismo','LGAT']
];
function installAcademicSchema(db){
 const columns=db.prepare('PRAGMA table_info(users)').all();
 if(!columns.some(c=>c.name==='is_teacher'))db.exec('ALTER TABLE users ADD COLUMN is_teacher INTEGER NOT NULL DEFAULT 0');
 db.exec(`
 CREATE TABLE IF NOT EXISTS academic_programs (
   id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, code TEXT NOT NULL UNIQUE,
   level TEXT NOT NULL DEFAULT 'Licenciatura', duration_years INTEGER NOT NULL DEFAULT 4,
   is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
 );
 CREATE TABLE IF NOT EXISTS academic_subjects (
   id INTEGER PRIMARY KEY, program_id INTEGER NOT NULL REFERENCES academic_programs(id) ON DELETE RESTRICT,
   name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, academic_year INTEGER NOT NULL,
   semester INTEGER NOT NULL CHECK(semester BETWEEN 1 AND 2),
   teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
   schedule TEXT NOT NULL DEFAULT '', room TEXT NOT NULL DEFAULT '',
   created_at TEXT NOT NULL DEFAULT (datetime('now'))
 );
 CREATE TABLE IF NOT EXISTS academic_enrollments (
   id INTEGER PRIMARY KEY, subject_id INTEGER NOT NULL REFERENCES academic_subjects(id) ON DELETE CASCADE,
   student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   status TEXT NOT NULL DEFAULT 'inscrito' CHECK(status IN ('inscrito','anulado')),
   enrolled_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(subject_id,student_id)
 );
 CREATE TABLE IF NOT EXISTS academic_assignments (
   id INTEGER PRIMARY KEY, subject_id INTEGER NOT NULL REFERENCES academic_subjects(id) ON DELETE CASCADE,
   title TEXT NOT NULL, description TEXT NOT NULL, due_at TEXT NOT NULL,
   max_grade INTEGER NOT NULL DEFAULT 20, published INTEGER NOT NULL DEFAULT 1,
   created_at TEXT NOT NULL DEFAULT (datetime('now'))
 );
 CREATE TABLE IF NOT EXISTS academic_submissions (
   id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES academic_assignments(id) ON DELETE CASCADE,
   student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   body TEXT NOT NULL DEFAULT '', file_path TEXT, original_name TEXT, mime TEXT,
   submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
   feedback TEXT, UNIQUE(assignment_id,student_id)
 );
 CREATE TABLE IF NOT EXISTS academic_grades (
   id INTEGER PRIMARY KEY, subject_id INTEGER NOT NULL REFERENCES academic_subjects(id) ON DELETE CASCADE,
   student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   assignment_id INTEGER REFERENCES academic_assignments(id) ON DELETE SET NULL,
   assessment TEXT NOT NULL, grade REAL NOT NULL CHECK(grade BETWEEN 0 AND 20),
   published INTEGER NOT NULL DEFAULT 0, teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
   created_at TEXT NOT NULL DEFAULT (datetime('now')),
   updated_at TEXT NOT NULL DEFAULT (datetime('now')),
   UNIQUE(subject_id,student_id,assessment)
 );
 CREATE TABLE IF NOT EXISTS academic_announcements (
   id INTEGER PRIMARY KEY, subject_id INTEGER NOT NULL REFERENCES academic_subjects(id) ON DELETE CASCADE,
   author_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL,
   created_at TEXT NOT NULL DEFAULT (datetime('now'))
 );
 CREATE TABLE IF NOT EXISTS admission_applications (
   id INTEGER PRIMARY KEY, protocol TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL,
   email TEXT NOT NULL, phone TEXT NOT NULL, birth_date TEXT, document_number TEXT NOT NULL,
   province TEXT NOT NULL, program_id INTEGER NOT NULL REFERENCES academic_programs(id),
   study_shift TEXT NOT NULL CHECK(study_shift IN ('laboral','pos_laboral')),
   qualification TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submetida'
     CHECK(status IN ('submetida','em_analise','aprovada','nao_aprovada')),
   notes TEXT NOT NULL DEFAULT '', reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
   created_at TEXT NOT NULL DEFAULT (datetime('now')), reviewed_at TEXT
 );
 CREATE TABLE IF NOT EXISTS admission_files (
   id INTEGER PRIMARY KEY,
   application_id INTEGER NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
   type TEXT NOT NULL CHECK(type IN ('identificacao','habilitacoes')),
   original_name TEXT NOT NULL, path TEXT NOT NULL, mime TEXT NOT NULL,
   size INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
   UNIQUE(application_id,type)
 );
 CREATE INDEX IF NOT EXISTS admission_files_application ON admission_files(application_id);
 CREATE INDEX IF NOT EXISTS aca_enrollments_student ON academic_enrollments(student_id,status);
 CREATE INDEX IF NOT EXISTS aca_assignments_subject ON academic_assignments(subject_id,due_at);
 CREATE INDEX IF NOT EXISTS aca_grades_student ON academic_grades(student_id,published);
 CREATE INDEX IF NOT EXISTS admissions_email ON admission_applications(email,created_at);
 CREATE INDEX IF NOT EXISTS admissions_status ON admission_applications(status,created_at);
 `);
}
function seedAcademic(db,{demo=true,password='Demonstracao@2026'}={}){
 transaction(db,()=>{
  for(const [name,code] of PROGRAMS)run(db,'INSERT OR IGNORE INTO academic_programs(name,code) VALUES(?,?)',name,code);
 });
 if(!demo)return;
 if(one(db,'SELECT COUNT(*) AS n FROM academic_subjects').n)return;
 const findUser=(email)=>one(db,'SELECT id FROM users WHERE email=?',email)?.id;
 const addPerson=(name,email,role,phone,studentNo=null,course=null,isTeacher=0)=>{
  const found=findUser(email);if(found)return found;
  const id=Number(run(db,`INSERT INTO users(name,email,role,phone,password_hash,student_number,course,is_teacher,student_verified,email_verified)
   VALUES(?,?,?,?,?,?,?,?,?,1)`,name,email,role,phone,hashPassword(password),studentNo,course,isTeacher,studentNo?1:0).lastInsertRowid);
  if(studentNo)run(db,"INSERT OR IGNORE INTO student_roster(student_number,name,course,status) VALUES(?,?,?,'activo')",studentNo,name,course);
  return id;
 };
 const teacher1=addPerson('Teresa Massango','docente@ismma.test','funcionario','+258 84 000 0045',null,null,1);
 const teacher2=addPerson('Júlio Machava','docente2@ismma.test','funcionario','+258 86 000 0046',null,null,1);
 const student2=addPerson('Sérgio Mucavele','sergio@ismma.test','estudante','+258 87 000 0047','ISMMA2026002','Licenciatura em Gestão de Empresas');
 const student3=addPerson('Elisa Matsinhe','elisa@ismma.test','estudante','+258 82 000 0048','ISMMA2026003','Licenciatura em Direito');
 const student1=findUser('estudante@ismma.test');
 if(!student1)return;
 const g=one(db,"SELECT id FROM academic_programs WHERE code='LGE'").id;
 const d=one(db,"SELECT id FROM academic_programs WHERE code='LDIR'").id;
 const year=2026;
 const subs=[
  [g,'Fundamentos de Gestão','GEST101',teacher1,'Segunda e Quarta, 17h30 - 19h00','Sala A2',1],
  [g,'Contabilidade Geral I','CONT101',teacher2,'Terça, 17h30 - 20h00','Sala B1',1],
  [g,'Ética e Deontologia Profissional','ETIC101',teacher1,'Sexta, 17h30 - 19h00','Sala A1',1],
  [d,'Introdução ao Direito','DIR101',teacher2,'Segunda, 08h00 - 10h00','Sala C3',1],
  [d,'Direito Constitucional','DIR102',teacher1,'Quinta, 10h00 - 12h00','Sala C3',1]
 ];
 transaction(db,()=>{
  for(const [pid,name,code,tid,schedule,room,semester] of subs){
   const sid=Number(run(db,'INSERT INTO academic_subjects(program_id,name,code,academic_year,semester,teacher_id,schedule,room) VALUES(?,?,?,?,?,?,?,?)',pid,name,code,year,semester,tid,schedule,room).lastInsertRowid);
   const ids=pid===g?[student1,student2]:[student3];
   for(const student of ids)run(db,'INSERT INTO academic_enrollments(subject_id,student_id) VALUES (?,?)',sid,student);
   const due=new Date(Date.now()+((sid%3)+5)*86400000).toISOString().slice(0,19).replace('T',' ');
   const aid=Number(run(db,'INSERT INTO academic_assignments(subject_id,title,description,due_at) VALUES(?,?,?,?)',sid,`Trabalho prático - ${name}`,`Elabore uma reflexão fundamentada sobre os conceitos centrais de ${name}, relacionando-os com a realidade moçambicana. Entregue um texto estruturado com introdução, desenvolvimento e conclusão.`,due).lastInsertRowid);
   run(db,'INSERT INTO academic_announcements(subject_id,author_id,title,body) VALUES(?,?,?,?)',sid,tid,'Materiais e orientação da unidade curricular','Os materiais de apoio estão disponíveis na biblioteca. Consulte o plano de trabalho e respeite os prazos indicados.');
   for(const student of ids){
    run(db,"INSERT INTO academic_grades(subject_id,student_id,assessment,grade,published,teacher_id) VALUES(?,?, 'Teste de avaliação I',?,1,?)",sid,student,student===student1?15.5:student===student2?13:16.0,tid);
    run(db,"INSERT INTO academic_grades(subject_id,student_id,assessment,grade,published,teacher_id) VALUES(?,?, 'Teste de avaliação II',?,0,?)",sid,student,student===student1?17.0:14,tid);
   }
   if(sid===1){
    run(db,'INSERT INTO academic_submissions(assignment_id,student_id,body) VALUES(?,?,?)',aid,student2,'Trabalho demonstrativo sobre gestão de organizações em Moçambique.');
   }
  }
  const appId=Number(run(db,`INSERT INTO admission_applications(protocol,full_name,email,phone,birth_date,document_number,province,program_id,study_shift,qualification,status)
   VALUES(?,?,?,?,?,?,?,?,?,?,?)`,'PRE-2026-000001','Mariana Sitoe','mariana.sitoe@example.test','+258 84 000 0061','2006-03-14','BI-DEMO-26001','Maputo Cidade',g,'laboral','12.ª classe','em_analise').lastInsertRowid);
  run(db,'INSERT INTO admission_applications(protocol,full_name,email,phone,birth_date,document_number,province,program_id,study_shift,qualification,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
   'PRE-2026-000002','Celso Mabunda','candidato@ismma.test','+258 84 111 0004','2004-01-16','BI-DEMO-26002','Gaza',d,'pos_laboral','12.ª classe','submetida');
 });
}
module.exports={PROGRAMS,installAcademicSchema,seedAcademic};
