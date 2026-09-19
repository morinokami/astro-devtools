/** The theme a story-test browser instance renders in; unset when Storybook itself runs. */
interface ImportMetaEnv {
  readonly STORYBOOK_THEME?: "light" | "dark";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
