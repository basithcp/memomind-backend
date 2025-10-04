import Chat from '../../models/chatHistoryModel.js';


export async function isExisting(userId, itemId, task) {
  const existing = await Chat.findOne({ userId, itemId, task }).lean().exec();
  if(existing) return {value : true};
  return {value : false};
}
export async function createChat(userId, itemId, task) {
  if (!userId || !itemId || !task) throw new Error("userId, itemId and task required");
  const existing = await isExisting(userId, itemId, task);
  if(existing.value) return existing;
  const doc = await Chat.create({
    userId,
    itemId,
    task,
    prev: [],
  });
  return doc.toObject();
}



export async function addPrevEntry(
  userId,
  itemId,
  task,
  role,
  content,
  maxPrev = 200
) {
  if (!userId || !itemId || !task || !role || typeof content !== "string")
    throw new Error("userId,itemId,task,role and content are required");

  const entry = { role, content, createdAt: new Date() };

  const updated = await Chat.findOneAndUpdate(
    { userId, itemId, task },
    {
      $setOnInsert: { userId, itemId, task },
      $push: { prev: { $each: [entry], $slice: -Math.abs(maxPrev) } }
    },
    { upsert: true, new: true }
  ).lean();

  return updated;
}

export async function getChat(userId, itemId, task, sortPrev = true, limitPrev = null) {
  if (!userId || !itemId || !task) throw new Error("userId, itemId and task required");

  const doc = await Chat.findOne({ userId, itemId, task }).lean();
  if (!doc) return null;

  if (Array.isArray(doc.prev) && doc.prev.length > 0 && sortPrev) {
    const hasCreatedAt = doc.prev.every(e => e && (e.createdAt || e.createdAt === 0));
    if (hasCreatedAt) {
      doc.prev.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }
    if (Number.isInteger(limitPrev) && limitPrev > 0) {
      doc.prev = doc.prev.slice(-limitPrev);
    }
  }

  return doc;
}


