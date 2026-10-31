# Decisões de implementação

> As entradas abaixo são um registo histórico do protótipo inicial. A decisão mais recente sobre persistência substitui as referências a SQLite.

## Ligação real à base de dados - 31/10/2026

- **PostgreSQL no Supabase, driver `pg`, autenticação própria.** A aplicação liga-se por `DATABASE_URL`; não usa Supabase Auth nem a chave secreta do Supabase. O esquema e os catálogos institucionais são instalados de forma idempotente em `src/schema.js`.
- **Dados fictícios removidos do código de produção.** Já não existem seeds de utilizadores, pedidos, disciplinas, notas ou candidaturas. Os testes usam `tests/helpers/portal.js` com uma instância PostgreSQL embutida (PGlite), isolada por ficheiro.
- **Tokens e fila de email cifrados** com `MAIL_QUEUE_KEY` (AES-256-GCM), e não guardados em texto simples.
- **Sem scripts de backup SQLite.** Os backups passam a ser responsabilidade do Supabase/`pg_dump`; os anexos são copiados separadamente.
- Mantém-se CommonJS, Node.js 24 e ausência de frameworks; as únicas dependências de execução são `pg` e as ferramentas de teste PGlite.
- A identidade visual continua a ser uma proposta, não um manual oficial de marca.

## Protótipo inicial - 31/10/2026
- **31/10/2026:** manter JavaScript CommonJS, SQLite, Node.js 22.13+ e zero pacotes npm. O foco é simplicidade de instalação.
- **31/10/2026:** apresentar informação oficial em `/instituicao`, com ligações para as fontes; não efectuar recolha automática a cada acesso, pois o portal deve funcionar com pouca internet.
- **31/10/2026:** conservar a designação ISMMA apesar da notícia de aprovação da UMMA em 2025, por falta de confirmação do nome e das autorizações institucionais para o portal.
- **31/10/2026:** preservar quaisquer contactos personalizados existentes ao migrar; apenas substituir `contacto@ismma.test` por `geral@ismma.ac.mz`.
- **31/10/2026:** não tornar os cursos uma lista fechada obrigatória: um candidato poderá procurar outro tipo de formação. A lista oficial de licenciaturas serve como sugestão do navegador (`datalist`).
- **31/10/2026:** valores de pagamento e dados bancários não são inventados. Fase 3 do prompt ainda não está implementada.
- **31/10/2026:** contas e exemplos `.test` são fictícios; o protótipo exibe aviso de que não é um portal oficial e não deve receber dados pessoais reais.

## Expansão académica - 31/10/2026

- Mantidos Node.js, SQLite, CommonJS e zero dependências npm para facilitar testes no VS Code.
- Mantidos os módulos de atendimento, biblioteca e administração. O painel inicial passou a mostrar informação académica; o painel antigo de atendimento continua acessível em `/atendimento/painel`.
- Docentes são modelados como funcionários com o atributo `is_teacher`, para não quebrar a restrição de perfis existentes e as bases de dados antigas. A autorização por disciplina é sempre confirmada no servidor.
- Cursos públicos foram retirados da oferta publicada no sítio do ISMMA; disciplinas, turmas, trabalhos e alunos são fictícios.
- As notas usam escala de 0 a 20 valores e só são expostas ao estudante quando estão publicadas. A média é apenas aritmética demonstrativa, não uma regra de avaliação institucional.
- Pré-inscrições são simulações. Os estados não representam matrícula oficial e os anexos são opcionais apenas para teste.
- A combinação de protocolo e email devolve somente o estado da candidatura, sem exposição de documentos ou dados pessoais.
- A identidade visual é uma proposta, não um manual oficial de marca. A imagem do emblema é remota, de origem não oficial confirmada, e deve ser substituída antes da publicação institucional.
