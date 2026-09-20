import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export class Sreon {
  constructor(executable) {
    this.process = spawn(executable, [], { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
    this.sequence = 0;
    this.pending = new Map();
    this.failure = null;
    createInterface({ input: this.process.stdout }).on("line", (line) => {
      let message;
      try { message = JSON.parse(line); } catch { this.fail(new Error("Invalid Sreon response")); return; }
      const callback = this.pending.get(message.id);
      if (!callback) { this.fail(new Error(message.error?.message || "Unexpected Sreon response")); return; }
      this.pending.delete(message.id);
      if (message.error) callback.reject(new Error(message.error.message));
      else callback.resolve(message.result);
    });
    this.process.on("error", (error) => this.fail(error));
    this.process.on("exit", () => this.fail(new Error("Sreon API stopped")));
    this.process.stdin.on("error", (error) => this.fail(error));
  }

  fail(error) {
    this.failure = error;
    for (const callback of this.pending.values()) callback.reject(error);
    this.pending.clear();
  }

  search(q, category = "web", cursor = null) {
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending.size >= 32) return Promise.reject(new Error("Wait for pending searches to finish"));
    const id = ++this.sequence;
    const line = JSON.stringify({ id, method: "search", params: { q, category, cursor } }) + "\n";
    if (Buffer.byteLength(line) > 16384) return Promise.reject(new Error("Request exceeds 16 KiB"));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(line);
    });
  }

  close() {
    this.process.stdin.end();
    this.process.kill();
  }
}
