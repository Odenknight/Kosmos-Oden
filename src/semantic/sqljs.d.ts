/** sql.js ships no types for its browser build; only the part used here is declared. */
declare module "sql.js/dist/sql-wasm-browser.js" {
  const initSqlJs: (config?: { wasmBinary?: ArrayBuffer | Uint8Array; locateFile?: (file: string) => string }) => Promise<unknown>;
  export default initSqlJs;
}
