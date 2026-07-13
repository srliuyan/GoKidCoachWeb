# Deployment And Manual Test Instructions

Build:

- productVersion: `1.5.1`
- engineVersion: `candidate-coverage-v1`
- serviceWorkerCache: `gokidcoach-web-v151-stable-20260713`

Do not deploy automatically. Run these checks first:

```bash
node --check GoKidCoachWeb/*.js
for f in GoKidCoachWeb/test-*.js; do node "$f" || exit 1; done
python3 -m py_compile training/evaluate_policy.py
```

## Local HTTP Test From Kali

From the project root:

```bash
cd GoKidCoachWeb
python3 -m http.server 8080
```

Local desktop URL:

```text
http://127.0.0.1:8080/
```

Find the Kali LAN IP:

```bash
ip -4 addr show
```

Look for the Wi-Fi/Ethernet address such as `192.168.x.x` or `10.x.x.x`.

Open from an iPad on the same network:

```text
http://KALI_LAN_IP:8080/
```

Firewall notes:

- The iPad and Kali machine must be on the same network.
- Allow inbound TCP `8080` if a firewall is enabled.
- If the iPad cannot connect, test from another device first.

Do not use `file://` for PWA testing. Browser service workers, manifest behavior, module/cache behavior and IndexedDB edge cases differ or fail under `file://`.

Plain LAN HTTP limitations:

- Safari service workers generally require HTTPS or localhost. A plain LAN HTTP URL may not support full PWA/offline validation.
- Use LAN HTTP only for layout, gameplay, save/restore and SGF checks.

## HTTPS Options For Full PWA Testing

Preferred route: temporary GitHub Pages test URL from a release branch.

Alternative local HTTPS route without extra frameworks:

```bash
cd GoKidCoachWeb
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout /tmp/gokidcoach-key.pem \
  -out /tmp/gokidcoach-cert.pem \
  -days 7 \
  -subj "/CN=localhost"
python3 - <<'PY'
import http.server, ssl
server = http.server.ThreadingHTTPServer(("0.0.0.0", 8443), http.server.SimpleHTTPRequestHandler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain("/tmp/gokidcoach-cert.pem", "/tmp/gokidcoach-key.pem")
server.socket = ctx.wrap_socket(server.socket, server_side=True)
print("https://0.0.0.0:8443/")
server.serve_forever()
PY
```

iPad will show a certificate warning for this self-signed route. GitHub Pages is cleaner for final PWA/offline validation.

## Git Repository Setup If Needed

Current workspace may not be a Git repository. Verify first:

```bash
git rev-parse --show-toplevel
git status
```

If no repository exists, initialize only at the intended project root:

```bash
cd /path/to/WeiqiCoachProject
git init
cat > .gitignore <<'EOF'
__pycache__/
*.pyc
.DS_Store
node_modules/
EOF
git remote add origin GITHUB_REMOTE_URL
git remote -v
git checkout -b release/v1.2-rc1
git add GoKidCoachWeb training
git commit -m "Prepare GoKidCoach V1.2 rc1"
```

Do not push without explicit approval:

```bash
git push -u origin release/v1.2-rc1
```

## GitHub Pages

This repository uses `.github/workflows/deploy-pages.yml` to publish a runtime-only artifact from `main`.

The Pages artifact includes:

- `index.html`
- runtime JavaScript modules
- `build-info.js`
- `product-support.js`
- `sw.js`
- `manifest.webmanifest`
- `styles.css`
- `assets/`
- `404.html`
- `.nojekyll`

The Pages artifact intentionally excludes:

- `evaluation/`
- `release/*.json`
- `test-*.js`
- `training/`
- local backups

If GitHub Pages is still configured to `Deploy from a branch`, `_config.yml` applies the same exclusion policy as a fallback so tests, evaluation reports and release audit JSON are not published.

Recommended release branch before merging to `main`:

```bash
git checkout main
```

Pages settings:

- Source: GitHub Actions
- Workflow: `Deploy GitHub Pages`

Path checks:

- `index.html` uses relative asset paths.
- manifest path is `manifest.webmanifest`.
- service worker registration is `./sw.js`.
- manifest `start_url` is `./`.
- icons use relative `assets/...` URLs.
- service worker scope is repository subpath-safe.

Runtime rule:

- Cache runtime assets and `assets/*.json` only.
- Do not load or cache `evaluation/*.json`.
