# Verificação funcional

Executar na raiz do projecto:

```bash
npm run check
npm test
```

Os testes fazem pedidos HTTP reais a um servidor temporário. Cada ficheiro de teste arranca uma instância **PostgreSQL embutida (PGlite)** ligada pelo driver `pg`, com os dados de teste isolados numa pasta temporária. Não é necessária qualquer credencial nem a base do Supabase é tocada.

O helper `tests/helpers/portal.js` instala o esquema, cria os catálogos institucionais e semeia o cenário de teste (contas, pedidos, disciplinas, notas e candidaturas) apenas dentro dessa instância efémera.

### Fluxos cobertos

1. Página inicial, CSS e páginas institucionais.
2. Esquema PostgreSQL, departamentos e catálogo de cursos.
3. Login válido e autorização por perfil.
4. Rejeição de login inválido e limitação de tentativas.
5. Protecção CSRF.
6. Acesso do estudante somente aos seus pedidos.
7. Validação de categorias específicas dos candidatos.
8. Criação e protocolo único de pedido.
9. Resposta por funcionário associado ao departamento.
10. Invisibilidade das notas internas.
11. Alteração de estado restrito a funcionário.
12. Administração e exportação CSV.
13. Verificação do conteúdo real de ficheiros.
14. Visibilidade e descarregamento privado de documentos e versões.
15. Notificações e marcação como lidas.
16. Registo de candidato pelo formulário.
17. Upload de anexos privados e rejeição de falsos PDFs.
18. Substituição, remoção e recuperação de documentos.
19. Pré-inscrições, acompanhamento por protocolo e decisão administrativa.
20. Inscrições em disciplinas, trabalhos, entregas e notas publicadas.
21. Criação do administrador inicial em base vazia.
22. Cifra de tokens/fila de email, recuperação e confirmação de conta.
23. Configuração de Vercel/CI sem base local nem seeds.

Testes manuais recomendados: abrir a interface no Chrome/Edge, simular 390 px, criar um pedido com anexos reais, percorrer os quatro perfis e confirmar a ligação ao Supabase com dados que possam ser apagados depois.
