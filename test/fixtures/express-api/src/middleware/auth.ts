const config = require('./config');

export const authMiddleware = (_req: unknown, _res: unknown, next: () => void) => {
  next();
};
