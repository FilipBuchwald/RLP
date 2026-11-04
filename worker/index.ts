import { errorResponse } from './http'
import { Router } from './router'
import { health, me } from './routes/health'
import * as matches from './routes/matches'
import * as players from './routes/players'
import * as sessions from './routes/sessions'
import * as stats from './routes/stats'

const router = new Router()
  .on('GET', '/api/health', health)
  .on('GET', '/api/me', me)
  .on('GET', '/api/players', players.list)
  .on('POST', '/api/players', players.create)
  .on('PATCH', '/api/players/:id', players.update)
  .on('GET', '/api/players/:id/stats', stats.playerStats)
  .on('GET', '/api/ranking', stats.ranking)
  .on('GET', '/api/sessions', sessions.history)
  .on('POST', '/api/sessions', sessions.create)
  .on('GET', '/api/sessions/live', sessions.live)
  .on('POST', '/api/sessions/:id/rounds', sessions.nextRound)
  .on('POST', '/api/sessions/:id/finish', sessions.finish)
  .on('DELETE', '/api/sessions/:id', sessions.discard)
  .on('PUT', '/api/matches/:id', matches.setScore)

export default {
  async fetch(request, env) {
    try {
      return await router.handle(request, env)
    } catch (e) {
      console.error(e)
      return errorResponse(500, 'Błąd serwera')
    }
  },
} satisfies ExportedHandler<Env>
