import { crmCollections, crmIndexes } from "./crm-model.mjs";

export async function setupCrm(db) {
  // Do not silently apply a strict validator over incompatible existing records.
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [name, schema] of Object.entries(crmCollections)) {
    if (existing.has(name) && await db.collection(name).findOne({ $nor: [{ $jsonSchema: schema }] }, { projection: { _id: 1 } })) {
      throw new Error(`Existing ${name} records require an explicit data migration.`);
    }
  }
  for (const [name, schema] of Object.entries(crmCollections)) {
    const options = { validator: { $jsonSchema: schema }, validationLevel: "strict", validationAction: "error" };
    try { await db.createCollection(name, options); }
    catch (error) { if (error.code !== 48) throw error; await db.command({ collMod: name, ...options }); }
    await db.collection(name).createIndexes(crmIndexes[name]);
  }
}
