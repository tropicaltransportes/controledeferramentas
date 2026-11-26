// Vocabulário e formato das Ferramentas. A situação e as categorias chegam da API; aqui só fica o rótulo de exibição.
import { chamarApi, chamarApiBinario } from './api';

let categorias: Promise<string[]> | null = null;

/** Categorias aceitas pela API, buscadas uma vez por sessão de página. */
export function carregarCategorias(): Promise<string[]> {
  categorias ??= chamarApi<{ categorias: string[] }>('/ferramentas/categorias')
    .then((resposta) => resposta.categorias)
    .catch((falha: unknown) => {
      categorias = null;
      throw falha;
    });

  return categorias;
}

export type Situacao = 'no_almoxarifado' | 'fora' | 'atrasada' | 'com_problema' | 'baixada' | 'extraviada';

export type Filtro = 'todas' | 'no_almoxarifado' | 'fora' | 'atrasada' | 'com_problema' | 'baixadas_extraviadas';

export const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'no_almoxarifado', rotulo: 'No almoxarifado' },
  { valor: 'fora', rotulo: 'Fora' },
  { valor: 'atrasada', rotulo: 'Atrasadas' },
  { valor: 'com_problema', rotulo: 'Com Problema' },
  { valor: 'baixadas_extraviadas', rotulo: 'Baixadas/Extraviadas' },
];

const SITUACOES: Record<Situacao, { rotulo: string; classe: string }> = {
  no_almoxarifado: { rotulo: 'No almoxarifado', classe: 'b-disp' },
  fora: { rotulo: 'Fora', classe: 'b-fora' },
  atrasada: { rotulo: 'Atrasada', classe: 'b-atr' },
  com_problema: { rotulo: 'Com Problema', classe: 'b-prob' },
  baixada: { rotulo: 'Baixada', classe: 'b-off' },
  extraviada: { rotulo: 'Extraviada', classe: 'b-off' },
};

export function situacaoDe(situacao: Situacao): { rotulo: string; classe: string } {
  return SITUACOES[situacao];
}

export interface Ferramenta {
  numero: string;
  nome: string;
  categoria: string;
  marca: string | null;
  modelo: string | null;
  especificacao: string | null;
  numeroSerie: string | null;
  aquisicao: string | null;
  observacoes: string | null;
  temFoto: boolean;
  situacao: Situacao;
  /** Quem está com a Ferramenta agora (Retirada aberta), ou null quando ela não está fora. */
  responsavel: { id: number; nome: string; retiradaEm: string } | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** Envia a foto (já reduzida) e devolve a Ferramenta com `temFoto` atualizado. */
export function enviarFoto(numero: string, foto: Blob): Promise<Ferramenta> {
  return chamarApi<Ferramenta>(`/ferramentas/${encodeURIComponent(numero)}/foto`, { metodo: 'PUT', arquivo: foto });
}

export function buscarFoto(numero: string): Promise<Blob> {
  return chamarApiBinario(`/ferramentas/${encodeURIComponent(numero)}/foto`);
}

export interface ListaFerramentas {
  itens: Ferramenta[];
  contagens: Record<Filtro, number>;
}

/** Campos digitados no formulário. Vazios viram null na API. */
export interface CamposFerramenta {
  numero: string;
  nome: string;
  categoria: string;
  marca: string;
  modelo: string;
  especificacao: string;
  numeroSerie: string;
  aquisicao: string;
  observacoes: string;
}

export function camposDe(ferramenta: Ferramenta): CamposFerramenta {
  return {
    numero: ferramenta.numero,
    nome: ferramenta.nome,
    categoria: ferramenta.categoria,
    marca: ferramenta.marca ?? '',
    modelo: ferramenta.modelo ?? '',
    especificacao: ferramenta.especificacao ?? '',
    numeroSerie: ferramenta.numeroSerie ?? '',
    aquisicao: ferramenta.aquisicao ?? '',
    observacoes: ferramenta.observacoes ?? '',
  };
}

/** Destino dado pelo Almoxarife: extraviar (Retirada aberta) ou, com Problema, liberar ou baixar. */
export type AcaoDestino = 'extraviar' | 'liberar' | 'baixar';

export function darDestino(numero: string, acao: AcaoDestino): Promise<unknown> {
  return chamarApi(`/ferramentas/${encodeURIComponent(numero)}/${acao}`, { metodo: 'POST' });
}
