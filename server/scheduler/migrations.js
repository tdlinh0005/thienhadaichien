'use strict';
var SCHEDULER_SCHEMA_VERSION = 1;
var JOB_SEMANTIC_COLUMNS = [
  'replay_of_job_id', 'resolved_by_job_id', 'checkpoint_revision',
  'source_account_id', 'blocked_by_job_id', 'locked_generation'
];
var APPLICATION_SEMANTIC_COLUMNS = ['resolves_job_id', 'result_sha256'];
var CUTOVER_SNAPSHOT_COLUMNS = [
  'ht_rows_json', 'event_jobs_rows_json', 'event_applications_rows_json',
  'scheduler_meta_rows_json', 'scheduler_lease_rows_json', 'scheduler_audit_rows_json'
];
var REQUIRED_COLUMNS = {
  scheduler_meta: ['key', 'value', 'updated_at_ms'],
  scheduler_lease: [
    'lease_name', 'owner_id', 'expires_at_ms', 'heartbeat_at_ms', 'generation'
  ],
  event_jobs: [
    'id', 'kind', 'scheduled_at_s', 'priority', 'sequence', 'state',
    'idempotency_key', 'aggregate_type', 'aggregate_id', 'expected_revision',
    'source_account_id', 'checkpoint_revision', 'replay_of_job_id',
    'blocked_by_job_id', 'resolved_by_job_id', 'payload_json',
    'payload_sha256', 'attempt',
    'max_attempts', 'retry_at_ms', 'locked_by', 'locked_generation',
    'locked_until_ms', 'completed_at_ms', 'cancelled_at_ms', 'cancel_reason',
    'quarantined_at_ms', 'error_code', 'error_message_safe', 'created_at_ms',
    'updated_at_ms'
  ],
  event_applications: [
    'idempotency_key', 'job_id', 'resolves_job_id', 'effective_at_s',
    'applied_at_ms', 'snapshot_json', 'snapshot_sha256', 'result_json',
    'result_sha256'
  ],
  scheduler_audit: ['id', 'action', 'job_id', 'detail_safe', 'at_ms'],
  scheduler_cutover_snapshot: [
    'snapshot_id', 'created_at_ms', 'mode_before', 'reconcile_cursor_before',
    'dq_rows_json', 'ht_rows_json', 'hamdang_rows_json', 'hamgiu_rows_json',
    'event_jobs_rows_json', 'event_applications_rows_json',
    'scheduler_meta_rows_json', 'scheduler_lease_rows_json',
    'scheduler_audit_rows_json', 'imported_job_ids_json',
    'combat_seed_key_before'
  ]
};
var INTEGER_COLUMNS = {
  scheduler_meta: ['updated_at_ms'],
  scheduler_lease: ['expires_at_ms', 'heartbeat_at_ms', 'generation'],
  event_jobs: [
    'scheduled_at_s', 'priority', 'sequence', 'expected_revision',
    'source_account_id', 'checkpoint_revision', 'attempt', 'max_attempts',
    'retry_at_ms', 'locked_generation', 'locked_until_ms', 'completed_at_ms',
    'cancelled_at_ms', 'quarantined_at_ms', 'created_at_ms', 'updated_at_ms'
  ],
  event_applications: ['effective_at_s', 'applied_at_ms'],
  scheduler_audit: ['id', 'at_ms'],
  scheduler_cutover_snapshot: ['snapshot_id', 'created_at_ms']
};
var NOT_NULL_COLUMNS = {
  scheduler_meta: ['value', 'updated_at_ms'],
  scheduler_lease: ['owner_id', 'expires_at_ms', 'heartbeat_at_ms', 'generation'],
  event_jobs: [
    'kind', 'scheduled_at_s', 'priority', 'sequence', 'state',
    'idempotency_key', 'aggregate_type', 'aggregate_id', 'payload_json',
    'payload_sha256', 'attempt', 'max_attempts', 'created_at_ms', 'updated_at_ms'
  ],
  event_applications: [
    'job_id', 'effective_at_s', 'applied_at_ms', 'result_json', 'result_sha256'
  ],
  scheduler_audit: ['action', 'detail_safe', 'at_ms'],
  scheduler_cutover_snapshot: REQUIRED_COLUMNS.scheduler_cutover_snapshot.filter(
    function (name) {
      return ['snapshot_id', 'reconcile_cursor_before',
        'combat_seed_key_before'].indexOf(name) < 0;
    }
  )
};
var PRIMARY_KEY_COLUMNS = {
  scheduler_meta: 'key', scheduler_lease: 'lease_name', event_jobs: 'id',
  event_applications: 'idempotency_key', scheduler_audit: 'id',
  scheduler_cutover_snapshot: 'snapshot_id'
};

function migrationError(code) {
  var error = new Error(code);
  error.code = code;
  return error;
}
function hasTable(kho, name) {
  return Boolean(kho.db.prepare(
    "SELECT 1 AS yes FROM sqlite_master WHERE type='table' AND name=?"
  ).get(name));
}
function columnNames(kho, name) {
  return kho.db.prepare('PRAGMA table_info(' + name + ')').all()
    .map(function (row) { return row.name; });
}
function rowCount(kho, name) {
  return Number(kho.db.prepare('SELECT COUNT(*) AS n FROM ' + name).get().n);
}
var CURRENT_TABLE_SQL = {
  scheduler_meta: 'CREATE TABLE scheduler_meta (' +
    'key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at_ms INTEGER NOT NULL)',
  scheduler_lease: 'CREATE TABLE scheduler_lease (' +
    "lease_name TEXT PRIMARY KEY CHECK(lease_name='global-writer')," +
    'owner_id TEXT NOT NULL,expires_at_ms INTEGER NOT NULL,' +
    'heartbeat_at_ms INTEGER NOT NULL,generation INTEGER NOT NULL)',
  event_jobs: 'CREATE TABLE event_jobs (' +
    'id TEXT PRIMARY KEY,kind TEXT NOT NULL,scheduled_at_s INTEGER NOT NULL,' +
    'priority INTEGER NOT NULL DEFAULT 100,sequence INTEGER NOT NULL UNIQUE,' +
    "state TEXT NOT NULL CHECK(state IN ('PENDING','RUNNING','RETRY_WAIT'," +
    "'COMPLETED','CANCELLED','QUARANTINED'))," +
    'idempotency_key TEXT NOT NULL UNIQUE,aggregate_type TEXT NOT NULL,' +
    'aggregate_id TEXT NOT NULL,expected_revision INTEGER,source_account_id INTEGER,' +
    'checkpoint_revision INTEGER,replay_of_job_id TEXT REFERENCES event_jobs(id),' +
    'blocked_by_job_id TEXT REFERENCES event_jobs(id),' +
    'resolved_by_job_id TEXT REFERENCES event_jobs(id),payload_json TEXT NOT NULL,' +
    'payload_sha256 TEXT NOT NULL,attempt INTEGER NOT NULL DEFAULT 0,' +
    'max_attempts INTEGER NOT NULL,retry_at_ms INTEGER,locked_by TEXT,' +
    'locked_generation INTEGER,locked_until_ms INTEGER,completed_at_ms INTEGER,' +
    'cancelled_at_ms INTEGER,cancel_reason TEXT,quarantined_at_ms INTEGER,' +
    'error_code TEXT,error_message_safe TEXT,created_at_ms INTEGER NOT NULL,' +
    'updated_at_ms INTEGER NOT NULL,CHECK(attempt>=0 AND max_attempts>=1),' +
    "CHECK(blocked_by_job_id IS NULL OR (kind='ACCOUNT_ADVANCE' AND state='PENDING'))," +
    'CHECK(blocked_by_job_id IS NULL OR blocked_by_job_id<>id))',
  event_applications: 'CREATE TABLE event_applications (' +
    'idempotency_key TEXT PRIMARY KEY,job_id TEXT NOT NULL UNIQUE ' +
    'REFERENCES event_jobs(id),resolves_job_id TEXT UNIQUE REFERENCES event_jobs(id),' +
    'effective_at_s INTEGER NOT NULL,applied_at_ms INTEGER NOT NULL,' +
    'snapshot_json TEXT,snapshot_sha256 TEXT,result_json TEXT NOT NULL,' +
    'result_sha256 TEXT NOT NULL)',
  scheduler_audit: 'CREATE TABLE scheduler_audit (' +
    'id INTEGER PRIMARY KEY,action TEXT NOT NULL,job_id TEXT,' +
    'detail_safe TEXT NOT NULL,at_ms INTEGER NOT NULL)',
  scheduler_cutover_snapshot: 'CREATE TABLE scheduler_cutover_snapshot (' +
    'snapshot_id INTEGER PRIMARY KEY CHECK(snapshot_id=1),' +
    'created_at_ms INTEGER NOT NULL,mode_before TEXT NOT NULL,' +
    'reconcile_cursor_before TEXT,dq_rows_json TEXT NOT NULL,' +
    'ht_rows_json TEXT NOT NULL,hamdang_rows_json TEXT NOT NULL,' +
    'hamgiu_rows_json TEXT NOT NULL,event_jobs_rows_json TEXT NOT NULL,' +
    'event_applications_rows_json TEXT NOT NULL,' +
    'scheduler_meta_rows_json TEXT NOT NULL,' +
    'scheduler_lease_rows_json TEXT NOT NULL,' +
    'scheduler_audit_rows_json TEXT NOT NULL,' +
    'imported_job_ids_json TEXT NOT NULL,combat_seed_key_before TEXT)'
};
var CURRENT_INDEX_SQL = {
  event_jobs_due_idx: 'CREATE INDEX event_jobs_due_idx ON event_jobs(' +
    'state,scheduled_at_s,priority,sequence,id)',
  event_jobs_retry_idx: 'CREATE INDEX event_jobs_retry_idx ON event_jobs(' +
    'state,retry_at_ms,priority,sequence,id)',
  event_jobs_aggregate_idx: 'CREATE INDEX event_jobs_aggregate_idx ON event_jobs(' +
    'aggregate_type,aggregate_id,state)',
  event_jobs_source_unresolved_idx:
    'CREATE INDEX event_jobs_source_unresolved_idx ON event_jobs(' +
    'source_account_id,state,scheduled_at_s)',
  event_jobs_blocked_by_idx:
    'CREATE UNIQUE INDEX event_jobs_blocked_by_idx ON event_jobs(' +
    'blocked_by_job_id) WHERE blocked_by_job_id IS NOT NULL'
};
var CURRENT_TRIGGER_SQL = {};
function normalizedSql(sql) {
  var source = String(sql || ''), output = '', quote = null, index, character;
  for (index = 0; index < source.length; index += 1) {
    character = source[index];
    if (quote) {
      output += character;
      if (character === quote) {
        if (source[index + 1] === quote) {
          output += source[index + 1]; index += 1;
        } else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character; output += character; continue;
    }
    if (/\s/.test(character)) continue;
    output += character.toLowerCase();
  }
  return output.replace(/;+$/, '');
}
function normalizedTableSql(kho, name) {
  var row = kho.db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
  ).get(name);
  return row && normalizedSql(row.sql);
}
function withoutTopLevelColumns(sql, omitted) {
  var open = sql.indexOf('('), close = sql.lastIndexOf(')');
  var body = sql.slice(open + 1, close), parts = [], start = 0, depth = 0;
  var quote = false, index, character;
  for (index = 0; index < body.length; index += 1) {
    character = body[index];
    if (character === "'" && body[index - 1] !== '\\') quote = !quote;
    if (quote) continue;
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(body.slice(start, index)); start = index + 1;
    }
  }
  parts.push(body.slice(start));
  parts = parts.filter(function (part) {
    var source = part.trim();
    var name = source.split(/\s+/)[0];
    if (omitted.indexOf(name) >= 0) return false;
    return !(/^CHECK\s*\(/i.test(source) && omitted.some(function (column) {
      return new RegExp('\\b' + column + '\\b').test(source);
    }));
  });
  return sql.slice(0, open + 1) + parts.join(',') + sql.slice(close);
}
function allowedEmptyOmissions(missing, additions) {
  return missing.length > 0 && missing.every(function (name) {
    return additions.indexOf(name) >= 0;
  });
}
function missingColumns(actual, required) {
  return required.filter(function (name) { return actual.indexOf(name) < 0; });
}
function canonicalCounter(value) {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) &&
    Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}
function metaValue(kho, key) {
  if (!hasTable(kho, 'scheduler_meta')) return null;
  var row = kho.db.prepare('SELECT value FROM scheduler_meta WHERE key=?').get(key);
  return row ? row.value : null;
}
function assertCanonicalTable(kho, table) {
  if (!hasTable(kho, table) ||
      normalizedTableSql(kho, table) !== normalizedSql(CURRENT_TABLE_SQL[table])) {
    throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
  }
}
function assertStoredSchemaVersion(kho) {
  if (!hasTable(kho, 'scheduler_meta')) return null;
  var columns = columnNames(kho, 'scheduler_meta');
  if (columns.indexOf('key') < 0 || columns.indexOf('value') < 0) {
    throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
  }
  var stored = metaValue(kho, 'schema_version');
  if (stored === null) {
    assertCanonicalTable(kho, 'scheduler_meta');
    return null;
  }
  if (typeof stored !== 'string' || !/^(0|[1-9][0-9]*)$/.test(stored)) {
    throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
  }
  var version = BigInt(stored);
  var current = BigInt(SCHEDULER_SCHEMA_VERSION);
  if (version > current) throw migrationError('SCHEDULER_SCHEMA_TOO_NEW');
  if (version !== current) throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
  assertCanonicalTable(kho, 'scheduler_meta');
  return Number(version);
}
function assertSchedulerNamespace(kho) {
  var tables = Object.keys(CURRENT_TABLE_SQL);
  var rows = kho.db.prepare(
    "SELECT type,name,tbl_name,sql FROM sqlite_master " +
    "WHERE type IN ('table','index','view','trigger') ORDER BY type,name"
  ).all();
  rows.forEach(function (row) {
    var rowName = String(row.name).toLowerCase();
    var targetName = String(row.tbl_name).toLowerCase();
    var owned = tables.indexOf(targetName) >= 0;
    var namespaced = /^(scheduler_|event_)/.test(rowName);
    var attached = owned && (row.type === 'index' || row.type === 'trigger');
    if (!namespaced && !attached) return;
    if (row.type === 'table' &&
        Object.prototype.hasOwnProperty.call(CURRENT_TABLE_SQL, rowName) &&
        row.name === rowName && row.tbl_name === row.name) return;
    if (row.type === 'index' && row.sql === null && owned) return;
    if (row.type === 'index' &&
        Object.prototype.hasOwnProperty.call(CURRENT_INDEX_SQL, rowName) &&
        row.name === rowName &&
        row.tbl_name === 'event_jobs' &&
        normalizedSql(row.sql) === normalizedSql(CURRENT_INDEX_SQL[rowName])) return;
    if (row.type === 'trigger' &&
        Object.prototype.hasOwnProperty.call(CURRENT_TRIGGER_SQL, rowName) &&
        row.name === rowName &&
        owned && normalizedSql(row.sql) ===
          normalizedSql(CURRENT_TRIGGER_SQL[rowName])) return;
    throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
  });
}
function assertDqRevisionShape(kho) {
  var columns = kho.db.prepare('PRAGMA table_info(dq)').all();
  if (!columns.length) throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
  var revision = columns.find(function (row) { return row.name === 'revision'; });
  if (!revision) return false;
  if (String(revision.type).toUpperCase() !== 'INTEGER' ||
      revision.notnull !== 1 || revision.dflt_value !== '0' || revision.pk !== 0) {
    throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
  }
  return true;
}
function assertCanonicalIndexes(kho, requireComplete) {
  var expected = Object.keys(CURRENT_INDEX_SQL).sort();
  var schedulerTables = Object.keys(CURRENT_TABLE_SQL);
  var rows = kho.db.prepare(
    "SELECT name,tbl_name,sql FROM sqlite_master WHERE type='index' " +
    'AND sql IS NOT NULL ORDER BY name'
  ).all().filter(function (row) {
    return schedulerTables.indexOf(row.tbl_name) >= 0;
  });
  // sqlite_autoindex_* entries have sql=NULL and are deliberately excluded.
  // Every explicit index on a scheduler-owned table is part of the exact
  // schema signature: an extra UNIQUE/partial index can restrict otherwise
  // legal writes just as surely as an extra table CHECK.
  rows.forEach(function (row) {
    if (!Object.prototype.hasOwnProperty.call(CURRENT_INDEX_SQL, row.name) ||
        normalizedSql(row.sql) !== normalizedSql(CURRENT_INDEX_SQL[row.name])) {
      throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
    }
  });
  if (requireComplete && (rows.length !== expected.length ||
      rows.some(function (row, index) { return row.name !== expected[index]; }))) {
    throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
  }
}
function assertPreflight(kho) {
  var tables = Object.keys(CURRENT_TABLE_SQL);
  assertStoredSchemaVersion(kho);
  assertSchedulerNamespace(kho);
  assertDqRevisionShape(kho);
  var jobsExists = hasTable(kho, 'event_jobs');
  var appsExists = hasTable(kho, 'event_applications');
  var snapshotsExists = hasTable(kho, 'scheduler_cutover_snapshot');
  var jobsCount = jobsExists ? rowCount(kho, 'event_jobs') : 0;
  var missingJobs = jobsExists ? missingColumns(
    columnNames(kho, 'event_jobs'), REQUIRED_COLUMNS.event_jobs
  ) : [];
  var missingApps = appsExists ? missingColumns(
    columnNames(kho, 'event_applications'), REQUIRED_COLUMNS.event_applications
  ) : [];
  var missingSnapshots = snapshotsExists ? missingColumns(
    columnNames(kho, 'scheduler_cutover_snapshot'),
    REQUIRED_COLUMNS.scheduler_cutover_snapshot
  ) : [];
  var metaPayload = hasTable(kho, 'scheduler_meta') &&
    rowCount(kho, 'scheduler_meta') > 0;
  var nonemptyPayload = tables.some(function (table) {
    return table !== 'scheduler_meta' && hasTable(kho, table) && rowCount(kho, table) > 0;
  });
  assertCanonicalIndexes(kho, false);
  // Sequence is durable state, not a value that CREATE/ALTER may silently
  // repair. Validate it before the first schema mutation even when the job
  // table is absent or empty. A wholly fresh database has no counter yet.
  var counter = metaValue(kho, 'sequence');
  if (counter !== null && !canonicalCounter(counter)) {
    throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
  }
  // Meta-only state is durable payload too: it may coexist with explicitly
  // supported empty additive omissions, but never with an absent base table.
  if (metaPayload && tables.some(function (table) { return !hasTable(kho, table); })) {
    throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
  }
  if (jobsExists && missingJobs.length &&
      (jobsCount || !allowedEmptyOmissions(missingJobs, JOB_SEMANTIC_COLUMNS)) ||
      appsExists && missingApps.length &&
      (rowCount(kho, 'event_applications') ||
        !allowedEmptyOmissions(missingApps, APPLICATION_SEMANTIC_COLUMNS)) ||
      snapshotsExists && missingSnapshots.length &&
      (rowCount(kho, 'scheduler_cutover_snapshot') ||
        !allowedEmptyOmissions(missingSnapshots, CUTOVER_SNAPSHOT_COLUMNS))) {
    throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
  }
  // Any scheduler payload means the whole inventory must already be current.
  // This predicate, exact DDL/index signatures, and FK integrity all run
  // before rebuildEmptyPartialSchedulerTables can issue its first DROP.
  if (nonemptyPayload) {
    tables.forEach(function (table) { assertCanonicalTable(kho, table); });
    assertCanonicalIndexes(kho, true);
    try {
      if (kho.db.prepare('PRAGMA foreign_key_check').all().length) {
        throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
      }
    } catch (error) {
      if (error && error.code === 'SCHEDULER_SCHEMA_UNSUPPORTED') throw error;
      throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
    }
  } else {
    tables.forEach(function (table) {
      if (!hasTable(kho, table) || table === 'scheduler_meta') return;
      var missing = missingColumns(columnNames(kho, table), REQUIRED_COLUMNS[table]);
      var supported = table === 'event_jobs' ? JOB_SEMANTIC_COLUMNS :
        table === 'event_applications' ? APPLICATION_SEMANTIC_COLUMNS :
        table === 'scheduler_cutover_snapshot' ? CUTOVER_SNAPSHOT_COLUMNS : [];
      if (missing.some(function (name) { return supported.indexOf(name) < 0; })) {
        throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
      }
      var expected = missing.length ?
        withoutTopLevelColumns(CURRENT_TABLE_SQL[table], missing) :
        CURRENT_TABLE_SQL[table];
      if (normalizedTableSql(kho, table) !== normalizedSql(expected)) {
        throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
      }
    });
  }
  if (jobsCount) {
    var max = Number(kho.db.prepare('SELECT MAX(sequence) AS n FROM event_jobs').get().n);
    if (!canonicalCounter(counter) || Number(counter) < max) {
      throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
    }
  }
}
function ensureColumn(kho, table, name, sql) {
  if (columnNames(kho, table).indexOf(name) < 0) kho.db.exec(sql);
}
function rebuildEmptyPartialSchedulerTables(kho) {
  var jobsMissing = hasTable(kho, 'event_jobs') && missingColumns(
    columnNames(kho, 'event_jobs'), JOB_SEMANTIC_COLUMNS
  ).length > 0;
  var applicationsMissing = hasTable(kho, 'event_applications') && missingColumns(
    columnNames(kho, 'event_applications'), APPLICATION_SEMANTIC_COLUMNS
  ).length > 0;
  var snapshotsMissing = hasTable(kho, 'scheduler_cutover_snapshot') && missingColumns(
    columnNames(kho, 'scheduler_cutover_snapshot'), CUTOVER_SNAPSHOT_COLUMNS
  ).length > 0;
  if (snapshotsMissing) kho.db.exec('DROP TABLE scheduler_cutover_snapshot');
  if (jobsMissing) {
    if (hasTable(kho, 'event_applications')) {
      if (rowCount(kho, 'event_applications') !== 0) {
        throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
      }
      kho.db.exec('DROP TABLE event_applications');
    }
    kho.db.exec('DROP TABLE event_jobs');
    return;
  }
  if (applicationsMissing) kho.db.exec('DROP TABLE event_applications');
}


function createCurrentTables(kho) {
  Object.keys(CURRENT_TABLE_SQL).forEach(function (table) {
    kho.db.exec(CURRENT_TABLE_SQL[table].replace('CREATE TABLE ',
      'CREATE TABLE IF NOT EXISTS '));
  });
}


function createIndexes(kho) {
  Object.keys(CURRENT_INDEX_SQL).forEach(function (name) {
    kho.db.exec(CURRENT_INDEX_SQL[name].replace(
      /^CREATE (UNIQUE )?INDEX /, 'CREATE $1INDEX IF NOT EXISTS '
    ));
  });
}
function apDungMigrationScheduler(kho, nowMs) {
  return kho.trongGiaoDich(function () {
    assertPreflight(kho);
    var jobsWereEmpty = !hasTable(kho, 'event_jobs') || rowCount(kho, 'event_jobs') === 0;
    // ALTER cannot recover PK/UNIQUE/FK/default/CHECK constraints from a
    // partial table. Empty supported partials are rebuilt atomically from
    // the exact current DDL; any nonempty partial was rejected in preflight.
    rebuildEmptyPartialSchedulerTables(kho);
    createCurrentTables(kho);
    ensureColumn(
      kho, 'dq', 'revision',
      'ALTER TABLE dq ADD COLUMN revision INTEGER NOT NULL DEFAULT 0'
    );
    ensureColumn(
      kho, 'event_jobs', 'replay_of_job_id',
      'ALTER TABLE event_jobs ADD COLUMN replay_of_job_id TEXT REFERENCES event_jobs(id)'
    );
    ensureColumn(
      kho, 'event_jobs', 'resolved_by_job_id',
      'ALTER TABLE event_jobs ADD COLUMN resolved_by_job_id TEXT REFERENCES event_jobs(id)'
    );
    ensureColumn(
      kho, 'event_jobs', 'checkpoint_revision',
      'ALTER TABLE event_jobs ADD COLUMN checkpoint_revision INTEGER'
    );
    ensureColumn(
      kho, 'event_jobs', 'source_account_id',
      'ALTER TABLE event_jobs ADD COLUMN source_account_id INTEGER'
    );
    ensureColumn(
      kho, 'event_jobs', 'blocked_by_job_id',
      'ALTER TABLE event_jobs ADD COLUMN blocked_by_job_id TEXT REFERENCES event_jobs(id)'
    );
    ensureColumn(
      kho, 'event_jobs', 'locked_generation',
      'ALTER TABLE event_jobs ADD COLUMN locked_generation INTEGER'
    );
    ensureColumn(
      kho, 'event_applications', 'resolves_job_id',
      'ALTER TABLE event_applications ADD COLUMN resolves_job_id TEXT REFERENCES event_jobs(id)'
    );
    ensureColumn(
      kho, 'event_applications', 'result_sha256',
      "ALTER TABLE event_applications ADD COLUMN result_sha256 TEXT NOT NULL DEFAULT ''"
    );
    ensureColumn(
      kho, 'scheduler_cutover_snapshot', 'ht_rows_json',
      "ALTER TABLE scheduler_cutover_snapshot ADD COLUMN ht_rows_json TEXT NOT NULL DEFAULT '[]'"
    );
    ensureColumn(
      kho, 'scheduler_cutover_snapshot', 'event_jobs_rows_json',
      "ALTER TABLE scheduler_cutover_snapshot ADD COLUMN event_jobs_rows_json TEXT NOT NULL DEFAULT '[]'"
    );
    ensureColumn(
      kho, 'scheduler_cutover_snapshot', 'event_applications_rows_json',
      "ALTER TABLE scheduler_cutover_snapshot ADD COLUMN event_applications_rows_json TEXT NOT NULL DEFAULT '[]'"
    );
    ensureColumn(
      kho, 'scheduler_cutover_snapshot', 'scheduler_meta_rows_json',
      "ALTER TABLE scheduler_cutover_snapshot ADD COLUMN scheduler_meta_rows_json TEXT NOT NULL DEFAULT '[]'"
    );
    ensureColumn(
      kho, 'scheduler_cutover_snapshot', 'scheduler_lease_rows_json',
      "ALTER TABLE scheduler_cutover_snapshot ADD COLUMN scheduler_lease_rows_json TEXT NOT NULL DEFAULT '[]'"
    );
    ensureColumn(
      kho, 'scheduler_cutover_snapshot', 'scheduler_audit_rows_json',
      "ALTER TABLE scheduler_cutover_snapshot ADD COLUMN scheduler_audit_rows_json TEXT NOT NULL DEFAULT '[]'"
    );
    createIndexes(kho);
    if (jobsWereEmpty && metaValue(kho, 'sequence') === null) {
      kho.db.prepare(
        "INSERT INTO scheduler_meta(key,value,updated_at_ms) VALUES('sequence','0',?)"
      ).run(nowMs);
    }
    if (jobsWereEmpty && !canonicalCounter(metaValue(kho, 'sequence'))) {
      throw migrationError('SCHEDULER_SCHEMA_UNSUPPORTED');
    }
    kho.db.prepare(
      "INSERT INTO scheduler_meta(key,value,updated_at_ms) VALUES('schema_version',?,?) " +
      'ON CONFLICT(key) DO NOTHING'
    ).run(String(SCHEDULER_SCHEMA_VERSION), nowMs);
    kho.db.prepare(
      "INSERT INTO scheduler_meta(key,value,updated_at_ms) VALUES('scheduler_mode','legacy',?) " +
      'ON CONFLICT(key) DO NOTHING'
    ).run(nowMs);
  }, {immediate: true});
}
module.exports = {SCHEDULER_SCHEMA_VERSION, apDungMigrationScheduler};
