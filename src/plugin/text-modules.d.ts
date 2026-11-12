/** Built text artifacts are imported as strings (esbuild text loader). */
declare module "*.txt" {
  const text: string;
  export default text;
}
