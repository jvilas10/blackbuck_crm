const databases = {
  development: "blackbuck_crm_dev",
  staging: "blackbuck_crm_staging",
};

export function resolveDatabaseTarget({ CRM_ENV, MONGODB_URI }) {
  if (CRM_ENV !== "development" && CRM_ENV !== "staging") {
    throw new Error("Set CRM_ENV to development or staging.");
  }

  if (!MONGODB_URI || !/^mongodb(?:\+srv)?:\/\//.test(MONGODB_URI)) {
    throw new Error("Set MONGODB_URI to a MongoDB connection string.");
  }

  if (CRM_ENV === "staging" && !MONGODB_URI.startsWith("mongodb+srv://")) {
    throw new Error("Staging requires an Atlas SRV connection string.");
  }

  return { environment: CRM_ENV, dbName: databases[CRM_ENV], uri: MONGODB_URI };
}
