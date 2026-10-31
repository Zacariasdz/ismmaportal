# Guia de instalação e testes na IDE

## Windows 11 e VS Code

1. Instale o **Node.js 24 LTS** ou use Node.js 22.13+ já instalado.
2. Extraia o ZIP. Abra a pasta no **Visual Studio Code**.
3. No menu **Terminal > New Terminal**, execute `node -v`.
4. Execute `npm run dev`.
5. No Chrome/Edge abra `http://localhost:3000`.
6. Visite também `http://localhost:3000/instituicao` para ver informações públicas verificadas no sítio oficial.
7. Inicie sessão com `admin@ismma.test` e `Demonstracao@2026`.
8. Teste a gestão de departamentos e os relatórios. Termine sessão e experimente as contas de estudante, candidato e funcionário.
9. Execute `npm run check` e `npm test` noutro terminal.

Se a porta 3000 estiver ocupada, crie um ficheiro `.env`:

```ini
PORT=3001
HOST=127.0.0.1
```

Depois abra `http://localhost:3001`.

O Node.js 22 pode apresentar `ExperimentalWarning: SQLite is an experimental feature`; é um aviso da biblioteca integrada, não um erro de arranque.

## Onde editar o código

- Informação institucional pública: `src/institution.js` e `docs/FONTES_OFICIAIS.md`.
- Interface, textos e menus: `src/views.js`.
- Cores, componentes e responsividade: `public/app.css`.
- Interacções em JavaScript no navegador: `public/app.js`.
- Regras e rotas: `src/app.js`.
- Tabelas e dados de teste: `src/db.js`.

O comando `npm run dev` reinicia o servidor sempre que o Node detecta alterações nos ficheiros importados. Actualize o navegador para ver os novos estilos.

## Problemas frequentes

**`node is not recognized`**: instale o Node ou reabra o terminal após a instalação.

**`ERR_MODULE_NOT_FOUND` / `No such built-in module: node:sqlite`**: actualize o Node para 22.13+; de preferência 24 LTS.

**`EADDRINUSE`**: mude a porta no `.env` ou termine o processo anterior.

**Credenciais não funcionam**: a palavra-passe de demonstração só é definida no primeiro arranque da base de dados. Se a alterou, redefina a base de teste como indicado no README.

**Uploads não funcionam**: confirme a permissão de escrita na pasta `uploads/` e formatos aceites (PDF, DOC, DOCX, JPG, PNG).
