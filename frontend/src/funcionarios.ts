// Formato dos Funcionários. A situação (ativo, Retiradas abertas) chega da API; aqui só fica a apresentação.

export interface Funcionario {
  id: number;
  nome: string;
  funcao: string | null;
  ativo: boolean;
  retiradasAbertas: number;
  /** Retiradas abertas já depois do prazo do Expediente. Quem tem alguma aparece primeiro. */
  retiradasAtrasadas: number;
}

/** Iniciais para o avatar: primeira e última palavra do nome. */
export function iniciaisDe(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) {
    return '?';
  }

  const primeira = palavras[0].charAt(0);
  const ultima = palavras.length > 1 ? palavras[palavras.length - 1].charAt(0) : '';
  return `${primeira}${ultima}`.toUpperCase();
}
