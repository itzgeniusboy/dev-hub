<div align="center">
<pre>
       ◇      ◇      ◇
       │      │      │
   ╭──────┬──────┬──────╮
   │ PLAN │ BUILD│ CHECK│
   ╰──────┴──────┴──────╯
        ◉  POWER CORE
     NEXUS AGNET ...The Ultimate Powerhouse for Android Automation!
</pre>
</div>
<p align="center">
  <a href="https://github.com/itzgeniusboy/nexus/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/nexus-ai"><img alt="npm" src="https://img.shields.io/npm/v/nexus-ai?style=flat-square" /></a>
  <a href="https://github.com/itzgeniusboy/nexus/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/itzgeniusboy/nexus/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![NEXUS Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://github.com/itzgeniusboy/nexus)

---

### Installation

```bash
# YOLO
curl -fsSL https://github.com/itzgeniusboy/nexus/releases | bash

# Package managers
npm i -g nexus-ai@latest        # or bun/pnpm/yarn
scoop install nexus             # Windows
choco install nexus             # Windows
brew install itzgeniusboy/nexus # macOS and Linux (recommended, always up to date)
brew install nexus              # macOS and Linux (official brew formula, updated less)
sudo pacman -S nexus            # Arch Linux (Stable)
paru -S nexus-bin               # Arch Linux (Latest from AUR)
mise use -g nexus               # Any OS
nix run nixpkgs#nexus           # or github:itzgeniusboy/nexus for latest dev branch
```

> [!TIP]
> Remove versions older than 0.1.x before installing.

### Desktop App (BETA)

NEXUS is also available as a desktop application. Download directly from the [releases page](https://github.com/itzgeniusboy/nexus/releases) or [nexus/download](https://github.com/itzgeniusboy/nexus/releases).

| Platform              | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `nexus-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `nexus-desktop-mac-x64.dmg`     |
| Windows               | `nexus-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm`, or `.AppImage`     |

```bash
# macOS (Homebrew)
brew install --cask nexus-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/nexus-desktop
```

#### Installation Directory

The install script respects the following priority order for the installation path:

1. `$NEXUS_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/bin` - Standard user binary directory (if it exists or can be created)
4. `$HOME/.nexus/bin` - Default fallback

```bash
# Examples
NEXUS_INSTALL_DIR=/usr/local/bin curl -fsSL https://github.com/itzgeniusboy/nexus/releases | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://github.com/itzgeniusboy/nexus/releases | bash
```

### Agents

NEXUS includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://github.com/itzgeniusboy/nexus#readme/agents).

### Documentation

For more info on how to configure NEXUS, [**head over to our docs**](https://github.com/itzgeniusboy/nexus#readme).

### Contributing

If you're interested in contributing to NEXUS, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

### Building on NEXUS

If you are working on a project that's related to NEXUS and is using "nexus" as part of its name, for example "nexus-dashboard" or "nexus-mobile", please add a note to your README to clarify that it is not built by the NEXUS team and is not affiliated with us in any way.

---

**Join our community** [Discord](https://github.com/itzgeniusboy/nexus) | [X.com](https://github.com/itzgeniusboy/nexus)
