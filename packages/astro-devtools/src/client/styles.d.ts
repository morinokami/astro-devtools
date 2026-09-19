/** CSS imports are compiled to strings by the package build plugin. */
declare module "*.css" {
  const css: string;
  export default css;
}
