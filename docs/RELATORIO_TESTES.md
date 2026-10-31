# Relatório de testes - 31/10/2026

## Execução automatizada

Ambiente: Node.js `v22.16.0`, SQLite integrado com Node.js, servidor HTTP local. Sem dependências npm.

Comandos executados:

```bash
npm run check
npm test
```

**Resultado:** 59 testes aprovados de 59. Sem falhas, sem testes ignorados.

Abrangência de testes:

- Autenticação, sessões e permissões anteriores.
- Protecção CSRF, validação de anexos por tipo real, restrições de documentos.
- Pedidos de atendimento, respostas, notas internas e auditoria.
- Migrações idempotentes, backups e detecção de corrupção de backups cifrados.
- Página pública do portal, cursos e utilizadores fictícios.
- Homepage académica sem hero promocional, navegação horizontal, lista de serviços, barra lateral e ícones locais, com cinco testes específicos de interface.
- Pré-inscrição, geração de protocolo, consulta com protocolo e email, entrada inválida.
- Documentos fictícios anexados à candidatura e acesso exclusivo do administrador.
- Inscrições em disciplinas, isolamento entre estudantes e docentes.
- Trabalhos, submissões, restrições de acesso, avaliações e publicação de notas.
- Gestão de cursos, docentes e pré-inscrições pelo administrador.
- Tratamento de HTML na interface com escape.

## Verificações HTTP locais realizadas

Os testes HTTP automatizados verificaram a página inicial e os recursos `/portal-v5.css`, `/app.css` e `/app.js`. Os testes funcionais também verificaram pré-inscrição, documentos e navegação, sem erros.

## Verificações não realizadas

- Auditoria independente de segurança e testes de penetração.
- Interface no Chromium, em ecrãs reais Android, ou em ecrãs de 360 px: a execução headless local não concluiu, pelo que o design responsivo só foi verificado por análise de CSS.
- Testes de acessibilidade com leitor de ecrã.
- Testes de carga com centenas de estudantes em simultâneo.
- Integração com SMTP, SMS/WhatsApp, sistemas de matrícula, pagamentos, Moodle, SIGA ou qualquer sistema académico oficial.
- Instalação real atrás de proxy HTTPS em VPS.
- Verificação de uma cópia oficial e autorizada do ficheiro de logótipo directamente com a instituição.

## Limitações conhecidas

Este é um demonstrador técnico, **não um sistema oficial de admissões e gestão académica**. A introdução de dados reais exige políticas de privacidade e retenção, autenticação reforçada, mecanismos de prova de identidade, regulamentos validados, autorização institucional e revisão de infra-estrutura.
