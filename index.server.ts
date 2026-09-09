import type { PluginServerContext } from '@getpaseo/plugin/server';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRewriteService } from './server/service';
import { registerServer } from './server/register';

export default function contribute(server: PluginServerContext) {
  const home = process.env.PASEO_HOME || join(homedir(), '.paseo');
  return registerServer(server, createRewriteService({ directory: join(home, 'plugin-data', 'paseo-plain') }));
}
