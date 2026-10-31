# Roteiro de ensaio - Portal Académico ISMMA

A aplicação já não cria contas de demonstração. Para ensaiar os fluxos, crie o administrador inicial com `npm run criar-admin` e, nesse perfil, registe um docente, um estudante e um funcionário. Use dados de ensaio que possa apagar depois. **Não introduza dados pessoais reais sem concluir a revisão de privacidade e segurança.**

## 1. Admissões

1. Visitar `/pre-inscricao` sem iniciar sessão.
2. Seleccionar uma licenciatura publicada e preencher dados de ensaio.
3. Opcionalmente, anexar um PDF de teste.
4. Submeter e copiar o protocolo `PRE-AAAA-NNNNNN`.
5. Visitar `/acompanhar-candidatura` e inserir protocolo mais email. Deve aparecer apenas o estado.
6. Entrar como administrador, abrir «Pré-inscrições», consultar e alterar o estado para «Em análise».
7. Repetir a consulta pública para confirmar a alteração.

## 2. Portal do estudante

1. Criar/importar o estudante em «Estudantes confirmados» (CSV `numero,nome,curso,estado`) e criar a conta em «Utilizadores».
2. Em «Gestão académica», criar uma disciplina, atribuí-la a um docente e inscrever o estudante.
3. Entrar com a conta do estudante: o painel inicial abre a visão académica.
4. Em «Disciplinas», abrir a disciplina inscrita e consultar horário, aviso e trabalhos.
5. Entregar uma resposta de texto ou um PDF de teste antes do prazo.
6. Em «Notas e avaliações», confirmar que só aparecem notas publicadas.
7. Em «Atendimento», criar um pedido e consultar a resposta do funcionário.

## 3. Área do docente

1. Criar o docente em «Gestão académica > Docentes» e atribuir-lhe uma disciplina.
2. Entrar com a conta do docente e abrir a disciplina atribuída.
3. Criar um trabalho com prazo futuro e publicar um comunicado.
4. Consultar as entregas, lançar nota e comentário e publicar o resultado.
5. Confirmar que o estudante já vê a nota publicada no boletim.
6. Tentar aceder a uma disciplina de outro docente: a Operação deve ser negada (404).

## 4. Administração

1. Abrir «Gestão académica» e consultar cursos, disciplinas e docentes.
2. Registar um docente, criar uma disciplina e inscrever um estudante.
3. Abrir «Pré-inscrições» e consultar uma candidatura.
4. Importar um CSV de estudantes (colunas: `numero,nome,curso,estado`).
5. Em «Pedidos» e «Documentos», confirmar o funcionamento do atendimento e da biblioteca.
6. Exportar o relatório CSV em «Relatórios».

## 5. Segurança e validação

- Aceder a uma disciplina não inscrita com a conta do estudante: a página deve retornar 404.
- Abrir o boletim com uma conta de candidato: acesso negado.
- Tentar consultar um ficheiro de candidatura com conta de estudante: acesso negado.
- Alterar nota com docente que não lecciona a disciplina: acesso negado.
- Submeter POST sem `_csrf`: acesso negado.
- Executar `npm run check` e `npm test`.

## 6. Limpeza

Os registos de ensaio podem ser removidos no Supabase (SQL Editor) ou com `pgAdmin`/`psql`. Apague primeiro sessões, mensagens e registos dependentes; nunca apague dados reais por engano. Confirme sempre o filtro antes de executar um `DELETE`.
