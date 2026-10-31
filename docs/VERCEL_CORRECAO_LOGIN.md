# Correcção da entrada na Vercel (v5.2.1)

## Erro observado

`Cannot read properties of null (reading 'remoteAddress')` após submeter o formulário de entrada.

## Causa

A antiga função `sourceIp()` lia `req.socket.remoteAddress` sem verificar se `req.socket` existia. Na Vercel, um pedido serverless pode não ter um socket Node.js disponível.

## Alterações

- `src/request-ip.js`: IP obtido dos cabeçalhos encaminhados na Vercel, com validação IPv4/IPv6; acesso seguro a `req.socket`.
- `src/app.js`: reutiliza o novo helper na limitação de tentativas.
- `vercel.json`: região corrigida de `eu-west-1` para `dub1`.
- `tests/request-ip.test.js`: cinco testes para o caso `socket: null`, proxy e cabeçalhos inválidos.

## Publicar

1. Mantenha `DATABASE_URL` e as restantes variáveis já configuradas na Vercel.
2. Envie os ficheiros corrigidos para o repositório.
3. Execute novo deploy e tente entrar novamente.

**Não é necessário voltar a executar o SQL de criação do administrador.** A existência da conta pode ser confirmada no Supabase com `SELECT id, name, email, role, is_active FROM public.users WHERE email = 'reginamula3@gmail.com';`.

A alteração evita a excepção reportada, mas ainda necessita de uma confirmação real no domínio da Vercel.
