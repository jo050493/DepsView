import { formatName } from '../utils/format';

export function Header({ user }: { user: string }) {
  return <h1>{formatName(user)}</h1>;
}
