'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {portalLanding}=require('../src/academic-views');
const {layout,publicLayout}=require('../src/views');
const page=portalLanding();
const root=path.resolve(__dirname,'..');

test('portal v5 expõe acessos académicos e atendimento, sem estilo promocional',()=>{
 for(const expected of ['Pré-inscrições','Portal do estudante','Área do docente','Atendimento académico','Documentos e formulários'])assert.ok(page.includes(expected),expected);
 for(const route of ['/pre-inscricao','/entrar','/acompanhar-candidatura','/documentos'])assert.ok(page.includes(`href="${route}"`),route);
 assert.match(page,/Portal Académico/);
 assert.match(page,/m5-public-grid/);
 assert.doesNotMatch(page,/iv4-hero-photo|iv4-hero-overlay|orbit-tag/);
});

test('navegação pública funciona em telemóveis e mantém rotas existentes',()=>{
 assert.match(page,/data-public-menu/);
 assert.match(page,/aria-expanded="false"/);
 assert.match(page,/id="iv4-mobile-nav"/);
 assert.match(page,/href="\/instituicao#cursos"/);
 assert.doesNotMatch(page,/href="\/academico\/cursos"/);
});

test('identidade da instituição e recurso gráfico possuem fallback local',()=>{
 const seal=path.join(root,'public','selo-ismma-referencia.svg');
 assert.ok(fs.readFileSync(seal,'utf8').startsWith('<svg'));
 assert.match(page,/src="\/selo-ismma-referencia.svg"/);
 assert.doesNotMatch(page,/image-11\.png/);
 assert.match(page,/Instituto Superior Maria Mãe de África/);
 assert.match(page,/A Verdade na Caridade/);
});

test('área reservada tem navegação típica de ambiente académico e CSS específico',()=>{
 const inner=layout({user:{name:'Estudante Exemplo',role:'estudante'},title:'Disciplinas',route:'/academico/disciplinas',csrf:'abc'});
 assert.match(inner,/class="app-shell m5-app"/);
 assert.match(inner,/Minhas disciplinas/);
 assert.match(inner,/Trabalhos e tarefas/);
 assert.match(inner,/Notas e avaliações/);
 assert.match(inner,/portal-v5.css/);
 assert.match(page,/class="m5-service-item"/);
 assert.ok((page.match(/class="m5-service-item"/g)||[] ) .length===6);
 const css=fs.readFileSync(path.join(root,'public','portal-v5.css'),'utf8');
 assert.match(css,/@media\(max-width:580px\)/);
 assert.match(css,/\.m5-app \.sidebar/);
});

test('a página de confirmação mantém visual adaptado sem dependências externas',()=>{
 const html=publicLayout('Iniciar sessão','<p>Teste</p>');
 assert.match(html,/portal-v5.css/);
 assert.doesNotMatch(html,/<script src="https?:\/\//);
});


test('pré-inscrição pública usa walkthrough em 3 passos e resumo antes de submeter',()=>{
 const page=require('../src/academic-views').admissionForm({programs:[{id:1,name:'Direito'}],csrfToken:'abc'});
 assert.match(page,/data-step-form/);
 assert.match(page,/data-step-panel="1"/);
 assert.match(page,/data-step-panel="2"/);
 assert.match(page,/data-step-panel="3"/);
 assert.match(page,/data-step-next/);
 assert.match(page,/data-step-prev/);
 assert.match(page,/data-review="program_id"/);
 assert.match(page,/Pré-inscrição online/);
});
