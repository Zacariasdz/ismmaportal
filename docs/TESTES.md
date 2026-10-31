# Verificação funcional

Executar na raiz do projecto:

```bash
npm run check
npm test
```

Os testes fazem pedidos HTTP reais a um servidor local temporário, contra uma base SQLite em memória e ficheiros numa pasta temporária. Não modificam a base de dados usada na demonstração.

### Fluxos cobertos

1. Página inicial e CSS.
2. Tabelas, departamentos e utilizadores de demonstração.
3. Login válido e autorização por perfil.
4. Rejeição de login inválido.
5. Protecção CSRF.
6. Acesso do estudante somente aos seus pedidos.
7. Validação de categorias específicas dos candidatos.
8. Criação e protocolo único de pedido.
9. Resposta por funcionário associado ao departamento.
10. Invisibilidade das notas internas.
11. Alteração de estado restrita a funcionário.
12. Administração e exportação CSV.
13. Verificação do conteúdo real de ficheiros.
14. Visibilidade e descarregamento privado de documentos.
15. Notificações e marcação como lidas.
16. Registo de candidato pelo formulário.
17. Upload de anexos privados e rejeição de falsos PDFs.
18. Substituição, remoção e recuperação de documentos.

Testes manuais recomendados: abrir a interface no Chrome/Edge, simular 360 px com ferramentas de desenvolvimento, criar um pedido com anexos reais e experimentar todos os perfis, activar/desactivar contas e confirmar a possibilidade de criar/restaurar backups.
