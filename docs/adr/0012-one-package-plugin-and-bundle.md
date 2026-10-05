# ADR-0012: jeROMy installs as one npm package that is both the dsh plugin and a dsh bundle

**Status:** Accepted
**Date:** 2026-10-05

## Context

Roadmap item 7 asks for an install that works from a clean machine:
`dsh plugin --profile jeromy add <spec>`. Until now the plugin only ran
from source, mounted by an absolute path in a dev overlay that
`scripts/dsh-dev.sh` regenerates, and that overlay has grown to carry the
whole composition: the model default, the sidebar browser, the session-log
switch, the coding-tool disables, the `jeromy` agent preset and the
permission default (ADR-0001, ADR-0011, roadmap item 11).

dsh's profile model (`@deepseek-ai/dsh-app-boot/profile`): a profile is a
directory with a `package.json` whose `dsh.profile.bundles` lists bundle
packages in order, plus the user's own `cordis.patch.yml`. A bundle is an
npm package whose manifest declares `dsh.bundle.patch` (one or more patch
files) and whose rows can mount plugins by package name. `dsh plugin
--profile <p> add <spec>` runs pnpm in the profile, checks the package's
`peerDependencies` on `@deepseek-ai/*` against the running dsh version
before installing (exact-version exemptions exist), and enables the bundle.
Local paths, git URLs and registry specs are all accepted.

Two facts shape the data layout. First, a package installed under
`node_modules` must not be written to: promoted mappings and the hack
directories (ADR-0009) need a user-owned home. Second, the plugin resolves
its own files (`mappings/`, `skills/`, `mesen/bridge.lua`, Capstone WASM)
relative to `import.meta.url`, and `dist/dsh/index.js` sits at the same
depth as `src/dsh/index.ts`, so the same relative paths work built and
unbuilt.

## Decision

1. **One package, `jeromy-dsh`, is both the plugin and the bundle.** Its
   `package.json` declares `dsh.bundle.patch: ["./cordis.patch.yml"]`;
   that root file mounts the plugin by package name and carries the whole
   composition that the dev overlay used to carry. The package exports
   `dist/dsh/index.js` as its main; `files` ships `dist/`,
   `cordis.patch.yml`, `mappings/*.json`, `skills/`, `mesen/bridge.lua` and
   the built Capstone artifacts. `peerDependencies` name the dsh packages
   the adapter imports, with ranges that admit the current pre-release.
2. **The root `cordis.patch.yml` is the single source of truth for the
   composition.** `scripts/dsh-dev.sh` derives its dev overlay from it by
   rewriting the plugin row's `name` to the source path; nothing else is
   duplicated.
3. **User state lives outside the package when installed.** When the
   package root is under a `node_modules` directory, the defaults become
   `$DSH_HOME/jeromy/mappings` (promotion target; the package's `mappings/`
   is a read-only seed consulted when the user copy has no file for the
   ROM) and `$DSH_HOME/jeromy/hacks`. In the repository the defaults stay
   `mappings/` and `hacks/`. Both remain overridable by plugin config.
4. **Setup help without a client plugin.** The plugin logs the Lua script
   path at startup, `/status` on the emulator view reports it, and the
   view's disconnected state tells the person what to load in Mesen, with
   the `\\wsl.localhost\...` form when running under WSL. A settings card
   in dsh's UI would need a browser-side plugin build and is deferred.
5. **The install is verified by `scripts/install-check.sh`:** a fresh
   profile from the web template, `dsh plugin --profile <p> add <repo>`,
   boot, view `/status` and a `/pick` without a model, one headless check,
   then the profile is removed.

## Consequences

- A person installs with two commands (create the profile from the web
  template, add the package) and gets the same composition the developer
  runs. Updating is `dsh plugin --profile jeromy add jeromy-dsh@<version>`
  or the git URL again.
- The dev loop is unchanged: `scripts/up.sh` still mounts source.
- The package carries Capstone artifacts that are gitignored in the
  repository; a publish or a local-path install needs `npm run build` and
  the WASM built first, which `install-check.sh` enforces.
- The compatibility check is strict about dsh versions: a dsh upgrade past
  the declared range refuses to load the plugin until the range (or an
  exemption) is updated. Preferable to silent breakage.
- Mappings promoted on an installed copy land in the user's home, not in the
  repository; contributing them back is a file copy, which the `promote`
  tool text says.

## Alternatives

- **Keep the dev overlay as the only composition and tell people to clone
  the repo.** No install story, and the composition would drift between
  overlay and bundle. Rejected.
- **Separate plugin and bundle packages.** Clean in theory; two versions to
  keep aligned for one project. Rejected until a second host or a second
  bundle exists.
- **A settings card for setup.** Needs the browser-side plugin pipeline;
  the view already has a page the person opens, so the help lives there.
  Deferred, not rejected.

## Revisit triggers

- dsh stabilises its plugin API (1.0) or changes the bundle manifest shape.
- A second console adapter or a second bundle (ADR-0007's frame channel as
  its own plugin, for instance).
- Mappings promoted by installed users become common enough that a share
  path (ADR-0009's exports) should be a tool, not a file copy.
