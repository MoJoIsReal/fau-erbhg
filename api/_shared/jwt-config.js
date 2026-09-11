export const JWT_ALGORITHM = 'HS256';
export const JWT_ISSUER = 'fau-erdal-barnehage';
export const JWT_AUDIENCE = 'fau-erdal-barnehage-web';
export const MIN_SESSION_SECRET_LENGTH = 32;

const PLACEHOLDER_SECRET_RE = /^(change-me|replace-me|your[_-]|example|secret$)/i;

export function getJwtConfig(env = process.env) {
  const secret = typeof env.SESSION_SECRET === 'string' ? env.SESSION_SECRET.trim() : '';
  if (secret.length < MIN_SESSION_SECRET_LENGTH || PLACEHOLDER_SECRET_RE.test(secret)) {
    throw new Error(`SESSION_SECRET must be a non-placeholder secret of at least ${MIN_SESSION_SECRET_LENGTH} characters`);
  }

  return {
    secret,
    signOptions: {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: '2h',
    },
    verifyOptions: {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  };
}
