# Portal Académico ISMMA - Protótipo de Demonstração

**Instituto Superior Maria Mãe de África | Moçambique | Outubro de 2026**

Projecto educativo e independente, criado para demonstrar como poderia funcionar um portal académico institucional. **Não é um serviço oficial do ISMMA, não recebe candidaturas oficiais nem deve recolher dados pessoais reais.**

Este projecto evolui a versão anterior do sistema de atendimento, mantendo os pedidos, os documentos e a administração, e acrescenta:

- Página pública do portal com acesso a admissões, estudante, docente e atendimento.
- **Pré-inscrições** com protocolo `PRE-AAAA-NNNNNN`, curso pretendido, dados fictícios, documentos opcionais e acompanhamento do estado por protocolo e email.
- **Área dos estudantes** com disciplinas inscritas, calendário/horários, trabalhos, entrega de textos e anexos, notas publicadas e comunicados.
- **Área dos docentes** com disciplinas atribuídas, publicação de trabalhos, consulta/avaliação de entregas, lançamento de notas (0 a 20 valores) e publicação controlada de resultados.
- **Administração académica** para registar docentes, cursos, disciplinas, inscrições e analisar pré-inscrições.
- **Atendimento institucional** com departamentos, pedidos, respostas, documentos privados, notificações e auditoria.

## Requisitos

- **Node.js 22.13.0 ou superior** (recomendado Node.js 22 LTS). Confirme com `node -v`.
- VS Code ou outra IDE.
- Windows 10/11, Ubuntu ou macOS.
- Sem PHP, MySQL, Docker, Composer, instalação de dependências npm, frameworks ou serviços externos.

A aplicação utiliza módulos padrão de Node.js (`node:http`, `node:sqlite`, `node:crypto`, `node:test`) e SQLite guardada num único ficheiro local. O portal utiliza HTML e CSS locais, sem bibliotecas externas. O emblema incluído é uma reconstrução gráfica local, sem fundo, inspirada em referência pública do ISMMA. Continua a ser recomendável substituir este ficheiro pelo timbre oficial autorizado da instituição.

## Como executar no VS Code

1. Extraia o ZIP.
2. Abra **a pasta que contém `server.js` e `package.json`** no VS Code.
3. No terminal integrado execute:

   ```bash
   npm run dev
   ```

4. No navegador abra **http://localhost:3000**.

**Windows:** também pode executar `INICIAR-WINDOWS.bat`.

**Linux/macOS:** execute `bash INICIAR-LINUX.sh`.

O ficheiro SQLite é criado automaticamente em `data/ismma.sqlite`, juntamente com utilizadores e aulas fictícias, na primeira execução. Dados e ficheiros não são incluídos no ZIP distribuído.

> Para começar de novo no modo de demonstração, pare o servidor e remova `data/ismma.sqlite`, `data/ismma.sqlite-wal` e `data/ismma.sqlite-shm`, depois execute novamente. **Isto apaga os dados locais. Nunca faça esse procedimento numa instalação com dados que pretenda conservar.**

## Contas fictícias

Todas as contas abaixo usam a palavra-passe **`Demonstracao@2026`**. Estes endereços `.test` não existem e servem apenas para demonstração.

| Perfil | Endereço de entrada | O que experimentar |
| --- | --- | --- |
| Administrador | `admin@ismma.test` | Pré-inscrições, cursos, disciplinas, docentes, estudantes, atendimento |
| Estudante, Gestão de Empresas | `estudante@ismma.test` | Disciplinas, trabalhos, submissões, notas publicadas |
| Estudante, Gestão de Empresas | `sergio@ismma.test` | Entrega fictícia e aulas da mesma turma |
| Estudante, Direito | `elisa@ismma.test` | Disciplinas distintas das de Gestão de Empresas |
| Docente, Gestão e Ética | `docente@ismma.test` | Publicar trabalhos, avaliar e lançar notas |
| Docente, Contabilidade e Direito | `docente2@ismma.test` | Disciplinas atribuídas a outro docente |
| Funcionário da Secretaria | `secretaria@ismma.test` | Atendimento por departamento |
| Candidato | `candidato@ismma.test` | Pré-inscrições e atendimento |

Estes docentes são tecnicamente `funcionario` com o atributo `is_teacher=1`, para manter a compatibilidade com as versões anteriores e com os respectivos testes. Os docentes só podem manipular as disciplinas atribuídas à sua conta.

## Principais endereços

| Endereço | Função |
| --- | --- |
| `/` | Portal público |
| `/pre-inscricao` | Formulário de pré-inscrição pública |
| `/acompanhar-candidatura` | Consulta do estado da candidatura |
| `/entrar` | Autenticação |
| `/painel` | Visão académica depois de entrar |
| `/academico/disciplinas` | Disciplinas inscritas ou atribuídas |
| `/academico/trabalhos` | Trabalhos académicos |
| `/academico/notas` | Boletim de notas publicadas do estudante |
| `/docente/disciplinas/:id/notas` | Lançamento de notas do docente |
| `/admin/candidaturas` | Análise de pré-inscrições |
| `/admin/academico` | Gestão de cursos, docentes e inscrições |
| `/pedidos` | Atendimento por departamentos |
| `/documentos` | Biblioteca de documentos |
| `/instituicao` | Informações institucionais com fontes |

## Simulações sugeridas

**Estudante:** entre com `estudante@ismma.test`, consulte a disciplina «Fundamentos de Gestão», abra um trabalho e faça uma entrega. Consulte o boletim e confirme que só as notas publicadas aparecem.

**Docente:** entre com `docente@ismma.test`, abra uma das suas disciplinas, publique um novo trabalho, consulte as entregas, avalie e publique notas. Confirme que não consegue lançar notas em disciplinas de outro docente.

**Administrador:** entre com `admin@ismma.test`, abra «Pré-inscrições» e altere o estado de uma candidatura fictícia. Na «Gestão académica», crie uma disciplina, associe um docente e inscreva um estudante.

**Candidato:** use `/pre-inscricao` com dados fictícios. Guarde o protocolo devolvido e use `/acompanhar-candidatura` com o mesmo email.

## Testes e verificações

```bash
npm run check
npm test
```

Na última verificação neste ambiente, os **60 testes automatizados passaram**. O ambiente executou Node.js v22.16.0. Os testes incluem autenticação, CSRF, gestão de documentos e tickets, migrações, admissão, notas, publicação, gestão académica, submissões, ficheiros privados e permissões.

O conteúdo responsivo está definido em CSS, mas **não foi possível concluir uma inspecção visual automatizada do navegador**. O projecto também não foi submetido a testes de carga, auditoria de segurança independente ou testes de produção.

## Base de dados e conservação

A base de dados é criada em `data/ismma.sqlite`. A pasta `uploads/` contém documentos privados e trabalhos. Ambas são ignoradas pelo Git. As migrações das novas tabelas são idempotentes e podem abrir a base SQLite da versão de atendimento anterior.

**Não copie uma base de dados real por cima dos ficheiros de demonstração.** Faça primeiro um backup verificado. Para operação real, desactive os dados de demonstração e crie um administrador seguro:

```bash
# Linux / macOS
DEMO_SEED=false NODE_ENV=production npm run criar-admin
```

No Windows (PowerShell):

```powershell
$env:DEMO_SEED="false"
$env:NODE_ENV="production"
npm run criar-admin
```

**Produção requer HTTPS, protecção de dados pessoais, revisão de regras académicas, alojamento, recuperação de conta por SMTP, backups externos e auditoria de segurança. Este protótipo não está aprovado para utilização institucional.**

## Identidade visual e fontes

O nome, lema, contacto, morada e alguns cursos foram verificados em páginas públicas do ISMMA. A paleta de azul, branco e apontamentos verdes é uma **proposta de interface académica**, não uma paleta oficial declarada pela instituição. A estrutura inspira-se em portais universitários moçambicanos sem copiar código ou imagens de terceiros.

O emblema apresentado pelo portal eKuSchool está documentado em `docs/REVISAO_UI_UX_V4.md`. **Não foi possível obter uma cópia isolada do logótipo original do ISMMA.** A página tenta carregar o recorte real de uma captura pública; sem Internet utiliza uma reconstrução local ilustrativa. Para uso institucional, substituir ambos por um ficheiro oficial autorizado e guardado localmente.

A oferta publicada no site pode mudar. Nenhum conteúdo é uma confirmação de vagas, mensalidades, matrículas, resultados reais ou requisitos actuais de admissão.

## Documentação adicional

- `docs/PORTAL_ACADEMICO.md`: arquitectura, base de dados, permissões e fluxos.
- `docs/FLUXOS_DEMONSTRACAO.md`: roteiro de ensaio dos quatro perfis.
- `docs/FONTES_E_BRANDING.md`: dados institucionais e situação do logótipo.
- `docs/RELATORIO_TESTES.md`: resultado real de verificações e limitações.
- `docs/DEPLOY.md`: servidor e cuidados de publicação (da versão de atendimento).
- `docs/DECISOES.md`: decisões sobre compatibilidade, dados e funcionalidades.

**Contexto:** existe notícia no próprio site institucional sobre a aprovação da transformação em UMMA em Novembro de 2025. A interface mantém «ISMMA» conforme solicitado, sem alegar que seja a designação institucional definitiva. A entidade responsável deve confirmar a marca a utilizar antes de disponibilizar o sistema ao público.

## Actualização visual v5 - estilo académico, inspirado no Moodle (31/10/2026)

A homepage abandona a apresentação promocional: utiliza um cabeçalho institucional, barra de navegação horizontal azul, breadcrumbs, avisos, lista organizada de serviços e área de acesso reservada. Depois de iniciar sessão, o utilizador encontra uma navegação lateral fixa, conteúdos e disciplinas em painéis simples, tabelas e formulários convencionais. O objectivo é familiaridade com portais universitários usados em Moçambique, em vez de uma página de marketing.

- Não foram adicionadas dependências nem alterada a estrutura da base de dados.
- `public/portal-v5.css` contém os estilos locais e responsivos, carregados depois do CSS existente para preservar as páginas funcionais.
- `docs/REVISAO_UI_UX_V5.md` explica referências, opções visuais e limitações.
- O timbre real continua **pendente de obtenção num ficheiro oficial autorizado**. O elemento gráfico actual é uma referência obtida de captura pública e requer substituição antes de apresentação institucional final.
- Os dados académicos e as contas continuam a ser fictícios. Não introduzir dados reais neste protótipo.
