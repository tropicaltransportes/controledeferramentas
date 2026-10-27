import { reactive } from 'vue';

// Só o token fica no navegador. Dados do usuário voltam sempre da API (GET /eu).
const CHAVE_TOKEN = 'controle-ferramentas.token';

export type Papel = 'almoxarife' | 'gestor';

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
}

export const sessao = reactive<{ usuario: UsuarioSessao | null }>({ usuario: null });

let aoPerderSessao: () => void = () => {};

/** O roteador registra aqui o que fazer quando a sessão deixa de valer (ir para o login). */
export function definirAoPerderSessao(callback: () => void): void {
  aoPerderSessao = callback;
}

export function lerToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    // Navegador sem armazenamento (janela privada bloqueada etc.): segue sem sessão guardada.
    return null;
  }
}

export function guardarToken(token: string): void {
  try {
    localStorage.setItem(CHAVE_TOKEN, token);
  } catch {
    // Sem armazenamento, o usuário terá de entrar de novo ao recarregar.
  }
}

function apagarToken(): void {
  try {
    localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    // Nada a apagar se o armazenamento não existe.
  }
}

/** Esquece o token e o usuário, sem navegar. */
export function esquecerSessao(): void {
  apagarToken();
  sessao.usuario = null;
}

/** Sessão inválida (401): esquece tudo e leva para a tela de login. */
export function perderSessao(): void {
  esquecerSessao();
  aoPerderSessao();
}

export function rotuloPapel(papel: Papel): string {
  return papel === 'gestor' ? 'Gestor' : 'Almoxarife';
}
