import { accountCollections, accountIndexes } from "./account-model.mjs";
import { accountFixtures } from "./account-fixtures.mjs";

export async function setupAccounts(db) {
  for (const [name, schema] of Object.entries(accountCollections)) {
    const options = { validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" };
    try {
      await db.createCollection(name, options);
    } catch (error) {
      if (error.code !== 48) throw error;
      await db.command({ collMod: name, ...options });
    }
    const collection = db.collection(name);
    if (accountIndexes[name]) await collection.createIndexes(accountIndexes[name]);
    for (const { _id, ...attributes } of accountFixtures[name]) {
      await collection.updateOne({ _id, synthetic: true }, {
        $setOnInsert: { ...attributes, synthetic: true },
      }, { upsert: true });
    }
  }
}
