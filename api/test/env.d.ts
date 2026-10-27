import type { D1Migration } from '@cloudflare/vitest-plugin';
import type { Env as EnvDaApi } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends EnvDaApi {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
