import { lerToken, perderSessao } from './sessao';

// Em desenvolvimento a API roda no wrangler dev; no build do Pages a URL vem de VITE_API_URL.
const URL_API = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

interface OpcoesChamada {
  metodo?: 'GET' | 'POST';
  corpo?: unknown;
  /** Chamadas de login não mandam token e não derrubam sessão quando a senha está errada. */
  autenticado?: boolean;
}

export async function chamarApi<T>(caminho: string, opcoes: OpcoesChamada = {}): Promise<T> {
  const { metodo = 'GET', corpo, autenticado = true } = opcoes;
  const cabecalhos: Record<string, string> = {};

  if (corpo !== undefined) {
    cabecalhos['Content-Type'] = 'application/json';
  }

  const token = autenticado ? lerToken() : null;
  if (token) {
    cabecalhos.Authorization = `Bearer ${token}`;
  }

  const resposta = await fetch(`${URL_API}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  if (resposta.status === 401 && autenticado) {
    perderSessao();
    throw new ErroApi(401, 'Sua sessão expirou. Entre novamente.');
  }

  if (!resposta.ok) {
    const dados = (await resposta.json().catch(() => ({}))) as { erro?: string };
    throw new ErroApi(resposta.status, dados.erro ?? 'Não foi possível concluir a ação.');
  }

  if (resposta.status === 204) {
    return undefined as T;
  }

  return (await resposta.json()) as T;
}
