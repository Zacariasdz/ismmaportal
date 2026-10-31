# Manual do Portal de Atendimento ISMMA

> Todos os nomes de utilizadores, respostas e números académicos de demonstração são fictícios. Contactos e cursos publicados do ISMMA encontram-se na página `/instituicao`, com fontes, mas este projecto **não é um serviço oficial**.

## Estudante interno

1. A conta de estudante exige validação do número de estudante e do nome numa lista importada pelo Registo Académico. Para testes, use os dados de demonstração.
2. Em **Pedidos > Novo pedido**, seleccione o departamento e a categoria.
3. Preencha o assunto, descreva a situação e, se necessário, junte até cinco anexos de 5 MB.
4. Submeta e guarde o número do protocolo que aparecerá na página.
5. Abra o pedido para ler respostas, descarregar os seus anexos e continuar a conversa.
6. Se estiver respondido, pode reabri-lo dentro do prazo definido pelo administrador.
7. Em **Documentos**, consulte os documentos públicos e exclusivos para estudantes.

## Candidato

1. Crie uma conta seleccionando **Candidato** e indicando o curso pretendido. As sugestões de cursos são baseadas na página pública de licenciaturas do ISMMA, mas não são prova de vagas.
2. Envie pedidos às categorias disponíveis para candidatos, incluindo candidatura e exames de admissão.
3. Consulte protocolos, respostas e documentos dirigidos a candidatos.

## Funcionário

1. Entre com a conta criada pelo administrador.
2. Em **Pedidos**, consulte somente os pedidos dos departamentos aos quais foi associado.
3. Abra um pedido, escreva uma resposta e anexe ficheiros, se necessário.
4. Use **Nota interna** para registar informação que não deve ser vista pelo estudante ou candidato.
5. Altere estado e prioridade, ou encaminhe o pedido para outro departamento.
6. Crie modelos de resposta em **Respostas rápidas**.
7. Publique documentos associados aos seus departamentos e consulte as versões anteriores.

## Administrador

1. Consulte estatísticas e todos os pedidos.
2. Em **Utilizadores**, crie funcionários, atribua departamentos, bloqueie ou reactive contas e redefina palavras-passe.
3. Em **Departamentos** e **Categorias**, configure o atendimento.
4. Em **Documentos**, publique documentos e recupere os que foram removidos.
5. Em **Relatórios**, filtre datas, exporte CSV ou imprima em PDF.
6. Em **Auditoria**, consulte as operações registadas.
7. Em **Configurações**, defina os prazos de reabertura e o tamanho máximo de documentos.
8. Em **Estudantes confirmados**, importe a lista académica validada; crie o primeiro administrador com `npm run criar-admin` numa instalação de produção.

## Nota sobre emails

Nesta edição simplificada, as notificações aparecem **dentro da aplicação**. O envio real exige configuração SMTP e de `MAIL_QUEUE_KEY`. A fila `mail_outbox` e a recuperação de palavra-passe já existem, mas os testes de SMTP foram realizados com um serviço simulado.


## Módulos académicos (versão 2)

Consultar `PORTAL_ACADEMICO.md` e `FLUXOS_DEMONSTRACAO.md`. Os 59 testes mais recentes estão descritos em `RELATORIO_TESTES.md`.
