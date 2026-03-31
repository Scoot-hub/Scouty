const TIDB_DEFAULT_PORT = 4000;
const MYSQL_DEFAULT_PORT = 3306;

function shouldUseStrictSsl(url) {
  const sslAccept = url.searchParams.get("sslaccept");
  return sslAccept === "strict" || url.hostname.includes("tidbcloud.com");
}

function buildSslConfig(url) {
  if (!shouldUseStrictSsl(url)) {
    return undefined;
  }

  return {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  };
}

function buildPoolConfigFromDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  const ssl = buildSslConfig(url);

  return {
    host: url.hostname,
    port: Number(url.port || TIDB_DEFAULT_PORT),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    ssl,
  };
}

function buildPoolConfigFromTiDbEnv(env) {
  if (!env.TIDB_HOST || !env.TIDB_USER || !env.TIDB_PASSWORD || !env.TIDB_DATABASE) {
    return null;
  }

  return {
    host: env.TIDB_HOST,
    port: Number(env.TIDB_PORT || TIDB_DEFAULT_PORT),
    user: env.TIDB_USER,
    password: env.TIDB_PASSWORD,
    database: env.TIDB_DATABASE,
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
  };
}

function buildPoolConfigFromLegacyEnv(env) {
  return {
    host: env.DB_HOST || "localhost",
    port: Number(env.DB_PORT || MYSQL_DEFAULT_PORT),
    user: env.DB_USER || "root",
    password: env.DB_PASSWORD || "",
    database: env.DB_NAME || "scoutinghub",
  };
}

export function createDbPoolConfig(env = process.env) {
  const basePoolConfig = {
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };

  if (env.DATABASE_URL) {
    return {
      ...basePoolConfig,
      ...buildPoolConfigFromDatabaseUrl(env.DATABASE_URL),
    };
  }

  const tidbPoolConfig = buildPoolConfigFromTiDbEnv(env);
  if (tidbPoolConfig) {
    return {
      ...basePoolConfig,
      ...tidbPoolConfig,
    };
  }

  return {
    ...basePoolConfig,
    ...buildPoolConfigFromLegacyEnv(env),
  };
}
