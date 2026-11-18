export async function setupAdministration(db) {
  const validator = { $jsonSchema: {
    bsonType: "object", additionalProperties: false,
    required: ["_id", "actorId", "action", "targetType", "targetId", "occurredAt", "details"],
    properties: {
      _id: { bsonType: "objectId" }, actorId: { bsonType: "string" }, action: { bsonType: "string" },
      targetType: { bsonType: "string" }, targetId: { bsonType: "string" }, occurredAt: { bsonType: "date" },
      agencyId: { bsonType: "string" }, clientId: { bsonType: "string" }, details: { bsonType: "object" },
    },
  } };
  try { await db.createCollection("audit_events", { validator, validationLevel: "strict", validationAction: "error" }); }
  catch (error) { if (error.code !== 48) throw error; await db.command({ collMod: "audit_events", validator, validationLevel: "strict", validationAction: "error" }); }
  await db.collection("audit_events").createIndex({ agencyId: 1, clientId: 1, occurredAt: -1 });
  await db.collection("audit_events").createIndex({ actorId: 1, occurredAt: -1 });
  await db.collection("support_requests").createIndex({ requesterId: 1, status: 1, expiresAt: 1 });
  await db.collection("support_requests").createIndex({ agencyId: 1, clientId: 1, createdAt: -1 });
  // Create transactional state collections before their first write.
  for (const name of ["user_preferences", "admin_locks"]) {
    try { await db.createCollection(name); } catch (error) { if (error.code !== 48) throw error; }
  }
}
