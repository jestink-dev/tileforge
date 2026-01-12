# Releasing TileForge

This guide covers how to publish new versions of TileForge to npm using GitHub Actions.

## How Releases Work

When you create a **GitHub Release**, the package is automatically published to npm via GitHub Actions. You don't need to run `npm publish` manually.

```
Create GitHub Release → GitHub Actions runs → Package published to npm
```

---

## Creating a New Release

### Step 1: Update the Version

Before creating a release, update the version in `package.json`:

```bash
# For bug fixes (1.0.0 → 1.0.1)
npm version patch

# For new features (1.0.0 → 1.1.0)
npm version minor

# For breaking changes (1.0.0 → 2.0.0)
npm version major
```

This command:
- Updates `package.json` version
- Creates a git commit
- Creates a git tag (e.g., `v1.0.1`)

### Step 2: Push Changes and Tags

```bash
git push && git push --tags
```

### Step 3: Create GitHub Release

1. Go to **https://github.com/jestink-dev/tileforge/releases**
2. Click **"Draft a new release"**
3. Click **"Choose a tag"** → Select the tag you just pushed (e.g., `v1.0.1`)
4. **Release title**: `v1.0.1` (or whatever version)
5. **Description**: Write what changed (see template below)
6. Click **"Publish release"**

### Step 4: Verify Publication

1. Check the **Actions** tab to see the workflow running
2. Once complete, verify on npm: https://www.npmjs.com/package/tileforge

---

## Release Description Template

```markdown
## What's Changed

### New Features
- Added support for XYZ

### Bug Fixes
- Fixed issue with ABC

### Other Changes
- Updated dependencies

**Full Changelog**: https://github.com/jestink-dev/tileforge/compare/v1.0.0...v1.0.1
```

---

## Quick Release Checklist

- [ ] Update version: `npm version patch|minor|major`
- [ ] Push changes: `git push && git push --tags`
- [ ] Create release on GitHub
- [ ] Verify on npm after Actions completes

---

## Managing the npm Token

The GitHub Action uses an npm token (stored as `NPM_TOKEN` secret) to publish packages. This token may expire and need renewal.

### When to Renew

- If you set a 30/60/90 day expiration, renew before it expires
- If a release fails with "401 Unauthorized", the token has likely expired
- npm will email you before the token expires

### How to Create a New npm Token

1. Go to **https://www.npmjs.com** → Log in
2. Click your profile icon → **Access Tokens**
3. Click **"Generate New Token"** → **"Granular Access Token"**
4. Fill in the form:

| Field | Value |
|-------|-------|
| **Token name** | `github-actions-tileforge` (or any name) |
| **Description** | `Token for GitHub Actions to publish tileforge` |
| **Expiration** | Choose based on preference (90 days or longer) |
| **Packages and scopes → Permissions** | **Read and write** |
| **Packages and scopes → Select packages** | Select `tileforge` |
| **Organizations → Permissions** | No access |

5. Click **"Generate token"**
6. **Copy the token immediately** (you won't see it again!)

### How to Update the GitHub Secret

1. Go to **https://github.com/jestink-dev/tileforge/settings/secrets/actions**
2. Find **NPM_TOKEN** in the list
3. Click the **pencil icon** (edit) next to it
4. Paste the new token
5. Click **"Update secret"**

### Verifying the Token Works

After updating, you can manually trigger a release or wait for the next one. If it succeeds, the token is working.

---

## Troubleshooting

### Release Failed: 401 Unauthorized

**Cause**: npm token expired or invalid

**Fix**: Create a new npm token and update the GitHub secret (see above)

### Release Failed: 403 Forbidden

**Cause**: Token doesn't have write permission for the package

**Fix**: When creating the token, ensure:
- Permissions is set to "Read and write"
- The `tileforge` package is selected (or "All packages")

### Release Failed: Package Name Already Exists

**Cause**: Someone else owns the package name on npm

**Fix**: Either:
- Contact npm support if you believe it's your package
- Rename your package (update `name` in `package.json`)
- Use a scoped name like `@jestink-dev/tileforge`

### Version Already Published

**Cause**: Trying to publish a version that already exists

**Fix**: Bump the version number:
```bash
npm version patch
git push && git push --tags
```
Then create a new release with the new tag.

---

## Manual Publishing (Fallback)

If GitHub Actions fails and you need to publish urgently:

```bash
# Login to npm (one-time)
npm login

# Publish directly
npm publish
```

---

## Setting Up npm Token for the First Time

If you're setting up a fresh repository or the secret was deleted:

1. **Create npm token** (see "How to Create a New npm Token" above)
2. **Add to GitHub**:
   - Go to: https://github.com/jestink-dev/tileforge/settings/secrets/actions
   - Click **"New repository secret"**
   - Name: `NPM_TOKEN`
   - Value: Paste the token
   - Click **"Add secret"**

---

## Token Expiration Reminder

Set a calendar reminder to renew your npm token before it expires:

| Expiration Setting | Reminder Date |
|--------------------|---------------|
| 30 days | 25 days after creation |
| 60 days | 55 days after creation |
| 90 days | 85 days after creation |

npm will also send email reminders before expiration.
