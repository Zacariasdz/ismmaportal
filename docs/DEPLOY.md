# Publicação e backup - considerações

**Esta versão foi construída prioritariamente para testes locais. Não coloque dados reais de estudantes neste protótipo sem completar a revisão de segurança.**

Para uma VPS Ubuntu moderna:

1. Instale Node.js 24 LTS e um proxy reverso Nginx ou Caddy.
2. Copie o projecto para um utilizador não privilegiado, fora de `/var/www/html` público.
3. Configure `.env` com `NODE_ENV=production`, `DEMO_SEED=false`, `PORT=3000`, `HOST=127.0.0.1`.
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
