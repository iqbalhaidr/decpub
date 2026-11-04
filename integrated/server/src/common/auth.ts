/**
 * Autentikasi akun operasional (email + password, JWT), terpisah total dari pseudonim.
 * Port dari `backend-go/internal/middleware/{jwt,role}.go`, dengan `@Auth(...roles)` sebagai
 * satu dekorator: tanpa argumen = login saja; dengan argumen = peran harus salah satunya.
 */
import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiBearerAuth } from "@nestjs/swagger";
import jwt from "jsonwebtoken";
import { APP_CONFIG, type AppConfig } from "../config/config.js";

export type AccountRole = "author" | "reviewer" | "editor" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  role: AccountRole;
}

const ROLES_KEY = "decpub:roles";

export function signToken(config: Pick<AppConfig, "jwtSecret" | "jwtTtlSeconds">, user: AuthUser): string {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtTtlSeconds,
  });
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
    const header = req.headers.authorization ?? "";
    const m = /^Bearer (.+)$/.exec(header);
    if (!m) throw new UnauthorizedException("Token tidak ada");
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(m[1], this.config.jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException("Token tidak sah atau kedaluwarsa");
    }
    const user: AuthUser = { id: String(payload.sub), email: String(payload.email), role: payload.role as AccountRole };
    const roles = this.reflector.getAllAndOverride<AccountRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (roles.length > 0 && !roles.includes(user.role)) {
      throw new ForbiddenException(`Peran ${user.role} tidak diizinkan; butuh ${roles.join(" atau ")}`);
    }
    req.user = user;
    return true;
  }
}

/** Wajib login; bila `roles` diisi, peran akun harus salah satunya. */
export const Auth = (...roles: AccountRole[]) =>
  applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(AuthGuard), ApiBearerAuth());

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
});
