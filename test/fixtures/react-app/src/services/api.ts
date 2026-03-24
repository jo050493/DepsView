import { getConfig } from '../utils/config';

export const apiClient = {
  baseUrl: getConfig().apiUrl,
};
