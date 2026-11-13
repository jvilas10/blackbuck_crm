import nextEnv from "@next/env";
import { MongoClient } from "mongodb";
import { resolveDatabaseTarget } from "./db-target.mjs";

async function setup() {
  nextEnv.loadEnvConfig(process.cwd(), true);
  const { environment, dbName, uri } = resolveDatabaseTarget(process.env);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

  try {
    const db = client.db(dbName);
    const migrations = db.collection("schema_migrations");
    // Every operation in migration 001 is safe to rerun after partial failure.
    if (!(await migrations.findOne({ _id: "001-bootstrap" }))) {
      const fixtures = db.collection("setup_fixtures");
      await fixtures.createIndex({ key: 1 }, { unique: true, name: "fixture_key_unique" });
      await fixtures.updateOne(
        { key: "pilot-demo-client" },
        { $setOnInsert: { key: "pilot-demo-client", name: "Demo Client", synthetic: true } },
        { upsert: true },
      );
      await migrations.updateOne(
        { _id: "001-bootstrap" },
        { $setOnInsert: { appliedAt: new Date() } },
        { upsert: true },
      );
    }
    console.log(`Database setup verified for ${environment} (${dbName}).`);
  } finally {
    await client.close();
  }
}

setup().catch((error) => {
  // Connection errors can include connection details. Report only the type.
  console.error(`Database setup failed (${error.name}). Check the environment, access list, and database role.`);
  process.exitCode = 1;
});
