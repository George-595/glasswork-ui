/* The WAVs are imported with Vite's `?no-inline`, which gives the hashed URL of an emitted file
   and never a base64 string (the small ones would otherwise be inlined into the JavaScript).
   The kit's tsconfig does not load `vite/client`, so the shape is declared here. */
declare module '*.wav?no-inline' {
  const url: string;
  export default url;
}
