import { UserController } from '../controllers/userController';

export const userRouter = { get: UserController.getAll };
