# Frontend no GitHub Pages, API e dados na Cloudflare, independente do ERP Oficina

O Controle de Ferramentas é um sistema totalmente separado do ERP Oficina — nada de banco, login ou armazenamento compartilhado. O frontend (SPA estática) é publicado no GitHub Pages a partir deste repositório público; a API roda num Cloudflare Worker e os dados (inclusive as fotos, comprimidas para ~80 KB) ficam no Cloudflare D1. Tudo no plano gratuito. Descartamos o Supabase (o que o ERP usa) porque o Gestor não quer depender da conta/organização do ERP, e o Firebase porque, desde fev/2026, o Storage exige o plano pago Blaze. A Cloudflare tem cota gratuita folgada (D1 com 5 GB), não exige cartão e não pausa por inatividade.

## Consequências

- Não há serviço de autenticação pronto: o login (e-mail + senha, duas contas convidadas — Almoxarife e Gestor, sem auto-cadastro, sessão de 30 dias) é implementado na própria API.
- Frontend e API ficam em domínios diferentes (`*.github.io` e `*.workers.dev`), então a sessão usa token no cabeçalho `Authorization` em vez de cookie, e a API libera CORS só para a origem do Pages e para o servidor local de desenvolvimento (`http://localhost:5173`, o Vite), para que o frontend rodando na máquina de quem desenvolve possa chamar a API local.
- Este repositório é público (exigência do GitHub Pages gratuito): nenhum segredo, dado ou backup entra nele. O backup semanal do D1 vai para um repositório **privado** separado.
- D1 é SQLite: regras de integridade (uma Retirada aberta por Ferramenta, por exemplo) ficam em constraints e na API.
- A API é publicada pela integração Git da Cloudflare (Workers Builds), ligada ao `main` deste repositório: a Cloudflare clona, aplica as migrações do D1 e faz o deploy com um token que ela mesma gerencia. Não há token da Cloudflare neste repositório nem deploy da API pelo GitHub Actions — o Actions só publica o frontend no Pages.
- Se a cota gratuita estourar, a Cloudflare passa a responder com erro em vez de cobrar — o sistema para, não gera conta surpresa.
