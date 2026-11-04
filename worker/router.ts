// Minimalny router dla /api/* oparty o URLPattern (wbudowany w runtime Workers).

export type Ctx = {
  request: Request
  env: Env
  params: Record<string, string | undefined>
  /** E-mail z Cloudflare Access (lokalnie: DEV_USER_EMAIL), null gdy brak. */
  user: string | null
}
export type Handler = (ctx: Ctx) => Response | Promise<Response>

type Route = { method: string; pattern: URLPattern; handler: Handler }

export class Router {
  private routes: Route[] = []

  on(method: string, path: string, handler: Handler): this {
    this.routes.push({ method, pattern: new URLPattern({ pathname: path }), handler })
    return this
  }

  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const user =
      request.headers.get('Cf-Access-Authenticated-User-Email') ?? env.DEV_USER_EMAIL ?? null
    let pathMatched = false

    for (const r of this.routes) {
      const m = r.pattern.exec({ pathname: url.pathname })
      if (!m) continue
      pathMatched = true
      if (r.method !== request.method) continue
      return r.handler({ request, env, params: m.pathname.groups, user })
    }
    return pathMatched ? error(405, 'Method not allowed') : error(404, 'Not found')
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status })
export const error = (status: number, message: string) => json({ error: message }, status)
