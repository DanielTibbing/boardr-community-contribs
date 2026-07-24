import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'boardr',
  description: 'The digital boardgame table — build games for it',
  // served from the community repo's GitHub Pages
  base: '/boardr-community-contribs/',
  appearance: 'dark',
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/boardr-community-contribs/logo.svg' }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/manifest' },
      { text: 'Submit a game', link: 'https://github.com/DanielTibbing/boardr-community-contribs#submitting-a-game' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'The SDK', link: '/guide/sdk' },
            { text: 'Tutorial: Tap Race', link: '/guide/tutorial' },
            { text: 'Publishing your game', link: '/guide/publishing' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Game manifest', link: '/reference/manifest' },
            { text: 'CLI', link: '/reference/cli' },
            { text: 'Wire protocol', link: '/reference/protocol' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Game manifest', link: '/reference/manifest' },
            { text: 'CLI', link: '/reference/cli' },
            { text: 'Wire protocol', link: '/reference/protocol' },
          ],
        },
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'The SDK', link: '/guide/sdk' },
            { text: 'Tutorial: Tap Race', link: '/guide/tutorial' },
            { text: 'Publishing your game', link: '/guide/publishing' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/DanielTibbing/boardr' }],
    footer: {
      message: 'boardr — games on the table, hands on your phone.',
    },
    search: { provider: 'local' },
  },
})
