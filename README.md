# OSCAL Docs

A static documentation site for the [OSCAL](https://pages.nist.gov/OSCAL/) (Open Security Controls Assessment Language) data models, generated directly from the official [NIST OSCAL Metaschema](https://github.com/usnistgov/OSCAL) sources.

Live site: <https://pkothare.github.io/oscal-docs/>

## What it does

- Fetches the OSCAL Metaschema XML for every released OSCAL version at build time.
- Parses assemblies, fields, flags, and constraints, including inline `define-assembly`/`define-field` definitions.
- Renders a browsable reference for each model (catalog, profile, component-definition, SSP, AP, AR, POA&M) in both **JSON** and **XML** form.
- Provides a collapsible top-level format outline plus per-definition cards with linked properties, attributes, constraints, and remarks.

Everything is generated &mdash; there are no hand-authored content pages.

## Project structure

```
src/
├── layouts/BaseLayout.astro      # Header, footer, sidebar shell, global CSS import
├── lib/metaschema.ts             # Version discovery, XML fetch + parse
├── components/                   # Reusable rendering pieces (outlines, tables, sections)
├── pages/
│   ├── index.astro               # Redirect to latest catalog JSON
│   └── [version]/[model]/{json,xml}/index.astro
└── styles/                       # Modular CSS (global.css aggregates the rest)
public/                           # Logo + generated favicons
```

## Local development

Requires Node.js &ge; 22.12.

```sh
npm install
npm run dev      # http://localhost:4321/oscal-docs/
npm run build    # static output in ./dist
npm run preview
```

The build fetches metaschema sources from GitHub, so an internet connection is required.

## Deployment

Pushes to `main` trigger the GitHub Actions workflow in [`.github/workflows/`](.github/workflows/), which builds the site and publishes `dist/` to GitHub Pages.

## License

The site code is provided as-is. OSCAL itself is a NIST project; consult the [upstream repository](https://github.com/usnistgov/OSCAL) for OSCAL licensing.

# OSCAL Docs

A static documentation site for the [OSCAL](https://pages.nist.gov/OSCAL/) (Open Security Controls Assessment Language) data models, generated directly from the official [NIST OSCAL Metaschema](https://github.com/usnistgov/OSCAL) sources.

Live site: <https://pkothare.github.io/oscal-docs/>

## What it does

- Fetches the OSCAL Metaschema XML for every released OSCAL version at build time.
- Parses assemblies, fields, flags, and constraints, including inline `define-assembly`/`define-field` definitions.
- Renders a browsable reference for each model (catalog, profile, component-definition, SSP, AP, AR, POA&M) in both **JSON** and **XML** form.
- Provides a collapsible top-level format outline plus per-definition cards with linked properties, attributes, constraints, and remarks.

Everything is generated &mdash; there are no hand-authored Markdown content pages.

## Tech stack

- [Astro](https://astro.build/) v6 (static SSG, `output: 'static'`)
- [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser) with a custom DOCTYPE entity resolver
- Modular CSS under [`src/styles/`](src/styles/) (tokens, base, layout, sidebar, cards, definitions, outline)
- Deployed via GitHub Actions ([`withastro/action`](https://github.com/withastro/action)) to GitHub Pages

## Project structure

```
src/
├── layouts/BaseLayout.astro      # Header, footer, sidebar shell, global CSS import
├── lib/metaschema.ts             # Version discovery, XML fetch + parse
├── components/                   # Reusable rendering pieces (outlines, tables, sections)
├── pages/
│   ├── index.astro               # Redirect to latest catalog JSON
│   └── [version]/[model]/{json,xml}/index.astro
└── styles/                       # Modular CSS (global.css aggregates the rest)
public/                           # Logo + generated favicons
```

## Local development

Requires Node.js &ge; 22.12.

```sh
npm install
npm run dev      # http://localhost:4321/oscal-docs/
npm run build    # static output in ./dist
npm run preview
```

The build fetches metaschema sources from GitHub, so an internet connection is required on first build.

## Deployment

Pushes to `main` trigger the GitHub Actions workflow in [`.github/workflows/`](.github/workflows/), which builds the site and publishes `dist/` to GitHub Pages.

## License

The site code is provided as-is. OSCAL itself is a NIST project; consult the [upstream repository](https://github.com/usnistgov/OSCAL) for OSCAL licensing.

# Astro Starter Kit: Minimal

```sh
npm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
