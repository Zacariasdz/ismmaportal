# Guia de instalação e testes na IDE

## Windows 11 e VS Code

1. Instale o **Node.js 24 LTS**.
2. Extraia o ZIP. Abra a pasta no **Visual Studio Code**.
3. No menu **Terminal > New Terminal**, execute `node -v`.
4. Copie `.env.example` para `.env` e preencha `DATABASE_URL` e `MAIL_QUEUE_KEY`.
5. Execute `npm install` e depois `npm run dev`.
6. No Chrome/Edge abra `http://localhost:3000`.
7. Visite também `http://localhost:3000/instituicao` para ver informações públicas verificadas no sítio oficial.
8. Crie o administrador inicial com `npm run criar-admin` e inicie sessão com essas credenciais.
9. Execute `npm run check` e `npm test` noutro terminal.

Se a porta 3000 estiver ocupada, ajuste no `.env`:

```ini
PORT=3001
HOST=127.0.0.1
```

Depois abra `http://localhost:3001`.

Na primeira ligação, o esquema PostgreSQL é criado automaticamente no Supabase. Não são criados utilizadores, pedidos ou notas de demonstração.

## Onde editar o código

- Informação institucional pública: `src/institution.js` e `docs/FONTES_OFICIAIS.md`.
- Interface, textos e menus: `src/views.js`.
- Cores, componentes e responsividade: `public/app.css`.
- Interacções em JavaScript no navegador: `public/app.js`.
- Regras e rotas: `src/app.js` e `src/academic-routes.js`.
- Esquema PostgreSQL e catálogos: `src/schema.js`.
- Ligação e transacções: `src/db.js`.

O comando `npm run dev` reinicia o servidor sempre que o Node detecta alterações nos ficheiros importados. Actualize o navegador para ver os novos estilos.

## Problemas frequentes

**`node is not recognized`**: instale o Node ou reabra o terminal após a instalação.

**`Cannot find module 'pg'`**: execute `npm install`.

**`DATABASE_URL não está configurada`**: copie `.env.example` para `.env` e preencha a ligação do Supabase.

**`password authentication failed`**: codifique caracteres especiais na URL (por exemplo `@` → `%40`) e confirme a palavra-passe no painel do Supabase.

**`EADDRINUSE`**: mude a porta no `.env` ou termine o processo anterior.

**Credenciais não funcionam**: crie o administrador com `npm run criar-admin`; não existem contas de demonstração.

**Uploads não funcionam**: confirme a permissão de escrita na pasta `uploads/` e formatos aceites (PDF, DOC, DOCX, JPG, PNG).
