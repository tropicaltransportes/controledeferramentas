// Origens que podem chamar a API: o frontend publicado no GitHub Pages e o
// servidor local de desenvolvimento do Vite.
const ORIGENS_PERMITIDAS = new Set(['https://tropicaltransportes.github.io', 'http://localhost:5173']);

export function cabecalhosCors(origem: string | null): Headers {
  const cabecalhos = new Headers({ Vary: 'Origin' });

  if (origem && ORIGENS_PERMITIDAS.has(origem)) {
    cabecalhos.set('Access-Control-Allow-Origin', origem);
    cabecalhos.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    cabecalhos.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    cabecalhos.set('Access-Control-Max-Age', '600');
  }

  return cabecalhos;
}
