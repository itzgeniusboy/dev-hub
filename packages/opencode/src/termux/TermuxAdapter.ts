export class TermuxAdapter {
  static get isTermux(): boolean {
    return Boolean(process.env.PREFIX && process.env.PREFIX.includes("com.termux"));
  }

  static get binPath(): string {
    return this.isTermux ? "/data/data/com.termux/files/usr/bin/" : "/usr/local/bin/";
  }

  static get homePath(): string {
    return this.isTermux ? "/data/data/com.termux/files/home/" : process.env.HOME || "/root/";
  }

  static get maxParallelJobs(): number {
    return this.isTermux ? 2 : 4; // Low CPU limit for Termux
  }

  static get packageManager(): string {
    return this.isTermux ? "pkg" : "apt";
  }

  static get pipArgs(): string[] {
    return this.isTermux ? ["--no-cache-dir"] : [];
  }
}
