# Roteiro de demonstração - Portal Académico ISMMA

**Todos os nomes de estudantes, docentes, turmas, horários, avaliações e protocolos abaixo são fictícios.**

## 1. Admissões

1. Visitar `/pre-inscricao` sem iniciar sessão.
2. Seleccionar uma licenciatura publicada e usar dados fictícios (não enviar documentos reais).
3. Opcionalmente, anexar um PDF de teste.
4. Submeter e copiar o protocolo `PRE-AAAA-NNNNNN`.
5. Visitar `/acompanhar-candidatura` e inserir protocolo mais email. Deve aparecer apenas o estado.
6. Entrar como `admin@ismma.test`, abrir «Pré-inscrições», consultar e alterar o estado para «Em análise».
7. Repetir a consulta pública para confirmar a alteração.

## 2. Portal do estudante

1. Entrar com `estudante@ismma.test` e `Demonstracao@2026`.
2. O painel inicial abre a visão académica.
3. Em «Disciplinas», abrir «Fundamentos de Gestão».
4. Consultar o horário e o aviso do docente, e abrir «Trabalho prático - Fundamentos de Gestão».
5. Entregar uma resposta fictícia de texto ou um PDF de teste antes do prazo.
6. Em «Notas e avaliações», ver apenas «Teste de avaliação I». O segundo teste encontra-se em rascunho.
7. Em «Atendimento», consultar os pedidos anteriores e as respostas da Secretaria.

## 3. Área do docente

1. Entrar com `docente@ismma.test` e `Demonstracao@2026`.
2. Abrir «Disciplinas», seleccionar «Fundamentos de Gestão».
3. Criar um trabalho com prazo futuro e publicar um comunicado para a turma.
4. Consultar o trabalho, abrir a submissão de um estudante e lançar nota e comentário.
5. Publicar a nota e verificar que o estudante já a vê no seu boletim.
6. Tentar aceder à disciplina «Contabilidade Geral I», atribuída a outro docente. Deve ser negado.

## 4. Administração

1. Entrar com `admin@ismma.test`.
2. Abrir «Gestão académica» e consultar a lista de cursos, disciplinas e docentes.
3. Registar um docente fictício, criar uma disciplina e inscrever um estudante.
4. Abrir «Pré-inscrições» e consultar uma candidatura.
5. Abrir «Estudantes confirmados» para importar CSV (colunas: `numero,nome,curso,estado`).
6. Em «Pedidos» e «Documentos», confirmar que os módulos anteriores continuam operacionais.

## 5. Segurança e validação

- Aceder a uma disciplina não inscrita com a conta do estudante: a página deve retornar 404.
- Abrir o boletim com uma conta de candidato: acesso negado.
- Tentar consultar um ficheiro de candidatura com conta de estudante: acesso negado.
- Alterar nota com docente que não lecciona a disciplina: acesso negado.
- Submeter POST sem `_csrf`: acesso negado.
- Executar `npm run check` e `npm test`.
