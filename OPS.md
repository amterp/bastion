# Operations

## Dev script

A [Rad](https://github.com/amterp/rad) script (`dev`) provides common
development commands:

```sh
rad dev build      # Build to dist/
rad dev test       # Run vitest
rad dev check      # TypeScript type check
rad dev zip        # Build + zip to build/bastion.zip
rad dev release <version>  # Full release pipeline
```

## Releasing to Chrome Web Store

Releases are currently done locally via the dev script. This could move
to GitHub Actions in the future (triggered by tag push), using the same
CWS API credentials stored as repository secrets.

The `rad dev release` command automates the full release pipeline:

1. Validates that the working directory is clean
2. Bumps the version in `manifest.json` and `package.json`
3. Runs type checking, tests, and build
4. Creates `build/bastion.zip`
5. Shows a summary and asks for confirmation
6. Uploads the zip to the Chrome Web Store via the API
7. Publishes the new version
8. Commits the version bump, creates a git tag, and pushes

```sh
rad dev release 1.1.0
```

If you decline at the confirmation step, the version bump is reverted
and nothing is uploaded.

### Required credentials

The release command needs four environment variables set in your shell:

| Variable | Description |
|---|---|
| `CWS_CLIENT_ID` | Google Cloud OAuth client ID |
| `CWS_CLIENT_SECRET` | Google Cloud OAuth client secret |
| `CWS_REFRESH_TOKEN` | OAuth refresh token with `chromewebstore` scope |
| `CWS_EXTENSION_ID` | 32-character Chrome Web Store item ID |

How you provide these is up to you - a secrets file sourced by your
shell, a password manager CLI, `direnv`, etc. They just need to be in
the environment when you run the release command.

### One-time credential setup

If these credentials don't exist yet (new machine, new maintainer):

1. **Google Cloud project** - Create a project at
   [console.cloud.google.com](https://console.cloud.google.com) and
   enable the **Chrome Web Store API**.

2. **OAuth client** - Under APIs & Services > Credentials, create an
   OAuth client ID with type **Web application**. Add
   `https://example.com` as an authorized redirect URI. Note the
   client ID and client secret.

3. **Refresh token** - Visit this URL (substituting your client ID):
   ```
   https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=https://example.com&access_type=offline&prompt=consent
   ```
   Authorize, then copy the `code` parameter from the redirect URL.
   Exchange it for a refresh token:
   ```sh
   curl -s -X POST https://oauth2.googleapis.com/token \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "code=THE_CODE" \
     -d "grant_type=authorization_code" \
     -d "redirect_uri=https://example.com"
   ```
   The response contains `refresh_token`.

4. **Extension ID** - Found in the Chrome Web Store Developer Dashboard
   URL for the item, or on the item's detail page. It's the
   32-character lowercase string (e.g. `abcdefghijklmnopqrstuvwxyzabcdef`).
