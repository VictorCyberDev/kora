import type { FastifyReply, FastifyRequest } from "fastify";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "HttpError";
  }
}
export const notFound = () => new HttpError(404, "not_found");
export const forbidden = (message = "insufficient role") =>
  new HttpError(403, "forbidden", message);

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};
export interface AuthContext {
  userId: string;
  email: string;
  displayName: string;
  sessionId: string;
  memberships: ReadonlyMap<string, Role>;
}
declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export function requireUser(req: FastifyRequest): AuthContext {
  if (!req.auth) throw new HttpError(401, "unauthenticated");
  return req.auth;
}
/** Membership role in `orgId`, or 404: never reveals that the org exists. */
export function requireOrgRole(
  req: FastifyRequest,
  orgId: string,
  min: Role,
): Role {
  const role = requireUser(req).memberships.get(orgId);
  if (!role) throw notFound();
  if (ROLE_RANK[role] < ROLE_RANK[min]) throw forbidden();
  return role;
}
export const sendError = (reply: FastifyReply, e: HttpError, requestId: string) =>
  reply.code(e.statusCode).send({ error: e.code, message: e.message, requestId });
