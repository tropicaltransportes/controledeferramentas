// URL da API (Cloudflare Worker), definida no build pela variável VITE_API_URL.
// Sem ela, aponta para o `wrangler dev` local.
export const URL_API = import.meta.env.VITE_API_URL || 'http://localhost:8787';
