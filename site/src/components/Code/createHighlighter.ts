import { getSingletonHighlighter } from 'shiki';
import gruvboxDarkHard from 'shiki/themes/gruvbox-dark-hard.mjs';
import gruvboxDarkSoft from 'shiki/themes/gruvbox-dark-soft.mjs';

export default function createHighlighter(config: Omit<Parameters<typeof getSingletonHighlighter>[0], 'themes'>) {
  return getSingletonHighlighter({
    ...config,
    themes: [gruvboxDarkHard, gruvboxDarkSoft],
  });
}
