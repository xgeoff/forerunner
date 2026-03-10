# Releasing to Maven Central (Gradle)

This guide captures a working release flow for JVM libraries published through Sonatype Central (OSSRH compatibility API) using Gradle.

This repository is multi-module. The published artifact is produced by the
`core` module: `biz.digitalindustry.workflow:forerunner`.

## Prerequisites

- A Sonatype Central publisher account with access to your namespace/group.
- A GPG key pair for signing artifacts.
- Your public GPG key published and discoverable by keyservers Sonatype checks.
- Gradle build configured with:
  - `maven-publish`
  - `signing`
  - `io.github.gradle-nexus.publish-plugin`
  - `withSourcesJar()` and `withJavadocJar()`

## Required Gradle Properties

Put these in `~/.gradle/gradle.properties` (or equivalent CI secrets):

```properties
sonatypePublisherTokenName=...
sonatypePublisherTokenPassword=...
signing.keyIdHex=...
signing.password=...
signing.secretKeyRingFileBase64=...
```

Notes:
- `signing.keyIdHex` should be the short hex key id (usually last 8 chars).
- `signing.secretKeyRingFileBase64` is your ASCII-armored private key, base64-encoded.

## One-Time GPG Key Publication

If Sonatype rejects signatures with "Could not find a public key by the key fingerprint", publish your public key first:

```bash
gpg --keyserver hkps://keys.openpgp.org --send-keys <YOUR_KEY_ID>
gpg --keyserver hkps://keys.openpgp.org --recv-keys <YOUR_KEY_ID>
```

## Release Steps

1. Set a non-snapshot version in `build.gradle.kts`.
2. Run validation build:

```bash
./gradlew clean build
```

3. Publish, close, and release staging repository in one command:

```bash
./gradlew :core:publishToSonatype closeAndReleaseSonatypeStagingRepository
```

4. Verify publication after indexing delay:

```bash
curl -s 'https://search.maven.org/solrsearch/select?q=g:%22<GROUP_ID>%22+AND+a:%22<ARTIFACT_ID>%22&rows=20&wt=json'
```

## Snapshot Publishing

For `-SNAPSHOT` versions, publish with:

```bash
./gradlew :core:publishToSonatype
```

## CI Recommendation

For reproducible releases in CI:
- Store all Sonatype and signing values as encrypted secrets.
- Use a dedicated release job that runs:

```bash
./gradlew clean build :core:publishToSonatype closeAndReleaseSonatypeStagingRepository
```

## Common Failures

- `Could not read PGP secret key`
  - Check private key formatting/base64 decoding and signing passphrase.
- `Invalid signature ... Could not find a public key by the key fingerprint`
  - Publish public key and wait for propagation.
- Artifacts uploaded but not visible on Maven Central
  - Ensure close/release step ran successfully; upload alone is not enough.
