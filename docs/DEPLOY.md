# Publicação no GitHub, Vercel e VPS

**A base de dados é PostgreSQL (Supabase) e a autenticação é própria. Antes de recolher dados reais, complete a revisão de segurança e privacidade indicada no fim deste documento.**

## GitHub

O repositório deve conter apenas código, documentação e os recursos de `public/`. Os anexos, capturas de ecrã e o ficheiro `.env` são ignorados.

1. Crie um repositório **vazio** no GitHub (sem README, sem `.gitignore`, sem licença).
2. No projecto local, confirme que não existem repositórios Git aninhados (`find . -maxdepth 2 -name .git`) — só pode existir o da raiz.
3. Configure o remoto e envie:

```bash
git remote add origin https://github.com/<conta>/<repositorio>.git
git push -u origin main
```

O workflow `.github/workflows/ci.yml` executa `npm ci`, `npm run check` e `npm test` em Node.js 24 a cada push para `main` e em cada pull request. Os testes não precisam de base externa: cada ficheiro usa um PostgreSQL embutido (PGlite).

## Vercel

`vercel.json` encaminha todos os pedidos para `api/index.js`, inclui `public/**` no pacote da função e activa `TRUST_PROXY=true`.

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório. Framework: **Other**; não defina comando de build.
2. Confirme que a versão de Node é 24 (`.nvmrc` e `engines.node`).
3. Defina as variáveis de ambiente:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | Ligação PostgreSQL do Supabase (senha codificada, `@` → `%40`) |
| `APP_URL` | Domínio público, ex.: `https://portal.exemplo.mz` |
| `MAIL_QUEUE_KEY` | 32+ caracteres aleatórios para cifrar tokens e fila de email |
| `SESSION_HOURS` | Duração da sessão (por omissão `12`) |
| `CONTACT_EMAIL` | Email institucional de contacto |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Opcional, para entrega real de email |
| `SMS_WEBHOOK_URL`, `SMS_API_KEY` | Opcional, para SMS |

4. Faça o deploy. O endpoint `/saude` confirma o estado da base e do armazenamento.

### Limites importantes da Vercel

- A **base de dados é persistente** porque está no Supabase.
- Só `/tmp` é gravável na função. Os anexos ficam em `/tmp/ismma/uploads` e **desaparecem a cada arranque a frio**. Para anexos persistentes, use armazenamento de objectos ou uma VPS com disco.
- Os processos periódicos de manutenção e de envio de email não correm num ambiente serverless; as mensagens ficam na fila até serem processadas por um processo com `server.js` ou por uma tarefa agendada.
- `UPLOAD_DIR` é ignorado na Vercel.

## VPS Ubuntu

1. Instale Node.js 24 LTS e um proxy reverso Nginx ou Caddy.
2. Copie o projecto para um utilizador não privilegiado, fora de `/var/www/html` público.
3. Configure `.env` com `NODE_ENV=production`, `PORT=3000`, `HOST=127.0.0.1`, `APP_URL` com o domínio HTTPS, `DATABASE_URL`, `MAIL_QUEUE_KEY` e SMTP.
4. Execute `npm ci`.
5. Crie o administrador inicial: `npm run criar-admin`.
6. Inicie com `npm start` através de um serviço `systemd` com reinício automático.
7. Configure o proxy reverso para `http://127.0.0.1:3000`, com certificado HTTPS e domínio institucional.
8. Proteja `uploads/` e configure retenção e monitorização de logs.

## Base de dados e backups

O esquema é criado/actualizado automaticamente no arranque (`src/schema.js`, migrações idempotentes). Os catálogos institucionais são semeados apenas uma vez — não são criados utilizadores nem dados académicos fictícios.

Use os **backups geridos do Supabase** e/ou cópias com `pg_dump` a partir de um ambiente seguro:

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl -Fc -f ismma-$(date +%F).dump
```

Guarde os ficheiros de anexos (`uploads/`) separadamente. Teste periodicamente o restauro para um projecto Supabase de ensaio. Não guarde credenciais nem cópias de dados pessoais no repositório.

## Email e SMS

Os adaptadores SMTP e webhook existem e a fila é cifrada com `MAIL_QUEUE_KEY`. Sem `SMTP_HOST`/`SMS_WEBHOOK_URL`, as mensagens permanecem em `mail_outbox` sem serem entregues. Configure e teste a entrega real num ambiente controlado antes de depender da recuperação de conta por email.

## Antes de produção

- Revisão de segurança independente, HTTPS obrigatório e limitação de tentativas.
- Política de privacidade, consentimento e retenção de dados pessoais.
- Regras académicas, escala de avaliação e processos de matrícula validados pela instituição.
- Verificação de identidade/roster de estudantes e autorização de docentes.
- Backups remotos testados e monitorização de erros.
- Rotação de credenciais que tenham sido partilhadas por chat ou ficheiros temporários.
