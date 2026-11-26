// Comando administrativo: cria (ou redefine a senha de) um Almoxarife ou Gestor.
// Não existe cadastro público na API. Uso (a senha vai por variável de ambiente, não por argumento):
//
//   SENHA_NOVA='...' node scripts/criar-usuario.ts --email ana@tropical.com.br --nome "Ana" --papel almoxarife
//   SENHA_NOVA='...' node scripts/criar-usuario.ts --email ... --nome ... --papel gestor --local
//
// Sem --local, grava no D1 remoto da Cloudflare (precisa estar autenticado no Wrangler).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gerarHashSenha } from '../src/senha.ts';

const PAPEIS = ['almoxarife', 'gestor'] as const;
const NOME_BANCO = 'controle-ferramentas';
const TAMANHO_MINIMO_SENHA = 8;

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    nome: { type: 'string' },
    papel: { type: 'string' },
    local: { type: 'boolean', default: false },
  },
});

function sair(mensagem: string): never {
  console.error(`Erro: ${mensagem}`);
  process.exit(1);
}

const email = values.email?.trim().toLowerCase() ?? '';
const nome = values.nome?.trim() ?? '';
const papel = values.papel ?? '';
const senha = process.env.SENHA_NOVA ?? '';

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) sair('informe um --email válido');
if (!nome) sair('informe --nome');
if (!(PAPEIS as readonly string[]).includes(papel)) sair('--papel deve ser almoxarife ou gestor');
if (senha.length < TAMANHO_MINIMO_SENHA) {
  sair(`defina SENHA_NOVA com pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`);
}

// Valores vão como literais SQL com aspas duplicadas. A senha nunca vai em claro: só o hash.
const literal = (texto: string) => `'${texto.replace(/'/g, "''")}'`;
const hash = await gerarHashSenha(senha);

const sql = [
  `INSERT INTO usuarios (email, nome, papel, senha_hash, ativo) VALUES (${literal(email)}, ${literal(nome)}, ${literal(papel)}, ${literal(hash)}, 1)`,
  `ON CONFLICT (email) DO UPDATE SET nome = excluded.nome, papel = excluded.papel, senha_hash = excluded.senha_hash, ativo = 1;`,
  `DELETE FROM sessoes WHERE usuario_id = (SELECT id FROM usuarios WHERE email = ${literal(email)});`,
].join(' ');

const raizApi = fileURLToPath(new URL('..', import.meta.url));
const wranglerBin = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const destino = values.local ? '--local' : '--remote';

const resultado = spawnSync(
  process.execPath,
  [wranglerBin, 'd1', 'execute', NOME_BANCO, destino, '--command', sql],
  { cwd: raizApi, stdio: 'inherit' },
);

if (resultado.status !== 0) sair('o Wrangler não conseguiu gravar o usuário');
console.log(`Usuário ${email} (${papel}) pronto no banco ${values.local ? 'local' : 'remoto'}.`);
