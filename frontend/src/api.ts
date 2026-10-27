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
  metodo?: 'GET' | 'POST' | 'PUT';
  corpo?: unknown;
  /** Arquivo enviado como corpo bruto (foto); o tipo vem do próprio arquivo. */
  arquivo?: Blob;
  /** Chamadas de login não mandam token e não derrubam sessão quando a senha está errada. */
  autenticado?: boolean;
}

async function chamar(caminho: string, opcoes: OpcoesChamada): Promise<Response> {
  const { metodo = 'GET', corpo, arquivo, autenticado = true } = opcoes;
  const cabecalhos: Record<string, string> = {};

  if (arquivo) {
    cabecalhos['Content-Type'] = arquivo.type;
  } else if (corpo !== undefined) {
    cabecalhos['Content-Type'] = 'application/json';
  }

  const token = autenticado ? lerToken() : null;
  if (token) {
    cabecalhos.Authorization = `Bearer ${token}`;
  }

  const resposta = await fetch(`${URL_API}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: arquivo ?? (corpo === undefined ? undefined : JSON.stringify(corpo)),
  });

  if (resposta.status === 401 && autenticado) {
    perderSessao();
    throw new ErroApi(401, 'Sua sessão expirou. Entre novamente.');
  }

  if (!resposta.ok) {
    const dados = (await resposta.json().catch(() => ({}))) as { erro?: string };
    throw new ErroApi(resposta.status, dados.erro ?? 'Não foi possível concluir a ação.');
  }

  return resposta;
}

export async function chamarApi<T>(caminho: string, opcoes: OpcoesChamada = {}): Promise<T> {
  const resposta = await chamar(caminho, opcoes);

  if (resposta.status === 204) {
    return undefined as T;
  }

  return (await resposta.json()) as T;
}

/** Resposta que não é JSON (a foto da Ferramenta). Precisa de token, por isso não serve direto a uma tag img. */
export async function chamarApiBinario(caminho: string): Promise<Blob> {
  return (await chamar(caminho, {})).blob();
}
