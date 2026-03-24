import { userRouter } from './routes/users';
import { authMiddleware } from './middleware/auth';

const app = { use: (_: unknown) => {} };
app.use(authMiddleware);
app.use(userRouter);
