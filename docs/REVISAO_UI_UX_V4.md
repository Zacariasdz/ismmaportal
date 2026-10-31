# Revisão de UI/UX - Portal Académico ISMMA v4

## Objectivo da proposta

Apresentar um **portal académico institucional demonstrativo** à equipa do Instituto Superior Maria Mãe de África (ISMMA), preservando a base Node.js/SQLite e todos os fluxos de pré-inscrição, estudantes, docentes, notas, trabalhos, atendimento e administração.

## Actualizações visuais

- Homepage refeita: imagem de estudante africana com livros, fotografia **ilustrativa criada para este projecto**, guardada localmente em `public/hero-estudante.webp` para reduzir dependências e consumo de dados.
- Navegação institucional com morada, telefone, email, cursos, admissão, candidatura e entrada.
- Hero com texto legível, sobreposição suave e duas acções úteis.
- Quatro áreas principais com ícones SVG: admissão, estudante, docente e atendimento.
- Secção de acessos frequentes, apresentação institucional e notícias reais do sítio do ISMMA.
- Tipografia de sistema e Georgia, CSS puro, navegação por teclado, menu responsivo e adaptação a ecrãs pequenos.
- Ficheiros estáticos servidos pelo próprio Node.js.

## Timbre/emblema e fidelidade da marca

**A imagem mostrada publicamente no guia de acesso ao portal eKuSchool - ISMMA inclui o emblema institucional real**, que foi usado como referência:

- https://blog.ekutivasolutions.com/ekuschool-ismma/
- https://i0.wp.com/blog.ekutivasolutions.com/wp-content/uploads/2025/11/image-11.png?resize=840%2C523&ssl=1

O cabeçalho mostra, quando a ligação funciona, um recorte visual dessa captura real. Não foi possível transferir o ficheiro de logótipo original isolado do sítio institucional. A imagem `public/selo-ismma-referencia.svg` é uma **reconstrução de referência para funcionamento offline**; não é um ficheiro oficial nem deve ser usada como timbre definitivo. Antes de submeter formalmente ou publicar, o ISMMA deverá facultar o ficheiro oficial (preferencialmente SVG ou PNG) para substituição.

A paleta azul institucional e dourado discreto foi escolhida como **proposta visual inspirada nas interfaces e elementos consultados**, não foi confirmada como manual de identidade oficial do ISMMA. O conteúdo usa o nome e lema publicados no sítio institucional.

## Inspiração de navegação

- Site oficial do ISMMA: https://ismma.ac.mz/site/
- Portal de pré-inscrição da UEM: https://prereg.uem.mz/
- Portal SIGA da UEM: https://home.siga.uem.mz/
- Página de contactos do ISMMA: https://ismma.ac.mz/site/contact/
- Publicação eKuSchool - ISMMA: https://blog.ekutivasolutions.com/ekuschool-ismma/

A publicação eKuSchool apresenta uma plataforma de gestão académica associada ao ISMMA. Esta proposta não assume que a instituição não tenha sistema existente; apresenta uma alternativa demonstrativa para avaliação.

## Notícias verificadas

- 18/10/2026: https://ismma.ac.mz/site/ismma-celebra-o-dia-do-professor-com-missa-momentos-culturais-e-convivio/
- 29/09/2026: https://ismma.ac.mz/site/setembro-amarelo-no-ismma-se-precisar-peca-ajuda/
- 18/09/2026: https://ismma.ac.mz/site/prof-a-dra-sonia-cossa-lanca-livro-sobre-relacoes-publicas-comunicacao-e-imagem-nas-organizacoes/

Estas ligações são externas; o protótipo não copia artigos completos.

## Limitações

- Os dados académicos de demonstração não pertencem a estudantes reais.
- Não foi obtida uma cópia isolada e autorizada do logótipo original.
- A imagem fotográfica não retrata necessariamente as instalações ou estudantes do ISMMA.
- A segurança, privacidade, acessibilidade e exactidão administrativa requerem validação institucional antes da utilização pública.
