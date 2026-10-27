// PBKDF2-SHA256 via WebCrypto. 100 mil iterações é o máximo que o Worker aceita.
const ITERACOES = 100_000;
const TAMANHO_SAL = 16;
const TAMANHO_HASH = 32;
const ALGORITMO = 'pbkdf2-sha256';

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(TAMANHO_SAL));
  const hash = await derivar(senha, sal, ITERACOES);

  return [ALGORITMO, ITERACOES, paraBase64(sal), paraBase64(hash)].join('$');
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const [algoritmo, iteracoes, salBase64, hashBase64] = armazenado.split('$');
  if (algoritmo !== ALGORITMO || !iteracoes || !salBase64 || !hashBase64) {
    return false;
  }

  const obtido = await derivar(senha, deBase64(salBase64), Number(iteracoes));
  return iguais(obtido, deBase64(hashBase64));
}

async function derivar(senha: string, sal: Uint8Array, iteracoes: number): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256' },
    chave,
    TAMANHO_HASH * 8,
  );

  return new Uint8Array(bits);
}

// Comparação em tempo constante para não vazar, pelo tempo, quantos bytes batem.
function iguais(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a[i] ^ b[i];
  }

  return diferenca === 0;
}

function paraBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function deBase64(texto: string): Uint8Array {
  return Uint8Array.from(atob(texto), (caractere) => caractere.charCodeAt(0));
}
