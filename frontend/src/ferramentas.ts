// Vocabulário e formato das Ferramentas. A situação chega pronta da API; aqui só fica o rótulo de exibição.

export const CATEGORIAS = [
  'Medição',
  'Diagnóstico',
  'Elétrica',
  'Elevação',
  'Mecânica',
  'Pneumática',
  'Suspensão',
  'Freios',
  'Motor',
  'Geral',
] as const;

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
  situacao: Situacao;
  criadoEm: string;
  atualizadoEm: string;
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
