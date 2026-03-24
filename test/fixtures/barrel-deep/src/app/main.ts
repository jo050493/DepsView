// Entry point — imports from top-level barrel
import { TextInput, Button } from '../components';
import { formatDate } from '../utils';

export function bootstrap() {
  return { TextInput, Button, formatDate };
}
