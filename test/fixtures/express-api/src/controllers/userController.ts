import { UserService } from '../services/userService';

const logger = import('../utils/logger');

export const UserController = {
  getAll: () => UserService.findAll(),
};
