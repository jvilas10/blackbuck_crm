// Persistence schemas only. T13+ services must resolve references in the same
// tenant/client and retain the T09 authorization boundary before every operation.
const id = { bsonType: "string", minLength: 1, maxLength: 200 };
const date = { bsonType: "date" };
const nullableId = { anyOf: [id, { bsonType: "null" }] };
const nullableDate = { bsonType: ["date", "null"] };
const shortText = { bsonType: "string", maxLength: 200 };
const note = { bsonType: "string", maxLength: 4000 };
export const enquiryStages = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"];
export const intakeChannels = ["Website", "Meta", "Manual"];
const stage = { enum: enquiryStages };
function schema(required, properties) {
  return { bsonType: "object", additionalProperties: false,
    required: ["_id", "agencyId", "clientId", "createdAt", "updatedAt", ...required],
    properties: { _id: id, agencyId: id, clientId: id, createdAt: date, updatedAt: date,
      synthetic: { bsonType: "bool" }, ...properties } };
}
export const crmCollections = {
  contacts: schema(["name"], {
    name: id,
    emailNormalized: { bsonType: "string", minLength: 3, maxLength: 254, pattern: "^[^A-Z\\s@]+@[^A-Z\\s@]+\\.[^A-Z\\s@]+$" },
    phoneNormalized: { bsonType: "string", pattern: "^\\+[1-9][0-9]{6,14}$" },
  }),
  sources: schema(["name", "channel", "active", "defaultAssigneeId"], {
    name: id, channel: { enum: intakeChannels }, active: { bsonType: "bool" }, defaultAssigneeId: nullableId,
    // Provider form identity is scoped to channel/client; Meta Page ID is retained separately.
    externalKey: id, pageId: id,
  }),
  enquiries: {
    ...schema(["contactId", "sourceId", "intakeChannel", "submittedAt", "stage", "assignedTo", "nextActionAt", "firstContactAt", "firstQualifiedAt", "wonAt", "attribution"], {
      contactId: id, sourceId: id, intakeChannel: { enum: intakeChannels }, externalSubmissionId: id,
      submittedAt: date, stage, assignedTo: nullableId, nextActionAt: nullableDate,
      firstContactAt: nullableDate, firstQualifiedAt: nullableDate, wonAt: nullableDate,
      lastContactOutcome: shortText, lostReason: note,
      attribution: { bsonType: "object", additionalProperties: false, required: ["marketingSource", "campaign", "placement"], properties: {
        marketingSource: { anyOf: [shortText, { bsonType: "null" }] },
        campaign: { anyOf: [shortText, { bsonType: "null" }] },
        placement: { enum: ["Facebook", "Instagram", "Unknown", "Not applicable"] },
        campaignId: id, adId: id, landingPage: { bsonType: "string", maxLength: 2048 },
        utmSource: shortText, utmMedium: shortText, utmCampaign: shortText, utmContent: shortText, utmTerm: shortText,
      } },
      answers: { bsonType: "array", maxItems: 100, items: { bsonType: "object", additionalProperties: false,
        required: ["name", "value"], properties: { name: id, value: note } } },
    }),
    oneOf: [
      { properties: { intakeChannel: { enum: ["Website", "Meta"] } }, required: ["externalSubmissionId"] },
      { properties: { intakeChannel: { enum: ["Manual"] } }, not: { required: ["externalSubmissionId"] } },
    ],
  },
  activities: schema(["enquiryId", "actorId", "occurredAt", "type", "details"], {
    enquiryId: id, actorId: nullableId, occurredAt: date,
    type: { enum: ["created", "stage_changed", "assigned", "contact_attempt", "note", "follow_up_scheduled", "follow_up_rescheduled", "follow_up_completed", "follow_up_cancelled"] },
    details: { bsonType: "object", additionalProperties: false, properties: {
      previousStage: stage, stage, previousAssigneeId: nullableId, assigneeId: nullableId,
      outcome: shortText, channel: { enum: ["Call", "Message", "Other"] }, note,
      followUpId: id, previousDueAt: date, dueAt: date,
    } },
  }),
  follow_ups: {
    ...schema(["enquiryId", "assignedTo", "createdBy", "dueAt", "status", "completedAt", "cancelledAt"], {
      enquiryId: id, assignedTo: nullableId, createdBy: id, dueAt: date,
      status: { enum: ["pending", "completed", "cancelled"] }, completedAt: nullableDate, cancelledAt: nullableDate,
      note, outcome: shortText,
    }),
    oneOf: [
      { properties: { status: { enum: ["pending"] }, completedAt: { bsonType: "null" }, cancelledAt: { bsonType: "null" } } },
      { properties: { status: { enum: ["completed"] }, completedAt: date, cancelledAt: { bsonType: "null" } } },
      { properties: { status: { enum: ["cancelled"] }, completedAt: { bsonType: "null" }, cancelledAt: date } },
    ],
  },
};
export const crmIndexes = {
  contacts: [
    { name: "contacts_by_client", key: { agencyId: 1, clientId: 1, _id: 1 } },
    { name: "contact_email_match", key: { agencyId: 1, clientId: 1, emailNormalized: 1 }, partialFilterExpression: { emailNormalized: { $type: "string" } } },
    { name: "contact_phone_match", key: { agencyId: 1, clientId: 1, phoneNormalized: 1 }, partialFilterExpression: { phoneNormalized: { $type: "string" } } },
  ],
  sources: [
    { name: "sources_by_client", key: { agencyId: 1, clientId: 1, active: 1 } },
    { name: "source_external_identity", key: { agencyId: 1, clientId: 1, channel: 1, externalKey: 1 }, unique: true, partialFilterExpression: { externalKey: { $type: "string" } } },
  ],
  enquiries: [
    { name: "unique_external_submission", key: { agencyId: 1, clientId: 1, sourceId: 1, externalSubmissionId: 1 }, unique: true, partialFilterExpression: { externalSubmissionId: { $type: "string" } } },
    { name: "enquiries_by_contact", key: { agencyId: 1, clientId: 1, contactId: 1, submittedAt: -1 } },
    { name: "enquiries_by_assignee_due", key: { agencyId: 1, clientId: 1, assignedTo: 1, nextActionAt: 1 } },
    { name: "enquiries_by_stage", key: { agencyId: 1, clientId: 1, stage: 1, submittedAt: -1 } },
    { name: "enquiries_by_submission", key: { agencyId: 1, clientId: 1, submittedAt: -1 } },
  ],
  activities: [{ name: "enquiry_activity_history", key: { agencyId: 1, clientId: 1, enquiryId: 1, occurredAt: 1, _id: 1 } }],
  follow_ups: [
    { name: "followups_by_assignee_due", key: { agencyId: 1, clientId: 1, assignedTo: 1, status: 1, dueAt: 1 } },
    { name: "followups_by_enquiry", key: { agencyId: 1, clientId: 1, enquiryId: 1, dueAt: -1 } },
  ],
};
