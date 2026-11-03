// La file des rendus : un fil de calcul à part, un GIF à la fois, une limite de temps. Si le
// fil se bloque ou tombe, il est remplacé, et le bot n'en sait rien.
import { Worker } from "node:worker_threads";

export class RenderQueue {
  constructor({ timeout = 60_000, maxPending = 6 } = {}) {
    this.timeout = timeout;
    this.maxPending = maxPending;
    this.jobs = [];
    this.current = null;
    this.worker = null;
    this.nextId = 1;
  }

  get pending() {
    return this.jobs.length + (this.current ? 1 : 0);
  }

  /** Rend une scène ; rejette si la file est pleine ou si le rendu dépasse le délai. */
  render(scene, data, buffers) {
    if (this.pending >= this.maxPending) return Promise.reject(new Error("FILE_PLEINE"));
    return new Promise((resolve, reject) => {
      this.jobs.push({ id: this.nextId++, scene, data, buffers, resolve, reject });
      this.pump();
    });
  }

  spawn() {
    const worker = new Worker(new URL("./worker.js", import.meta.url));
    worker.on("message", (message) => {
      const job = this.current;
      if (!job || message.id !== job.id) return;
      clearTimeout(job.timer);
      this.current = null;
      if (message.error) job.reject(new Error(message.error));
      else job.resolve({ gif: Buffer.from(message.gif), stats: message.stats });
      this.pump();
    });
    worker.on("error", (error) => this.fail(worker, error));
    worker.on("exit", (code) => {
      if (code !== 0) this.fail(worker, new Error(`Fil de rendu arrêté (${code})`));
    });
    return worker;
  }

  fail(worker, error) {
    if (this.worker !== worker) return;
    this.worker = null;
    const job = this.current;
    this.current = null;
    if (job) {
      clearTimeout(job.timer);
      job.reject(error);
    }
    this.pump();
  }

  pump() {
    if (this.current || !this.jobs.length) return;
    this.worker ??= this.spawn();
    const job = this.jobs.shift();
    this.current = job;
    job.timer = setTimeout(() => {
      const worker = this.worker;
      this.fail(worker, new Error("RENDU_TROP_LONG"));
      worker?.terminate();
    }, this.timeout);
    this.worker.postMessage({ id: job.id, scene: job.scene, data: job.data, buffers: job.buffers });
  }

  async close() {
    await this.worker?.terminate();
    this.worker = null;
  }
}
