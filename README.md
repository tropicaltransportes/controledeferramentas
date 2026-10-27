# Controle de Ferramentas

Sistema do almoxarifado da oficina para saber, a qualquer momento, com quem está cada ferramenta. Vocabulário em [`CONTEXT.md`](CONTEXT.md); arquitetura em [`docs/adr/0001-hospedagem-cloudflare.md`](docs/adr/0001-hospedagem-cloudflare.md).

## Estrutura

- `api/`: API em Cloudflare Worker com banco D1.
- `frontend/`: SPA em Vue 3 + Vite, com rotas por hash, publicada no GitHub Pages.
- `.github/workflows/pages.yml`: gera o build do frontend e publica no Pages a cada push no `main`. A API não passa por aqui: a Cloudflare a publica pela integração Git.

Requisito: Node 24 ou superior.

## Rodar localmente

API (`wrangler dev` em `http://localhost:8787`):

```bash
cd api
npm install
npm test
npm run typecheck
npm run dev
```

Frontend (em `http://localhost:5173/controledeferramentas/`):

```bash
cd frontend
npm install
npm run dev
```

A variável `VITE_API_URL` define a URL da API no build (sem ela, o frontend usa `http://localhost:8787`). O workflow do Pages recusa publicar sem ela.

## Contas

Não existe cadastro público: Almoxarife e Gestor são criados pelo comando administrativo `api/scripts/criar-usuario.ts`. A senha vai pela variável `SENHA_NOVA` (nunca como argumento) e só o hash é gravado.

```bash
cd api
SENHA_NOVA='uma-senha-forte' node scripts/criar-usuario.ts --email ana@exemplo.com --nome "Ana" --papel almoxarife --local
```

Sem `--local`, o comando grava no D1 remoto (é preciso estar autenticado no Wrangler). Rodar o mesmo comando de novo para um e-mail existente redefine a senha e encerra as sessões dessa conta.

## Testes

O `api/vitest.config.ts` roda os testes dentro do runtime de Workers, com D1 local, migrações aplicadas e armazenamento isolado por teste. O relógio é fixado só nesse ambiente, em `2026-10-27T12:00:00Z`, pelas variáveis `AMBIENTE=teste` e `RELOGIO_TESTE`. Em produção essas variáveis não existem e a API usa a hora real.

## Infraestrutura (o que a issue de infraestrutura precisa configurar)

1. **D1**: criar o banco `controle-ferramentas` na Cloudflare e colocar o ID em `api/wrangler.jsonc`, no campo `database_id`.
2. **Cloudflare Workers Builds** (integração Git ligada ao `main`):
   - Root directory: `api`
   - Deploy command: `npx wrangler d1 migrations apply controle-ferramentas --remote && npx wrangler deploy`
3. **GitHub Pages**: em Settings → Pages, escolher "GitHub Actions" como fonte.
4. **Variável do build**: em Settings → Secrets and variables → Actions → Variables, criar `VITE_API_URL` com a URL do Worker (por exemplo, `https://controle-ferramentas-api.<subdominio>.workers.dev`).

Este repositório é público. Nenhum segredo, token ou dado de produção entra nele.
