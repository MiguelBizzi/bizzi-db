import type { ComponentType } from 'react';
import type { DatabaseDialect } from '../../types';
import { MySqlLogo } from './MySqlLogo';
import { PostgresLogo } from './PostgresLogo';
import { SqlServerLogo } from './SqlServerLogo';

const LOGOS: Partial<Record<DatabaseDialect, ComponentType<{ className?: string }>>> = {
  PostgreSQL: PostgresLogo,
  MySQL: MySqlLogo,
  SQLServer: SqlServerLogo,
};

export function EngineLogo({
  dialect,
  className,
}: {
  dialect?: DatabaseDialect;
  className?: string;
}) {
  const Logo = (dialect && LOGOS[dialect]) || PostgresLogo;
  return <Logo className={className} />;
}
