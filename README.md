# safe-pkgs-action

<p align="center">
  <strong>GitHub Action for safe-pkgs dependency auditing in CI.</strong><br />
  Downloads the safe-pkgs binary, audits your lockfile, and surfaces results as annotations + job summary.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Node%2024-green" alt="Node 24" />
  <img src="https://img.shields.io/badge/built%20with-bun-f9f1e1" alt="Bun" />
  <img src="https://img.shields.io/badge/linter-Biome-60a5fa" alt="Biome" />
</p>

## What It Does

Runs `safe-pkgs audit` against your project lockfile and:
- Creates GitHub annotations (errors/warnings) for denied packages
- Generates a job summary with audit results
- Sets action outputs for downstream steps
- Fails the workflow if any package meets the severity threshold

## Quick Start

```yaml
- uses: math280h/safe-pkgs-action@main
  with:
    path: '.'
    fail-on-severity: 'high'
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `path` | `.` | Path to lockfile or project directory |
| `registry` | _(auto-detect)_ | Registry override (`npm`, `cargo`, `pypi`) |
| `version` | `latest` | safe-pkgs release version to download |
| `fail-on-severity` | `high` | Fail threshold (`low`, `medium`, `high`, `critical`, `off`) |

## Outputs

| Output | Description |
|--------|-------------|
| `allow` | `"true"` or `"false"` — overall audit result |
| `risk` | Highest severity found |
| `total` | Total packages audited |
| `denied` | Number of denied packages |
| `json` | Raw JSON output from safe-pkgs |

## Auto-detection

When `registry` is not set, the action detects the registry from your lockfile:

| Lockfile | Registry |
|----------|----------|
| `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` | `npm` |
| `Cargo.lock` | `cargo` |
| `requirements.txt`, `poetry.lock`, `uv.lock`, `Pipfile.lock` | `pypi` |

If `path` is a directory, it scans for known lockfiles automatically.

## Examples

### Audit and fail on high-risk packages

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: math280h/safe-pkgs-action@main
    with:
      fail-on-severity: 'high'
```

### Audit a specific lockfile

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: math280h/safe-pkgs-action@main
    with:
      path: 'backend/requirements.txt'
      registry: 'pypi'
```

### Use outputs in downstream steps

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: math280h/safe-pkgs-action@main
    id: audit
    with:
      fail-on-severity: 'off'
  - run: echo "Denied ${{ steps.audit.outputs.denied }} of ${{ steps.audit.outputs.total }} packages"
```

### Pin a specific version

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: math280h/safe-pkgs-action@main
    with:
      version: '0.5.0'
      fail-on-severity: 'critical'
```

## Job Summary

The action writes a markdown summary to the GitHub Actions job summary:

- Overall status (pass/fail) with risk level
- Total and denied package counts
- Table of denied packages with name, version, risk, and reasons

## Development

```bash
bun install
bun test
bun run build
bunx biome check src tests
```

Type check:

```bash
bunx tsc --noEmit
```
