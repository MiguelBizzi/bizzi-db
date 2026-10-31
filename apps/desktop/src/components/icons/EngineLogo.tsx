import type { DatabaseDialect } from '../../types';
import { MySqlLogo } from './MySqlLogo';
import { PostgresLogo } from './PostgresLogo';

export function EngineLogo({
  dialect,
  className,
}: {
  dialect?: DatabaseDialect;
  className?: string;
}) {
  if (dialect === 'MySQL') return <MySqlLogo className={className} />;
  return <PostgresLogo className={className} />;
}
