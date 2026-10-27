import { atender } from './app';
import type { Env } from './env';

export default {
  fetch: (request, env) => atender(request, env),
} satisfies ExportedHandler<Env>;
