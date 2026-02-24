/**
 * SQLCipher database wrapper.
 *
 * Thin layer over @signalapp/sqlcipher that handles:
 * - File path / in-memory selection
 * - WAL mode + foreign keys
 * - Schema migrations on init
 * - Optional encryption key
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "@signalapp/sqlcipher";
import { runMigrations } from "./migrations.js";

export interface DatabaseOptions {
  /** Path to the database file. Default: './data/jeromy.db' */
  path?: string;
  /** Encryption key for SQLCipher. If omitted, DB is unencrypted. */
  encryptionKey?: string;
  /** Use an in-memory database (for testing). */
  inMemory?: boolean;
}

const DEFAULT_PATH = "./data/jeromy.db";

export class JeromyDatabase {
  readonly db: Database;

  constructor(options: DatabaseOptions = {}) {
    if (options.inMemory) {
      this.db = new Database(":memory:");
    } else {
      const dbPath = options.path ?? DEFAULT_PATH;
      mkdirSync(dirname(dbPath), { recursive: true });
      this.db = new Database(dbPath);
    }

    // Encryption (optional)
    if (options.encryptionKey) {
      this.db.pragma(`key = '${options.encryptionKey}'`);
    }

    // Performance + integrity
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    // Run schema migrations
    runMigrations(this.db);
  }

  close(): void {
    this.db.close();
  }
}
