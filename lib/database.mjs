import { MongoClient } from "mongodb";
import { resolveDatabaseTarget } from "../scripts/db-target.mjs";

let connection;
export function database() {
  if (!connection) {
    const { uri, dbName } = resolveDatabaseTarget(process.env);
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    connection = { client, db: client.db(dbName) };
  }
  return connection;
}
