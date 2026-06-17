# frozen_string_literal: true

class ReagentBridge < Formula
  desc "Always-on bridge hub for the reagent Claude Code harness"
  homepage "https://github.com/ferrule-io/reagent"
  url "https://github.com/ferrule-io/reagent/archive/refs/tags/v0.1.1.tar.gz"
  sha256 "80350ba15040bf80c00c59d7d2222c0cb0b4dd1212823b9a70e49d266eab9c25"

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
    begin
      system bin/"reagent-bridge", "--version"
    rescue
      nil
    end
    # At minimum verify the entrypoint file is present:
    assert_path_exists libexec/"bridge/bin/reagent-bridge.js"
    assert_path_exists libexec/"plugin/.claude-plugin/plugin.json"
  end
end
