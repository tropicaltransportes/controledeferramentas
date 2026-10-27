import { applyD1Migrations, env } from 'cloudflare:test';

// Aplica as migrações do D1 antes de cada arquivo de teste. O isolamento do
// armazenamento do pool desfaz as escritas de cada teste ao final dele.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
