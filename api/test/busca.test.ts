import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { tratarBusca } from '../src/busca';

async function buscar(texto: string): Promise<unknown> {
  const url = new URL('https://api.test/busca');
  url.searchParams.set('texto', texto);
  const resposta = await tratarBusca(new Request(url), env);
  return resposta.json();
}

async function inserirFerramenta(numero: string, nome: string, marca: string | null = null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ferramentas (numero, nome, categoria, marca, estado, criado_em, atualizado_em)
     VALUES (?, ?, 'Mecânica', ?, 'disponivel', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  )
    .bind(numero, nome, marca)
    .run();
}

async function inserirFuncionario(nome: string): Promise<number> {
  const { meta } = await env.DB.prepare('INSERT INTO funcionarios (nome, funcao, ativo) VALUES (?, NULL, 1)')
    .bind(nome)
    .run();
  return Number(meta.last_row_id);
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM problemas'),
    env.DB.prepare('DELETE FROM retiradas'),
    env.DB.prepare('DELETE FROM funcionarios'),
    env.DB.prepare('DELETE FROM ferramentas'),
  ]);
});

describe('GET /busca', () => {
  it('um Número existente abre a Ficha, com ou sem o F- e os zeros', async () => {
    await inserirFerramenta('F-023', 'Chave de impacto');

    expect(await buscar('23')).toEqual({ destino: 'ferramenta', numero: 'F-023' });
    expect(await buscar('F23')).toEqual({ destino: 'ferramenta', numero: 'F-023' });
    expect(await buscar('F-023')).toEqual({ destino: 'ferramenta', numero: 'F-023' });
    expect(await buscar('f-023')).toEqual({ destino: 'ferramenta', numero: 'F-023' });
  });

  it('um número sem Ferramenta cadastrada cai no catálogo filtrado pelo texto', async () => {
    await inserirFerramenta('F-023', 'Chave de impacto');

    expect(await buscar('99')).toEqual({ destino: 'catalogo', texto: '99' });
  });

  it('o nome de um Funcionário abre o perfil quando nenhuma Ferramenta corresponde', async () => {
    const ana = await inserirFuncionario('Ana Souza');
    await inserirFerramenta('F-001', 'Torquímetro');

    expect(await buscar('Ana Souza')).toEqual({ destino: 'funcionario', id: ana });
    expect(await buscar('ana')).toEqual({ destino: 'funcionario', id: ana });
  });

  it('Ferramenta que corresponde ao texto tem prioridade sobre o Funcionário', async () => {
    await inserirFuncionario('Chave');
    await inserirFerramenta('F-002', 'Chave de roda');

    expect(await buscar('Chave')).toEqual({ destino: 'catalogo', texto: 'Chave' });
  });

  it('um nome que casa com mais de um Funcionário cai no catálogo, sem escolher ao acaso', async () => {
    await inserirFuncionario('Carlos Lima');
    await inserirFuncionario('Carlos Mota');

    expect(await buscar('Carlos')).toEqual({ destino: 'catalogo', texto: 'Carlos' });
  });

  it('um nome exato tem prioridade sobre nomes parecidos', async () => {
    const carlos = await inserirFuncionario('Carlos');
    const carlosMota = await inserirFuncionario('Carlos Mota');

    expect(await buscar('carlos')).toEqual({ destino: 'funcionario', id: carlos });
    expect(await buscar('Carlos Mota')).toEqual({ destino: 'funcionario', id: carlosMota });
  });

  it('outro texto cai no catálogo, sem o texto ser alterado', async () => {
    expect(await buscar('  esmeril  ')).toEqual({ destino: 'catalogo', texto: 'esmeril' });
  });

  it('texto vazio leva ao catálogo sem filtro', async () => {
    expect(await buscar('   ')).toEqual({ destino: 'catalogo', texto: '' });
  });

  it('exige sessão, como as demais rotas de consulta', async () => {
    // Sem sessão, a checagem fica no roteador: a rota é registrada em app.ts.
    const resposta = await SELF.fetch('https://api.test/busca?texto=23');

    expect(resposta.status).toBe(401);
  });
});
