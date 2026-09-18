// Every /api/* request reaches the one handler in server/. Keeping Pages types to this file
// lets the server code run unchanged under Miniflare in tests.
import { handle } from '../../server/api'
import type { Env } from '../../server/env'

export const onRequest: PagesFunction<Env> = (context) => handle(context.request, context.env)
