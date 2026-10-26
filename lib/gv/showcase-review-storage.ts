export type ShowcaseDecision = {
  factCheck: string;
  decision: string;
  rationale: string;
  savedAt: string;
};

export type ShowcaseAttachment = {
  id: string;
  taskId: string;
  point: number;
  name: string;
  size: number;
  addedAt: string;
  file: File;
};

const databaseName = "certiscope-project-review";
const storeName = "attachments";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(storeName, { keyPath: "id" });
      store.createIndex("taskId", "taskId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listShowcaseAttachments(taskId: string): Promise<ShowcaseAttachment[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).index("taskId").getAll(taskId);
    request.onsuccess = () => { db.close(); resolve(request.result as ShowcaseAttachment[]); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function saveShowcaseAttachment(attachment: ShowcaseAttachment): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(attachment);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

export async function deleteShowcaseAttachment(id: string): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

export function showcaseDecisionKey(taskId: string) {
  return `certiscope-review-${taskId}`;
}
