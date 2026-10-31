# Publicação no GitHub e na Vercel

**Esta versão foi construída para demonstração. Não coloque dados reais de estudantes neste protótipo sem completar a revisão de segurança.**

## GitHub

O repositório deve conter apenas código, documentação e os recursos de `public/`. A base SQLite, os anexos, os backups, as capturas de ecrã e o ficheiro `.env` são ignorados.

1. Crie um repositório **vazio** no GitHub (sem README, sem `.gitignore`, sem licença).
2. No projecto local, confirme que não existem repositórios Git aninhados (`find . -maxdepth 2 -name .git`) — só pode existir o da raiz.
3. Configure o remoto e envie:

```bash
git remote add origin https://github.com/<conta>/<repositorio>.git
git push -u origin main
```

O workflow `.github/workflows/ci.yml` executa `npm run check` e `npm test` em Node.js 24 a cada push para `main` e em cada pull request.

## Vercel (demonstração)

O projecto não tem dependências nem etapa de build. `vercel.json` encaminha todos os pedidos para `api/index.js`, inclui `public/**` no pacote da função e activa `TRUST_PROXY=true`.

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório. Framework: **Other**; não defina comando de build.
2. Confirme que a versão de Node é 24 (`.nvmrc` e `engines.node`).
3. Defina as variáveis de ambiente:

| Variável | Valor |
| --- | --- |
| `APP_URL` | Domínio público, ex.: `https://portal.exemplo.mz` |
| `DEMO_SEED` | `true` para repor as contas fictícias a cada arranque |
| `DEMO_PASSWORD` | Palavra-passe das contas fictícias |
| `SESSION_HOURS` | Duração da sessão (por omissão `12`) |
| `CONTACT_EMAIL` | Email institucional de contacto |

4. Faça o deploy. O endpoint `/saude` confirma o estado da base e do armazenamento.

### Limites importantes da Vercel

- Só `/tmp` é gravável na função. A base e os anexos ficam em `/tmp/ismma` e **desaparecem a cada arranque a frio**; com `DEMO_SEED=true` os dados fictícios são recriados.
- Cada instância da função tem o seu próprio `/tmp`. Sessões, inscrições e pedidos podem não ser partilhados entre instâncias concorrentes. Isto serve para demonstração, não para uso institucional.
- Os processos periódicos de manutenção e de envio de email não correm num ambiente serverless; as mensagens ficam na fila do respetivo processo.
- `DB_FILE` e `UPLOAD_DIR` são ignorados na Vercel.
- Para dados persistentes é necessário armazenamento externo (base de dados gerida e armazenamento de objectos), que **não está incluído** neste projecto. A alternativa suportada é uma VPS com disco persistente.

## VPS Ubuntu (uso persistente)

1. Instale Node.js 24 LTS e um proxy reverso Nginx ou Caddy.
2. Copie o projecto para um utilizador não privilegiado, fora de `/var/www/html` público.
3. Configure `.env` com `NODE_ENV=production`, `DEMO_SEED=false`, `PORT=3000`, `HOST=127.0.0.1` e `APP_URL` com o domínio HTTPS.
4. Inicie com `npm start` através de um serviço `systemd` com reinício automático.
5. Configure o proxy reverso para `http://127.0.0.1:3000`, com certificado HTTPS e domínio institucional.
6. Use `npm run criar-admin` para criar o administrador inicial, **sem utilizar as contas e a palavra-passe de demonstração**.
7. Configure retenção, protecção e monitorização de `data/`, `uploads/` e `backups/`.
8. Antes de disponibilizar publicamente, configure SMTP e `MAIL_QUEUE_KEY` (a recuperação de acesso só terá utilidade com entrega real de email); valide o roster académico e realize testes de segurança e monitorização.

## Backup local

```bash
npm run backup
```

O script executa `VACUUM INTO` para obter uma cópia SQLite consistente, inclui os anexos e calcula SHA-256 por ficheiro. Use `npm run backup -- --encrypt --destino /caminho/seguro` com `BACKUP_KEY` de pelo menos 32 caracteres. Os backups locais são retidos durante 14 dias. Os backups são guardados em `backups/`.

Para restaurar: pare o servidor e execute `npm run restaurar -- /caminho/do/backup`, validando o manifesto e confirmando a substituição. Faça testes mensais de restauro para um ambiente separado. Não guarde `BACKUP_KEY` no repositório.

## Email

Os adaptadores de envio SMTP e webhook já existem, mas estão **desligados por omissão**. Os testes existentes usam um SMTP simulado; a configuração real, incluindo `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS` e `MAIL_QUEUE_KEY`, requer testes específicos em ambiente controlado.
