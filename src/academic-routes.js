'use strict';
const {one,all,run,transaction,audit,notify}=require('./db');
const {validateFile,storeFile,scanFile,passwordValid,hashPassword}=require('./security');
const AV=require('./academic-views');
const V=require('./views');
const e=V.e;
const num=x=>Number.parseInt(String(x||''),10)||0;
const s=(b,k)=>String(b[k]??'').trim();
const stamp=()=>new Date().toISOString().slice(0,19).replace('T',' ');
const emailOk=x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)&&x.length<=180;
const phoneOk=x=>/^\+?258[\s-]*8[2-7][\d\s-]{7,13}$/.test(x);
const dateOk=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x));
const PROVINCES=['Maputo Cidade','Maputo Província','Gaza','Inhambane','Sofala','Manica','Tete','Zambézia','Nampula','Cabo Delgado','Niassa'];

function registerAcademicRoutes({db,get,post,page,html,fail,redirect,reject,rate,uploadDir}){
 const programList=async()=>await all(db,'SELECT * FROM academic_programs WHERE is_active=1 ORDER BY name');
 const subjectBase=`SELECT s.*,p.name AS program_name,u.name AS teacher_name FROM academic_subjects s
 JOIN academic_programs p ON p.id=s.program_id LEFT JOIN users u ON u.id=s.teacher_id`;
 function teacherCan(user,subject){return user.role==='administrador'||!!user.is_teacher&&user.id===subject.teacher_id;}
 async function enrollment(user,subjectId){return !!await one(db,"SELECT id FROM academic_enrollments WHERE subject_id=? AND student_id=? AND status='inscrito'",subjectId,user.id);}
 async function academicAccess(user,subject){return user.role==='administrador'||!!user.is_teacher&&subject.teacher_id===user.id||user.role==='estudante'&&await enrollment(user,subject.id);}
 async function subjectFrom(ctx,field='id'){
  const subject=await one(db,subjectBase+' WHERE s.id=?',num(ctx.params[field]));
  if(!subject||!await academicAccess(ctx.user,subject)){fail(ctx,404,'Disciplina não encontrada ou sem acesso.');return null;}
  return subject;
 }
 async function teachSubject(ctx,field='id'){
  const subject=await subjectFrom(ctx,field);
  if(subject&&!teacherCan(ctx.user,subject)){fail(ctx,403,'Só o docente responsável pode realizar esta operação.');return null;}
  return subject;
 }
 async function academicSubjects(user){
  if(user.role==='administrador')return await all(db,subjectBase+' ORDER BY s.academic_year DESC,s.name');
  if(user.is_teacher)return await all(db,subjectBase+' WHERE s.teacher_id=? ORDER BY s.name',user.id);
  if(user.role==='estudante')return await all(db,subjectBase+" JOIN academic_enrollments ae ON ae.subject_id=s.id WHERE ae.student_id=? AND ae.status='inscrito' ORDER BY s.name",user.id);
  return [];
 }
 async function assignmentQuery(user,limit=60){
  const base=`SELECT a.*,s.name AS subject_name,s.code,s.teacher_id,sub.submitted_at
   FROM academic_assignments a JOIN academic_subjects s ON s.id=a.subject_id
   LEFT JOIN academic_submissions sub ON sub.assignment_id=a.id AND sub.student_id=?`;
  if(user.role==='administrador')return await all(db,base+' ORDER BY a.due_at ASC LIMIT ?',user.id,limit);
  if(user.is_teacher)return await all(db,base+' WHERE s.teacher_id=? ORDER BY a.due_at ASC LIMIT ?',user.id,user.id,limit);
  if(user.role==='estudante')return await all(db,base+` JOIN academic_enrollments ae ON ae.subject_id=s.id AND ae.student_id=? AND ae.status='inscrito' WHERE a.published=1 ORDER BY a.due_at ASC LIMIT ?`,user.id,user.id,limit);
  return [];
 }
 async function gradeQuery(user){return await all(db,`SELECT g.*,s.name AS subject_name,s.code FROM academic_grades g
    JOIN academic_subjects s ON s.id=g.subject_id WHERE g.student_id=? AND g.published=1
    AND EXISTS(SELECT 1 FROM academic_enrollments ae WHERE ae.student_id=g.student_id AND ae.subject_id=g.subject_id AND ae.status='inscrito')
    ORDER BY g.updated_at DESC LIMIT 120`,user.id);}
 get('/pre-inscricao',async ctx=>html(ctx,AV.admissionForm({programs:await programList(),csrfToken:ctx.csrf})));
 post('/pre-inscricao',async ctx=>{
  await rate(ctx,'pre-inscricao',8,3600000);
  const b=ctx.body,fullName=s(b,'full_name'),email=s(b,'email').toLowerCase(),phone=s(b,'phone'),birth=s(b,'birth_date'),doc=s(b,'document_number'),province=s(b,'province'),programId=num(b.program_id),shift=s(b,'study_shift'),qualification=s(b,'qualification');
  const allowed=['12.ª classe','Equivalente à 12.ª classe','Licenciatura','Outro'];
  if(fullName.length<5||fullName.length>120||!emailOk(email)||!phoneOk(phone)||doc.length<4||doc.length>50||!PROVINCES.includes(province)||!['laboral','pos_laboral'].includes(shift)||!allowed.includes(qualification)||s(b,'agreement')!=='1'||birth&&!dateOk(birth)||!await one(db,'SELECT id FROM academic_programs WHERE id=? AND is_active=1',programId))reject('Preencha correctamente os campos obrigatórios da pré-inscrição.');
  const files=ctx.files.filter(file=>['identificacao','habilitacoes'].includes(file.field));
  if(files.length>2||new Set(files.map(f=>f.field)).size!==files.length)reject('Envie no máximo um documento por categoria.');
  for(const file of files){
   const v=validateFile(file,{type:'ticket',maxBytes:5*1024*1024});
   if(!['application/pdf','image/jpeg','image/png'].includes(v.mime))reject('Os documentos de admissão devem estar em PDF ou imagem JPG/PNG.');
   await scanFile(file.data);
  }
  const saved=[];
  try{for(const file of files)saved.push({...storeFile(uploadDir,file,{type:'ticket',maxBytes:5*1024*1024}),type:file.field});}
  catch(error){const fs=require('node:fs'),path=require('node:path');for(const f of saved){try{fs.unlinkSync(path.join(uploadDir,f.path));}catch{}}throw error;}
  const id=await transaction(db,async()=>{
   const temp='TEMP-'+require('node:crypto').randomUUID();
   const r=await run(db,'INSERT INTO admission_applications(protocol,full_name,email,phone,birth_date,document_number,province,program_id,study_shift,qualification) VALUES(?,?,?,?,?,?,?,?,?,?)',temp,fullName,email,phone,birth||null,doc,province,programId,shift,qualification);
   const id=Number(r.lastInsertRowid);
   await run(db,'UPDATE admission_applications SET protocol=? WHERE id=?',`PRE-${new Date().getFullYear()}-${String(id).padStart(6,'0')}`,id);
   for(const file of saved)await run(db,'INSERT INTO admission_files(application_id,type,original_name,path,mime,size) VALUES(?,?,?,?,?,?)',id,file.type,file.original_name,file.path,file.mime,file.size);
   await audit(db,ctx.user,'pre_inscricao_submetida','admission_application',id);
   return id;
  });
  // Confirmação por sessão temporária: não revelar dados por número simples.
  const application=await one(db,'SELECT a.*,p.name AS program_name FROM admission_applications a JOIN academic_programs p ON p.id=a.program_id WHERE a.id=?',id);
  html(ctx,AV.admissionSuccess(application));
 });
 get('/acompanhar-candidatura',async ctx=>html(ctx,AV.trackAdmission({csrfToken:ctx.csrf})));
 post('/acompanhar-candidatura',async ctx=>{
  await rate(ctx,'acompanhar-candidatura',15,3600000);
  const protocol=s(ctx.body,'protocol').toUpperCase(),email=s(ctx.body,'email').toLowerCase();
  if(!/^PRE-\d{4}-\d{6}$/.test(protocol)||!emailOk(email))return html(ctx,AV.trackAdmission({csrfToken:ctx.csrf,found:true}));
  const result=await one(db,'SELECT protocol,status FROM admission_applications WHERE protocol=? AND email=?',protocol,email);
  html(ctx,AV.trackAdmission({csrfToken:ctx.csrf,result,found:true}));
 });
 const academicHome=async ctx=>{
  const user=ctx.user,subjects=await academicSubjects(user),assignments=await assignmentQuery(user,5),grades=user.role==='estudante'?await gradeQuery(user):[],announcements=user.role==='estudante'?await all(db,`SELECT a.*,s.name AS subject_name FROM academic_announcements a JOIN academic_subjects s ON s.id=a.subject_id JOIN academic_enrollments ae ON ae.subject_id=s.id WHERE ae.student_id=? AND ae.status='inscrito' ORDER BY a.id DESC LIMIT 4`,user.id):[],applications=user.role==='candidato'?await all(db,`SELECT a.protocol,a.status,p.name AS program_name FROM admission_applications a JOIN academic_programs p ON p.id=a.program_id WHERE a.email=? ORDER BY a.id DESC LIMIT 10`,user.email):[],tickets=(await one(db,`SELECT COUNT(*) n FROM tickets WHERE ${user.role==='administrador'?'1=1':user.role==='funcionario'?'department_id IN (SELECT department_id FROM department_staff WHERE user_id=?)':'user_id=?'}`, ...(user.role==='administrador'?[]:[user.id]))).n;
  const counts={subjects:subjects.length,tasks:user.role==='estudante'?assignments.filter(a=>!a.submitted_at).length:user.role==='administrador'?(await one(db,'SELECT COUNT(*) n FROM admission_applications')).n:assignments.length,grades:user.role==='administrador'?(await one(db,"SELECT COUNT(*) n FROM users WHERE role='estudante'")).n:user.is_teacher?(await one(db,`SELECT COUNT(*) n FROM academic_submissions sub JOIN academic_assignments a ON a.id=sub.assignment_id JOIN academic_subjects s ON s.id=a.subject_id WHERE s.teacher_id=?`,user.id)).n:grades.length,tickets};
  await page(ctx,'Visão académica',AV.academicOverview({user,subjects:subjects.slice(0,5),assignments,grades,announcements,applications,counts}),'Disciplinas, trabalhos e informação do seu percurso académico.');
 };
 get('/academico',academicHome,{auth:true});
 get('/academico/disciplinas',async ctx=>await page(ctx,'Disciplinas',AV.programsPage({subjects:await academicSubjects(ctx.user),programs:ctx.user.role==='administrador'?await programList():[],user:ctx.user}),'Unidades curriculares do ano académico 2026.'),{auth:true});
 get('/academico/disciplinas/:id',async ctx=>{
  const subject=await subjectFrom(ctx);if(!subject)return;
  const teacher=teacherCan(ctx.user,subject);
  const assignments=await all(db,`SELECT a.*,sub.submitted_at FROM academic_assignments a LEFT JOIN academic_submissions sub ON sub.assignment_id=a.id AND sub.student_id=? WHERE a.subject_id=? AND (a.published=1 OR ?=1) ORDER BY a.due_at`,ctx.user.id,subject.id,teacher?1:0);
  const grades=teacher?[]:await all(db,'SELECT * FROM academic_grades WHERE subject_id=? AND student_id=? AND published=1 ORDER BY assessment',subject.id,ctx.user.id);
  const announcements=await all(db,'SELECT * FROM academic_announcements WHERE subject_id=? ORDER BY id DESC LIMIT 15',subject.id);
  const enrollments=teacher?await all(db,`SELECT u.id,u.name,u.email,u.student_number FROM academic_enrollments ae JOIN users u ON u.id=ae.student_id WHERE ae.subject_id=? AND ae.status='inscrito' ORDER BY u.name`,subject.id):[];
  await page(ctx,subject.name,AV.subjectPage({subject,user:ctx.user,assignments,grades,announcements,enrollments,csrfToken:ctx.csrf}),'Unidade curricular · '+subject.code);
 },{auth:true});
 get('/academico/trabalhos',async ctx=>{
  const teacher=ctx.user.role==='administrador'||!!ctx.user.is_teacher;
  const assignments=await assignmentQuery(ctx.user);
  if(teacher)for(const a of assignments)a.submissions=(await one(db,'SELECT COUNT(*) n FROM academic_submissions WHERE assignment_id=?',a.id)).n;
  await page(ctx,'Trabalhos académicos',AV.assignmentsPage({assignments,teacher}),'Acompanhe os prazos e as suas entregas.');
 },{auth:true});
 async function assignmentFrom(ctx){
  const assignment=await one(db,`SELECT a.*,s.name AS subject_name,s.code,s.teacher_id,s.id AS sid FROM academic_assignments a JOIN academic_subjects s ON s.id=a.subject_id WHERE a.id=?`,num(ctx.params.id));
  if(!assignment||!await academicAccess(ctx.user,{id:assignment.sid,teacher_id:assignment.teacher_id})||(!teacherCan(ctx.user,assignment)&&!assignment.published)){fail(ctx,404,'Trabalho não encontrado ou sem acesso.');return null;}
  return assignment;
 }
 get('/academico/trabalhos/:id',async ctx=>{
  const assignment=await assignmentFrom(ctx);if(!assignment)return;
  const teacher=teacherCan(ctx.user,assignment);
  const submission=teacher?null:await one(db,'SELECT * FROM academic_submissions WHERE assignment_id=? AND student_id=?',assignment.id,ctx.user.id);
  const submissions=teacher?await all(db,`SELECT sub.*,u.name,u.student_number,g.grade,g.published FROM academic_submissions sub JOIN users u ON u.id=sub.student_id LEFT JOIN academic_grades g ON g.assignment_id=sub.assignment_id AND g.student_id=sub.student_id WHERE sub.assignment_id=? ORDER BY sub.id DESC`,assignment.id):[];
  await page(ctx,assignment.title,AV.assignmentDetail({assignment,user:ctx.user,submission,submissions,csrfToken:ctx.csrf,teacher}),'Entrega e acompanhamento académico.');
 },{auth:true});
 post('/academico/trabalhos/:id/submeter',async ctx=>{
  if(ctx.user.role!=='estudante')return fail(ctx,403,'A entrega é reservada aos estudantes.');
  const a=await assignmentFrom(ctx);if(!a)return;
  if(Date.now()>Date.parse(a.due_at.replace(' ','T')+'Z'))reject('O prazo deste trabalho terminou.');
  const body=s(ctx.body,'body'),file=ctx.files.find(x=>x.field==='ficheiro');
  if(body.length>6000||!body&& !file)reject('Escreva uma resposta ou anexe um ficheiro.');
  if(file){validateFile(file,{type:'ticket',maxBytes:5*1024*1024});await scanFile(file.data);}
  const previous=await one(db,'SELECT * FROM academic_submissions WHERE assignment_id=? AND student_id=?',a.id,ctx.user.id);
  const saved=file?storeFile(uploadDir,file,{type:'ticket',maxBytes:5*1024*1024}):null;
  await transaction(db,async()=>{
   await run(db,`INSERT INTO academic_submissions(assignment_id,student_id,body,file_path,original_name,mime) VALUES(?,?,?,?,?,?)
    ON CONFLICT(assignment_id,student_id) DO UPDATE SET body=excluded.body,
    file_path=COALESCE(excluded.file_path,academic_submissions.file_path),
    original_name=COALESCE(excluded.original_name,academic_submissions.original_name),
    mime=COALESCE(excluded.mime,academic_submissions.mime),submitted_at=now(),feedback=NULL`,
    a.id,ctx.user.id,body,saved?.path||null,saved?.original_name||null,saved?.mime||null);
   if(previous)await run(db,'DELETE FROM academic_grades WHERE assignment_id=? AND student_id=?',a.id,ctx.user.id);
   await audit(db,ctx.user,'entregou_trabalho','academic_assignment',a.id);
   if(a.teacher_id)await notify(db,a.teacher_id,'Nova entrega académica',`Foi submetido o trabalho ${a.title}.`,`/academico/trabalhos/${a.id}`,false);
  });
  if(previous?.file_path&&saved){const fs=require('node:fs'),path=require('node:path');try{fs.unlinkSync(path.join(uploadDir,previous.file_path));}catch{}}
  redirect(ctx,`/academico/trabalhos/${a.id}`,'Trabalho submetido com sucesso.');
 },{auth:true,roles:['estudante']});
 get('/academico/submissoes/:id/ficheiro',async ctx=>{
  const sub=await one(db,`SELECT sub.*,a.subject_id,s.teacher_id FROM academic_submissions sub JOIN academic_assignments a ON a.id=sub.assignment_id JOIN academic_subjects s ON s.id=a.subject_id WHERE sub.id=?`,num(ctx.params.id));
  if(!sub?.file_path||!(sub.student_id===ctx.user.id||teacherCan(ctx.user,{teacher_id:sub.teacher_id})))return fail(ctx,404,'Ficheiro não encontrado.');
  const fs=require('node:fs'),path=require('node:path');const full=path.join(uploadDir,path.basename(sub.file_path));
  if(!fs.existsSync(full))return fail(ctx,404,'O ficheiro não está disponível.');
  await audit(db,ctx.user,'descarregou_trabalho','academic_submission',sub.id);
  ctx.res.writeHead(200,{'Content-Type':sub.mime||'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(sub.original_name||'trabalho')}`,'X-Content-Type-Options':'nosniff'});
  fs.createReadStream(full).pipe(ctx.res);
 },{auth:true});
 get('/academico/notas',async ctx=>{
  if(ctx.user.role!=='estudante')return fail(ctx,403,'O boletim individual é reservado aos estudantes.');
  await page(ctx,'Notas e avaliações',AV.gradePage({grades:await gradeQuery(ctx.user),teacher:false}),'Apenas avaliações publicadas.');
 },{auth:true,roles:['estudante']});
 post('/docente/disciplinas/:id/trabalhos',async ctx=>{
  const subject=await teachSubject(ctx);if(!subject)return;
  const title=s(ctx.body,'title'),description=s(ctx.body,'description'),due=s(ctx.body,'due_at');
  const when=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due)?Date.parse(due+':00+02:00'):NaN;if(title.length<4||title.length>160||description.length<10||description.length>5000||!Number.isFinite(when)||when<Date.now()||when>Date.now()+366*86400000)reject('Verifique o título, as orientações e o prazo do trabalho.');
  const id=Number((await run(db,'INSERT INTO academic_assignments(subject_id,title,description,due_at) VALUES(?,?,?,?)',subject.id,title,description,new Date(when).toISOString().slice(0,19).replace('T',' '))).lastInsertRowid);
  await audit(db,ctx.user,'publicou_trabalho','academic_assignment',id);
  for(const st of await all(db,"SELECT student_id FROM academic_enrollments WHERE subject_id=? AND status='inscrito'",subject.id))await notify(db,st.student_id,'Novo trabalho académico',`A disciplina ${subject.name} publicou o trabalho ${title}.`,`/academico/trabalhos/${id}`,false);
  redirect(ctx,`/academico/disciplinas/${subject.id}`,'Trabalho publicado.');
 },{auth:true,roles:['funcionario','administrador']});
 post('/docente/disciplinas/:id/comunicados',async ctx=>{
  const subject=await teachSubject(ctx);if(!subject)return;
  const title=s(ctx.body,'title'),body=s(ctx.body,'body');if(title.length<3||title.length>120||body.length<5||body.length>3000)reject('Preencha o assunto e a mensagem.');
  const id=Number((await run(db,'INSERT INTO academic_announcements(subject_id,author_id,title,body) VALUES(?,?,?,?)',subject.id,ctx.user.id,title,body)).lastInsertRowid);await audit(db,ctx.user,'publicou_comunicado','academic_announcement',id);
  for(const st of await all(db,"SELECT student_id FROM academic_enrollments WHERE subject_id=? AND status='inscrito'",subject.id))await notify(db,st.student_id,'Novo comunicado',`Comunicado de ${subject.name}: ${title}.`,`/academico/disciplinas/${subject.id}`,false);
  redirect(ctx,`/academico/disciplinas/${subject.id}`,'Comunicado publicado.');
 },{auth:true,roles:['funcionario','administrador']});
 get('/docente/disciplinas/:id/notas',async ctx=>{
  const subject=await teachSubject(ctx);if(!subject)return;
  const grades=await all(db,'SELECT g.*,u.name AS student_name FROM academic_grades g JOIN users u ON u.id=g.student_id WHERE g.subject_id=? ORDER BY u.name,g.assessment',subject.id);
  const students=await all(db,"SELECT u.id,u.name,u.student_number FROM users u JOIN academic_enrollments ae ON ae.student_id=u.id WHERE ae.subject_id=? AND ae.status='inscrito' ORDER BY u.name",subject.id);
  await page(ctx,'Lançamento de notas',AV.gradePage({teacher:true,subject,grades,students,csrfToken:ctx.csrf}),'Avaliações por estudante, com publicação controlada.');
 },{auth:true,roles:['funcionario','administrador']});
 post('/docente/disciplinas/:id/notas',async ctx=>{
  const subject=await teachSubject(ctx);if(!subject)return;
  const studentId=num(ctx.body.student_id),assessment=s(ctx.body,'assessment'),raw=s(ctx.body,'grade'),grade=Number(raw),published=s(ctx.body,'published')==='1'?1:0;
  if(!await enrollment({id:studentId},subject.id)||assessment.length<3||assessment.length>100||!raw||!Number.isFinite(grade)||grade<0||grade>20)reject('Estudante, avaliação ou nota inválidos. Use valores entre 0 e 20.');
  await run(db,`INSERT INTO academic_grades(subject_id,student_id,assessment,grade,published,teacher_id) VALUES(?,?,?,?,?,?)
   ON CONFLICT(subject_id,student_id,assessment) DO UPDATE SET grade=excluded.grade,published=excluded.published,teacher_id=excluded.teacher_id,updated_at=now()`,subject.id,studentId,assessment,grade,published,ctx.user.id);
  await audit(db,ctx.user,published?'publicou_nota':'guardou_nota','academic_subject',subject.id,assessment);
  if(published)await notify(db,studentId,'Nota académica publicada',`A disciplina ${subject.name} publicou uma avaliação.`, '/academico/notas',false);
  redirect(ctx,`/docente/disciplinas/${subject.id}/notas`,'Avaliação guardada.');
 },{auth:true,roles:['funcionario','administrador']});
 post('/docente/notas/:id/publicar',async ctx=>{
  const grade=await one(db,`SELECT g.*,s.teacher_id,s.name AS subject_name FROM academic_grades g JOIN academic_subjects s ON s.id=g.subject_id WHERE g.id=?`,num(ctx.params.id));
  if(!grade||!teacherCan(ctx.user,grade))return fail(ctx,404,'Avaliação não encontrada.');
  await run(db,"UPDATE academic_grades SET published=CASE WHEN published=1 THEN 0 ELSE 1 END,updated_at=now() WHERE id=?",grade.id);
  await audit(db,ctx.user,'alterou_publicacao_nota','academic_grade',grade.id);
  if(!grade.published)await notify(db,grade.student_id,'Nota académica publicada',`A disciplina ${grade.subject_name} publicou uma avaliação.`,'/academico/notas',false);
  redirect(ctx,`/docente/disciplinas/${grade.subject_id}/notas`,'Visibilidade da nota actualizada.');
 },{auth:true,roles:['funcionario','administrador']});
 post('/docente/submissoes/:id/avaliar',async ctx=>{
  const sub=await one(db,`SELECT sub.*,a.subject_id,a.title,s.teacher_id,s.name AS subject_name FROM academic_submissions sub JOIN academic_assignments a ON a.id=sub.assignment_id JOIN academic_subjects s ON s.id=a.subject_id WHERE sub.id=?`,num(ctx.params.id));
  if(!sub||!teacherCan(ctx.user,sub))return fail(ctx,404,'Submissão não encontrada.');
  const raw=s(ctx.body,'grade'),grade=Number(raw),feedback=s(ctx.body,'feedback'),published=s(ctx.body,'published')==='1'?1:0;
  if(!raw||!Number.isFinite(grade)||grade<0||grade>20||feedback.length>1500)reject('Nota ou comentário inválido.');
  await transaction(db,async()=>{
   await run(db,'UPDATE academic_submissions SET feedback=? WHERE id=?',feedback,sub.id);
   await run(db,`INSERT INTO academic_grades(subject_id,student_id,assignment_id,assessment,grade,published,teacher_id) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(subject_id,student_id,assessment) DO UPDATE SET grade=excluded.grade,published=excluded.published,teacher_id=excluded.teacher_id,assignment_id=excluded.assignment_id,updated_at=now()`,sub.subject_id,sub.student_id,sub.assignment_id,sub.title,grade,published,ctx.user.id);
   await audit(db,ctx.user,'avaliou_submissao','academic_submission',sub.id);
   if(published)await notify(db,sub.student_id,'Trabalho avaliado',`O docente avaliou o trabalho de ${sub.subject_name}.`,'/academico/notas',false);
  });
  redirect(ctx,`/academico/trabalhos/${sub.assignment_id}`,'Avaliação guardada.');
 },{auth:true,roles:['funcionario','administrador']});
 get('/admin/candidaturas',async ctx=>{
  const q=String(ctx.url.searchParams.get('pesquisa')||'').slice(0,80),status=String(ctx.url.searchParams.get('estado')||'');
  let where=' WHERE 1=1 ',args=[];if(q){where+=' AND (a.protocol LIKE ? OR a.full_name LIKE ? OR a.email LIKE ?)';args.push(...Array(3).fill('%'+q+'%'));}if(['submetida','em_analise','aprovada','nao_aprovada'].includes(status)){where+=' AND a.status=?';args.push(status);}
  const applications=await all(db,`SELECT a.*,p.name AS program_name FROM admission_applications a JOIN academic_programs p ON p.id=a.program_id ${where} ORDER BY a.id DESC LIMIT 100`,...args);
  await page(ctx,'Gestão de candidaturas',AV.admissionsAdmin({applications,csrfToken:ctx.csrf,filters:{q,status}}),'Pré-inscrições submetidas no ambiente de demonstração.');
 },{auth:true,roles:['administrador']});
 get('/admin/candidaturas/:id',async ctx=>{
  const application=await one(db,`SELECT a.*,p.name AS program_name FROM admission_applications a JOIN academic_programs p ON p.id=a.program_id WHERE a.id=?`,num(ctx.params.id));
  if(!application)return fail(ctx,404,'Candidatura não encontrada.');
  const files=await all(db,'SELECT id,type,original_name FROM admission_files WHERE application_id=?',application.id);
  await page(ctx,application.protocol,AV.admissionAdminDetail({application,csrfToken:ctx.csrf,files}),'Análise e decisão administrativa da candidatura.');
 },{auth:true,roles:['administrador']});
 get('/admin/candidaturas/:id/ficheiros/:fileId',async ctx=>{
  const file=await one(db,'SELECT * FROM admission_files WHERE id=? AND application_id=?',num(ctx.params.fileId),num(ctx.params.id));
  if(!file)return fail(ctx,404,'Documento de candidatura não encontrado.');
  const fs=require('node:fs'),path=require('node:path');const filePath=path.join(uploadDir,path.basename(file.path));
  if(!fs.existsSync(filePath))return fail(ctx,404,'Documento indisponível.');
  await audit(db,ctx.user,'consultou_documento_candidatura','admission_file',file.id);
  ctx.res.writeHead(200,{'Content-Type':file.mime,'X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`});
  fs.createReadStream(filePath).pipe(ctx.res);
 },{auth:true,roles:['administrador']});
 post('/admin/candidaturas/:id/estado',async ctx=>{
  const a=await one(db,'SELECT * FROM admission_applications WHERE id=?',num(ctx.params.id));if(!a)return fail(ctx,404,'Candidatura não encontrada.');
  const status=s(ctx.body,'status'),notes=s(ctx.body,'notes');if(!['submetida','em_analise','aprovada','nao_aprovada'].includes(status)||notes.length>1500)reject('Estado ou observação inválidos.');
  await run(db,'UPDATE admission_applications SET status=?,notes=?,reviewed_by=?,reviewed_at=? WHERE id=?',status,notes,ctx.user.id,stamp(),a.id);
  await audit(db,ctx.user,'actualizou_candidatura','admission_application',a.id,status);
  const user=await one(db,'SELECT id FROM users WHERE email=? AND is_active=1',a.email);
  if(user)await notify(db,user.id,'Estado de candidatura actualizado',`O protocolo ${a.protocol} foi actualizado.`,'/academico',false);
  redirect(ctx,`/admin/candidaturas/${a.id}`,'Candidatura actualizada.');
 },{auth:true,roles:['administrador']});
 get('/admin/academico',async ctx=>{
  const programs=await programList(),teachers=await all(db,"SELECT id,name FROM users WHERE is_teacher=1 AND role='funcionario' AND is_active=1 ORDER BY name"),students=await all(db,"SELECT id,name,student_number FROM users WHERE role='estudante' AND student_verified=1 AND is_active=1 ORDER BY name"),subjects=await all(db,subjectBase+` LEFT JOIN (SELECT subject_id,COUNT(*) AS student_count FROM academic_enrollments WHERE status='inscrito' GROUP BY subject_id) q ON q.subject_id=s.id ORDER BY s.id DESC`);
  await page(ctx,'Gestão académica',AV.academicAdmin({programs,teachers,students,subjects,csrfToken:ctx.csrf}),'Cursos, unidades curriculares e inscrições de estudantes.');
 },{auth:true,roles:['administrador']});
 post('/admin/academico/disciplinas',async ctx=>{
  const b=ctx.body,programId=num(b.program_id),name=s(b,'name'),code=s(b,'code').toUpperCase(),year=num(b.academic_year),semester=num(b.semester),teacherId=num(b.teacher_id),schedule=s(b,'schedule'),room=s(b,'room');
  if(!await one(db,'SELECT id FROM academic_programs WHERE id=? AND is_active=1',programId)||name.length<4||name.length>150||!/^[A-Z0-9-]{3,24}$/.test(code)||year<2020||year>2100||![1,2].includes(semester)||schedule.length>180||room.length>60||teacherId&&!await one(db,"SELECT id FROM users WHERE id=? AND is_teacher=1 AND is_active=1",teacherId))reject('Verifique os dados da disciplina e o docente atribuído.');
  const id=Number((await run(db,'INSERT INTO academic_subjects(program_id,name,code,academic_year,semester,teacher_id,schedule,room) VALUES(?,?,?,?,?,?,?,?)',programId,name,code,year,semester,teacherId||null,schedule,room)).lastInsertRowid);
  await audit(db,ctx.user,'criou_disciplina','academic_subject',id);redirect(ctx,'/admin/academico','Disciplina criada.');
 },{auth:true,roles:['administrador']});
 post('/admin/academico/cursos',async ctx=>{
  const name=s(ctx.body,'name'),code=s(ctx.body,'code').toUpperCase(),years=num(ctx.body.duration_years);
  if(name.length<8||name.length>170||!/^[A-Z0-9-]{3,20}$/.test(code)||years<1||years>8)reject('Verifique o nome, código e duração do curso.');
  const id=Number((await run(db,'INSERT INTO academic_programs(name,code,duration_years) VALUES(?,?,?)',name,code,years)).lastInsertRowid);
  await audit(db,ctx.user,'criou_programa_academico','academic_program',id,name);
  redirect(ctx,'/admin/academico','Curso registado.');
 },{auth:true,roles:['administrador']});
 post('/admin/academico/docentes',async ctx=>{
  const name=s(ctx.body,'name'),email=s(ctx.body,'email').toLowerCase(),phone=s(ctx.body,'phone'),password=s(ctx.body,'password');
  if(name.length<5||name.length>120||!emailOk(email)||!phoneOk(phone)||!passwordValid(password))reject('Dados do docente inválidos. A palavra-passe deve ter pelo menos 10 caracteres com maiúsculas, minúsculas e números.');
  if(await one(db,'SELECT id FROM users WHERE email=?',email))reject('Já existe uma conta com este email.');
  const id=Number((await run(db,`INSERT INTO users(name,email,phone,password_hash,role,is_teacher,email_verified) VALUES(?,?,?,?,'funcionario',1,0)`,name,email,phone,hashPassword(password))).lastInsertRowid);
  await audit(db,ctx.user,'criou_docente','user',id);
  redirect(ctx,'/admin/academico','Docente registado.');
 },{auth:true,roles:['administrador']});
 post('/admin/academico/inscricoes',async ctx=>{
  const sid=num(ctx.body.student_id),courseId=num(ctx.body.subject_id),student=await one(db,"SELECT id FROM users WHERE id=? AND role='estudante' AND student_verified=1 AND is_active=1",sid),subject=await one(db,'SELECT id FROM academic_subjects WHERE id=?',courseId);
  if(!student||!subject)reject('Estudante ou disciplina inválidos.');
  await run(db,"INSERT INTO academic_enrollments(subject_id,student_id,status) VALUES(?,?,'inscrito') ON CONFLICT(subject_id,student_id) DO UPDATE SET status='inscrito'",courseId,sid);
  await audit(db,ctx.user,'inscreveu_estudante','academic_subject',courseId,`estudante ${sid}`);
  redirect(ctx,'/admin/academico','Estudante inscrito.');
 },{auth:true,roles:['administrador']});
 return {academicHome};
}
module.exports={registerAcademicRoutes};
