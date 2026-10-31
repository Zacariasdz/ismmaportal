'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {PGLiteSocketServer}=require('@electric-sql/pglite-socket');
const {openDatabase,one,run,transaction}=require('../../src/db');
const {hashPassword}=require('../../src/security');
const {makeApp}=require('../../src/app');

const DEMO_PASSWORD='Demonstracao@2026';

async function startPortal({seed=true,uploadDir}={}){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ismma-test-'));
  const pglite=new PGlite();
  const socket=new PGLiteSocketServer({db:pglite,host:'127.0.0.1',port:0,maxConnections:5});
  await socket.start();
  const port=Number(socket.getServerConn().split(':').pop());
  const connectionString=`postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
  const db=await openDatabase({connectionString,max:5});
  if(seed)await seedDemo(db);
  const directory=uploadDir||path.join(tmp,'uploads');
  const server=makeApp({db,uploadDir:directory,environment:'test'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {
    db,server,pglite,socket,tmp,uploadDir:directory,connectionString,
    base:`http://127.0.0.1:${server.address().port}`,
    async close(){
      await new Promise(resolve=>server.close(resolve));
      await db.close();
      await socket.stop();
      await pglite.close();
      fs.rmSync(tmp,{recursive:true,force:true});
    }
  };
}

async function seedDemo(db,{password=DEMO_PASSWORD}={}){
  await transaction(db,async()=>{
    const addPerson=async(name,email,role,phone,{studentNumber=null,course=null,teacher=0}={})=>{
      const id=Number((await run(db,`INSERT INTO users(name,email,phone,password_hash,role,student_number,course,is_teacher,student_verified,email_verified)
        VALUES(?,?,?,?,?,?,?,?,?,1)`,name,email,phone,hashPassword(password),role,studentNumber,course,teacher,studentNumber?1:0)).lastInsertRowid);
      if(studentNumber)await run(db,"INSERT INTO student_roster(student_number,name,course,status) VALUES(?,?,?,'activo')",studentNumber,name,course);
      return id;
    };
    const admin=await addPerson('Administrador de Demonstração','admin@ismma.test','administrador','+258 84 111 0001');
    const staff=await addPerson('Paulo Nhantumbo','secretaria@ismma.test','funcionario','+258 84 111 0002');
    const student=await addPerson('Ana Macuácua','estudante@ismma.test','estudante','+258 84 111 0003',{studentNumber:'ISMMA2026001',course:'Licenciatura em Gestão de Empresas'});
    const candidate=await addPerson('Celso Mabunda','candidato@ismma.test','candidato','+258 84 111 0004',{course:'Licenciatura em Contabilidade e Auditoria'});
    const teacher1=await addPerson('Teresa Massango','docente@ismma.test','funcionario','+258 84 000 0045',{teacher:1});
    const teacher2=await addPerson('Júlio Machava','docente2@ismma.test','funcionario','+258 86 000 0046',{teacher:1});
    const student2=await addPerson('Sérgio Mucavele','sergio@ismma.test','estudante','+258 87 000 0047',{studentNumber:'ISMMA2026002',course:'Licenciatura em Gestão de Empresas'});
    const student3=await addPerson('Elisa Matsinhe','elisa@ismma.test','estudante','+258 82 000 0048',{studentNumber:'ISMMA2026003',course:'Licenciatura em Direito'});
    await run(db,'INSERT INTO department_staff(user_id,department_id) VALUES (?,1)',staff);
    await run(db,"INSERT INTO reply_templates(department_id,title,body) VALUES(1,'Recepção do pedido','Confirmamos a recepção do seu pedido. A nossa equipa irá analisar a sua solicitação.')");

    const tickets=[
      [student,1,'Declaração de notas','Solicito informação sobre o levantamento de uma declaração de notas.','em_analise'],
      [candidate,1,'Documentos para candidatura','Gostaria de saber quais são os documentos necessários para a candidatura.','respondido'],
      [student,4,'Informação sobre propinas','Pretendo confirmar as modalidades de pagamento das propinas.','aberto']
    ];
    const year=new Date().getFullYear();
    for(const [uid,dep,subject,description,status] of tickets){
      const category=await one(db,'SELECT id FROM categories WHERE department_id=? AND (applies_to=? OR applies_to=?) LIMIT 1',dep,uid===student?'estudante':'candidato','ambos');
      const id=Number((await run(db,'INSERT INTO tickets(protocol,user_id,department_id,category_id,subject,description,status) VALUES (?,?,?,?,?,?,?)',`TEMP-${uid}-${subject}`,uid,dep,category.id,subject,description,status)).lastInsertRowid);
      await run(db,'UPDATE tickets SET protocol=? WHERE id=?',`ISMMA-${year}-${String(id).padStart(6,'0')}`,id);
      await run(db,'INSERT INTO ticket_histories(ticket_id,user_id,action,to_value) VALUES (?,?,?,?)',id,uid,'criado','aberto');
      if(status==='respondido')await run(db,'INSERT INTO messages(ticket_id,user_id,body) VALUES (?,?,?)',id,staff,'Agradecemos o contacto. Dirija-se à Secretaria com o BI, o certificado e as fotografias tipo passe. Confirme os requisitos actualizados junto do ISMMA.');
    }

    const g=await one(db,"SELECT id FROM academic_programs WHERE code='LGE'");
    const d=await one(db,"SELECT id FROM academic_programs WHERE code='LDIR'");
    const subjects=[
      [g.id,'Fundamentos de Gestão','GEST101',teacher1,'Segunda e Quarta, 17h30 - 19h00','Sala A2'],
      [g.id,'Contabilidade Geral I','CONT101',teacher2,'Terça, 17h30 - 20h00','Sala B1'],
      [g.id,'Ética e Deontologia Profissional','ETIC101',teacher1,'Sexta, 17h30 - 19h00','Sala A1'],
      [d.id,'Introdução ao Direito','DIR101',teacher2,'Segunda, 08h00 - 10h00','Sala C3'],
      [d.id,'Direito Constitucional','DIR102',teacher1,'Quinta, 10h00 - 12h00','Sala C3']
    ];
    for(const [pid,name,code,teacher,schedule,room] of subjects){
      const sid=Number((await run(db,'INSERT INTO academic_subjects(program_id,name,code,academic_year,semester,teacher_id,schedule,room) VALUES(?,?,?,?,?,?,?,?)',pid,name,code,2026,1,teacher,schedule,room)).lastInsertRowid);
      const enrolled=pid===g.id?[student,student2]:[student3];
      for(const person of enrolled)await run(db,'INSERT INTO academic_enrollments(subject_id,student_id) VALUES (?,?)',sid,person);
      const due=new Date(Date.now()+((sid%3)+5)*86400000).toISOString().slice(0,19).replace('T',' ');
      const aid=Number((await run(db,'INSERT INTO academic_assignments(subject_id,title,description,due_at) VALUES(?,?,?,?)',sid,`Trabalho prático - ${name}`,`Elabore uma reflexão fundamentada sobre os conceitos centrais de ${name}, relacionando-os com a realidade moçambicana. Entregue um texto estruturado com introdução, desenvolvimento e conclusão.`,due)).lastInsertRowid);
      await run(db,'INSERT INTO academic_announcements(subject_id,author_id,title,body) VALUES(?,?,?,?)',sid,teacher,'Materiais e orientação da unidade curricular','Os materiais de apoio estão disponíveis na biblioteca. Consulte o plano de trabalho e respeite os prazos indicados.');
      for(const person of enrolled){
        await run(db,"INSERT INTO academic_grades(subject_id,student_id,assessment,grade,published,teacher_id) VALUES(?,?, 'Teste de avaliação I',?,1,?)",sid,person,person===student?15.5:person===student2?13:16.0,teacher);
        await run(db,"INSERT INTO academic_grades(subject_id,student_id,assessment,grade,published,teacher_id) VALUES(?,?, 'Teste de avaliação II',?,0,?)",sid,person,person===student?17.0:14,teacher);
      }
      if(sid===1)await run(db,'INSERT INTO academic_submissions(assignment_id,student_id,body) VALUES(?,?,?)',aid,student2,'Trabalho demonstrativo sobre gestão de organizações em Moçambique.');
    }
    await run(db,`INSERT INTO admission_applications(protocol,full_name,email,phone,birth_date,document_number,province,program_id,study_shift,qualification,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`,'PRE-2026-000001','Mariana Sitoe','mariana.sitoe@example.test','+258 84 000 0061','2006-03-14','BI-DEMO-26001','Maputo Cidade',g.id,'laboral','12.ª classe','em_analise');
    await run(db,`INSERT INTO admission_applications(protocol,full_name,email,phone,birth_date,document_number,province,program_id,study_shift,qualification,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`,'PRE-2026-000002','Celso Mabunda','candidato@ismma.test','+258 84 111 0004','2004-01-16','BI-DEMO-26002','Gaza',d.id,'pos_laboral','12.ª classe','submetida');
  });
}

module.exports={startPortal,seedDemo,DEMO_PASSWORD};
