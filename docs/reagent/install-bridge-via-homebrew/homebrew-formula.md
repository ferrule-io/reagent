# Unit: homebrew-formula

## Goal

Create a Homebrew formula `Formula/reagent-bridge.rb` that lets users install the bridge with `brew install ferrule-io/reagent/reagent-bridge`. The formula builds from the tagged GitHub source tarball, installs the compiled bridge + plugin assets into `libexec`, installs a wrapper shell script into `bin`, and includes a `service do ... end` block for `brew services start reagent-bridge` (launchd always-on at port 4319).

## Scope

- `Formula/reagent-bridge.rb` (new file)

No other files may be touched in this unit.

## Approach

### 1. Formula skeleton

Create `Formula/reagent-bridge.rb` as a standard Homebrew formula. The file lives at the repo root under `Formula/` — this is the conventional path for a Homebrew tap hosted in a non-dedicated repo (users run `brew tap ferrule-io/reagent https://github.com/ferrule-io/reagent`; Homebrew looks for `Formula/*.rb` in the tapped repo).

```ruby
class ReagentBridge < Formula
  desc "Always-on bridge hub for the reagent Claude Code harness"
  homepage "https://github.com/ferrule-io/reagent"
  url "https://github.com/ferrule-io/reagent/archive/refs/tags/v0.1.1.tar.gz"
  sha256 "<sha256 of v0.1.1 tarball>"
  license "MIT"         # or the actual license — check root LICENSE file

  depends_on "node"

  # Plugin asset directories/files that must be co-installed with the bridge.
  PLUGIN_ASSETS = %w[.claude-plugin skills agents commands .mcp.json].freeze

  def install
    # ── 1. Build the bridge ──────────────────────────────────────────────────
    Dir.chdir("bridge") do
      system "npm", "ci"
      system "npm", "run", "build"
      system "npm", "prune", "--omit=dev"
    end

    # ── 2. Install bridge artifacts into libexec/bridge ──────────────────────
    (libexec/"bridge").mkpath
    (libexec/"bridge/dist").install Dir["bridge/dist/*"]
    (libexec/"bridge/node_modules").mkpath
    cp_r "bridge/node_modules/.", libexec/"bridge/node_modules"
    # Copy the bin shim so the wrapper can invoke it:
    (libexec/"bridge/bin").install "bridge/bin/reagent-bridge.js"
    # Copy package.json so Node can resolve the package type:
    (libexec/"bridge").install "bridge/package.json"

    # ── 3. Install plugin assets into libexec/plugin ─────────────────────────
    plugin_dest = libexec/"plugin"
    plugin_dest.mkpath
    PLUGIN_ASSETS.each do |asset|
      src = Pathname.new(asset)
      if src.directory?
        # cp_r copies the directory tree into the destination directory.
        cp_r src, plugin_dest
      elsif src.file?
        # cp copies a single file into the destination directory.
        cp src, plugin_dest
      end
    end

    # ── 4. Install wrapper script into bin ────────────────────────────────────
    # The wrapper sets REAGENT_PLUGIN_DIR so the bridge finds its assets.
    (bin/"reagent-bridge").write <<~SH
      #!/bin/bash
      export REAGENT_PLUGIN_DIR="#{libexec}/plugin"
      exec node "#{libexec}/bridge/bin/reagent-bridge.js" "$@"
    SH
    chmod 0755, bin/"reagent-bridge"
  end

  service do
    run [opt_bin/"reagent-bridge"]
    keep_alive true
    log_path var/"log/reagent-bridge.log"
    error_log_path var/"log/reagent-bridge.log"
    environment_variables REAGENT_PLUGIN_DIR: "#{opt_libexec}/plugin"
  end

  test do
    # Smoke-test: the binary exists and Node can parse it.
    system bin/"reagent-bridge", "--version" rescue nil
    # At minimum verify the entrypoint file is present:
    assert_predicate libexec/"bridge/bin/reagent-bridge.js", :exist?
    assert_predicate libexec/"plugin/.claude-plugin/plugin.json", :exist?
  end
end
```

### 2. Install block idioms — valid Homebrew copy methods

Homebrew's `install` block exposes these copy methods from `FileUtils` and Homebrew's `Pathname` extensions:

- **`cp src, dest`** — copies a single file `src` into directory `dest` (or to the path `dest` if it is a file path). This is the correct method for individual files such as `.mcp.json`.
- **`cp_r src, dest`** — recursively copies a directory `src` into `dest`. After `cp_r ".claude-plugin", plugin_dest` the result is `plugin_dest/.claude-plugin/...`.
- **`(dest_path).install sources`** — an `Array#install`-like Homebrew extension on Pathname; installs files/dirs from `sources` into `dest_path`. Can also be used as `(plugin_dest/".mcp.json").write File.read(".mcp.json")` for explicit single-file install.

**Do NOT use `install_p`** — this method is available only on `etc`/`pkgetc` Pathname objects via the `InstallRenamed` module and raises `NoMethodError` when called bare inside an `install` block.

The loop in the `install` block above uses `cp` for files and `cp_r` for directories — both are always available in any Homebrew formula `install` block.

### 3. SHA-256 placeholder

At authoring time the formula executor should:
1. Download the tarball: `curl -L https://github.com/ferrule-io/reagent/archive/refs/tags/v0.1.1.tar.gz -o /tmp/reagent-v0.1.1.tar.gz`
2. Compute: `sha256sum /tmp/reagent-v0.1.1.tar.gz` (or `shasum -a 256` on macOS)
3. Fill in the actual hex digest in the `sha256` line.

### 4. License

Check whether a `LICENSE` file exists at the repo root. If it does, set `license` to the SPDX identifier. If not, omit the `license` line.

### 5. Verify with brew

After writing the formula:
```sh
brew audit --strict Formula/reagent-bridge.rb
brew style Formula/reagent-bridge.rb
```

`brew audit --strict` will likely warn about the absence of a bottle block — this is expected for a source-build tap formula and can be suppressed with `bottle :unneeded` if brew complains.

### 6. Key implementation notes

- The `cp_r` call for `node_modules` may be slow but is necessary — `npm prune --omit=dev` has already trimmed it.
- `libexec` is the Homebrew-idiomatic location for private runtime files not exposed in PATH.
- The `service do` block requires Homebrew 3.4+ (launchd on macOS; systemd on Linux). The `keep_alive true` directive ensures launchd restarts the bridge after crashes.
- The `environment_variables` in `service do` must use `opt_libexec` (a method, returns a Pathname), not `libexec` (only valid in `install`).
- Port 4319 is hardcoded in the bridge's default config; no additional environment variable is needed to set it.
- The sha256 sed pattern `[a-f0-9]*` used in `scripts/update-formula-version.sh` (a later unit) is safe because `release-flow-wiring` depends on `homebrew-formula`, which ships a real digest — the pattern will always match a valid hex string.

## Acceptance criteria

- `Formula/reagent-bridge.rb` exists at the repo root.
- The formula class is named `ReagentBridge` (Homebrew derives it from the filename `reagent-bridge.rb`).
- `brew style Formula/reagent-bridge.rb` exits 0 with no offenses.
- `brew audit --strict Formula/reagent-bridge.rb` exits 0 (or exits non-zero only for expected bottle-related warnings that are acceptable for a tap formula).
- The formula includes `depends_on "node"`.
- The formula includes a `service do ... end` block with `keep_alive true`.
- The `sha256` value in the formula is the actual hex digest of the v0.1.1 tarball (not a placeholder string).
- The wrapper script installed at `bin/reagent-bridge` sets `REAGENT_PLUGIN_DIR` to the `libexec/plugin` path.
- The `install` block uses only valid Homebrew copy idioms (`cp`, `cp_r`, `(dest).install`) — `install_p` is NOT used anywhere.
- No files outside `Formula/` are modified by this unit.
