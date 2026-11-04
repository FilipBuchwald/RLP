import { health } from './health'
import { Router, error } from './router'

const router = new Router().on('GET', '/api/health', health)

export default {
  async fetch(request, env) {
    try {
      return await router.handle(request, env)
    } catch (e) {
      console.error(e)
      return error(500, 'Internal error')
    }
  },
} satisfies ExportedHandler<Env>
