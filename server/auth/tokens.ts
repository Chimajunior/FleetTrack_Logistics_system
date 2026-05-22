import { createHmac, timingSafeEqual } from "node:crypto";

export type AuthRole = "ADMIN" | "DISPATCHER" | "DRIVER";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
};

type TokenPayload = AuthUser & {
  exp: number;
};

const issuer = "fleettrack";
const ttlSeconds = 60 * 60 * 8;

export function signToken(user: AuthUser) {
  const header = base64UrlEncode({ alg: "HS256", typ: "JWT", iss: issuer });
  const payload = base64UrlEncode({
    ...user,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  });
  const signature = sign(`${header}.${payload}`);

  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): AuthUser | null {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;

  const expected = sign(`${header}.${payload}`);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenPayload;
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;

  return {
    id: parsed.id,
    email: parsed.email,
    name: parsed.name,
    role: parsed.role
  };
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function base64UrlEncode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function getSecret() {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_TOKEN_SECRET is required in production");
  }

  return secret ?? "fleettrack-dev-secret-change-me";
}
