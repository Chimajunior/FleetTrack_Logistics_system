import { Queue } from "bullmq";
import IORedis from "ioredis";

type DispatchJob = {
  orderId: string;
  driverId: string;
};

let queue: Queue<DispatchJob> | undefined;

export function getDispatchQueue() {
  if (queue || !process.env.REDIS_URL) return queue;

  // BullMQ requires Redis; the API falls back to in-memory mode when Redis is unavailable.
  const connection = new IORedis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null
  });

  queue = new Queue<DispatchJob>("delivery-dispatch", { connection });
  return queue;
}

export async function enqueueDispatch(job: DispatchJob) {
  const dispatchQueue = getDispatchQueue();
  if (!dispatchQueue) {
    return {
      queued: false,
      mode: "memory",
      job
    };
  }

  try {
    const queuedJob = await dispatchQueue.add("assign-driver", job, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: 50,
      removeOnFail: 100
    });

    return {
      queued: true,
      mode: "bullmq",
      jobId: queuedJob.id
    };
  } catch {
    return {
      queued: false,
      mode: "memory",
      job
    };
  }
}
