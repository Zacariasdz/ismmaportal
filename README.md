# Portal Académico ISMMA

**Instituto Superior Maria Mãe de África | Moçambique | Outubro de 2026**

Portal académico e de atendimento em Node.js, com base de dados PostgreSQL alojada no Supabase. O projecto mantém autenticação própria (contas e palavras-passe na base de dados) e não depende do Supabase Auth.

O sistema inclui:

- Página pública com admissões, acesso de estudante, acesso de docente e atendimento.
- **Pré-inscrições** com protocolo `PRE-AAAA-NNNNNN`, curso pretendido, documentos opcionais e acompanhamento por protocolo e email.
- **Área dos estudantes** com disciplinas inscritas, horários, trabalhos, entregas, notas publicadas e comunicados.
- **Área dos docentes** com disciplinas atribuídas, publicação de trabalhos, avaliação de entregas e lançamento/publicação de notas.
- **Administração académica** para registar docentes, cursos, disciplinas e inscrições, e para analisar pré-inscrições.
- **Atendimento institucional** com departamentos, pedidos, respostas, documentos privados, notificações, fila de email e auditoria.

## Requisitos

- **Node.js 24 LTS** (testado com 24.21.0; exigido pela Vercel e pelo CI). Confirme com `node -v`.
- Uma base **PostgreSQL** — este projecto está configurado para o Supabase (pooler na porta 6543, SSL obrigatório).
- `npm install` para instalar `pg`. Os testes usam `@electric-sql/pglite` como PostgreSQL embutido.

## Configuração

1. Copie `.env.example` para `.env`.
2. Defina `DATABASE_URL` com a ligação do Supabase. A palavra-passe deve ser codificada na URL (`@` → `%40`):

   ```env
   DATABASE_URL=postgresql://postgres.PROJECTO:PALAVRA%40PASSE@aws-0-REGIAO.pooler.supabase.com:6543/postgres
   ```

3. Defina `MAIL_QUEUE_KEY` com 32 ou mais caracteres aleatórios (cifra dos tokens e da fila de email).
4. Instale dependências e inicie:

   ```bash
   npm install
   npm run dev
   ```

5. Abra **http://localhost:3000**.

Na primeira ligação, o esquema (28 tabelas e índices), as configurações institucionais, os cinco departamentos/categorias e as nove licenciaturas são criados automaticamente. **A aplicação não cria utilizadores, pedidos, disciplinas, notas nem candidaturas de demonstração.**

## Criar o primeiro administrador

```bash
npm run criar-admin
```

O comando pede nome, email, telefone e palavra-passe (ou aceita `ADMIN_PASSWORD` no ambiente). Depois de criado, o administrador pode registar docentes, funcionários e estudantes em `/admin/utilizadores`, e docentes/cursos/disciplinas em `/admin/academico`.

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
| `/saude` | Estado da base de dados e do armazenamento |

## Testes e verificações

```bash
npm run check
npm test
```

Os testes fazem pedidos HTTP reais a um servidor temporário e usam uma instância PostgreSQL embutida (PGlite) por ficheiro de teste, pelo que não precisam de credenciais nem alteram a base do Supabase. Incluem autenticação, CSRF, permissões, pedidos, documentos, admissão, notas, publicação, gestão académica, ficheiros privados, notificações e configuração de publicação. A última execução local passou os **64 testes** em Node.js 24.

## Base de dados e anexos

A base vive no PostgreSQL do Supabase; as migrações do esquema são idempotentes e seguras para executar em cada arranque. Os anexos e trabalhos são guardados em `uploads/` (ou em `/tmp/ismma/uploads` na Vercel). A pasta `uploads/` é ignorada pelo Git.

Os catálogos institucionais (configurações, departamentos, categorias e licenciaturas) são configuração e não dados fictícios de utilizadores. Todos os restantes registos são criados pelos utilizadores reais do portal.

**Faça backups através do Supabase** (backups automáticos e/ou `pg_dump`). Não existem scripts locais de cópia SQLite.

## Publicar no GitHub e na Vercel

`api/index.js` expõe a aplicação como função serverless e `vercel.json` encaminha os pedidos e inclui `public/**`.

1. Crie um repositório vazio no GitHub e envie o código.
2. Importe o repositório em [vercel.com/new](https://vercel.com/new), framework **Other**, sem build.
3. Configure as variáveis `DATABASE_URL`, `APP_URL`, `MAIL_QUEUE_KEY` e, se aplicável, SMTP/SMS.
4. Confirme Node.js 24 (`.nvmrc` e `engines.node`).

**Limite:** na Vercel só `/tmp` é gravável e é apagado a cada arranque a frio, pelo que os anexos são efémeros. A base de dados é persistente porque está no Supabase. Para anexos persistentes, use armazenamento de objectos ou uma VPS com disco.

Detalhes completos: [docs/DEPLOY.md](docs/DEPLOY.md).

## Segurança

- `.env` está no `.gitignore` e contém credenciais reais: nunca o envie para o repositório.
- A chave secreta do Supabase não é necessária para esta integração (ligação PostgreSQL directa + autenticação própria); se foi partilhada, rode-a no painel do Supabase.
- Em produção use HTTPS, `NODE_ENV=production`, `TRUST_PROXY=true` atrás de um proxy fiável e restrinja o acesso à base por rede/IP quando possível.

## Documentação adicional

- `docs/PORTAL_ACADEMICO.md`: arquitectura, base de dados, permissões e fluxos.
- `docs/DEPLOY.md`: GitHub, Vercel, VPS Ubuntu, backups e email.
- `docs/TESTES.md`: cobertura e execução dos testes.
- `docs/FONTES_E_BRANDING.md`: dados institucionais e situação do logótipo.
- `docs/RELATORIO_TESTES.md`: resultado de verificações e limitações.
- `docs/DECISOES.md`: decisões técnicas.

**Contexto:** existe notícia no próprio site institucional sobre a aprovação da transformação em UMMA em Novembro de 2025. A interface mantém «ISMMA» conforme solicitado, sem alegar que seja a designação institucional definitiva. A entidade responsável deve confirmar a marca a utilizar antes de disponibilizar o sistema ao público.
