# Datacom Inventory Local Server Setup

Run this system on one dedicated office PC. Other users access it from their own computers through a browser.

## Start the Server

On the dedicated PC:

1. Open this project folder.
2. Double-click `start-local-server.bat`.
3. Keep the server window open while the system is in use.

The app runs on port `3000`.

## User Access URL

Other users should open:

```text
http://SERVER_IP:3000
```

Example:

```text
http://192.168.1.15:3000
```

Create desktop shortcuts on user PCs that point to this URL.

## Important Notes

- Do not open the app as a local file.
- Do not use `localhost` on user PCs. `localhost` means that user's own computer.
- The dedicated PC must stay powered on and connected to the office network.
- Windows Firewall must allow Node.js or inbound TCP port `3000`.
- Login and role permissions remain controlled inside the web app.
