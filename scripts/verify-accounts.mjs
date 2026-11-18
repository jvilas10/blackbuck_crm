import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { MongoClient } from "mongodb";
import { resolveDatabaseTarget } from "./db-target.mjs";
import { accountCollections, accountIndexes } from "./account-model.mjs";
import { accountFixtures } from "./account-fixtures.mjs";

nextEnv.loadEnvConfig(process.cwd(), true);
async function verify() {
  const { dbName, uri } = resolveDatabaseTarget(process.env);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    const db = client.db(dbName);
    await db.command({ ping: 1 });
    for (const migration of ["001-bootstrap", "002-accounts"]) {
      assert.ok(await db.collection("schema_migrations").findOne({ _id: migration }));
    }
    for (const [name, schema] of Object.entries(accountCollections)) {
      const [info] = await db.listCollections({ name }).toArray();
      assert.deepEqual(info.options.validator, { $jsonSchema: schema });
      assert.equal(info.options.validationLevel, "strict");
      assert.equal(info.options.validationAction, "error");
      const indexes = await db.collection(name).listIndexes().toArray();
      for (const expected of accountIndexes[name] ?? []) {
        const actual = indexes.find(({ name }) => name === expected.name);
        assert.ok(actual);
        assert.deepEqual(actual.key, expected.key);
        if (expected.unique) assert.equal(actual.unique, true);
        if (expected.collation) {
          assert.equal(actual.collation.locale, expected.collation.locale);
          assert.equal(actual.collation.strength, expected.collation.strength);
        }
      }
      for (const fixture of accountFixtures[name]) {
        assert.deepEqual(await db.collection(name).findOne({ _id: fixture._id }), {
          ...fixture, synthetic: true,
        });
      }
      console.log(`${name}: ${accountFixtures[name].length} fixtures verified; validator and indexes verified.`);
    }
    console.log(`T07 database verification passed (${dbName}).`);
  } finally {
    await client.close();
  }
}
verify().catch((error) => {
  console.error(`T07 verification failed (${error.name}). Credentials and database contents omitted.`);
  process.exitCode = 1;
});
