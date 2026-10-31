# Revisão UI/UX v5 - Proposta de portal académico ISMMA

Data: 31 de Outubro de 2026. Contexto: proposta independente, em português de Moçambique.

## Problema resolvido

A versão anterior apresentava um hero de campanha, composição decorativa, slogans, ícones pouco informativos e cartões vistosos que não correspondiam ao modo como estudantes e docentes usam um portal académico todos os dias. Essa composição foi substituída por uma página inicial institucional e uma área reservada inspiradas em sistemas universitários e ambientes Moodle.

## Referências públicas consultadas

- ISMMA (conteúdo e informação institucional): https://ismma.ac.mz/site/
- Moodle da UEM: https://aulas.uem.mz/
- CEAD / UP Maputo (ligação aos vários serviços académicos): https://estudante.up.ac.mz/
- Portal eKuSchool com referência visual do emblema associado ao ISMMA: https://blog.ekutivasolutions.com/ekuschool-ismma/

A aplicação não inclui templates, fotografias, folhas de estilo ou código copiados destes portais. A estrutura visual e os padrões de navegação são originais e inspirados em práticas comuns de aplicações académicas.

## Alterações implementadas

1. Cabeçalho público com identificação da instituição, contactos, acesso à conta e barra horizontal de navegação.
2. Página inicial sem imagem de campanha nem círculos decorativos: breadcrumb, mensagem institucional curta, serviços agrupados, avisos e ligações úteis.
3. Menu lateral compacto na área reservada, com separadores para estudo, comunicação e serviços.
4. Cores contidas, tipografia de sistema, contornos discretos e densidade informativa adequadas ao uso diário.
5. Media queries para navegação por telemóvel, grelhas e formulários em ecrãs estreitos.
6. Mantidos os fluxos académicos: pré-inscrição, disciplinas, horários, trabalhos, entrega, lançamento e publicação de notas, administração e atendimento.

## Identidade visual e limitações

A logomarca original do ISMMA não foi disponibilizada num ficheiro isolado e autorizado. O projecto mostra uma referência visual recortada de uma imagem publicada sobre o eKuSchool, que pode necessitar de acesso à Internet. Existe um SVG de referência alternativo, explicitamente **não oficial**. Antes da entrega formal à instituição deve ser fornecido o timbre original, preferencialmente SVG ou PNG com boa resolução, e verificada a paleta de cores aprovada pela instituição.

As cores e a organização de interface são propostas. Os alunos, docentes, notas, candidaturas e horários apresentados são dados fictícios. Não existe integração com a base oficial de estudantes.

## Testes

Na última execução de 31/10/2026, `npm run check` e `npm test` foram concluídos com sucesso: **59 testes aprovados, 0 falhas**. O navegador Chromium headless não conseguiu produzir uma captura de ecrã neste ambiente. É necessário validar visualmente no Chrome, Firefox e em dispositivos Android antes de apresentar a versão como finalizada.
