// Minimalny router dla /api/* oparty o URLPattern (wbudowany w runtime Workers).
import { authenticate } from './auth'
import { HttpError, errorResponse } from './http'

export type Ctx = {
  request: Request
  env: Env
  url: URL
  params: Record<string, string | undefined>
  /** E-mail ze zweryfikowanego tokenu Cloudflare Access (lokalnie: DEV_USER_EMAIL), null gdy brak. */
  user: string | null
}
export type Handler = (ctx: Ctx) => Response | Promise<Response>

type Route = { method: string; pattern: URLPattern; handler: Handler }

const READ_METHODS = new Set(['GET', 'HEAD'])

export class Router {
  private routes: Route[] = []

  on(method: string, path: string, handler: Handler): this {
    this.routes.push({ method, pattern: new URLPattern({ pathname: path }), handler })
    return this
  }

  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const auth = await authenticate(request, env)
    if (!auth.ok) return errorResponse(auth.status, auth.message)
    const user = auth.email
    let pathMatched = false

    for (const r of this.routes) {
      const m = r.pattern.exec({ pathname: url.pathname })
      if (!m) continue
      pathMatched = true
      if (r.method !== request.method) continue
      // Zapisy tylko dla zalogowanych.
      if (!READ_METHODS.has(request.method) && !user) return errorResponse(401, 'Brak logowania')
      try {
        return await r.handler({ request, env, url, params: m.pathname.groups, user })
      } catch (e) {
        if (e instanceof HttpError) return errorResponse(e.status, e.message, e.extra)
        throw e
      }
    }
    return pathMatched
      ? errorResponse(405, 'Niedozwolona metoda')
      : errorResponse(404, 'Nie znaleziono')
  }
}
