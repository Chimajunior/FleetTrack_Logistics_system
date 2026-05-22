import type { NextFunction, Request, Response } from "express";
import { verifyToken, type AuthRole, type AuthUser } from "./tokens";

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};

export function requireAuth(roles: AuthRole[] = ["ADMIN", "DISPATCHER", "DRIVER"]) {
  return (request: Request, response: Response, next: NextFunction) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    const user = token ? verifyToken(token) : null;

    if (!user) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!roles.includes(user.role)) {
      response.status(403).json({ error: "Insufficient role" });
      return;
    }

    (request as AuthenticatedRequest).user = user;
    next();
  };
}
