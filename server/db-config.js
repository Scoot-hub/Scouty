const TIDB_DEFAULT_PORT = 4000;
const MYSQL_DEFAULT_PORT = 3306;

function normalizeEnvValue(value) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  const wrappedInSingleQuotes =
    trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2;
  const wrappedInDoubleQuotes =
    trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2;

  if (wrappedInSingleQuotes || wrappedInDoubleQuotes) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

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
  const url = new URL(normalizeEnvValue(databaseUrl));
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
  const host = normalizeEnvValue(env.TIDB_HOST);
  const user = normalizeEnvValue(env.TIDB_USER);
  const password = normalizeEnvValue(env.TIDB_PASSWORD);
  const database = normalizeEnvValue(env.TIDB_DATABASE);
  const port = normalizeEnvValue(env.TIDB_PORT);

  if (!host || !user || !password || !database) {
    return null;
  }

  return {
    host,
    port: Number(port || TIDB_DEFAULT_PORT),
    user,
    password,
    database,
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
  };
}

function buildPoolConfigFromLegacyEnv(env) {
  const host = normalizeEnvValue(env.DB_HOST);
  const port = normalizeEnvValue(env.DB_PORT);
  const user = normalizeEnvValue(env.DB_USER);
  const password = normalizeEnvValue(env.DB_PASSWORD);
  const database = normalizeEnvValue(env.DB_NAME);

  return {
    host: host || "localhost",
    port: Number(port || MYSQL_DEFAULT_PORT),
    user: user || "root",
    password: password || "",
    database: database || "scoutinghub",
  };
}

export function createDbPoolConfig(env = process.env) {
  const basePoolConfig = {
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };

  const databaseUrl = normalizeEnvValue(env.DATABASE_URL);

  if (databaseUrl) {
    return {
      ...basePoolConfig,
      ...buildPoolConfigFromDatabaseUrl(databaseUrl),
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
