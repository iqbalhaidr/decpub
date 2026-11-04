/** Klien HTTP tipis untuk skrip demo dan tes. Melempar `ApiError` dengan isi balasan bila status bukan 2xx. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** Nama revert chain bila ada (balasan 409 CHAIN_REVERT). */
  get revert(): string | undefined {
    return (this.body as { revert?: string } | undefined)?.revert;
  }
}

export class Api {
  /** Kait pengamat: dipanggil dengan isi permintaan keluar. Dipakai demo untuk membuktikan apa yang dikirim klien ke server. */
  static trace?: (e: { method: string; path: string; body: string }) => void;

  token?: string;
  constructor(public readonly base: string) {}

  as(token: string): Api {
    const a = new Api(this.base);
    a.token = token;
    return a;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...extra };
  }

  private async handle<T>(res: Response, what: string): Promise<T> {
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* bukan JSON */
    }
    if (!res.ok) {
      const msg = (body as { message?: unknown })?.message;
      throw new ApiError(res.status, body, `${what} -> ${res.status} ${typeof msg === "string" ? msg : JSON.stringify(msg ?? body).slice(0, 200)}`);
    }
    return body as T;
  }

  async get<T = any>(path: string): Promise<T> {
    return this.handle<T>(await fetch(this.base + path, { headers: this.headers() }), `GET ${path}`);
  }

  async post<T = any>(path: string, json?: unknown): Promise<T> {
    Api.trace?.({ method: "POST", path, body: JSON.stringify(json ?? {}) });
    return this.handle<T>(
      await fetch(this.base + path, { method: "POST", headers: this.headers({ "content-type": "application/json" }), body: JSON.stringify(json ?? {}) }),
      `POST ${path}`,
    );
  }

  async postForm<T = any>(path: string, form: FormData): Promise<T> {
    return this.handle<T>(await fetch(this.base + path, { method: "POST", headers: this.headers(), body: form }), `POST ${path}`);
  }

  async bytes(path: string): Promise<Uint8Array> {
    const res = await fetch(this.base + path, { headers: this.headers() });
    if (!res.ok) throw new ApiError(res.status, await res.text(), `GET ${path} -> ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
