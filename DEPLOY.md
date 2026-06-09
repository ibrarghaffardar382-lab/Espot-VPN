# Espot VPN — Deploy Guide

## One-time GitHub setup (do this ONCE)

1. Go to: https://github.com/ibrarghaffardar382-lab/Espot-VPN
2. Click **Releases → Create a new release**
3. Set tag: `v1.0`
4. Drag and drop `espot-vpn-source-fixed.zip` into the assets box
5. Click **Publish release**
6. Also upload `bootstrap.sh` and `install.sh` to the **repo root** (main branch)

---

## On your VPS — single command

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ibrarghaffardar382-lab/Espot-VPN/main/bootstrap.sh)
```

This automatically:
- Downloads the zip from your GitHub release
- Extracts the source code
- Asks for all settings (DB URL, admin credentials, gateway host…)
- Runs npm install
- Applies the database schema
- Prints a full summary of everything

---

## Edit config later

```bash
bash ~/espot-vpn/install.sh edit
```

---

## Start the server

```bash
bash ~/espot-vpn/start.sh
```

Or directly:

```bash
cd ~/espot-vpn/espot-vpn-backend && npm start
```

---

## Files after install

```
~/espot-vpn/
├── install.sh                 ← run with 'edit' to change config
├── start.sh                   ← start the server
├── espot-vpn-backend/
│   ├── .env                   ← all your secrets (chmod 600)
│   └── ...
└── espot-vpn-extension/
    └── ...                    ← load this in Chrome
```
