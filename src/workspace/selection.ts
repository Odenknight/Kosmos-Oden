/** UI ordering only. This class does not authorize content or cancel host I/O. */
export class WorkspaceSelection {
  private revision = 0;
  private controller: AbortController | null = null;
  private closed = false;

  get version(): number { return this.revision; }

  invalidate(): void {
    this.revision++;
    this.controller?.abort();
    this.controller = null;
  }

  close(): void {
    this.closed = true;
    this.invalidate();
  }

  /** Host preparation owns policy checks and bounded physical work. A prepared
   * preview is disposable: stale renders must release their host components.
   * publish must recheck current authority before applying the preview, without
   * an intervening await; stillSelected checks UI ordering at that same point.
   */
  async select<T>(
    prepare: (signal: AbortSignal) => Promise<T>,
    publish: (value: T, stillSelected: () => boolean) => Promise<boolean>,
    discard: (value: T) => void,
  ): Promise<boolean> {
    if (this.closed) return false;
    this.invalidate();
    const revision = this.revision;
    const controller = new AbortController();
    this.controller = controller;
    const current = () => !this.closed && this.revision === revision && !controller.signal.aborted;
    let value: T;
    try { value = await prepare(controller.signal); }
    catch (error) { if (!current()) return false; throw error; }
    let published = false;
    try {
      if (current()) published = await publish(value, current);
      return published;
    } catch (error) {
      if (current()) throw error;
      return false;
    } finally {
      if (!published) discard(value);
      if (this.controller === controller) this.controller = null;
    }
  }
}
