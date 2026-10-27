import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { atender } from '../src/app';
import { gerarHashSenha } from '../src/senha';

const SENHA = 'senha-forte-123';

async function criarUsuario(email: string, papel: 'almoxarife' | 'gestor'): Promise<void> {
  const hash = await gerarHashSenha(SENHA);
  await env.DB.prepare(
    'INSERT INTO usuarios (email, nome, papel, senha_hash, ativo) VALUES (?, ?, ?, ?, 1)',
  )
    .bind(email, `Nome de ${papel}`, papel, hash)
    .run();
}

async function tokenDe(email: string): Promise<string> {
  const resposta = await SELF.fetch('https://api.test/entrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha: SENHA }),
  });
  return ((await resposta.json()) as { token: string }).token;
}

function comToken(token: string, metodo = 'GET', caminho = '/ferramentas', corpo?: unknown): Promise<Response> {
  return SELF.fetch(`https://api.test${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}

function cadastro(numero: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { numero, nome: `Ferramenta ${numero}`, categoria: 'Mecânica', ...extra };
}

let token = '';

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ferramentas'),
    env.DB.prepare('DELETE FROM sessoes'),
    env.DB.prepare('DELETE FROM usuarios'),
  ]);
  await criarUsuario('almoxarife@tropical.test', 'almoxarife');
  token = await tokenDe('almoxarife@tropical.test');
});

describe('POST /ferramentas', () => {
  it('cadastra a Ferramenta como disponível e no almoxarifado', async () => {
    const resposta = await comToken(token, 'POST', '/ferramentas', {
      ...cadastro('F-023', { marca: 'Gedore', modelo: 'GR-12', observacoes: '  ' }),
    });

    expect(resposta.status).toBe(201);
    expect(await resposta.json()).toEqual({
      numero: 'F-023',
      nome: 'Ferramenta F-023',
      categoria: 'Mecânica',
      marca: 'Gedore',
      modelo: 'GR-12',
      especificacao: null,
      numeroSerie: null,
      aquisicao: null,
      observacoes: null,
      temFoto: false,
      situacao: 'no_almoxarifado',
      criadoEm: '2026-10-27T12:00:00.000Z',
      atualizadoEm: '2026-10-27T12:00:00.000Z',
    });
  });

  it('normaliza o Número digitado em minúsculas', async () => {
    const resposta = await comToken(token, 'POST', '/ferramentas', cadastro('f-050'));

    expect(await resposta.json()).toMatchObject({ numero: 'F-050' });
  });

  it('responde 422 quando outra gravação pega o mesmo Número depois da checagem', async () => {
    // Simula a corrida: a checagem não acha nada, mas o INSERT encontra a chave já usada.
    const bancoDaCorrida = {
      prepare: (sql: string) =>
        sql.startsWith('INSERT INTO ferramentas')
          ? {
              bind: () => ({
                run: () => Promise.reject(new Error('D1_ERROR: UNIQUE constraint failed: ferramentas.numero')),
              }),
            }
          : env.DB.prepare(sql),
    } as unknown as D1Database;

    const resposta = await atender(
      new Request('https://api.test/ferramentas', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cadastro('F-060')),
      }),
      { ...env, DB: bancoDaCorrida },
    );

    expect(resposta.status).toBe(422);
  });

  it('recusa um Número já cadastrado com 422', async () => {
    await comToken(token, 'POST', '/ferramentas', cadastro('F-001'));

    const resposta = await comToken(token, 'POST', '/ferramentas', cadastro('F-001'));

    expect(resposta.status).toBe(422);
  });

  it('recusa Ferramenta sem nome com 422', async () => {
    const resposta = await comToken(token, 'POST', '/ferramentas', cadastro('F-002', { nome: '   ' }));

    expect(resposta.status).toBe(422);
  });

  it('recusa Número fora do formato F-NNN e categoria desconhecida com 422', async () => {
    const numeroInvalido = await comToken(token, 'POST', '/ferramentas', cadastro('023'));
    const categoriaInvalida = await comToken(token, 'POST', '/ferramentas', cadastro('F-003', { categoria: 'Cozinha' }));

    expect(numeroInvalido.status).toBe(422);
    expect(categoriaInvalida.status).toBe(422);
  });

  it('exige sessão', async () => {
    const resposta = await SELF.fetch('https://api.test/ferramentas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cadastro('F-004')),
    });

    expect(resposta.status).toBe(401);
  });
});

function enviarFoto(numero: string, corpo: Uint8Array | string, tipo = 'image/jpeg'): Promise<Response> {
  return SELF.fetch(`https://api.test/ferramentas/${numero}/foto`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipo },
    body: corpo,
  });
}

function lerFoto(numero: string): Promise<Response> {
  return SELF.fetch(`https://api.test/ferramentas/${numero}/foto`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('PUT /ferramentas/:numero/foto', () => {
  beforeEach(async () => {
    await comToken(token, 'POST', '/ferramentas', cadastro('F-030'));
  });

  it('guarda a foto de até 200 KB e a devolve igual, com o tipo enviado', async () => {
    const foto = new Uint8Array(200 * 1024).map((_, indice) => indice % 251);

    const resposta = await enviarFoto('F-030', foto);
    const lida = await lerFoto('F-030');

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ numero: 'F-030', temFoto: true });
    expect(lida.status).toBe(200);
    expect(lida.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await lida.arrayBuffer())).toEqual(foto);
  });

  it('recusa foto acima de 200 KB com 422 e não guarda nada', async () => {
    const resposta = await enviarFoto('F-030', new Uint8Array(200 * 1024 + 1));

    expect(resposta.status).toBe(422);
    expect(await (await comToken(token, 'GET', '/ferramentas/F-030')).json()).toMatchObject({ temFoto: false });
  });

  it('recusa arquivo que não é imagem com 422', async () => {
    const resposta = await enviarFoto('F-030', 'não sou uma foto', 'text/plain');

    expect(resposta.status).toBe(422);
  });

  it('recusa SVG e outros formatos que não são foto raster, com 422', async () => {
    const svg = await enviarFoto('F-030', '<svg onload="alert(1)"></svg>', 'image/svg+xml');

    expect(svg.status).toBe(422);
  });

  it('troca a foto anterior pela nova', async () => {
    await enviarFoto('F-030', new Uint8Array([1, 2, 3]), 'image/jpeg');

    await enviarFoto('F-030', new Uint8Array([9, 8]), 'image/png');
    const lida = await lerFoto('F-030');

    expect(lida.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await lida.arrayBuffer())).toEqual(new Uint8Array([9, 8]));
  });

  it('responde 404 quando a Ferramenta não tem foto ou não existe', async () => {
    const semFoto = await lerFoto('F-030');
    const semFichaEnvio = await enviarFoto('F-998', new Uint8Array([1]));
    const semFichaLeitura = await lerFoto('F-998');

    expect(semFoto.status).toBe(404);
    expect(semFichaEnvio.status).toBe(404);
    expect(semFichaLeitura.status).toBe(404);
  });

  it('exige sessão', async () => {
    const resposta = await SELF.fetch('https://api.test/ferramentas/F-030/foto', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: new Uint8Array([1]),
    });

    expect(resposta.status).toBe(401);
  });
});

describe('GET /ferramentas/categorias', () => {
  it('lista as categorias aceitas no cadastro, para o formulário usar a mesma lista', async () => {
    const resposta = await comToken(token, 'GET', '/ferramentas/categorias');

    expect(await resposta.json()).toEqual({
      categorias: expect.arrayContaining(['Medição', 'Elétrica', 'Mecânica', 'Geral']),
    });
  });
});

describe('GET /ferramentas/proximo-numero', () => {
  it('sugere F-001 quando não há nenhuma Ferramenta', async () => {
    const resposta = await comToken(token, 'GET', '/ferramentas/proximo-numero');

    expect(await resposta.json()).toEqual({ numero: 'F-001' });
  });

  it('sugere o maior Número existente mais um', async () => {
    await comToken(token, 'POST', '/ferramentas', cadastro('F-023'));
    await comToken(token, 'POST', '/ferramentas', cadastro('F-007'));

    const resposta = await comToken(token, 'GET', '/ferramentas/proximo-numero');

    expect(await resposta.json()).toEqual({ numero: 'F-024' });
  });
});

describe('GET /ferramentas/:numero', () => {
  it('devolve a Ficha da Ferramenta', async () => {
    await comToken(token, 'POST', '/ferramentas', cadastro('F-010'));

    const resposta = await comToken(token, 'GET', '/ferramentas/F-010');

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ numero: 'F-010', nome: 'Ferramenta F-010' });
  });

  it('responde 404 para codificação malformada no Número, sem derrubar a requisição', async () => {
    const resposta = await comToken(token, 'GET', '/ferramentas/%E0%A4%A');

    expect(resposta.status).toBe(404);
  });

  it('responde 404 para um Número inexistente', async () => {
    const resposta = await comToken(token, 'GET', '/ferramentas/F-999');

    expect(resposta.status).toBe(404);
  });
});

describe('PUT /ferramentas/:numero', () => {
  it('altera os dados da Ficha e mantém o Número', async () => {
    await comToken(token, 'POST', '/ferramentas', cadastro('F-011'));

    const resposta = await comToken(token, 'PUT', '/ferramentas/F-011', {
      numero: 'F-999',
      nome: 'Chave de impacto',
      categoria: 'Elétrica',
      marca: 'Makita',
    });

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({
      numero: 'F-011',
      nome: 'Chave de impacto',
      categoria: 'Elétrica',
      marca: 'Makita',
    });
    expect((await comToken(token, 'GET', '/ferramentas/F-999')).status).toBe(404);
  });

  it('mantém os campos que não vieram no corpo', async () => {
    await comToken(token, 'POST', '/ferramentas', cadastro('F-013', { marca: 'Gedore', modelo: 'GR-12' }));

    const resposta = await comToken(token, 'PUT', '/ferramentas/F-013', { nome: 'Chave nova' });

    expect(await resposta.json()).toMatchObject({
      nome: 'Chave nova',
      categoria: 'Mecânica',
      marca: 'Gedore',
      modelo: 'GR-12',
    });
  });

  it('limpa um campo quando o corpo manda string vazia', async () => {
    await comToken(token, 'POST', '/ferramentas', cadastro('F-014', { marca: 'Gedore' }));

    const resposta = await comToken(token, 'PUT', '/ferramentas/F-014', { marca: '' });

    expect(await resposta.json()).toMatchObject({ marca: null, nome: 'Ferramenta F-014' });
  });

  it('recusa apagar o nome com 422 e responde 404 para Número inexistente', async () => {
    await comToken(token, 'POST', '/ferramentas', cadastro('F-012'));

    const semNome = await comToken(token, 'PUT', '/ferramentas/F-012', { nome: '', categoria: 'Geral' });
    const inexistente = await comToken(token, 'PUT', '/ferramentas/F-998', { nome: 'X', categoria: 'Geral' });

    expect(semNome.status).toBe(422);
    expect(inexistente.status).toBe(404);
  });
});

describe('GET /ferramentas (catálogo)', () => {
  beforeEach(async () => {
    await comToken(token, 'POST', '/ferramentas', cadastro('F-001', { nome: 'Multímetro', categoria: 'Medição', marca: 'Fluke' }));
    await comToken(token, 'POST', '/ferramentas', cadastro('F-002', { nome: 'Chave de torque', categoria: 'Mecânica' }));
    await comToken(token, 'POST', '/ferramentas', cadastro('F-003', { nome: 'Macaco hidráulico', categoria: 'Elevação', modelo: 'MH-3T' }));
    await comToken(token, 'POST', '/ferramentas', cadastro('F-004', { nome: 'Alicate', categoria: 'Elétrica' }));
    await env.DB.batch([
      env.DB.prepare("UPDATE ferramentas SET estado = 'com_problema' WHERE numero = 'F-002'"),
      env.DB.prepare("UPDATE ferramentas SET estado = 'baixada' WHERE numero = 'F-003'"),
      env.DB.prepare("UPDATE ferramentas SET estado = 'extraviada' WHERE numero = 'F-004'"),
    ]);
  });

  it('"todas" deixa de fora as Baixadas e Extraviadas e as contagens batem', async () => {
    const corpo = (await (await comToken(token)).json()) as {
      itens: { numero: string }[];
      contagens: Record<string, number>;
    };

    expect(corpo.itens.map((item) => item.numero)).toEqual(['F-001', 'F-002']);
    expect(corpo.contagens).toEqual({
      todas: 2,
      no_almoxarifado: 1,
      fora: 0,
      atrasada: 0,
      com_problema: 1,
      baixadas_extraviadas: 2,
    });
  });

  it('filtra por situação', async () => {
    const corpo = (await (await comToken(token, 'GET', '/ferramentas?situacao=baixadas_extraviadas')).json()) as {
      itens: { numero: string; situacao: string }[];
    };

    expect(corpo.itens.map((item) => [item.numero, item.situacao])).toEqual([
      ['F-003', 'baixada'],
      ['F-004', 'extraviada'],
    ]);
  });

  it('filtra por categoria e por texto em número, nome, marca e modelo', async () => {
    const porCategoria = (await (
      await comToken(token, 'GET', '/ferramentas?categoria=Elétrica&situacao=baixadas_extraviadas')
    ).json()) as {
      itens: { numero: string }[];
    };
    const porMarca = (await (await comToken(token, 'GET', '/ferramentas?texto=fluke&situacao=todas')).json()) as {
      itens: { numero: string }[];
    };
    const porModelo = (await (await comToken(token, 'GET', '/ferramentas?texto=mh-3&situacao=baixadas_extraviadas')).json()) as {
      itens: { numero: string }[];
    };
    const porNumero = (await (await comToken(token, 'GET', '/ferramentas?texto=f-002&situacao=todas')).json()) as {
      itens: { numero: string }[];
    };

    expect(porCategoria.itens.map((item) => item.numero)).toEqual(['F-004']);
    expect(porMarca.itens.map((item) => item.numero)).toEqual(['F-001']);
    expect(porModelo.itens.map((item) => item.numero)).toEqual(['F-003']);
    expect(porNumero.itens.map((item) => item.numero)).toEqual(['F-002']);
  });

  it('as contagens respeitam categoria e texto, mas não a situação escolhida', async () => {
    const corpo = (await (await comToken(token, 'GET', '/ferramentas?categoria=Mecânica')).json()) as {
      contagens: Record<string, number>;
    };

    expect(corpo.contagens).toMatchObject({ todas: 1, no_almoxarifado: 0, com_problema: 1, baixadas_extraviadas: 0 });
  });
});
